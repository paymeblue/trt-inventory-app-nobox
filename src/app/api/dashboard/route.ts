import { query } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { handle, ok } from "@/lib/api";
import { isSource } from "@/lib/rbac";
import { AVAILABLE_SQL, ISSUED_SQL, RESERVED_SQL, STATUS_SQL } from "@/lib/items";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The workbook's Dashboard sheet: Total Materials, Opening Qty, Available Qty,
 * Reserved Qty, Issued Qty, Low Stock SKUs (LOW + REORDER NOW + OUT OF STOCK),
 * and the materials that need reordering.
 */
export const GET = handle(async (req: Request) => {
  await requireSession();
  const source = new URL(req.url).searchParams.get("source");
  const scope = isSource(source) ? "WHERE i.source = $1" : "";
  const params = isSource(source) ? [source] : [];

  const [totals, reorder] = await Promise.all([
    query(
      `SELECT COUNT(*)::int AS total_materials,
              COALESCE(SUM(i.opening_qty),0)::float8 AS opening_qty,
              COALESCE(SUM(${AVAILABLE_SQL}),0)::float8 AS available_qty,
              COALESCE(SUM(${RESERVED_SQL}),0)::float8 AS reserved_qty,
              COALESCE(SUM(${ISSUED_SQL}),0)::float8 AS issued_qty,
              COUNT(*) FILTER (WHERE ${STATUS_SQL} IN ('LOW','REORDER NOW','OUT OF STOCK'))::int AS low_stock_skus,
              COUNT(*) FILTER (WHERE ${STATUS_SQL} = 'REORDER NOW')::int AS reorder_now,
              COUNT(*) FILTER (WHERE ${STATUS_SQL} = 'OUT OF STOCK')::int AS out_of_stock
         FROM items i ${scope}`,
      params,
    ),
    query(
      `SELECT * FROM (
         SELECT i.id, i.source, i.sku, i.name, i.category, i.unit, i.reorder_level::float8 AS reorder_level,
                i.reorder_quantity::float8 AS reorder_quantity, (${AVAILABLE_SQL})::float8 AS available,
                ${STATUS_SQL} AS reorder_status
           FROM items i ${scope}) x
        WHERE x.reorder_status IN ('REORDER NOW','OUT OF STOCK')
        ORDER BY x.reorder_status = 'OUT OF STOCK' DESC, x.available, x.sku
        LIMIT 100`,
      params,
    ),
  ]);
  return ok({ ...totals[0], reorder });
});
