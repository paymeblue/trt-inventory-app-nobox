import { query } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { handle, ok } from "@/lib/api";
import { companyParam } from "@/lib/company";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Everything at or below its reorder threshold, worst first. */
export const GET = handle(async (req: Request) => {
  await requirePermission("stock:read");
  const url = new URL(req.url);
  const locationId = url.searchParams.get("location") ?? "";
  const company = companyParam(url);

  const params: unknown[] = [];
  let onHandExpr: string;
  if (locationId) {
    onHandExpr = `COALESCE((SELECT on_hand FROM stock_levels WHERE product_id = p.id AND location_id = $${params.push(locationId)}), 0)`;
  } else if (company) {
    onHandExpr = `COALESCE((SELECT SUM(on_hand) FROM stock_levels sl2
                             WHERE sl2.product_id = p.id
                               AND sl2.location_id IN (SELECT id FROM locations WHERE company_id = $${params.push(company)})), 0)`;
  } else {
    onHandExpr = `COALESCE((SELECT SUM(on_hand) FROM stock_levels WHERE product_id = p.id), 0)`;
  }

  const items = await query(
    `SELECT p.id, p.sku, p.name, p.unit, p.image_id, p.shelf_ref,
            p.reorder_level::float AS reorder_level,
            p.unit_cost::float AS unit_cost,
            ${onHandExpr}::float AS on_hand,
            GREATEST(p.reorder_level - ${onHandExpr}, 0)::float AS shortfall,
            c.name AS category_name,
            s.name AS supplier_name, s.phone AS supplier_phone, s.email AS supplier_email,
            (SELECT MAX(m.created_at) FROM stock_movements m
              WHERE m.product_id = p.id AND m.movement_type = 'RECEIPT') AS last_received_at
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN suppliers s ON s.id = p.supplier_id
      WHERE p.is_active
        AND ${onHandExpr} <= GREATEST(p.reorder_level, 0)
      ORDER BY CASE WHEN ${onHandExpr} <= 0 THEN 0 ELSE 1 END,
               (${onHandExpr} - p.reorder_level) ASC,
               p.name`,
    params,
  );

  const locations = await query(
    `SELECT l.id, l.name, l.code, l.kind, c.short_name AS company_name
       FROM locations l LEFT JOIN companies c ON c.id = l.company_id
      WHERE l.is_active ${company ? "AND l.company_id = $1" : ""}
      ORDER BY CASE l.kind WHEN 'WAREHOUSE' THEN 0 WHEN 'FACTORY' THEN 1 WHEN 'SITE' THEN 2 ELSE 3 END, l.name`,
    company ? [company] : [],
  );
  return ok({ items, locations });
});
