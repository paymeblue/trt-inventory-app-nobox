import { query, queryOne } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { fail, handle, ok } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await requirePermission("flow:read");
  const { id } = await ctx.params;

  const run = await queryOne(
    `SELECT r.*, f.code AS flow_code, f.name AS flow_name, f.category AS flow_category,
            f.summary AS flow_summary, f.app_route AS flow_app_route,
            p.code AS project_code, p.name AS project_name,
            c.short_name AS company_name,
            u.full_name AS started_by_name
       FROM process_runs r
       JOIN process_flows f ON f.id = r.flow_id
       LEFT JOIN projects p ON p.id = r.project_id
       LEFT JOIN companies c ON c.id = r.company_id
       LEFT JOIN users u ON u.id = r.started_by
      WHERE r.id = $1`,
    [id],
  );
  if (!run) return fail(404, "Process run not found.");

  const stages = await query(
    `SELECT rs.id, rs.seq, rs.status, rs.notes, rs.due_on,
            rs.started_at, rs.completed_at,
            s.name, s.action_by, s.steps, s.documents, s.decision_maker,
            s.criteria, s.stakeholders, s.duration,
            a.full_name AS assigned_to_name, rs.assigned_to,
            d.full_name AS completed_by_name
       FROM process_run_stages rs
       JOIN process_stages s ON s.id = rs.stage_id
       LEFT JOIN users a ON a.id = rs.assigned_to
       LEFT JOIN users d ON d.id = rs.completed_by
      WHERE rs.run_id = $1
      ORDER BY rs.seq`,
    [id],
  );

  return ok({ run, stages });
});
