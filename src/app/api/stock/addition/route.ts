import { queryOne, transaction } from "@/lib/db";
import { personOf, requireManager } from "@/lib/session";
import { fail, handle, ok, readJson } from "@/lib/api";
import type { Source } from "@/lib/rbac";
import { addStock } from "@/lib/stock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Stock_Addition_Form. Body: { itemId, quantity, supplierRef?, documentRef?, notes? } */
export const POST = handle(async (req: Request) => {
  const body = await readJson<{ itemId?: string; quantity?: number; supplierRef?: string; documentRef?: string; notes?: string }>(req);
  const item = body.itemId && /^[0-9a-f-]{36}$/i.test(body.itemId)
    ? await queryOne<{ source: Source }>("SELECT source FROM items WHERE id = $1", [body.itemId])
    : null;
  if (!item) return fail(400, "Missing required fields.");
  const session = await requireManager(item.source);
  const result = await transaction((client) =>
    addStock(client, { itemId: body.itemId!, quantity: Number(body.quantity), supplierRef: body.supplierRef, documentRef: body.documentRef, notes: body.notes }, personOf(session)),
  );
  return ok(result, { status: 201 });
});
