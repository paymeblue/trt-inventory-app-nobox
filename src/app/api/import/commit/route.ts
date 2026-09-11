import { transaction } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { fail, handle, ok, readJson } from "@/lib/api";
import { logActivity, postMovement } from "@/lib/inventory";
import { toNumber, toText } from "@/lib/import-map";
import { slugToSku } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  filename?: string;
  /** header label -> field name */
  mapping?: Record<string, string>;
  rows?: Record<string, string>[];
  locationId?: string | null;
  /** replace = set stock to the sheet value; add = post it on top */
  stockMode?: "skip" | "replace" | "add";
  updateExisting?: boolean;
  defaultUnit?: string;
};

type RowError = { row: number; message: string };

export const POST = handle(async (req: Request) => {
  const session = await requirePermission("product:import");
  const body = await readJson<Body>(req);

  const rows = body.rows ?? [];
  const mapping = body.mapping ?? {};
  const stockMode = body.stockMode ?? "skip";
  const updateExisting = body.updateExisting !== false;

  if (!rows.length) return fail(400, "There are no rows to import.");

  const fieldToHeader: Record<string, string> = {};
  for (const [header, field] of Object.entries(mapping)) {
    if (field && !fieldToHeader[field]) fieldToHeader[field] = header;
  }

  if (!fieldToHeader.name && !fieldToHeader.sku) {
    return fail(400, "Map at least a material name or a SKU column before importing.");
  }
  if (stockMode !== "skip" && !body.locationId) {
    return fail(400, "Choose which store the opening quantities belong to.");
  }

  const get = (row: Record<string, string>, field: string) =>
    fieldToHeader[field] ? row[fieldToHeader[field]] ?? "" : "";

  const result = await transaction(async (client) => {
    const errors: RowError[] = [];
    let created = 0;
    let updated = 0;
    let skipped = 0;
    let stockPosted = 0;

    const categoryCache = new Map<string, string>();
    const supplierCache = new Map<string, string>();
    const usedSkus = new Set<string>();

    async function categoryId(name: string): Promise<string | null> {
      if (!name) return null;
      const key = name.toLowerCase();
      if (categoryCache.has(key)) return categoryCache.get(key)!;
      const { rows: found } = await client.query<{ id: string }>(
        `INSERT INTO categories (name) VALUES ($1)
         ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
        [name],
      );
      categoryCache.set(key, found[0].id);
      return found[0].id;
    }

    async function supplierId(name: string): Promise<string | null> {
      if (!name) return null;
      const key = name.toLowerCase();
      if (supplierCache.has(key)) return supplierCache.get(key)!;
      const { rows: existing } = await client.query<{ id: string }>(
        "SELECT id FROM suppliers WHERE lower(name) = lower($1)",
        [name],
      );
      if (existing[0]) {
        supplierCache.set(key, existing[0].id);
        return existing[0].id;
      }
      const { rows: made } = await client.query<{ id: string }>(
        "INSERT INTO suppliers (name) VALUES ($1) RETURNING id",
        [name],
      );
      supplierCache.set(key, made[0].id);
      return made[0].id;
    }

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      const rowNo = i + 1;

      const name = toText(get(row, "name")) || toText(get(row, "sku"));
      if (!name) {
        skipped += 1;
        continue;
      }

      let sku = toText(get(row, "sku")).toUpperCase();
      if (!sku) sku = slugToSku(name) || `ITEM-${rowNo}`;
      // Keep SKUs unique inside this batch as well as against the table.
      let candidate = sku;
      let suffix = 1;
      while (usedSkus.has(candidate.toLowerCase())) {
        suffix += 1;
        candidate = `${sku}-${suffix}`;
      }
      sku = candidate.slice(0, 48);
      usedSkus.add(sku.toLowerCase());

      try {
        const unit = toText(get(row, "unit")) || body.defaultUnit || "pcs";
        const unitCost = toNumber(get(row, "unitCost"));
        const reorder = toNumber(get(row, "reorderLevel"));
        const quantity = toNumber(get(row, "quantity"));
        const catId = await categoryId(toText(get(row, "category")));
        const supId = await supplierId(toText(get(row, "supplier")));
        const description = toText(get(row, "description")) || null;
        const colour = toText(get(row, "colour")) || null;
        const spec = toText(get(row, "spec")) || null;
        const shelfRef = toText(get(row, "shelfRef")) || null;

        const { rows: existing } = await client.query<{ id: string }>(
          "SELECT id FROM products WHERE lower(sku) = lower($1)",
          [sku],
        );

        let productId: string;
        if (existing[0]) {
          productId = existing[0].id;
          if (!updateExisting) {
            skipped += 1;
            continue;
          }
          await client.query(
            `UPDATE products SET
               name = $1,
               description = COALESCE($2, description),
               category_id = COALESCE($3, category_id),
               supplier_id = COALESCE($4, supplier_id),
               unit = $5,
               unit_cost = CASE WHEN $6 > 0 THEN $6 ELSE unit_cost END,
               reorder_level = CASE WHEN $7 > 0 THEN $7 ELSE reorder_level END,
               colour = COALESCE($8, colour),
               spec = COALESCE($9, spec),
               shelf_ref = COALESCE($10, shelf_ref),
               is_active = true,
               updated_at = now()
             WHERE id = $11`,
            [name, description, catId, supId, unit, unitCost, reorder, colour, spec, shelfRef, productId],
          );
          updated += 1;
        } else {
          const { rows: made } = await client.query<{ id: string }>(
            `INSERT INTO products
               (sku, name, description, category_id, supplier_id, unit, unit_cost,
                reorder_level, colour, spec, shelf_ref, created_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
            [sku, name, description, catId, supId, unit, unitCost, reorder,
             colour, spec, shelfRef, session.sub],
          );
          productId = made[0].id;
          created += 1;
        }

        if (stockMode !== "skip" && body.locationId && quantity !== 0) {
          let delta = quantity;
          if (stockMode === "replace") {
            const { rows: level } = await client.query<{ on_hand: string }>(
              "SELECT on_hand FROM stock_levels WHERE product_id = $1 AND location_id = $2",
              [productId, body.locationId],
            );
            delta = quantity - Number(level[0]?.on_hand ?? 0);
          }
          if (delta !== 0) {
            await postMovement(client, {
              productId,
              type: stockMode === "replace" ? "ADJUSTMENT" : "OPENING",
              quantity: delta,
              toLocationId: body.locationId,
              unitCost: unitCost || null,
              reference: body.filename ? `Import · ${body.filename}` : "Spreadsheet import",
              userId: session.sub,
            });
            stockPosted += 1;
          }
        }
      } catch (err) {
        errors.push({
          row: rowNo,
          message: err instanceof Error ? err.message : "Could not import this row",
        });
        if (errors.length > 200) break;
      }
    }

    const { rows: batch } = await client.query<{ id: string }>(
      `INSERT INTO import_batches
         (filename, rows_total, rows_created, rows_updated, rows_skipped, location_id, errors, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8) RETURNING id`,
      [body.filename ?? "upload", rows.length, created, updated, skipped,
       body.locationId || null, JSON.stringify(errors), session.sub],
    );

    await logActivity(
      client, session.sub, "IMPORT", "import_batch", batch[0].id,
      `${created} created, ${updated} updated from ${body.filename ?? "upload"}`,
    );

    return { batchId: batch[0].id, total: rows.length, created, updated, skipped, stockPosted, errors };
  });

  return ok(result, { status: 201 });
});
