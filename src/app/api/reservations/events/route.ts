import { query } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { handle, ok } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Reservation activity for live notifications. Without `since`, returns only
 * the newest event (the starting cursor); with it, events after it, oldest first.
 */
export const GET = handle(async (req: Request) => {
  await requireSession();
  const since = new URL(req.url).searchParams.get("since");
  const params: unknown[] = [];
  let where = "";
  if (since && !Number.isNaN(Date.parse(since))) {
    params.push(since);
    where = "WHERE e.created_at > $1";
  }
  const items = await query(
    `SELECT e.id, e.action, e.note, e.created_at, to_json(e.created_at) #>> '{}' AS cursor,
            r.id AS reservation_id, r.ref, r.source, COALESCE(e.quantity, r.quantity)::float8 AS quantity, r.project,
            r.reserved_by, i.name AS item_name, i.unit, u.full_name AS by_name, e.created_by
       FROM reservation_events e
       JOIN reservations r ON r.id = e.reservation_id
       JOIN items i ON i.id = r.item_id
       LEFT JOIN users u ON u.id = e.created_by
       ${where}
      ORDER BY e.created_at ${where ? "ASC" : "DESC"}
      LIMIT ${where ? 25 : 1}`,
    params,
  );
  return ok({ items });
});
