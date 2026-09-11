import { transaction } from "@/lib/db";
import { requirePermission, HttpError } from "@/lib/session";
import { handle, ok } from "@/lib/api";
import { logActivity, postMovement } from "@/lib/inventory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Posts a draft GRN: writes RECEIPT movements and refreshes product costs. */
export const POST = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const session = await requirePermission("receipt:post");
  const { id } = await ctx.params;

  const result = await transaction(async (client) => {
    const { rows } = await client.query<{
      id: string; ref: string; status: string; location_id: string; waybill_no: string | null;
    }>(
      "SELECT id, ref, status, location_id, waybill_no FROM goods_receipts WHERE id = $1 FOR UPDATE",
      [id],
    );
    const receipt = rows[0];
    if (!receipt) throw new HttpError(404, "Goods receipt not found.");
    if (receipt.status === "POSTED") throw new HttpError(409, "This receipt has already been posted.");
    if (receipt.status === "CANCELLED") throw new HttpError(409, "This receipt was cancelled.");

    const { rows: items } = await client.query<{
      product_id: string; qty_received: string; unit_cost: string; condition: string;
    }>(
      "SELECT product_id, qty_received, unit_cost, condition FROM goods_receipt_items WHERE receipt_id = $1",
      [id],
    );
    if (!items.length) throw new HttpError(400, "This receipt has no lines.");

    let posted = 0;
    for (const item of items) {
      // Damaged or wrong-spec deliveries are recorded but never added to stock.
      if (item.condition === "DAMAGED" || item.condition === "WRONG_SPEC") continue;

      await postMovement(client, {
        productId: item.product_id,
        type: "RECEIPT",
        quantity: Number(item.qty_received),
        toLocationId: receipt.location_id,
        unitCost: Number(item.unit_cost),
        receiptId: id,
        reference: receipt.waybill_no ? `${receipt.ref} · ${receipt.waybill_no}` : receipt.ref,
        userId: session.sub,
      });

      if (Number(item.unit_cost) > 0) {
        await client.query(
          "UPDATE products SET unit_cost = $1, updated_at = now() WHERE id = $2",
          [Number(item.unit_cost), item.product_id],
        );
      }
      posted += 1;
    }

    await client.query(
      "UPDATE goods_receipts SET status='POSTED', posted_by=$1, posted_at=now() WHERE id=$2",
      [session.sub, id],
    );
    await logActivity(client, session.sub, "POST", "goods_receipt", id, receipt.ref);
    return { ref: receipt.ref, posted, skipped: items.length - posted };
  });

  return ok(result);
});
