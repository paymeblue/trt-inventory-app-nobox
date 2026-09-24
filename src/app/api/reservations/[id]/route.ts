import { transaction } from "@/lib/db";
import { HttpError, personOf, requireSession } from "@/lib/session";
import { fail, handle, ok, readJson } from "@/lib/api";
import { canManage } from "@/lib/rbac";
import { findReservation, issueReservation, releaseReservation } from "@/lib/reservations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Body: { action: "issue" | "cancel", quantity?, note? }.
 * Issue (Stock_Issue_Form): the side's manager, for part or all of the balance.
 * Cancel: the person who reserved it frees what is left; the side's manager
 * can do the same, which the log records as a release.
 */
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const session = await requireSession();
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return fail(404, "Reservation not found.");
  const body = await readJson<{ action?: string; quantity?: number; note?: string }>(req);
  const note = body.note?.trim() || null;
  const quantity = body.quantity === undefined || body.quantity === null ? undefined : Number(body.quantity);

  const result = await transaction(async (client) => {
    const r = await findReservation(client, id);
    if (!r) throw new HttpError(404, "Reservation not found.");
    const manager = canManage(session.role, r.source);
    const own = r.reserved_by === session.sub;

    if (body.action === "issue") {
      if (!manager) throw new HttpError(403, "Only the inventory team for that side can issue stock.");
      return issueReservation(client, id, personOf(session), { quantity, notes: note });
    }
    if (body.action === "cancel") {
      if (!manager && !own) throw new HttpError(403, "Only the person who reserved it, or the inventory team, can cancel it.");
      return releaseReservation(client, id, personOf(session), { notes: note, action: own ? "CANCELLED" : "RELEASED" });
    }
    throw new HttpError(400, "Choose issue or cancel.");
  });
  return ok(result);
});
