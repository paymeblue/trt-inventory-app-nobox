import { query, queryOne } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { handle, ok } from "@/lib/api";
import { companyParam } from "@/lib/company";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request) => {
  await requirePermission("stock:read");
  const url = new URL(req.url);

  const search = url.searchParams.get("q")?.trim() ?? "";
  const type = url.searchParams.get("type") ?? "";
  const locationId = url.searchParams.get("location") ?? "";
  const productId = url.searchParams.get("product") ?? "";
  const projectId = url.searchParams.get("project") ?? "";
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const pageSize = Math.min(200, Math.max(5, Number(url.searchParams.get("pageSize") ?? 30)));

  const where: string[] = [];
  const params: unknown[] = [];

  if (search) {
    params.push(`%${search}%`);
    where.push(`(p.name ILIKE $${params.length} OR p.sku ILIKE $${params.length} OR m.reference ILIKE $${params.length})`);
  }
  if (type) {
    params.push(type);
    where.push(`m.movement_type = $${params.length}`);
  }
  if (locationId) {
    params.push(locationId);
    where.push(`(m.from_location_id = $${params.length} OR m.to_location_id = $${params.length})`);
  }
  const company = companyParam(url);
  if (company) {
    params.push(company);
    where.push(
      `(m.from_location_id IN (SELECT id FROM locations WHERE company_id = $${params.length})` +
      ` OR m.to_location_id IN (SELECT id FROM locations WHERE company_id = $${params.length}))`,
    );
  }
  if (productId) {
    params.push(productId);
    where.push(`m.product_id = $${params.length}`);
  }
  if (projectId) {
    params.push(projectId);
    where.push(`m.project_id = $${params.length}`);
  }
  if (from) {
    params.push(from);
    where.push(`m.created_at >= $${params.length}::date`);
  }
  if (to) {
    params.push(to);
    where.push(`m.created_at < ($${params.length}::date + interval '1 day')`);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const countRow = await queryOne<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM stock_movements m JOIN products p ON p.id = m.product_id ${whereSql}`,
    params,
  );

  params.push(pageSize, (page - 1) * pageSize);
  const items = await query(
    `SELECT m.id, m.movement_type, m.quantity::float AS quantity, m.reference, m.notes, m.created_at,
            m.unit_cost::float AS unit_cost,
            p.id AS product_id, p.sku, p.name AS product_name, p.unit, p.image_id,
            fl.name AS from_location, tl.name AS to_location,
            u.full_name AS created_by_name, pr.name AS project_name, pr.code AS project_code
       FROM stock_movements m
       JOIN products p ON p.id = m.product_id
       LEFT JOIN locations fl ON fl.id = m.from_location_id
       LEFT JOIN locations tl ON tl.id = m.to_location_id
       LEFT JOIN users u ON u.id = m.created_by
       LEFT JOIN projects pr ON pr.id = m.project_id
       ${whereSql}
      ORDER BY m.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  return ok({ items, total: Number(countRow!.n), page, pageSize });
});
