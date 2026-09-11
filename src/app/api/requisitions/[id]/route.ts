import { query, queryOne } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { fail, handle, ok } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await requirePermission("requisition:read");
  const { id } = await ctx.params;

  const requisition = await queryOne(
    `SELECT r.*, p.name AS project_name, p.code AS project_code,
            fl.name AS from_location, fl.id AS from_location_id,
            tl.name AS to_location, tl.id AS to_location_id,
            req.full_name AS requested_by_name,
            apr.full_name AS approved_by_name,
            iss.full_name AS issued_by_name,
            rcv.full_name AS received_by_name
       FROM requisitions r
       LEFT JOIN projects p ON p.id = r.project_id
       LEFT JOIN locations fl ON fl.id = r.from_location_id
       LEFT JOIN locations tl ON tl.id = r.to_location_id
       LEFT JOIN users req ON req.id = r.requested_by
       LEFT JOIN users apr ON apr.id = r.approved_by
       LEFT JOIN users iss ON iss.id = r.issued_by
       LEFT JOIN users rcv ON rcv.id = r.received_by
      WHERE r.id = $1`,
    [id],
  );
  if (!requisition) return fail(404, "Requisition not found.");

  const items = await query(
    `SELECT i.id, i.qty_requested::float AS qty_requested,
            i.qty_approved::float AS qty_approved,
            i.qty_issued::float AS qty_issued,
            i.qty_returned::float AS qty_returned,
            i.notes,
            p.id AS product_id, p.sku, p.name AS product_name, p.unit, p.image_id,
            p.unit_cost::float AS unit_cost,
            COALESCE((
              SELECT sl.on_hand FROM stock_levels sl
               WHERE sl.product_id = p.id AND sl.location_id = $2
            ), 0)::float AS available_at_source
       FROM requisition_items i
       JOIN products p ON p.id = i.product_id
      WHERE i.requisition_id = $1
      ORDER BY p.name`,
    [id, (requisition as { from_location_id: string }).from_location_id],
  );

  const movements = await query(
    `SELECT m.id, m.movement_type, m.quantity::float AS quantity, m.created_at,
            p.sku, p.name AS product_name, u.full_name AS created_by_name
       FROM stock_movements m
       JOIN products p ON p.id = m.product_id
       LEFT JOIN users u ON u.id = m.created_by
      WHERE m.requisition_id = $1
      ORDER BY m.created_at DESC`,
    [id],
  );

  return ok({ requisition, items, movements });
});
