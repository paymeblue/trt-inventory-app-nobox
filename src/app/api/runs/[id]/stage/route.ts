import { transaction } from "@/lib/db";
import { requirePermission, HttpError } from "@/lib/session";
import { fail, handle, ok, readJson } from "@/lib/api";
import { logActivity } from "@/lib/inventory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  stageId?: string;
  status?: "PENDING" | "IN_PROGRESS" | "DONE" | "SKIPPED" | "BLOCKED";
  assignedTo?: string | null;
  notes?: string | null;
  dueOn?: string | null;
};

const STATUSES = ["PENDING", "IN_PROGRESS", "DONE", "SKIPPED", "BLOCKED"];

/** Updates one stage of a run and closes the run when every stage is settled. */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const session = await requirePermission("flow:run");
  const { id } = await ctx.params;
  const body = await readJson<Body>(req);

  if (!body.stageId) return fail(400, "Which stage?");
  if (body.status && !STATUSES.includes(body.status)) return fail(400, "Unknown stage status.");

  const result = await transaction(async (client) => {
    const { rows: runRows } = await client.query<{ id: string; ref: string; status: string }>(
      "SELECT id, ref, status FROM process_runs WHERE id = $1 FOR UPDATE",
      [id],
    );
    const run = runRows[0];
    if (!run) throw new HttpError(404, "Process run not found.");
    if (run.status === "COMPLETED" || run.status === "CANCELLED") {
      throw new HttpError(409, `This run is ${run.status.toLowerCase()} and cannot be changed.`);
    }

    const done = body.status === "DONE" || body.status === "SKIPPED";
    const { rows } = await client.query<{ id: string }>(
      `UPDATE process_run_stages SET
         status       = COALESCE($1, status),
         assigned_to  = CASE WHEN $2::boolean THEN $3::uuid ELSE assigned_to END,
         notes        = CASE WHEN $4::boolean THEN $5 ELSE notes END,
         due_on       = CASE WHEN $6::boolean THEN $7::date ELSE due_on END,
         started_at   = CASE WHEN $1 = 'IN_PROGRESS' AND started_at IS NULL THEN now() ELSE started_at END,
         completed_at = CASE WHEN $8::boolean THEN now() WHEN $1 IS NOT NULL THEN NULL ELSE completed_at END,
         completed_by = CASE WHEN $8::boolean THEN $9::uuid WHEN $1 IS NOT NULL THEN NULL ELSE completed_by END
       WHERE id = $10 AND run_id = $11
       RETURNING id`,
      [
        body.status ?? null,
        "assignedTo" in body, body.assignedTo || null,
        "notes" in body, body.notes ?? null,
        "dueOn" in body, body.dueOn || null,
        done, session.sub,
        body.stageId, id,
      ],
    );
    if (!rows[0]) throw new HttpError(400, "That stage does not belong to this run.");

    // Close the run automatically once nothing is outstanding.
    const { rows: left } = await client.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM process_run_stages
        WHERE run_id = $1 AND status NOT IN ('DONE','SKIPPED')`,
      [id],
    );
    const outstanding = Number(left[0].n);
    if (outstanding === 0) {
      await client.query(
        "UPDATE process_runs SET status='COMPLETED', completed_at=now(), updated_at=now() WHERE id=$1",
        [id],
      );
    } else {
      await client.query(
        `UPDATE process_runs
            SET status = CASE WHEN status = 'COMPLETED' THEN 'ACTIVE' ELSE status END,
                completed_at = CASE WHEN status = 'COMPLETED' THEN NULL ELSE completed_at END,
                updated_at = now()
          WHERE id = $1`,
        [id],
      );
    }

    await logActivity(client, session.sub, body.status ?? "UPDATE", "process_run", id, run.ref);
    return { outstanding, completed: outstanding === 0 };
  });

  return ok(result);
});
