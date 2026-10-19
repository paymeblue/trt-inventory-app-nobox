import type { PoolClient } from "pg";
import { HttpError } from "./session";
import { slugToSku } from "./utils";
import type { Location, Source } from "./rbac";
import { recalculateReorder } from "./reorder";
import { parseTemplate, placeLabel, type TemplateError, type TemplateRow } from "./template";

export type MovementKind = "CREATE" | "ADJUST" | "IMPORT" | "ISSUE" | "ADDITION" | "OPENING";

/**
 * Inventory_Master's Reserved_Qty for an item aliased `i`: what open and
 * part-issued reservations still hold.
 */
export const RESERVED_SQL = `COALESCE((SELECT SUM(GREATEST(r.quantity - r.issued_qty - r.released_qty, 0))
  FROM reservations r WHERE r.item_id = i.id AND r.status IN ('RESERVED','PART_ISSUED')), 0)`;

/** Inventory_Master's Issued_Qty: posted issues plus the Issued impact of adjustments. */
export const ISSUED_SQL = `(COALESCE((SELECT SUM(s.quantity) FROM stock_issues s WHERE s.item_id = i.id), 0)
  + COALESCE((SELECT SUM(a.issued_impact) FROM stock_adjustments a WHERE a.item_id = i.id), 0))`;

/** Inventory_Master's Stock_Added. */
export const ADDED_SQL = `COALESCE((SELECT SUM(d.quantity) FROM stock_additions d WHERE d.item_id = i.id), 0)`;

/** Available_Qty = what is physically in stock minus what is reserved. */
export const AVAILABLE_SQL = `(i.quantity - ${RESERVED_SQL})`;

/**
 * Reorder_Status, exactly as the workbook computes it:
 * IF(avail<=0,"OUT OF STOCK",IF(avail<=level,"REORDER NOW",IF(avail<=level*1.25,"LOW","OK")))
 */
export const STATUS_SQL = `CASE
  WHEN ${AVAILABLE_SQL} <= 0 THEN 'OUT OF STOCK'
  WHEN ${AVAILABLE_SQL} <= i.reorder_level THEN 'REORDER NOW'
  WHEN ${AVAILABLE_SQL} <= i.reorder_level * 1.25 THEN 'LOW'
  ELSE 'OK' END`;

/** True for an item (aliased `i`) whose category is not archived. */
export const ACTIVE_SQL = `NOT EXISTS (SELECT 1 FROM categories c
  WHERE c.source = i.source AND c.name = i.category AND NOT c.is_active)`;

/** Stock arriving for an item brings its archived category back into view. */
export async function reactivateCategoryOf(client: PoolClient, itemId: string) {
  await client.query(
    `UPDATE categories c SET is_active = true, updated_at = now()
       FROM items i
      WHERE i.id = $1 AND c.source = i.source AND c.name = i.category AND NOT c.is_active`,
    [itemId],
  );
}

export const REORDER_STATUSES = ["OK", "LOW", "REORDER NOW", "OUT OF STOCK"] as const;
export type ReorderStatus = (typeof REORDER_STATUSES)[number];

/** Every column the item screens read. */
export const ITEM_COLUMNS = `
  i.id, i.source, i.location, i.sku, i.name, i.category, i.subcategory, i.spec, i.dimensions, i.colour, i.unit,
  i.opening_qty::float8 AS opening_qty,
  i.quantity::float8 AS quantity, i.reorder_level::float8 AS reorder_level,
  i.reorder_quantity::float8 AS reorder_quantity, i.bad_qty::float8 AS bad_qty,
  i.reorder_level_manual, i.reorder_quantity_manual, i.lead_time_days::float8 AS lead_time_days,
  (${RESERVED_SQL})::float8 AS reserved,
  (${AVAILABLE_SQL})::float8 AS available,
  (${ISSUED_SQL})::float8 AS issued,
  (${ADDED_SQL})::float8 AS added,
  ${STATUS_SQL} AS reorder_status,
  i.description, i.image_id, i.created_at, i.updated_at,
  u.full_name AS updated_by_name`;

export const ITEM_FROM = "FROM items i LEFT JOIN users u ON u.id = i.updated_by";

export async function recordMovement(
  client: PoolClient,
  m: { itemId: string; source: Source; kind: MovementKind; delta: number; balance: number; note?: string | null; userId: string | null },
) {
  await client.query(
    `INSERT INTO item_movements (item_id, source, kind, delta, balance_after, note, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [m.itemId, m.source, m.kind, m.delta, m.balance, m.note ?? null, m.userId],
  );
}

/**
 * Returns the category's stored spelling, creating it for that side if it is
 * new. Items always carry the stored spelling, so "BOARDS" and "Boards" never
 * become two categories.
 */
export async function ensureCategory(
  client: PoolClient,
  source: Source,
  name: string | null,
  userId: string | null,
): Promise<string | null> {
  const trimmed = name?.trim();
  if (!trimmed) return null;
  if (trimmed.length > 60) throw new HttpError(400, "Category names must be 60 characters or fewer.");
  const { rows } = await client.query<{ name: string }>(
    `INSERT INTO categories (source, name, created_by) VALUES ($1, $2, $3)
     ON CONFLICT (source, lower(name)) DO UPDATE SET name = categories.name
     RETURNING name`,
    [source, trimmed, userId],
  );
  return rows[0].name;
}

export type ImportChange = {
  row: number;
  sku: string;
  name: string;
  /** Lagos or Abuja on Nobox; null elsewhere. */
  location: Location | null;
  action: "create" | "update";
  before: number;
  delta: number;
  after: number;
};

type Uploader = { userId: string; userName: string; userEmail: string; filename: string };

/** A material the upload can match a row to: one already stored, or one an earlier row creates. */
type Target = {
  id: string | null;
  sku: string;
  name: string;
  subcategory: string | null;
  spec: string | null;
  dimensions: string | null;
  location: Location | null;
  quantity: number;
  /** The row of this file that already wrote to it. */
  usedBy: number | null;
};

/** A Reorder_Level, Reorder_Quantity or Lead_Time_Days cell: blank (null), "auto", or a number. */
const cellNumber = (v: number | "auto" | null) => (typeof v === "number" ? v : null);
const cellText = (v: number | "auto" | null) => (v === null ? null : String(v));

const same = (a: string | null, b: string | null) => (a ?? "").toLowerCase() === (b ?? "").toLowerCase();

/** Name, subcategory, specification and dimensions, together with the code, tell materials apart. */
const DESCRIBING = ["name", "subcategory", "spec", "dimensions"] as const;

const describe = (t: Pick<Target, "sku" | "name" | "dimensions" | "spec">) =>
  [t.sku, t.name, t.spec, t.dimensions].filter(Boolean).join(" · ");

/**
 * Applies template rows to one side's inventory inside the caller's transaction.
 * A new material starts with its quantity as its Opening_Qty; on an existing
 * one it is posted as a Stock Addition. On Nobox each row is applied to the
 * Lagos and Abuja stores separately. Everything is validated first, so either
 * every row is applied or none is. With `dryRun` it only reports what would happen.
 *
 * A row is matched by its Material_Code (or, without one, its Material_Name).
 * Where that is shared by several materials, as the workbook does for each
 * finish and size of a handle, the row's name, subcategory, specification and
 * dimensions pick the one it means; if none fits, it is a new material.
 */
export async function applyImport(
  client: PoolClient,
  source: Source,
  rows: TemplateRow[],
  opts: Uploader & { dryRun: boolean },
): Promise<{ changes: ImportChange[]; errors: TemplateError[] }> {
  const { rows: existing } = await client.query<Omit<Target, "usedBy">>(
    `SELECT i.id, i.sku, i.name, i.subcategory, i.spec, i.dimensions, i.location, i.quantity::float8 AS quantity
       FROM items i
      WHERE i.source = $1
        AND (lower(i.sku) = ANY($2::text[]) OR lower(i.name) = ANY($3::text[]))
      ORDER BY i.created_at
      FOR UPDATE`,
    [
      source,
      rows.filter((r) => r.sku).map((r) => r.sku!.toLowerCase()),
      rows.filter((r) => !r.sku).map((r) => r.name!.toLowerCase()),
    ],
  );
  const targets: Target[] = existing.map((e) => ({ ...e, usedBy: null }));

  // Every code already used on this side or claimed in the file, so a
  // generated code never collides with either.
  const { rows: taken } = await client.query<{ sku: string }>("SELECT DISTINCT lower(sku) AS sku FROM items WHERE source = $1", [source]);
  const usedSkus = new Set([...taken.map((t) => t.sku), ...rows.filter((r) => r.sku).map((r) => r.sku!.toLowerCase())]);
  const generateSku = (name: string) => {
    const base = (slugToSku(name) || "ITEM").slice(0, 40);
    let candidate = base;
    for (let n = 2; usedSkus.has(candidate.toLowerCase()); n += 1) candidate = `${base}-${n}`;
    usedSkus.add(candidate.toLowerCase());
    return candidate;
  };

  // How often each code (or, for rows without one, each name) appears in the file.
  const keyOf = (r: TemplateRow) => (r.sku ? `sku:${r.sku.toLowerCase()}` : `name:${r.name!.toLowerCase()}`);
  const repeats = new Map<string, number>();
  for (const r of rows) repeats.set(keyOf(r), (repeats.get(keyOf(r)) ?? 0) + 1);

  type Resolved = { kind: "match"; target: Target } | { kind: "new" } | { kind: "ambiguous"; targets: Target[] };
  const resolve = (r: TemplateRow, location: Location | null): Resolved => {
    const pool = targets.filter((t) => t.location === location && (r.sku ? same(t.sku, r.sku) : same(t.name, r.name)));
    // A code (or name) used once, here and in the file, is the material: the
    // row may rename it or change its details.
    if (pool.length === 1 && repeats.get(keyOf(r)) === 1) return { kind: "match", target: pool[0] };
    const fits = pool.filter((t) => DESCRIBING.every((f) => r[f] === null || same(t[f], r[f])));
    if (fits.length === 1) return { kind: "match", target: fits[0] };
    return fits.length ? { kind: "ambiguous", targets: fits } : { kind: "new" };
  };

  const errors: TemplateError[] = [];
  const changes: ImportChange[] = [];
  type Step = { row: TemplateRow; location: Location | null; quantity: number; target: Target; create: boolean };
  const steps: Step[] = [];

  for (const r of rows) {
    // Blank quantities everywhere: update the material wherever it is held,
    // or create it in the first store (Lagos on Nobox).
    const given = r.quantities.filter((q) => q.quantity !== null);
    const held = r.quantities.filter((q) => resolve(r, q.location).kind !== "new");
    const wanted = given.length ? given : held.length ? held : [r.quantities[0]];

    let sku = r.sku;
    const created: Target[] = [];
    for (const { location, quantity } of wanted) {
      const where = location ? ` in ${placeLabel(location)}` : "";
      const res = resolve(r, location);
      if (res.kind === "ambiguous") {
        errors.push({
          row: r.row,
          column: r.sku ? "Material_Code" : "Material_Name",
          message: `${res.targets.length} materials${where} match ${r.sku ?? r.name} (${res.targets.map(describe).join("; ")}). Add the Material_Code, Specification or Dimensions to say which one.`,
        });
        continue;
      }
      if (res.kind === "match") {
        const t = res.target;
        if (t.usedBy !== null) {
          if (quantity !== null) {
            errors.push({
              row: r.row,
              column: r.sku ? "Material_Code" : "Material_Name",
              message: `${describe(t)}${where} is already on row ${t.usedBy}. Put its whole quantity on one row.`,
            });
          }
          continue;
        }
        t.usedBy = r.row;
        sku = t.sku;
        steps.push({ row: r, location, quantity: quantity ?? 0, target: t, create: false });
        continue;
      }
      if (!r.name) {
        errors.push({ row: r.row, column: "Material_Name", message: `${r.sku}${where} is new, so it needs a Material_Name.` });
        continue;
      }
      const t: Target = {
        id: null, sku: "", name: r.name, subcategory: r.subcategory, spec: r.spec, dimensions: r.dimensions,
        location, quantity: 0, usedBy: r.row,
      };
      targets.push(t);
      created.push(t);
      steps.push({ row: r, location, quantity: quantity ?? 0, target: t, create: true });
    }
    // The same material in Lagos and Abuja shares one code, generated once.
    if (created.length) {
      const code = sku ?? generateSku(r.name!);
      for (const t of created) t.sku = code;
    }
  }

  for (const { row: r, location, quantity, target: t, create } of steps) {
    changes.push({
      row: r.row, sku: t.sku, name: create ? t.name : (r.name ?? t.name), location,
      action: create ? "create" : "update", before: t.quantity, delta: quantity, after: t.quantity + quantity,
    });
  }

  if (errors.length || opts.dryRun) return { changes, errors };

  const note = `Upload · ${opts.filename}`;
  const categories = new Map<TemplateRow, string | null>();
  for (const { row: r, location, quantity, target: t, create } of steps) {
    if (!categories.has(r)) categories.set(r, await ensureCategory(client, source, r.category, opts.userId));
    const category = categories.get(r)!;
    if (create) {
      const { rows: made } = await client.query<{ id: string }>(
        `INSERT INTO items (source, location, sku, name, category, subcategory, spec, dimensions, unit, opening_qty, quantity,
                            reorder_level, reorder_quantity, description, created_by, updated_by,
                            reorder_level_manual, reorder_quantity_manual, lead_time_days)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10,$11,$12,$13,$14,$14,$15,$16,$17) RETURNING id`,
        [source, location, t.sku, r.name, category, r.subcategory, r.spec, r.dimensions, r.unit ?? "Unit", quantity,
         cellNumber(r.reorderLevel) ?? 0, cellNumber(r.reorderQuantity) ?? 0, r.notes, opts.userId,
         cellNumber(r.reorderLevel) !== null, cellNumber(r.reorderQuantity) !== null, cellNumber(r.leadTimeDays)],
      );
      await recordMovement(client, {
        itemId: made[0].id, source, kind: "OPENING", delta: quantity, balance: quantity, note, userId: opts.userId,
      });
      if (quantity > 0) await reactivateCategoryOf(client, made[0].id);
      continue;
    }

    const after = t.quantity + quantity;
    await client.query(
      `UPDATE items SET
         name = COALESCE($1, name),
         category = COALESCE($2, category),
         subcategory = COALESCE($3, subcategory),
         spec = COALESCE($4, spec),
         dimensions = COALESCE($5, dimensions),
         unit = COALESCE($6, unit),
         reorder_level = COALESCE($7, reorder_level),
         reorder_quantity = COALESCE($8, reorder_quantity),
         description = COALESCE($9, description),
         quantity = $10,
         updated_by = $11,
         updated_at = now(),
         reorder_level_manual = CASE WHEN $13::text IS NULL THEN reorder_level_manual ELSE $13 <> 'auto' END,
         reorder_quantity_manual = CASE WHEN $14::text IS NULL THEN reorder_quantity_manual ELSE $14 <> 'auto' END,
         lead_time_days = CASE WHEN $15::text IS NULL THEN lead_time_days WHEN $15 = 'auto' THEN NULL ELSE $15::numeric END
       WHERE id = $12`,
      [r.name, category, r.subcategory, r.spec, r.dimensions, r.unit, cellNumber(r.reorderLevel), cellNumber(r.reorderQuantity),
       r.notes, after, opts.userId, t.id, cellText(r.reorderLevel), cellText(r.reorderQuantity), cellText(r.leadTimeDays)],
    );
    if (quantity > 0) {
      const { rows: add } = await client.query<{ ref: string }>(
        `INSERT INTO stock_additions (item_id, source, quantity, supplier_ref, document_ref, notes,
                                      recorded_by, recorded_by_name, recorded_by_email)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING ref`,
        [t.id, source, quantity, r.supplierRef, r.documentRef, note, opts.userId, opts.userName, opts.userEmail],
      );
      await recordMovement(client, {
        itemId: t.id!, source, kind: "ADDITION", delta: quantity, balance: after, note: `${add[0].ref} · ${note}`, userId: opts.userId,
      });
      await reactivateCategoryOf(client, t.id!);
    }
  }

  return { changes, errors };
}

type ItemFields = {
  sku: string | null;
  name: string | null;
  category: string | null;
  subcategory: string | null;
  spec: string | null;
  dimensions: string | null;
  colour: string | null;
  unit: string | null;
  /** Absent: leave alone. Null: work it out from usage. A number: set by hand. */
  reorderLevel: number | null | undefined;
  reorderQuantity: number | null | undefined;
  /** Absent: leave alone. Null: the side's default. */
  leadTimeDays: number | null | undefined;
  description: string | null;
  imageId: string | null;
};

function leadTime(days: number | null | undefined) {
  if (days === 0) throw new HttpError(400, "Lead time must be more than 0 days.");
  return days;
}

/**
 * Reads the editable fields from a create or update request. On update, a key
 * that is absent means "leave alone", while an empty string clears the value.
 */
export function parseItemBody(body: Record<string, unknown>, opts: { creating: boolean }): ItemFields {
  const str = (key: string) => {
    const v = body[key];
    if (v === undefined || v === null) return null;
    return String(v).trim();
  };
  const num = (key: string, label: string) => {
    const v = body[key];
    if (v === undefined || v === null || v === "") return null;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) throw new HttpError(400, `${label} must be 0 or more.`);
    return n;
  };
  // A blank value is meaningful here, so absent and blank are told apart.
  const override = (key: string, label: string) => (key in body ? num(key, label) : undefined);

  const sku = str("sku")?.toUpperCase() ?? null;
  const name = str("name");
  if (opts.creating || sku !== null) {
    if (!sku) throw new HttpError(400, "Material Code is required.");
    if (sku.length > 100) throw new HttpError(400, "Material Code must be 100 characters or fewer.");
  }
  if ((opts.creating || name !== null) && !name) throw new HttpError(400, "Material Name is required.");

  return {
    sku,
    name,
    category: str("category"),
    subcategory: str("subcategory"),
    spec: str("spec"),
    dimensions: str("dimensions"),
    colour: str("colour"),
    unit: str("unit") || null,
    reorderLevel: override("reorderLevel", "Reorder Level"),
    reorderQuantity: override("reorderQuantity", "Reorder Quantity"),
    leadTimeDays: leadTime(override("leadTimeDays", "Lead time")),
    description: str("description"),
    imageId: str("imageId") || null,
  };
}

/**
 * The whole stock upload: read the file against the template, check every row,
 * and apply it only if nothing is wrong and `commit` is set. Every problem found
 * comes back sorted by row. This is what POST /api/items/import runs.
 */
export async function importStock(
  client: PoolClient,
  source: Source,
  buffer: Buffer,
  opts: Uploader & { commit: boolean },
): Promise<{ applied: boolean; changes: ImportChange[]; errors: TemplateError[] }> {
  const parsed = parseTemplate(buffer, source);
  if (parsed.fatal) return { applied: false, changes: [], errors: parsed.errors };

  // Well-formed rows are still checked when other rows are malformed, so the
  // manager sees every problem in the file in one pass.
  const apply = opts.commit && parsed.errors.length === 0;
  const result = await applyImport(client, source, parsed.rows, { ...opts, dryRun: !apply });
  if (apply && !result.errors.length) await recalculateReorder(client, { source });
  const errors = [...parsed.errors, ...result.errors].sort((a, b) => (a.row ?? 0) - (b.row ?? 0));
  return { applied: apply && errors.length === 0, changes: errors.length ? [] : result.changes, errors };
}
