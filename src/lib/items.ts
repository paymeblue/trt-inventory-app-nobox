import type { PoolClient } from "pg";
import { HttpError } from "./session";
import { slugToSku } from "./utils";
import type { Source } from "./rbac";
import { parseTemplate, type TemplateError, type TemplateRow } from "./template";

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

export const REORDER_STATUSES = ["OK", "LOW", "REORDER NOW", "OUT OF STOCK"] as const;
export type ReorderStatus = (typeof REORDER_STATUSES)[number];

/** Every column the item screens read. */
export const ITEM_COLUMNS = `
  i.id, i.source, i.sku, i.name, i.category, i.subcategory, i.spec, i.dimensions, i.colour, i.unit,
  i.opening_qty::float8 AS opening_qty,
  i.quantity::float8 AS quantity, i.reorder_level::float8 AS reorder_level,
  i.reorder_quantity::float8 AS reorder_quantity, i.bad_qty::float8 AS bad_qty,
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
  action: "create" | "update";
  before: number;
  delta: number;
  after: number;
};

type Uploader = { userId: string; userName: string; userEmail: string; filename: string };

/**
 * Applies template rows to one side's inventory inside the caller's transaction.
 * A new material starts with Quantity_Added as its Opening_Qty; on an existing
 * one it is posted as a Stock Addition. Everything is validated first, so either
 * every row is applied or none is. With `dryRun` it only reports what would happen.
 */
export async function applyImport(
  client: PoolClient,
  source: Source,
  rows: TemplateRow[],
  opts: Uploader & { dryRun: boolean },
): Promise<{ changes: ImportChange[]; errors: TemplateError[] }> {
  type Existing = { id: string; sku: string; name: string; quantity: number };
  const { rows: existing } = await client.query<Existing>(
    `SELECT i.id, i.sku, i.name, i.quantity::float8 AS quantity
       FROM items i
      WHERE i.source = $1
        AND (lower(i.sku) = ANY($2::text[]) OR lower(i.name) = ANY($3::text[]))
      FOR UPDATE`,
    [
      source,
      rows.filter((r) => r.sku).map((r) => r.sku!.toLowerCase()),
      rows.filter((r) => !r.sku).map((r) => r.name!.toLowerCase()),
    ],
  );
  const bySku = new Map(existing.map((e) => [e.sku.toLowerCase(), e]));
  const byName = new Map<string, Existing[]>();
  for (const e of existing) byName.set(e.name.toLowerCase(), [...(byName.get(e.name.toLowerCase()) ?? []), e]);

  // Every code already used on this side or claimed earlier in the file, so a
  // generated code never collides with either.
  const { rows: taken } = await client.query<{ sku: string }>("SELECT lower(sku) AS sku FROM items WHERE source = $1", [source]);
  const usedSkus = new Set([...taken.map((t) => t.sku), ...rows.filter((r) => r.sku).map((r) => r.sku!.toLowerCase())]);
  const generateSku = (name: string) => {
    const base = (slugToSku(name) || "ITEM").slice(0, 40);
    let candidate = base;
    for (let n = 2; usedSkus.has(candidate.toLowerCase()); n += 1) candidate = `${base}-${n}`;
    usedSkus.add(candidate.toLowerCase());
    return candidate;
  };

  const errors: TemplateError[] = [];
  const changes: ImportChange[] = [];
  const plan = new Map<number, { found: Existing | null; sku: string }>();

  for (const r of rows) {
    let found: Existing | null = null;
    if (r.sku) {
      found = bySku.get(r.sku.toLowerCase()) ?? null;
    } else {
      const matches = byName.get(r.name!.toLowerCase()) ?? [];
      if (matches.length > 1) {
        errors.push({
          row: r.row,
          column: "Material_Code",
          message: `${matches.length} materials are called ${r.name} (${matches.map((m) => m.sku).join(", ")}). Add the Material_Code to say which one.`,
        });
        continue;
      }
      found = matches[0] ?? null;
    }

    if (!found) {
      if (!r.name) {
        errors.push({ row: r.row, column: "Material_Name", message: `${r.sku} is new, so it needs a Material_Name.` });
      }
      const sku = r.sku ?? generateSku(r.name ?? "");
      plan.set(r.row, { found: null, sku });
      changes.push({ row: r.row, sku, name: r.name ?? sku, action: "create", before: 0, delta: r.quantity, after: r.quantity });
    } else {
      plan.set(r.row, { found, sku: found.sku });
      changes.push({
        row: r.row, sku: found.sku, name: r.name ?? found.name, action: "update",
        before: found.quantity, delta: r.quantity, after: found.quantity + r.quantity,
      });
    }
  }

  if (errors.length || opts.dryRun) return { changes, errors };

  const note = `Upload · ${opts.filename}`;
  for (const r of rows) {
    r.category = await ensureCategory(client, source, r.category, opts.userId);
    const { found, sku } = plan.get(r.row)!;
    if (!found) {
      const { rows: made } = await client.query<{ id: string }>(
        `INSERT INTO items (source, sku, name, category, subcategory, spec, dimensions, unit, opening_qty, quantity,
                            reorder_level, reorder_quantity, description, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,$10,$11,$12,$13,$13) RETURNING id`,
        [source, sku, r.name, r.category, r.subcategory, r.spec, r.dimensions, r.unit ?? "Unit", r.quantity,
         r.reorderLevel ?? 0, r.reorderQuantity ?? 0, r.notes, opts.userId],
      );
      await recordMovement(client, {
        itemId: made[0].id, source, kind: "OPENING", delta: r.quantity, balance: r.quantity, note, userId: opts.userId,
      });
      continue;
    }

    const after = found.quantity + r.quantity;
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
         updated_at = now()
       WHERE id = $12`,
      [r.name, r.category, r.subcategory, r.spec, r.dimensions, r.unit, r.reorderLevel, r.reorderQuantity,
       r.notes, after, opts.userId, found.id],
    );
    if (r.quantity > 0) {
      const { rows: add } = await client.query<{ ref: string }>(
        `INSERT INTO stock_additions (item_id, source, quantity, supplier_ref, document_ref, notes,
                                      recorded_by, recorded_by_name, recorded_by_email)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING ref`,
        [found.id, source, r.quantity, r.supplierRef, r.documentRef, note, opts.userId, opts.userName, opts.userEmail],
      );
      await recordMovement(client, {
        itemId: found.id, source, kind: "ADDITION", delta: r.quantity, balance: after, note: `${add[0].ref} · ${note}`, userId: opts.userId,
      });
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
  reorderLevel: number | null;
  reorderQuantity: number | null;
  description: string | null;
  imageId: string | null;
};

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

  const sku = str("sku")?.toUpperCase() ?? null;
  const name = str("name");
  if (opts.creating || sku !== null) {
    if (!sku) throw new HttpError(400, "Material Code is required.");
    if (sku.length > 48) throw new HttpError(400, "Material Code must be 48 characters or fewer.");
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
    reorderLevel: num("reorderLevel", "Reorder Level"),
    reorderQuantity: num("reorderQuantity", "Reorder Quantity"),
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
  const parsed = parseTemplate(buffer);
  if (parsed.fatal) return { applied: false, changes: [], errors: parsed.errors };

  // Well-formed rows are still checked when other rows are malformed, so the
  // manager sees every problem in the file in one pass.
  const apply = opts.commit && parsed.errors.length === 0;
  const result = await applyImport(client, source, parsed.rows, { ...opts, dryRun: !apply });
  const errors = [...parsed.errors, ...result.errors].sort((a, b) => (a.row ?? 0) - (b.row ?? 0));
  return { applied: apply && errors.length === 0, changes: errors.length ? [] : result.changes, errors };
}
