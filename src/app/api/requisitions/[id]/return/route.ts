import { transaction } from "@/lib/db";
import { requireSession, HttpError } from "@/lib/session";
import { fail, handle, ok, readJson } from "@/lib/api";
import { logActivity, postMovement } from "@/lib/inventory";
import { can } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = { lines?: { itemId: string; quantity: number }[]; notes?: string };

/** Site returns unused material to the store it came from. */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const session = await requireSession();
  if (!can(session.role, "requisition:receive") && !can(session.role, "requisition:issue")) {
    return fail(403, "Your role does not allow returns.");
  }

  const { id } = await ctx.params;
  const body = await readJson<Body>(req);
  const lines = (body.lines ?? []).filter((l) => l.itemId && Number(l.quantity) > 0);
  if (!lines.length) return fail(400, "Enter at least one quantity to return.");

  await transaction(async (client) => {
    const { rows } = await client.query<{
      id: string; ref: string; status: string;
      from_location_id: string; to_location_id: string | null; project_id: string | null;
    }>(
      `SELECT id, ref, status, from_location_id, to_location_id, project_id
         FROM requisitions WHERE id = $1 FOR UPDATE`,
      [id],
    );
    const req0 = rows[0];
    if (!req0) throw new HttpError(404, "Requisition not found.");
    if (!["ISSUED", "RECEIVED"].includes(req0.status)) {
      throw new HttpError(409, "Only issued or received requisitions can take returns.");
    }

    for (const line of lines) {
      const { rows: itemRows } = await client.query<{
        id: string; product_id: string; qty_issued: string; qty_returned: string;
      }>(
        "SELECT id, product_id, qty_issued, qty_returned FROM requisition_items WHERE id = $1 AND requisition_id = $2",
        [line.itemId, id],
      );
      const item = itemRows[0];
      if (!item) throw new HttpError(400, "That line does not belong to this requisition.");

      const qty = Number(line.quantity);
      const outstanding = Number(item.qty_issued) - Number(item.qty_returned);
      if (qty > outstanding) {
        throw new HttpError(400, `Cannot return more than the ${outstanding} still outstanding on that line.`);
      }

      await postMovement(client, {
        productId: item.product_id,
        // Material sitting at a site comes back as a transfer; material issued
        // straight to consumption comes back as a plain return.
        type: req0.to_location_id ? "TRANSFER" : "RETURN",
        quantity: qty,
        fromLocationId: req0.to_location_id,
        toLocationId: req0.from_location_id,
        requisitionId: id,
        projectId: req0.project_id,
        reference: `${req0.ref} return`,
        notes: body.notes ?? null,
        userId: session.sub,
      });

      await client.query(
        "UPDATE requisition_items SET qty_returned = qty_returned + $1 WHERE id = $2",
        [qty, item.id],
      );
    }

    await logActivity(client, session.sub, "RETURN", "requisition", id, req0.ref);
  });

  return ok({ ok: true });
});
