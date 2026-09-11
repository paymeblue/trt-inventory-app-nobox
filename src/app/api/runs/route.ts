import { query, transaction } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { fail, handle, ok, readJson } from "@/lib/api";
import { logActivity } from "@/lib/inventory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request) => {
  await requirePermission("flow:read");
  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? "";
  const flow = url.searchParams.get("flow") ?? "";

  const where: string[] = [];
  const params: unknown[] = [];
  if (status) {
    params.push(status);
    where.push(`r.status = $${params.length}`);
  }
  if (flow) {
    params.push(flow);
    where.push(`f.code = $${params.length}`);
  }

  const items = await query(
    `SELECT r.id, r.ref, r.title, r.status, r.started_at, r.completed_at, r.notes,
            f.code AS flow_code, f.name AS flow_name, f.category AS flow_category,
            p.code AS project_code, c.short_name AS company_name,
            u.full_name AS started_by_name,
            (SELECT COUNT(*)::int FROM process_run_stages rs WHERE rs.run_id = r.id) AS total_stages,
            (SELECT COUNT(*)::int FROM process_run_stages rs
              WHERE rs.run_id = r.id AND rs.status IN ('DONE','SKIPPED')) AS done_stages,
            (SELECT s.name FROM process_run_stages rs
               JOIN process_stages s ON s.id = rs.stage_id
              WHERE rs.run_id = r.id AND rs.status NOT IN ('DONE','SKIPPED')
              ORDER BY rs.seq LIMIT 1) AS next_stage
       FROM process_runs r
       JOIN process_flows f ON f.id = r.flow_id
       LEFT JOIN projects p ON p.id = r.project_id
       LEFT JOIN companies c ON c.id = r.company_id
       LEFT JOIN users u ON u.id = r.started_by
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY CASE r.status WHEN 'ACTIVE' THEN 0 WHEN 'ON_HOLD' THEN 1 ELSE 2 END,
               r.started_at DESC
      LIMIT 200`,
    params,
  );

  const counts = await query<{ status: string; n: string }>(
    "SELECT status, COUNT(*)::text AS n FROM process_runs GROUP BY status",
  );

  return ok({ items, counts });
});

type Body = {
  flowCode?: string;
  title?: string;
  projectId?: string | null;
  companyId?: string | null;
  notes?: string;
};

/** Starts a run: copies the flow's stages onto the instance as a live checklist. */
export const POST = handle(async (req: Request) => {
  const session = await requirePermission("flow:run");
  const body = await readJson<Body>(req);

  const flowCode = body.flowCode?.trim();
  const title = body.title?.trim();
  if (!flowCode) return fail(400, "Choose a process flow to start.");
  if (!title) return fail(400, "Give this run a title so people can find it.");

  const result = await transaction(async (client) => {
    const { rows: flows } = await client.query<{ id: string; code: string; name: string }>(
      "SELECT id, code, name FROM process_flows WHERE upper(code) = upper($1) AND is_active",
      [flowCode],
    );
    const flow = flows[0];
    if (!flow) return null;

    const year = new Date().getFullYear();
    const { rows: seqRows } = await client.query<{ n: string }>(
      "SELECT COUNT(*)::text AS n FROM process_runs WHERE ref LIKE $1",
      [`${flow.code}-${year}-%`],
    );
    const ref = `${flow.code}-${year}-${String(Number(seqRows[0].n) + 1).padStart(3, "0")}`;

    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO process_runs (ref, flow_id, title, project_id, company_id, notes, started_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [ref, flow.id, title, body.projectId || null, body.companyId || null,
       body.notes ?? null, session.sub],
    );
    const runId = rows[0].id;

    await client.query(
      `INSERT INTO process_run_stages (run_id, stage_id, seq)
       SELECT $1, s.id, s.seq FROM process_stages s WHERE s.flow_id = $2 ORDER BY s.seq`,
      [runId, flow.id],
    );

    await logActivity(client, session.sub, "START", "process_run", runId, `${ref} — ${title}`);
    return { id: runId, ref };
  });

  if (!result) return fail(404, "That process flow does not exist.");
  return ok(result, { status: 201 });
});
