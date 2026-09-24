import { queryOne, transaction } from "@/lib/db";
import { requireManager } from "@/lib/session";
import { fail, handle, ok, readJson } from "@/lib/api";
import type { Source } from "@/lib/rbac";
import { adjustQuantity } from "@/lib/items";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Adds (positive) or removes (negative) stock. Body: { delta, note? } */
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return fail(404, "Item not found.");
  const item = await queryOne<{ source: Source }>("SELECT source FROM items WHERE id = $1", [id]);
  if (!item) return fail(404, "Item not found.");
  const session = await requireManager(item.source);

  const body = await readJson<{ delta?: unknown; note?: unknown }>(req);
  const delta = Number(body.delta);
  const note = typeof body.note === "string" ? body.note.trim() || null : null;

  const result = await transaction((client) =>
    adjustQuantity(client, id, delta, { kind: "ADJUST", note, userId: session.sub, source: item.source }),
  );
  return ok({ id, quantity: result.quantity });
});
