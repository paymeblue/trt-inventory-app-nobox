import { query, queryOne } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { handle, ok } from "@/lib/api";
import { canManage, SOURCES } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * What each person needs to know, from the reservation log:
 * - the inventory team: every new reservation on their side;
 * - designers: when their reservations are issued to production or released.
 * Anything newer than when they last opened the list is unread.
 */
export const GET = handle(async () => {
  const session = await requireSession();
  const sides = SOURCES.filter((s) => canManage(session.role, s));
  const items = await query(
    `SELECT e.id, e.action, e.created_at, e.note, COALESCE(e.quantity, r.quantity)::float8 AS quantity,
            r.id AS reservation_id, r.ref, r.project, r.source, i.sku, i.name AS item_name, i.unit,
            COALESCE(u.full_name, r.designer_name) AS by_name,
            e.created_at > (SELECT notifications_seen_at FROM users WHERE id = $1) AS unread
       FROM reservation_events e
       JOIN reservations r ON r.id = e.reservation_id
       JOIN items i ON i.id = r.item_id
       LEFT JOIN users u ON u.id = e.created_by
      WHERE e.created_by IS DISTINCT FROM $1
        AND ((e.action = 'RESERVED' AND r.source = ANY($2::text[]))
          OR (e.action IN ('ISSUED','RELEASED','CANCELLED') AND r.reserved_by = $1))
      ORDER BY e.created_at DESC
      LIMIT 30`,
    [session.sub, sides],
  );
  const unread = await queryOne<{ n: number }>(
    `SELECT COUNT(*)::int AS n
       FROM reservation_events e JOIN reservations r ON r.id = e.reservation_id
      WHERE e.created_by IS DISTINCT FROM $1
        AND e.created_at > (SELECT notifications_seen_at FROM users WHERE id = $1)
        AND ((e.action = 'RESERVED' AND r.source = ANY($2::text[]))
          OR (e.action IN ('ISSUED','RELEASED','CANCELLED') AND r.reserved_by = $1))`,
    [session.sub, sides],
  );
  return ok({ items, unread: unread?.n ?? 0 });
});

/** Marks everything read. */
export const POST = handle(async () => {
  const session = await requireSession();
  await query("UPDATE users SET notifications_seen_at = now() WHERE id = $1", [session.sub]);
  return ok({ ok: true });
});
