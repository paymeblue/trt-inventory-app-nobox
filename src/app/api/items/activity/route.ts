import { query } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { handle, ok } from "@/lib/api";
import { isSource } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Most recent quantity changes, optionally for one side. */
export const GET = handle(async (req: Request) => {
  await requireSession();
  const source = new URL(req.url).searchParams.get("source");
  const params: unknown[] = [];
  let where = "";
  if (isSource(source)) {
    params.push(source);
    where = "WHERE m.source = $1";
  }

  const items = await query(
    `SELECT m.id, m.kind, m.delta::float8 AS delta, m.balance_after::float8 AS balance_after,
            m.note, m.created_at, m.source, i.id AS item_id, i.sku, i.name, i.unit,
            u.full_name AS by_name
       FROM item_movements m
       JOIN items i ON i.id = m.item_id
       LEFT JOIN users u ON u.id = m.created_by
       ${where}
      ORDER BY m.created_at DESC
      LIMIT 25`,
    params,
  );
  return ok({ items });
});
