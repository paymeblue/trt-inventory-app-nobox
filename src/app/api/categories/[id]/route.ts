import { queryOne, transaction } from "@/lib/db";
import { requireManager } from "@/lib/session";
import { fail, handle, ok, readJson } from "@/lib/api";
import type { Source } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function find(id: string) {
  if (!UUID.test(id)) return null;
  return queryOne<{ id: string; source: Source; name: string }>(
    "SELECT id, source, name FROM categories WHERE id = $1",
    [id],
  );
}

/** Renames a category and every item filed under it, in one go. */
export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const category = await find(id);
  if (!category) return fail(404, "Category not found.");
  await requireManager(category.source);

  const body = await readJson<{ name?: unknown }>(req);
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return fail(400, "Give the category a name.");
  if (name.length > 60) return fail(400, "Category names must be 60 characters or fewer.");

  const moved = await transaction(async (client) => {
    await client.query("UPDATE categories SET name = $1, updated_at = now() WHERE id = $2", [name, id]);
    const { rowCount } = await client.query(
      "UPDATE items SET category = $1 WHERE source = $2 AND category = $3",
      [name, category.source, category.name],
    );
    return rowCount ?? 0;
  });
  return ok({ id, name, items: moved });
});

/** Only an empty category can be deleted, so no item silently loses its category. */
export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const category = await find(id);
  if (!category) return fail(404, "Category not found.");
  await requireManager(category.source);

  const used = await queryOne<{ n: number }>(
    "SELECT COUNT(*)::int AS n FROM items WHERE source = $1 AND category = $2",
    [category.source, category.name],
  );
  if (used && used.n > 0) {
    return fail(409, `${used.n} item${used.n === 1 ? " is" : "s are"} still in ${category.name}. Move ${used.n === 1 ? "it" : "them"} or rename the category instead.`);
  }
  await queryOne("DELETE FROM categories WHERE id = $1", [id]);
  return ok({ id });
});
