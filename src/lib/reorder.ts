import type { PoolClient } from "pg";
import type { Source } from "./rbac";

/**
 * Reorder_Level and Reorder_Quantity, worked out from what each material
 * actually uses: the issues posted against it (Stock_Issue_Log, plus the
 * Issued impact of Additional Issue and Return to Stock adjustments) over the
 * last USAGE_WINDOW_DAYS.
 *
 *   daily usage   d̄ = issued in the window ÷ days in the window
 *   variability   σ = standard deviation of the daily issued quantity
 *   Reorder_Level    = d̄ × lead time + Z × σ × √lead time   (demand during the lead time + safety stock)
 *   Reorder_Quantity = d̄ × days of cover                     (enough for one order cycle)
 *
 * Both are rounded up to whole units. Z = 1.65 aims to run out in no more than
 * 1 lead time in 20. Lead time and days of cover are set per side, and a
 * material may have its own lead time. A value a manager set by hand is kept.
 */
export const USAGE_WINDOW_DAYS = 90;
/** A new material's usage is spread over at least this many days, so one early issue does not look like a trend. */
export const MIN_WINDOW_DAYS = 7;
export const SERVICE_Z = 1.65;
/** The figures move as days pass without an issue, so they are worked out again at least this often. */
const REFRESH_MINUTES = 60;

export type SideSettings = { source: Source; lead_time_days: number; cover_days: number; reorder_calculated_at: string | null };

type Db = Pick<PoolClient, "query">;

/** Works the figures out again for one material, one side, or (with no scope) everything. */
export async function recalculateReorder(db: Db, scope: { itemId?: string; source?: Source } = {}) {
  await db.query(
    `WITH daily AS (
       SELECT u.item_id, u.day, GREATEST(SUM(u.qty), 0) AS qty FROM (
         SELECT s.item_id, s.created_at::date AS day, s.quantity AS qty
           FROM stock_issues s WHERE ($1::uuid IS NULL OR s.item_id = $1) AND s.created_at >= now() - make_interval(days => $3::int)
         UNION ALL
         SELECT a.item_id, a.created_at::date, a.issued_impact
           FROM stock_adjustments a WHERE ($1::uuid IS NULL OR a.item_id = $1) AND a.issued_impact <> 0 AND a.created_at >= now() - make_interval(days => $3::int)
       ) u
       GROUP BY u.item_id, u.day
     ),
     stats AS (
       SELECT i.id,
              GREATEST($4::int, LEAST($3::int, EXTRACT(EPOCH FROM now() - i.created_at) / 86400))::float8 AS days,
              COALESCE(i.lead_time_days, ss.lead_time_days)::float8 AS lead,
              ss.cover_days::float8 AS cover,
              COALESCE(SUM(d.qty), 0)::float8 AS total,
              COALESCE(SUM(d.qty * d.qty), 0)::float8 AS sumsq
         FROM items i
         JOIN side_settings ss ON ss.source = i.source
         LEFT JOIN daily d ON d.item_id = i.id
        WHERE ($1::uuid IS NULL OR i.id = $1) AND ($2::text IS NULL OR i.source = $2)
          AND NOT (i.reorder_level_manual AND i.reorder_quantity_manual)
        GROUP BY i.id, ss.lead_time_days, ss.cover_days
     ),
     calc AS (
       SELECT id, lead, cover, total / days AS mean,
              SQRT(GREATEST(sumsq / days - (total / days) ^ 2, 0)) AS sd
         FROM stats
     )
     UPDATE items i SET
       reorder_level = CASE WHEN i.reorder_level_manual THEN i.reorder_level
                            ELSE CEIL(c.mean * c.lead + $5::float8 * c.sd * SQRT(c.lead)) END,
       reorder_quantity = CASE WHEN i.reorder_quantity_manual THEN i.reorder_quantity
                               ELSE CEIL(c.mean * c.cover) END
       FROM calc c
      WHERE c.id = i.id`,
    [scope.itemId ?? null, scope.source ?? null, USAGE_WINDOW_DAYS, MIN_WINDOW_DAYS, SERVICE_Z],
  );
  if (!scope.itemId) {
    await db.query(
      "UPDATE side_settings SET reorder_calculated_at = now() WHERE $1::text IS NULL OR source = $1",
      [scope.source ?? null],
    );
  }
}

/**
 * Works everything out again if it has not been done in the last hour. Only
 * one caller wins the claim, so concurrent page loads do the work once.
 */
export async function refreshReorderIfStale(db: Db) {
  const { rowCount } = await db.query(
    `UPDATE side_settings SET reorder_calculated_at = now()
      WHERE reorder_calculated_at IS NULL OR reorder_calculated_at < now() - make_interval(mins => $1)`,
    [REFRESH_MINUTES],
  );
  if (rowCount) await recalculateReorder(db);
}

export async function sideSettings(db: Db, source: Source): Promise<SideSettings> {
  const { rows } = await db.query<SideSettings>(
    `SELECT source, lead_time_days::float8 AS lead_time_days, cover_days::float8 AS cover_days, reorder_calculated_at
       FROM side_settings WHERE source = $1`,
    [source],
  );
  return rows[0];
}
