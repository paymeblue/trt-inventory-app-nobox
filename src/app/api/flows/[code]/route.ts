import { query, queryOne } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { fail, handle, ok } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle(async (_req: Request, ctx: { params: Promise<{ code: string }> }) => {
  await requirePermission("flow:read");
  const { code } = await ctx.params;

  const flow = await queryOne(
    `SELECT id, code, name, category, summary, app_route, source_sheet
       FROM process_flows WHERE upper(code) = upper($1) AND is_active`,
    [code],
  );
  if (!flow) return fail(404, "Process flow not found.");

  const flowId = (flow as { id: string }).id;

  const stages = await query(
    `SELECT id, seq, name, action_by, steps, documents, decision_maker,
            criteria, stakeholders, duration
       FROM process_stages WHERE flow_id = $1 ORDER BY seq`,
    [flowId],
  );

  const runs = await query(
    `SELECT r.id, r.ref, r.title, r.status, r.started_at, r.completed_at,
            p.code AS project_code, u.full_name AS started_by_name,
            (SELECT COUNT(*)::int FROM process_run_stages rs WHERE rs.run_id = r.id) AS total_stages,
            (SELECT COUNT(*)::int FROM process_run_stages rs
              WHERE rs.run_id = r.id AND rs.status IN ('DONE','SKIPPED')) AS done_stages
       FROM process_runs r
       LEFT JOIN projects p ON p.id = r.project_id
       LEFT JOIN users u ON u.id = r.started_by
      WHERE r.flow_id = $1
      ORDER BY r.started_at DESC LIMIT 20`,
    [flowId],
  );

  return ok({ flow, stages, runs });
});
