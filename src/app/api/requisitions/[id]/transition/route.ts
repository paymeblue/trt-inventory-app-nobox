import { transaction } from "@/lib/db";
import { requirePermission, requireSession, HttpError } from "@/lib/session";
import { fail, handle, ok, readJson } from "@/lib/api";
import { logActivity, postMovement } from "@/lib/inventory";
import { can } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Action = "submit" | "approve" | "reject" | "issue" | "receive" | "close" | "cancel";
type Body = {
  action?: Action;
  reason?: string;
  /** approve/issue may override the per-line quantity. */
  quantities?: Record<string, number>;
};

const REQUIRED_STATUS: Record<Action, string[]> = {
  submit: ["DRAFT"],
  approve: ["SUBMITTED"],
  reject: ["SUBMITTED"],
  issue: ["APPROVED"],
  receive: ["ISSUED"],
  close: ["RECEIVED", "ISSUED"],
  cancel: ["DRAFT", "SUBMITTED", "APPROVED"],
};

export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const session = await requireSession();
  const { id } = await ctx.params;
  const body = await readJson<Body>(req);
  const action = body.action;

  if (!action || !(action in REQUIRED_STATUS)) return fail(400, "Unknown action.");

  if (action === "approve" || action === "reject") await requirePermission("requisition:approve");
  else if (action === "issue") await requirePermission("requisition:issue");
  else if (action === "receive") await requirePermission("requisition:receive");
  else if (!can(session.role, "requisition:create") && !can(session.role, "requisition:approve")) {
    return fail(403, "Your role does not allow this action.");
  }

  const result = await transaction(async (client) => {
    const { rows } = await client.query<{
      id: string; ref: string; status: string;
      from_location_id: string; to_location_id: string | null;
      project_id: string | null; requested_by: string | null;
    }>(
      `SELECT id, ref, status, from_location_id, to_location_id, project_id, requested_by
         FROM requisitions WHERE id = $1 FOR UPDATE`,
      [id],
    );
    const req0 = rows[0];
    if (!req0) throw new HttpError(404, "Requisition not found.");

    if (!REQUIRED_STATUS[action].includes(req0.status)) {
      throw new HttpError(409, `A ${req0.status.toLowerCase()} requisition cannot be ${action}d.`);
    }

    const { rows: items } = await client.query<{
      id: string; product_id: string;
      qty_requested: string; qty_approved: string | null; qty_issued: string;
    }>(
      "SELECT id, product_id, qty_requested, qty_approved, qty_issued FROM requisition_items WHERE requisition_id = $1",
      [id],
    );

    switch (action) {
      case "submit":
        await client.query("UPDATE requisitions SET status='SUBMITTED', updated_at=now() WHERE id=$1", [id]);
        break;

      case "approve": {
        for (const item of items) {
          const override = body.quantities?.[item.id];
          const approved = override !== undefined ? Number(override) : Number(item.qty_requested);
          if (approved < 0) throw new HttpError(400, "Approved quantity cannot be negative.");
          await client.query("UPDATE requisition_items SET qty_approved = $1 WHERE id = $2", [approved, item.id]);
        }
        await client.query(
          `UPDATE requisitions SET status='APPROVED', approved_by=$1, approved_at=now(), updated_at=now()
            WHERE id=$2`,
          [session.sub, id],
        );
        break;
      }

      case "reject":
        await client.query(
          `UPDATE requisitions SET status='REJECTED', approved_by=$1, approved_at=now(),
                  rejected_reason=$2, updated_at=now() WHERE id=$3`,
          [session.sub, body.reason ?? null, id],
        );
        break;

      case "issue": {
        let issuedAny = false;
        for (const item of items) {
          const override = body.quantities?.[item.id];
          const qty = override !== undefined
            ? Number(override)
            : Number(item.qty_approved ?? item.qty_requested);
          if (!Number.isFinite(qty) || qty <= 0) continue;

          // A destination location means the material is still ours, just
          // somewhere else. No destination means it is consumed on issue.
          await postMovement(client, {
            productId: item.product_id,
            type: req0.to_location_id ? "TRANSFER" : "ISSUE",
            quantity: qty,
            fromLocationId: req0.from_location_id,
            toLocationId: req0.to_location_id,
            requisitionId: id,
            projectId: req0.project_id,
            reference: req0.ref,
            userId: session.sub,
          });
          await client.query("UPDATE requisition_items SET qty_issued = $1 WHERE id = $2", [qty, item.id]);
          issuedAny = true;
        }
        if (!issuedAny) throw new HttpError(400, "Nothing to issue — every approved quantity is zero.");

        await client.query(
          `UPDATE requisitions SET status='ISSUED', issued_by=$1, issued_at=now(), updated_at=now() WHERE id=$2`,
          [session.sub, id],
        );
        break;
      }

      case "receive":
        await client.query(
          `UPDATE requisitions SET status='RECEIVED', received_by=$1, received_at=now(), updated_at=now() WHERE id=$2`,
          [session.sub, id],
        );
        break;

      case "close":
        await client.query(
          "UPDATE requisitions SET status='CLOSED', closed_at=now(), updated_at=now() WHERE id=$1",
          [id],
        );
        break;

      case "cancel":
        await client.query(
          "UPDATE requisitions SET status='CANCELLED', updated_at=now() WHERE id=$1",
          [id],
        );
        break;
    }

    await logActivity(client, session.sub, action.toUpperCase(), "requisition", id, req0.ref);
    return { ref: req0.ref };
  });

  return ok(result);
});
