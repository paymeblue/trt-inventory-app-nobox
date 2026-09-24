import { queryOne, transaction } from "@/lib/db";
import { personOf, requireManager } from "@/lib/session";
import { fail, handle, ok, readJson } from "@/lib/api";
import type { Source } from "@/lib/rbac";
import { adjustStock } from "@/lib/stock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Stock_Adjustment_Form. Body: { itemId, type, quantity, relatedRef?, notes? } */
export const POST = handle(async (req: Request) => {
  const body = await readJson<{ itemId?: string; type?: string; quantity?: number; relatedRef?: string; notes?: string }>(req);
  const item = body.itemId && /^[0-9a-f-]{36}$/i.test(body.itemId)
    ? await queryOne<{ source: Source }>("SELECT source FROM items WHERE id = $1", [body.itemId])
    : null;
  if (!item) return fail(400, "Missing required fields.");
  const session = await requireManager(item.source);
  const result = await transaction((client) =>
    adjustStock(client, { itemId: body.itemId!, type: String(body.type ?? ""), quantity: Number(body.quantity), relatedRef: body.relatedRef, notes: body.notes }, personOf(session)),
  );
  return ok(result, { status: 201 });
});
