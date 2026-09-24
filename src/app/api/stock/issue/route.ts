import { queryOne, transaction } from "@/lib/db";
import { personOf, requireManager } from "@/lib/session";
import { fail, handle, ok, readJson } from "@/lib/api";
import type { Source } from "@/lib/rbac";
import { issueReservation } from "@/lib/reservations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stock_Issue_Form. Body: { reservationId, quantity, notes? }. Issues part or
 * all of a reservation's balance and takes it out of stock.
 */
export const POST = handle(async (req: Request) => {
  const body = await readJson<{ reservationId?: string; quantity?: number; notes?: string }>(req);
  const r = body.reservationId && /^[0-9a-f-]{36}$/i.test(body.reservationId)
    ? await queryOne<{ source: Source }>("SELECT source FROM reservations WHERE id = $1", [body.reservationId])
    : null;
  if (!r) return fail(400, "Missing required fields.");
  const session = await requireManager(r.source);
  const result = await transaction((client) =>
    issueReservation(client, body.reservationId!, personOf(session), { quantity: Number(body.quantity), notes: body.notes }),
  );
  return ok(result, { status: 201 });
});
