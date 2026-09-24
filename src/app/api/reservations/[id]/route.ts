import { transaction } from "@/lib/db";
import { HttpError, requireSession } from "@/lib/session";
import { fail, handle, ok, readJson } from "@/lib/api";
import { canManage } from "@/lib/rbac";
import { cancelReservation, findReservation, issueReservation } from "@/lib/reservations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Body: { action: "issue" | "cancel", note? }.
 * Issue: the side's manager, once the items have actually been dispatched.
 * Cancel: the side's manager, or the person who made the reservation.
 */
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const session = await requireSession();
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return fail(404, "Reservation not found.");
  const body = await readJson<{ action?: string; note?: string }>(req);
  const note = body.note?.trim() || null;

  const result = await transaction(async (client) => {
    const r = await findReservation(client, id);
    if (!r) throw new HttpError(404, "Reservation not found.");
    const manager = canManage(session.role, r.source);

    if (body.action === "issue") {
      if (!manager) throw new HttpError(403, "Only the side that holds the stock can issue it.");
      return issueReservation(client, id, session.sub, note);
    }
    if (body.action === "cancel") {
      if (!manager && r.reserved_by !== session.sub) {
        throw new HttpError(403, "Only the person who reserved it, or the stock's manager, can cancel it.");
      }
      return cancelReservation(client, id, session.sub, note);
    }
    throw new HttpError(400, "Choose issue or cancel.");
  });
  return ok(result);
});
