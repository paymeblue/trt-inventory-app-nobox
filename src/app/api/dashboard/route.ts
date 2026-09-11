import { query, queryOne } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { handle, ok } from "@/lib/api";
import { companyParam } from "@/lib/company";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request) => {
  await requirePermission("product:read");
  const company = companyParam(new URL(req.url));

  // Every stock figure is scoped to the locations the chosen company owns.
  const scope = company
    ? "AND location_id IN (SELECT id FROM locations WHERE company_id = $1)"
    : "";
  const scopeJoin = company
    ? "AND sl.location_id IN (SELECT id FROM locations WHERE company_id = $1)"
    : "";
  const args = company ? [company] : [];

  const onHand = `COALESCE((SELECT SUM(on_hand) FROM stock_levels WHERE product_id = p.id ${scope}), 0)`;
  const totals = await queryOne<Record<string, string>>(
    `SELECT
       (SELECT COUNT(*) FROM products WHERE is_active)::text AS active_skus,
       (SELECT COALESCE(SUM(sl.on_hand * p.unit_cost), 0)
          FROM stock_levels sl JOIN products p ON p.id = sl.product_id
         WHERE p.is_active ${scopeJoin})::text AS stock_value,
       (SELECT COALESCE(SUM(sl.on_hand), 0)
          FROM stock_levels sl JOIN products p ON p.id = sl.product_id
         WHERE p.is_active ${scopeJoin})::text AS total_units,
       (SELECT COUNT(*) FROM products p WHERE p.is_active AND ${onHand} <= 0)::text AS out_of_stock,
       (SELECT COUNT(*) FROM products p WHERE p.is_active AND p.reorder_level > 0
          AND ${onHand} > 0 AND ${onHand} <= p.reorder_level)::text AS low_stock,
       (SELECT COUNT(*) FROM requisitions WHERE status = 'SUBMITTED')::text AS pending_approval,
       (SELECT COUNT(*) FROM requisitions WHERE status = 'APPROVED')::text AS awaiting_issue,
       (SELECT COUNT(*) FROM requisitions WHERE status = 'ISSUED')::text AS in_transit,
       (SELECT COUNT(*) FROM goods_receipts WHERE status = 'DRAFT')::text AS draft_receipts,
       (SELECT COUNT(*) FROM projects WHERE status IN ('PLANNING','IN_PRODUCTION','INSTALLATION'))::text AS active_projects`,
    args,
  );

  // 14-day in/out trend, zero-filled so the chart has no gaps.
  const trend = await query(
    `WITH days AS (
       SELECT generate_series(current_date - interval '13 days', current_date, interval '1 day')::date AS day
     )
     SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
            COALESCE(SUM(CASE WHEN m.movement_type IN ('RECEIPT','RETURN','OPENING') THEN m.quantity ELSE 0 END), 0)::float AS inbound,
            COALESCE(SUM(CASE WHEN m.movement_type IN ('ISSUE','WASTE') THEN m.quantity ELSE 0 END), 0)::float AS outbound
       FROM days d
       LEFT JOIN stock_movements m ON m.created_at::date = d.day
        ${company
          ? `AND (m.from_location_id IN (SELECT id FROM locations WHERE company_id = $1)
                  OR m.to_location_id IN (SELECT id FROM locations WHERE company_id = $1))`
          : ""}
      GROUP BY d.day ORDER BY d.day`,
    args,
  );

  const byLocation = await query(
    `SELECT l.id, l.name, l.code, l.kind, co.short_name AS company_name,
            COALESCE(SUM(sl.on_hand * p.unit_cost), 0)::float AS value,
            COALESCE(SUM(sl.on_hand), 0)::float AS units,
            COUNT(*) FILTER (WHERE sl.on_hand > 0)::int AS skus
       FROM locations l
       LEFT JOIN companies co ON co.id = l.company_id
       LEFT JOIN stock_levels sl ON sl.location_id = l.id
       LEFT JOIN products p ON p.id = sl.product_id AND p.is_active
      WHERE l.is_active ${company ? "AND l.company_id = $1" : ""}
      GROUP BY l.id, l.name, l.code, l.kind, co.short_name
      ORDER BY value DESC`,
    args,
  );

  const byCategory = await query(
    `SELECT COALESCE(c.name, 'Uncategorised') AS name,
            COALESCE(SUM(sl.on_hand * p.unit_cost), 0)::float AS value
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN stock_levels sl ON sl.product_id = p.id
      WHERE p.is_active ${scopeJoin}
      GROUP BY c.name
     HAVING COALESCE(SUM(sl.on_hand * p.unit_cost), 0) > 0
      ORDER BY value DESC LIMIT 8`,
    args,
  );

  const criticalStock = await query(
    `SELECT p.id, p.sku, p.name, p.unit, p.image_id,
            p.reorder_level::float AS reorder_level,
            ${onHand}::float AS on_hand,
            s.name AS supplier_name
       FROM products p LEFT JOIN suppliers s ON s.id = p.supplier_id
      WHERE p.is_active AND ${onHand} <= GREATEST(p.reorder_level, 0)
      ORDER BY (${onHand} - p.reorder_level) ASC
      LIMIT 8`,
    args,
  );

  const recentMovements = await query(
    `SELECT m.id, m.movement_type, m.quantity::float AS quantity, m.created_at, m.reference,
            p.sku, p.name AS product_name, p.unit, p.image_id,
            fl.name AS from_location, tl.name AS to_location, u.full_name AS created_by_name
       FROM stock_movements m
       JOIN products p ON p.id = m.product_id
       LEFT JOIN locations fl ON fl.id = m.from_location_id
       LEFT JOIN locations tl ON tl.id = m.to_location_id
       LEFT JOIN users u ON u.id = m.created_by
      ORDER BY m.created_at DESC LIMIT 8`,
  );

  const openRequisitions = await query(
    `SELECT r.id, r.ref, r.title, r.status, r.priority, r.needed_by, r.created_at,
            p.code AS project_code, u.full_name AS requested_by_name
       FROM requisitions r
       LEFT JOIN projects p ON p.id = r.project_id
       LEFT JOIN users u ON u.id = r.requested_by
      WHERE r.status IN ('SUBMITTED','APPROVED','ISSUED')
      ORDER BY CASE r.priority WHEN 'URGENT' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'NORMAL' THEN 2 ELSE 3 END,
               r.created_at ASC
      LIMIT 6`,
  );

  const byCompany = await query(
    `SELECT c.id, c.code, c.short_name AS name, c.colour,
            COALESCE(SUM(sl.on_hand * p.unit_cost), 0)::float AS value,
            COALESCE(SUM(sl.on_hand), 0)::float AS units,
            COUNT(DISTINCT sl.product_id) FILTER (WHERE sl.on_hand > 0)::int AS skus,
            COUNT(DISTINCT l.id)::int AS locations
       FROM companies c
       LEFT JOIN locations l ON l.company_id = c.id AND l.is_active
       LEFT JOIN stock_levels sl ON sl.location_id = l.id
       LEFT JOIN products p ON p.id = sl.product_id AND p.is_active
      WHERE c.is_active
      GROUP BY c.id, c.code, c.short_name, c.colour
      ORDER BY value DESC`,
  );

  return ok({ totals, trend, byLocation, byCategory, byCompany, criticalStock, recentMovements, openRequisitions });
});
