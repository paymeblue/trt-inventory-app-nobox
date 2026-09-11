import { query, queryOne } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { handle, ok } from "@/lib/api";
import { companyParam } from "@/lib/company";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Product rows with one on-hand column per location — the stock matrix. */
export const GET = handle(async (req: Request) => {
  await requirePermission("stock:read");
  const url = new URL(req.url);
  const search = url.searchParams.get("q")?.trim() ?? "";
  const locationId = url.searchParams.get("location") ?? "";
  const company = companyParam(url);
  const status = url.searchParams.get("status") ?? "";
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const pageSize = Math.min(100, Math.max(5, Number(url.searchParams.get("pageSize") ?? 30)));

  const locations = await query<{ id: string; name: string; code: string; kind: string }>(
    `SELECT l.id, l.name, l.code, l.kind, c.short_name AS company_name, c.colour AS company_colour
       FROM locations l LEFT JOIN companies c ON c.id = l.company_id
      WHERE l.is_active ${company ? "AND l.company_id = $1" : ""}
      ORDER BY CASE l.kind WHEN 'WAREHOUSE' THEN 0 WHEN 'FACTORY' THEN 1 WHEN 'SITE' THEN 2 ELSE 3 END, l.name`,
    company ? [company] : [],
  );

  const where: string[] = ["p.is_active = true"];
  const params: unknown[] = [];

  if (search) {
    params.push(`%${search}%`);
    where.push(`(p.name ILIKE $${params.length} OR p.sku ILIKE $${params.length})`);
  }

  let totalExpr: string;
  if (locationId) {
    totalExpr = `COALESCE((SELECT on_hand FROM stock_levels WHERE product_id = p.id AND location_id = $${params.push(locationId)}), 0)`;
  } else if (company) {
    totalExpr = `COALESCE((SELECT SUM(on_hand) FROM stock_levels sl2
                            WHERE sl2.product_id = p.id
                              AND sl2.location_id IN (SELECT id FROM locations WHERE company_id = $${params.push(company)})), 0)`;
  } else {
    totalExpr = `COALESCE((SELECT SUM(on_hand) FROM stock_levels WHERE product_id = p.id), 0)`;
  }

  if (status === "out") where.push(`${totalExpr} <= 0`);
  if (status === "low") where.push(`${totalExpr} > 0 AND p.reorder_level > 0 AND ${totalExpr} <= p.reorder_level`);

  const whereSql = `WHERE ${where.join(" AND ")}`;

  // The count wraps the same projection so every bound parameter is referenced.
  // Counting straight off `products` would leave the location/company parameter
  // unused, which Postgres rejects outright.
  const countRow = await queryOne<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM (
       SELECT p.id, ${totalExpr} AS total FROM products p ${whereSql}
     ) counted`,
    params,
  );

  params.push(pageSize, (page - 1) * pageSize);
  const items = await query(
    `SELECT p.id, p.sku, p.name, p.unit, p.unit_cost::float AS unit_cost,
            p.reorder_level::float AS reorder_level, p.image_id,
            c.name AS category_name,
            ${totalExpr}::float AS total_on_hand,
            COALESCE((
              SELECT json_agg(json_build_object(
                       'locationId', sl.location_id,
                       'onHand', sl.on_hand::float,
                       'reserved', sl.reserved::float))
                FROM stock_levels sl WHERE sl.product_id = p.id AND sl.on_hand <> 0
                  AND sl.location_id IN (SELECT id FROM locations WHERE is_active)
            ), '[]'::json) AS levels
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       ${whereSql}
      ORDER BY p.name
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  return ok({ items, locations, total: Number(countRow!.n), page, pageSize });
});
