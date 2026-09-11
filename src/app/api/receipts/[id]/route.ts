import { query, queryOne } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { fail, handle, ok } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await requirePermission("receipt:read");
  const { id } = await ctx.params;

  const receipt = await queryOne(
    `SELECT g.*, s.name AS supplier_name, l.name AS location_name,
            u.full_name AS created_by_name, pu.full_name AS posted_by_name
       FROM goods_receipts g
       LEFT JOIN suppliers s ON s.id = g.supplier_id
       LEFT JOIN locations l ON l.id = g.location_id
       LEFT JOIN users u ON u.id = g.created_by
       LEFT JOIN users pu ON pu.id = g.posted_by
      WHERE g.id = $1`,
    [id],
  );
  if (!receipt) return fail(404, "Goods receipt not found.");

  const items = await query(
    `SELECT i.id, i.qty_expected::float AS qty_expected, i.qty_received::float AS qty_received,
            i.unit_cost::float AS unit_cost, i.condition, i.notes,
            p.id AS product_id, p.sku, p.name AS product_name, p.unit, p.image_id
       FROM goods_receipt_items i JOIN products p ON p.id = i.product_id
      WHERE i.receipt_id = $1 ORDER BY p.name`,
    [id],
  );

  return ok({ receipt, items });
});
