import type { PoolClient } from "pg";
import { HttpError } from "./session";
import { slugToSku } from "./utils";
import type { Source } from "./rbac";
import { parseTemplate, type TemplateError, type TemplateRow } from "./template";

export type MovementKind = "CREATE" | "ADJUST" | "IMPORT" | "ISSUE";

/** Quantity set aside by open reservations, for an item aliased `i`. */
export const RESERVED_SQL = `COALESCE((SELECT SUM(r.quantity) FROM reservations r
  WHERE r.item_id = i.id AND r.status = 'RESERVED'), 0)`;

/** Every column the item screens read. */
export const ITEM_COLUMNS = `
  i.id, i.source, i.sku, i.name, i.category, i.colour, i.spec, i.unit,
  i.quantity::float8 AS quantity, i.reorder_level::float8 AS reorder_level,
  (${RESERVED_SQL})::float8 AS reserved,
  (i.quantity - ${RESERVED_SQL})::float8 AS available,
  i.description, i.image_id, i.created_at, i.updated_at,
  u.full_name AS updated_by_name`;

export const ITEM_FROM = "FROM items i LEFT JOIN users u ON u.id = i.updated_by";

export async function recordMovement(
  client: PoolClient,
  m: { itemId: string; source: Source; kind: MovementKind; delta: number; balance: number; note?: string | null; userId: string },
) {
  await client.query(
    `INSERT INTO item_movements (item_id, source, kind, delta, balance_after, note, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [m.itemId, m.source, m.kind, m.delta, m.balance, m.note ?? null, m.userId],
  );
}

/**
 * Returns the category's stored spelling, creating it for that side if it is
 * new. Items always carry the stored spelling, so "boards" and "Boards" never
 * become two categories.
 */
export async function ensureCategory(
  client: PoolClient,
  source: Source,
  name: string | null,
  userId: string,
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

/** Adds a signed amount to an item's quantity, refusing to take it below zero. */
export async function adjustQuantity(
  client: PoolClient,
  itemId: string,
  delta: number,
  opts: { kind: MovementKind; note?: string | null; userId: string; source?: Source },
): Promise<{ quantity: number; source: Source }> {
  if (!Number.isFinite(delta) || delta === 0) throw new HttpError(400, "Enter an amount other than zero.");

  const { rows } = await client.query<{ quantity: number; reserved: number; source: Source; name: string; sku: string }>(
    `SELECT i.quantity::float8 AS quantity, (${RESERVED_SQL})::float8 AS reserved, i.source, i.name, i.sku
       FROM items i WHERE i.id = $1 FOR UPDATE`,
    [itemId],
  );
  const item = rows[0];
  if (!item || (opts.source && item.source !== opts.source)) throw new HttpError(404, "Item not found.");

  const next = item.quantity + delta;
  if (next < 0) {
    throw new HttpError(
      400,
      `Only ${item.quantity} of ${item.name} (${item.sku}) in stock — cannot remove ${Math.abs(delta)}.`,
    );
  }
  if (delta < 0 && next < item.reserved) {
    throw new HttpError(
      400,
      `${item.reserved} of ${item.name} are reserved, so only ${item.quantity - item.reserved} can be deducted. ` +
        "Issue or release the reservations first.",
    );
  }

  await client.query(
    "UPDATE items SET quantity = $1, updated_by = $2, updated_at = now() WHERE id = $3",
    [next, opts.userId, itemId],
  );
  await recordMovement(client, {
    itemId, source: item.source, kind: opts.kind, delta, balance: next, note: opts.note, userId: opts.userId,
  });
  return { quantity: next, source: item.source };
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

/**
 * Applies template rows to one side's inventory inside the caller's transaction.
 * Validates everything against current stock first, so either every row is
 * applied or none is. With `dryRun` it only reports what would happen.
 */
export async function applyImport(
  client: PoolClient,
  source: Source,
  rows: TemplateRow[],
  opts: { userId: string; filename: string; dryRun: boolean },
): Promise<{ changes: ImportChange[]; errors: TemplateError[] }> {
  type Existing = { id: string; sku: string; name: string; quantity: number; reserved: number };
  const { rows: existing } = await client.query<Existing>(
    `SELECT i.id, i.sku, i.name, i.quantity::float8 AS quantity, (${RESERVED_SQL})::float8 AS reserved
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

  // Every SKU already used on this side or claimed earlier in the file, so a
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
          column: "SKU",
          message: `${matches.length} items are called ${r.name} (${matches.map((m) => m.sku).join(", ")}). Add the SKU to say which one.`,
        });
        continue;
      }
      found = matches[0] ?? null;
    }
    const label = r.sku ?? r.name!;

    if (!found) {
      if (!r.name) errors.push({ row: r.row, column: "Name", message: `${label} is new, so it needs a name.` });
      if (r.quantity < 0) {
        errors.push({ row: r.row, column: "Quantity", message: `${label} is new, so its quantity cannot be negative.` });
      }
      const sku = r.sku ?? generateSku(r.name ?? "");
      plan.set(r.row, { found: null, sku });
      changes.push({ row: r.row, sku, name: r.name ?? sku, action: "create", before: 0, delta: r.quantity, after: r.quantity });
    } else {
      const after = found.quantity + r.quantity;
      if (after < 0) {
        errors.push({
          row: r.row,
          column: "Quantity",
          message: `${found.sku} has ${found.quantity} in stock — removing ${Math.abs(r.quantity)} would leave ${after}.`,
        });
      } else if (r.quantity < 0 && after < found.reserved) {
        errors.push({
          row: r.row,
          column: "Quantity",
          message: `${found.sku} has ${found.reserved} reserved, so at most ${found.quantity - found.reserved} can be removed.`,
        });
      }
      plan.set(r.row, { found, sku: found.sku });
      changes.push({ row: r.row, sku: found.sku, name: r.name ?? found.name, action: "update", before: found.quantity, delta: r.quantity, after });
    }
  }

  if (errors.length || opts.dryRun) return { changes, errors };

  const note = `Upload · ${opts.filename}`;
  for (const r of rows) {
    r.category = await ensureCategory(client, source, r.category, opts.userId);
    const { found, sku } = plan.get(r.row)!;
    if (!found) {
      const { rows: made } = await client.query<{ id: string }>(
        `INSERT INTO items (source, sku, name, category, colour, spec, unit, quantity, reorder_level,
                            description, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11) RETURNING id`,
        [source, sku, r.name, r.category, r.colour, r.spec, r.unit ?? "pcs", r.quantity,
         r.reorderLevel ?? 0, r.description, opts.userId],
      );
      await recordMovement(client, {
        itemId: made[0].id, source, kind: "IMPORT", delta: r.quantity, balance: r.quantity, note, userId: opts.userId,
      });
      continue;
    }

    const after = found.quantity + r.quantity;
    await client.query(
      `UPDATE items SET
         name = COALESCE($1, name),
         category = COALESCE($2, category),
         colour = COALESCE($3, colour),
         spec = COALESCE($4, spec),
         unit = COALESCE($5, unit),
         reorder_level = COALESCE($6, reorder_level),
         description = COALESCE($7, description),
         quantity = $8,
         updated_by = $9,
         updated_at = now()
       WHERE id = $10`,
      [r.name, r.category, r.colour, r.spec, r.unit, r.reorderLevel, r.description, after, opts.userId, found.id],
    );
    if (r.quantity !== 0) {
      await recordMovement(client, {
        itemId: found.id, source, kind: "IMPORT", delta: r.quantity, balance: after, note, userId: opts.userId,
      });
    }
  }

  return { changes, errors };
}

type ItemFields = {
  sku: string | null;
  name: string | null;
  category: string | null;
  colour: string | null;
  spec: string | null;
  unit: string | null;
  reorderLevel: number | null;
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

  const sku = str("sku")?.toUpperCase() ?? null;
  const name = str("name");
  if (opts.creating || sku !== null) {
    if (!sku) throw new HttpError(400, "SKU is required.");
    if (sku.length > 48) throw new HttpError(400, "SKU must be 48 characters or fewer.");
  }
  if ((opts.creating || name !== null) && !name) throw new HttpError(400, "Name is required.");

  let reorderLevel: number | null = null;
  if (body.reorderLevel !== undefined && body.reorderLevel !== null && body.reorderLevel !== "") {
    reorderLevel = Number(body.reorderLevel);
    if (!Number.isFinite(reorderLevel) || reorderLevel < 0) {
      throw new HttpError(400, "Reorder level must be 0 or more.");
    }
  }

  return {
    sku,
    name,
    category: str("category"),
    colour: str("colour"),
    spec: str("spec"),
    unit: str("unit") || null,
    reorderLevel,
    description: str("description"),
    imageId: str("imageId") || null,
  };
}

/**
 * The whole stock upload: read the file against the template, check every row
 * against current stock, and apply it only if nothing is wrong and `commit` is
 * set. Every problem found, by the parser or against stock, comes back sorted
 * by row. This is what POST /api/items/import runs.
 */
export async function importStock(
  client: PoolClient,
  source: Source,
  buffer: Buffer,
  opts: { userId: string; filename: string; commit: boolean },
): Promise<{ applied: boolean; changes: ImportChange[]; errors: TemplateError[] }> {
  const parsed = parseTemplate(buffer);
  if (parsed.fatal) return { applied: false, changes: [], errors: parsed.errors };

  // Well-formed rows are still checked against stock when other rows are
  // malformed, so the manager sees every problem in the file in one pass.
  const apply = opts.commit && parsed.errors.length === 0;
  const result = await applyImport(client, source, parsed.rows, { userId: opts.userId, filename: opts.filename, dryRun: !apply });
  const errors = [...parsed.errors, ...result.errors].sort((a, b) => (a.row ?? 0) - (b.row ?? 0));
  return { applied: apply && errors.length === 0, changes: errors.length ? [] : result.changes, errors };
}
