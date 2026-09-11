import { transaction } from "@/lib/db";
import { requirePermission, HttpError } from "@/lib/session";
import { fail, handle, ok, readJson } from "@/lib/api";
import { logActivity } from "@/lib/inventory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Action = "hold" | "resume" | "complete" | "cancel" | "reopen";

const TARGET: Record<Action, string> = {
  hold: "ON_HOLD",
  resume: "ACTIVE",
  complete: "COMPLETED",
  cancel: "CANCELLED",
  reopen: "ACTIVE",
};

export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const session = await requirePermission("flow:run");
  const { id } = await ctx.params;
  const { action } = await readJson<{ action?: Action }>(req);

  if (!action || !(action in TARGET)) return fail(400, "Unknown action.");

  await transaction(async (client) => {
    const { rows } = await client.query<{ ref: string; status: string }>(
      "SELECT ref, status FROM process_runs WHERE id = $1 FOR UPDATE",
      [id],
    );
    if (!rows[0]) throw new HttpError(404, "Process run not found.");

    await client.query(
      `UPDATE process_runs
          SET status = $1,
              completed_at = CASE WHEN $1 = 'COMPLETED' THEN now() ELSE NULL END,
              updated_at = now()
        WHERE id = $2`,
      [TARGET[action], id],
    );
    await logActivity(client, session.sub, action.toUpperCase(), "process_run", id, rows[0].ref);
  });

  return ok({ ok: true });
});
