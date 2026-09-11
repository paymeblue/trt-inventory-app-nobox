import { query } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { handle, ok } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Companies in the group, each with its live stock position. */
export const GET = handle(async () => {
  await requireSession();

  const items = await query(
    `SELECT c.id, c.code, c.name, c.short_name, c.colour, c.parent_id,
            p.short_name AS parent_name,
            COALESCE(s.locations, 0)::int AS location_count,
            COALESCE(s.skus, 0)::int      AS sku_count,
            COALESCE(s.units, 0)::float   AS total_units,
            COALESCE(s.value, 0)::float   AS total_value
       FROM companies c
       LEFT JOIN companies p ON p.id = c.parent_id
       LEFT JOIN (
         SELECT l.company_id,
                COUNT(DISTINCT l.id)                              AS locations,
                COUNT(DISTINCT sl.product_id) FILTER (WHERE sl.on_hand > 0) AS skus,
                SUM(sl.on_hand)                                   AS units,
                SUM(sl.on_hand * pr.unit_cost)                    AS value
           FROM locations l
           LEFT JOIN stock_levels sl ON sl.location_id = l.id
           LEFT JOIN products pr ON pr.id = sl.product_id AND pr.is_active
          GROUP BY l.company_id
       ) s ON s.company_id = c.id
      WHERE c.is_active
      ORDER BY c.parent_id NULLS FIRST, c.name`,
  );

  return ok({ items });
});
