import { query } from "@/lib/db";
import { getSession } from "@/lib/session";
import { handle, ok } from "@/lib/api";
import { isSource } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Most recent quantity changes, optionally for one side. With `since` (an ISO
 * time) only changes after it are returned, oldest first, for notifications.
 */
export const GET = handle(async (req: Request) => {
  const session = await getSession();
  const p = new URL(req.url).searchParams;
  const source = p.get("source");
  const since = p.get("since");
  const params: unknown[] = [];
  const conditions: string[] = [];
  if (isSource(source)) {
    params.push(source);
    conditions.push(`m.source = $${params.length}`);
  }
  if (since && !Number.isNaN(Date.parse(since))) {
    params.push(since);
    conditions.push(`m.created_at > $${params.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const items = await query(
    `SELECT m.id, m.kind, m.delta::float8 AS delta, m.balance_after::float8 AS balance_after,
            m.note, m.created_at, m.source,
            -- Full microsecond precision; a JS Date would round it to milliseconds.
            to_json(m.created_at) #>> '{}' AS cursor, i.id AS item_id, i.sku, i.name, i.unit,
            u.full_name AS by_name
       FROM item_movements m
       JOIN items i ON i.id = m.item_id
       LEFT JOIN users u ON u.id = m.created_by
       ${where}
      ORDER BY m.created_at ${since ? "ASC" : "DESC"}
      LIMIT 25`,
    params,
  );
  // Browsing is public, but who made each change is only shown to staff.
  return ok({ items: session ? items : items.map((i) => ({ ...i, by_name: null })) });
});
