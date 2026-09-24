import { queryOne } from "@/lib/db";
import { requireManager, requireSession } from "@/lib/session";
import { fail, handle, ok, readJson } from "@/lib/api";
import type { Source } from "@/lib/rbac";
import { ITEM_COLUMNS, ITEM_FROM, parseItemBody } from "@/lib/items";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function sourceOf(id: string): Promise<Source | null> {
  if (!UUID.test(id)) return null;
  const row = await queryOne<{ source: Source }>("SELECT source FROM items WHERE id = $1", [id]);
  return row?.source ?? null;
}

export const GET = handle(async (_req: Request, ctx: Ctx) => {
  await requireSession();
  const { id } = await ctx.params;
  if (!UUID.test(id)) return fail(404, "Item not found.");
  const item = await queryOne(`SELECT ${ITEM_COLUMNS} ${ITEM_FROM} WHERE i.id = $1`, [id]);
  if (!item) return fail(404, "Item not found.");
  return ok(item);
});

/** Edits details. Quantity only changes through /adjust so every change is logged. */
export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const source = await sourceOf(id);
  if (!source) return fail(404, "Item not found.");
  const session = await requireManager(source);

  const body = await readJson<Record<string, unknown>>(req);
  const f = parseItemBody(body, { creating: false });
  const has = (key: string) => Object.prototype.hasOwnProperty.call(body, key);

  const row = await queryOne(
    `UPDATE items SET
       sku = COALESCE($1, sku),
       name = COALESCE($2, name),
       category = CASE WHEN $3 THEN NULLIF($4, '') ELSE category END,
       colour = CASE WHEN $5 THEN NULLIF($6, '') ELSE colour END,
       spec = CASE WHEN $7 THEN NULLIF($8, '') ELSE spec END,
       unit = COALESCE($9, unit),
       reorder_level = COALESCE($10, reorder_level),
       description = CASE WHEN $11 THEN NULLIF($12, '') ELSE description END,
       image_id = CASE WHEN $13 THEN $14::uuid ELSE image_id END,
       updated_by = $15,
       updated_at = now()
     WHERE id = $16 RETURNING id`,
    [f.sku, f.name, has("category"), f.category ?? "", has("colour"), f.colour ?? "",
     has("spec"), f.spec ?? "", f.unit, f.reorderLevel, has("description"), f.description ?? "",
     has("imageId"), f.imageId, session.sub, id],
  );
  return ok(row);
});

export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const source = await sourceOf(id);
  if (!source) return fail(404, "Item not found.");
  await requireManager(source);

  await queryOne("DELETE FROM items WHERE id = $1", [id]);
  return ok({ id });
});
