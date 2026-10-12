import { queryOne, transaction } from "@/lib/db";
import { requireManager } from "@/lib/session";
import { fail, handle, ok } from "@/lib/api";
import type { Source } from "@/lib/rbac";
import { dropImageIfUnused, saveImage } from "@/lib/images";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function find(id: string) {
  if (!UUID.test(id)) return null;
  return queryOne<{ source: Source; image_id: string | null }>("SELECT source, image_id FROM items WHERE id = $1", [id]);
}

/** Form field: file. Sets (or replaces) the material's photo in one step. */
export const PUT = handle(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const item = await find(id);
  if (!item) return fail(404, "Item not found.");
  const session = await requireManager(item.source);
  const form = await req.formData();

  const imageId = await transaction(async (client) => {
    const imageId = await saveImage(client, form.get("file"), session.sub);
    await client.query("UPDATE items SET image_id = $1, updated_by = $2, updated_at = now() WHERE id = $3", [imageId, session.sub, id]);
    await dropImageIfUnused(client, item.image_id);
    return imageId;
  });
  return ok({ id, imageId, url: `/api/images/${imageId}` });
});

export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const item = await find(id);
  if (!item) return fail(404, "Item not found.");
  const session = await requireManager(item.source);

  await transaction(async (client) => {
    await client.query("UPDATE items SET image_id = NULL, updated_by = $1, updated_at = now() WHERE id = $2", [session.sub, id]);
    await dropImageIfUnused(client, item.image_id);
  });
  return ok({ id, imageId: null });
});
