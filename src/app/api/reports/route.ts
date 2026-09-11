import { query, queryOne } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { handle, ok } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request) => {
  await requirePermission("report:read");
  const url = new URL(req.url);
  const days = Math.min(365, Math.max(7, Number(url.searchParams.get("days") ?? 30)));

  const summary = await queryOne<Record<string, string>>(
    `SELECT
       (SELECT COALESCE(SUM(quantity), 0) FROM stock_movements
         WHERE movement_type IN ('RECEIPT','OPENING') AND created_at > now() - ($1 || ' days')::interval)::text AS units_in,
       (SELECT COALESCE(SUM(quantity), 0) FROM stock_movements
         WHERE movement_type IN ('ISSUE','WASTE') AND created_at > now() - ($1 || ' days')::interval)::text AS units_out,
       (SELECT COALESCE(SUM(quantity), 0) FROM stock_movements
         WHERE movement_type = 'WASTE' AND created_at > now() - ($1 || ' days')::interval)::text AS waste_units,
       (SELECT COUNT(DISTINCT product_id) FROM stock_movements
         WHERE movement_type IN ('ISSUE','WASTE') AND created_at > now() - ($1 || ' days')::interval)::text AS skus_moved,
       (SELECT COUNT(*) FROM stock_movements
         WHERE created_at > now() - ($1 || ' days')::interval)::text AS movement_count`,
    [days],
  );

  const consumption = await query(
    `SELECT p.id, p.sku, p.name, p.unit, p.image_id,
            SUM(m.quantity)::float AS issued,
            SUM(m.quantity * COALESCE(m.unit_cost, p.unit_cost))::float AS value,
            COALESCE((SELECT SUM(on_hand) FROM stock_levels WHERE product_id = p.id), 0)::float AS on_hand
       FROM stock_movements m JOIN products p ON p.id = m.product_id
      WHERE m.movement_type IN ('ISSUE','WASTE')
        AND m.created_at > now() - ($1 || ' days')::interval
      GROUP BY p.id, p.sku, p.name, p.unit, p.image_id
      ORDER BY issued DESC LIMIT 15`,
    [days],
  );

  // Items with stock on hand but no outbound movement in the window — the
  // "slow-moving / ageing" review from the materials visibility flow.
  const ageing = await query(
    `SELECT p.id, p.sku, p.name, p.unit, p.image_id,
            COALESCE((SELECT SUM(on_hand) FROM stock_levels WHERE product_id = p.id), 0)::float AS on_hand,
            (COALESCE((SELECT SUM(on_hand) FROM stock_levels WHERE product_id = p.id), 0) * p.unit_cost)::float AS value,
            (SELECT MAX(created_at) FROM stock_movements m2
              WHERE m2.product_id = p.id AND m2.movement_type IN ('ISSUE','TRANSFER','WASTE')) AS last_moved_at
       FROM products p
      WHERE p.is_active
        AND COALESCE((SELECT SUM(on_hand) FROM stock_levels WHERE product_id = p.id), 0) > 0
        AND NOT EXISTS (
          SELECT 1 FROM stock_movements m3
           WHERE m3.product_id = p.id
             AND m3.movement_type IN ('ISSUE','TRANSFER','WASTE')
             AND m3.created_at > now() - ($1 || ' days')::interval)
      ORDER BY on_hand DESC LIMIT 15`,
    [days],
  );

  const byProject = await query(
    `SELECT pr.id, pr.code, pr.name, pr.status,
            SUM(CASE WHEN m.movement_type IN ('ISSUE','TRANSFER') THEN m.quantity ELSE 0 END)::float AS issued_units,
            SUM(CASE WHEN m.movement_type IN ('ISSUE','TRANSFER')
                     THEN m.quantity * COALESCE(m.unit_cost, p.unit_cost) ELSE 0 END)::float AS issued_value,
            SUM(CASE WHEN m.movement_type = 'RETURN' THEN m.quantity ELSE 0 END)::float AS returned_units
       FROM stock_movements m
       JOIN products p ON p.id = m.product_id
       JOIN projects pr ON pr.id = m.project_id
      WHERE m.created_at > now() - ($1 || ' days')::interval
      GROUP BY pr.id, pr.code, pr.name, pr.status
      ORDER BY issued_units DESC LIMIT 15`,
    [days],
  );

  const byType = await query(
    `SELECT movement_type, COUNT(*)::int AS count, SUM(quantity)::float AS units
       FROM stock_movements
      WHERE created_at > now() - ($1 || ' days')::interval
      GROUP BY movement_type ORDER BY units DESC`,
    [days],
  );

  const activity = await query(
    `SELECT a.id, a.action, a.entity, a.detail, a.created_at, u.full_name AS user_name
       FROM activity_log a LEFT JOIN users u ON u.id = a.user_id
      ORDER BY a.created_at DESC LIMIT 25`,
  );

  return ok({ days, summary, consumption, ageing, byProject, byType, activity });
});
