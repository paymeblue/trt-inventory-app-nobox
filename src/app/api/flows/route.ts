import { query } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { handle, ok } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** All process flows from the workbook, with stage counts and live run counts. */
export const GET = handle(async () => {
  await requirePermission("flow:read");

  const items = await query(
    `SELECT f.id, f.code, f.name, f.category, f.summary, f.app_route, f.source_sheet,
            (SELECT COUNT(*)::int FROM process_stages s WHERE s.flow_id = f.id) AS stage_count,
            (SELECT COUNT(*)::int FROM process_runs r WHERE r.flow_id = f.id AND r.status = 'ACTIVE') AS active_runs,
            (SELECT COUNT(*)::int FROM process_runs r WHERE r.flow_id = f.id AND r.status = 'COMPLETED') AS completed_runs
       FROM process_flows f
      WHERE f.is_active
      ORDER BY f.sort_order, f.name`,
  );

  return ok({ items });
});
