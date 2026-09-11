import { query, queryOne } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { fail, handle, ok, readJson } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  await requirePermission("location:read");
  const rows = await query(
    `SELECT l.id, l.code, l.name, l.kind, l.address, l.is_active,
            l.company_id, co.short_name AS company_name, co.colour AS company_colour,
            COALESCE(s.skus, 0)::int AS sku_count,
            COALESCE(s.units, 0)::float AS total_units,
            COALESCE(s.value, 0)::float AS total_value
       FROM locations l
       LEFT JOIN companies co ON co.id = l.company_id
       LEFT JOIN (
         SELECT sl.location_id,
                COUNT(*) FILTER (WHERE sl.on_hand > 0) AS skus,
                SUM(sl.on_hand) AS units,
                SUM(sl.on_hand * p.unit_cost) AS value
           FROM stock_levels sl JOIN products p ON p.id = sl.product_id
          GROUP BY sl.location_id
       ) s ON s.location_id = l.id
      ORDER BY CASE l.kind WHEN 'WAREHOUSE' THEN 0 WHEN 'FACTORY' THEN 1 WHEN 'SITE' THEN 2 ELSE 3 END, l.name`,
  );
  return ok({ items: rows });
});

export const POST = handle(async (req: Request) => {
  await requirePermission("location:write");
  const body = await readJson<{ code?: string; name?: string; kind?: string; address?: string }>(req);
  const code = body.code?.trim().toUpperCase();
  const name = body.name?.trim();
  if (!code || !name) return fail(400, "A code and a name are required.");

  const row = await queryOne(
    "INSERT INTO locations (code, name, kind, address) VALUES ($1,$2,$3,$4) RETURNING id",
    [code, name, body.kind ?? "WAREHOUSE", body.address ?? null],
  );
  return ok(row, { status: 201 });
});
