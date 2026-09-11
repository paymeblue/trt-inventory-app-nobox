import { query, queryOne, transaction } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { fail, handle, ok, readJson } from "@/lib/api";
import { logActivity } from "@/lib/inventory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_req: Request, ctx: Ctx) => {
  await requirePermission("product:read");
  const { id } = await ctx.params;

  const product = await queryOne(
    `SELECT p.*, c.name AS category_name, s.name AS supplier_name,
            u.full_name AS created_by_name,
            COALESCE((SELECT SUM(on_hand) FROM stock_levels WHERE product_id = p.id), 0)::float AS on_hand,
            COALESCE((SELECT SUM(reserved) FROM stock_levels WHERE product_id = p.id), 0)::float AS reserved
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN suppliers s ON s.id = p.supplier_id
       LEFT JOIN users u ON u.id = p.created_by
      WHERE p.id = $1`,
    [id],
  );
  if (!product) return fail(404, "Material not found.");

  const levels = await query(
    `SELECT l.id AS location_id, l.name AS location_name, l.code AS location_code, l.kind,
            sl.on_hand::float AS on_hand, sl.reserved::float AS reserved, sl.updated_at
       FROM stock_levels sl
       JOIN locations l ON l.id = sl.location_id
      WHERE sl.product_id = $1
      ORDER BY l.name`,
    [id],
  );

  const movements = await query(
    `SELECT m.id, m.movement_type, m.quantity::float AS quantity, m.reference, m.notes, m.created_at,
            fl.name AS from_location, tl.name AS to_location,
            u.full_name AS created_by_name, pr.name AS project_name
       FROM stock_movements m
       LEFT JOIN locations fl ON fl.id = m.from_location_id
       LEFT JOIN locations tl ON tl.id = m.to_location_id
       LEFT JOIN users u ON u.id = m.created_by
       LEFT JOIN projects pr ON pr.id = m.project_id
      WHERE m.product_id = $1
      ORDER BY m.created_at DESC
      LIMIT 40`,
    [id],
  );

  return ok({ product, levels, movements });
});

type PatchBody = {
  sku?: string;
  name?: string;
  description?: string | null;
  categoryId?: string | null;
  supplierId?: string | null;
  unit?: string;
  unitCost?: number;
  reorderLevel?: number;
  imageId?: string | null;
  colour?: string | null;
  spec?: string | null;
  shelfRef?: string | null;
  isActive?: boolean;
};

const FIELD_MAP: Record<keyof PatchBody, string> = {
  sku: "sku",
  name: "name",
  description: "description",
  categoryId: "category_id",
  supplierId: "supplier_id",
  unit: "unit",
  unitCost: "unit_cost",
  reorderLevel: "reorder_level",
  imageId: "image_id",
  colour: "colour",
  spec: "spec",
  shelfRef: "shelf_ref",
  isActive: "is_active",
};

export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const session = await requirePermission("product:write");
  const { id } = await ctx.params;
  const body = await readJson<PatchBody>(req);

  const sets: string[] = [];
  const params: unknown[] = [];

  // A stale image reference (a page left open across a reseed, say) must not
  // fail the whole save — it is dropped and the material falls back to its
  // placeholder.
  let imageId: string | null = null;
  if ("imageId" in body && body.imageId) {
    const found = await queryOne("SELECT 1 AS ok FROM images WHERE id = $1", [body.imageId]);
    imageId = found ? body.imageId : null;
  }

  for (const [key, column] of Object.entries(FIELD_MAP) as [keyof PatchBody, string][]) {
    if (!(key in body)) continue;
    let value = body[key] as unknown;
    if (key === "imageId") {
      value = imageId;
    } else if (typeof value === "string" && (key === "categoryId" || key === "supplierId")) {
      value = value || null;
    }
    params.push(value);
    sets.push(`${column} = $${params.length}`);
  }

  if (!sets.length) return fail(400, "Nothing to update.");

  params.push(id);
  const updated = await queryOne<{ id: string; sku: string; name: string }>(
    `UPDATE products SET ${sets.join(", ")}, updated_at = now()
      WHERE id = $${params.length} RETURNING id, sku, name`,
    params,
  );
  if (!updated) return fail(404, "Material not found.");

  await transaction((client) =>
    logActivity(client, session.sub, "UPDATE", "product", id, `${updated.sku} — ${updated.name}`),
  );
  return ok({ id: updated.id });
});

export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  const session = await requirePermission("product:write");
  const { id } = await ctx.params;

  // Products with ledger history are archived, never deleted, so the movement
  // log stays readable.
  const referenced = await queryOne<{ n: string }>(
    `SELECT (
       (SELECT COUNT(*) FROM stock_movements     WHERE product_id = $1) +
       (SELECT COUNT(*) FROM requisition_items   WHERE product_id = $1) +
       (SELECT COUNT(*) FROM goods_receipt_items WHERE product_id = $1)
     )::text AS n`,
    [id],
  );

  if (Number(referenced!.n) > 0) {
    await query("UPDATE products SET is_active = false, updated_at = now() WHERE id = $1", [id]);
    await transaction((client) => logActivity(client, session.sub, "ARCHIVE", "product", id));
    return ok({ archived: true });
  }

  await query("DELETE FROM products WHERE id = $1", [id]);
  await transaction((client) => logActivity(client, session.sub, "DELETE", "product", id));
  return ok({ deleted: true });
});
