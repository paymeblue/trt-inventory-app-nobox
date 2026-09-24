import { queryOne } from "@/lib/db";
import { handle, ok } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A fingerprint of everything the item screens show. Screens poll this every
 * few seconds and only re-fetch the full list when it changes, which keeps
 * them near-instant without hammering the database.
 */
export const GET = handle(async () => {
  const row = await queryOne<{ v: string }>(
    `SELECT concat_ws(':',
       (SELECT COUNT(*) FROM items),
       (SELECT extract(epoch FROM max(updated_at)) FROM items),
       (SELECT COUNT(*) FROM categories),
       (SELECT extract(epoch FROM max(updated_at)) FROM categories),
       (SELECT extract(epoch FROM max(created_at)) FROM item_movements),
       (SELECT extract(epoch FROM max(created_at)) FROM reservation_events)
     ) AS v`,
  );
  return ok({ version: row?.v ?? "", now: new Date().toISOString() });
});
