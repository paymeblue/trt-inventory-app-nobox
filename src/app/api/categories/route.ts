import { query, queryOne } from "@/lib/db";
import { requireManager, requireSession } from "@/lib/session";
import { fail, handle, ok, readJson } from "@/lib/api";
import { isSource } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** One side's categories, with how many items each holds. */
export const GET = handle(async (req: Request) => {
  await requireSession();
  const source = new URL(req.url).searchParams.get("source");
  if (!isSource(source)) return fail(400, "Choose Factory or Nobox.");

  const items = await query(
    `SELECT c.id, c.name, COUNT(i.id)::int AS item_count
       FROM categories c
       LEFT JOIN items i ON i.source = c.source AND i.category = c.name
      WHERE c.source = $1
      GROUP BY c.id
      ORDER BY lower(c.name)`,
    [source],
  );
  return ok({ items });
});

export const POST = handle(async (req: Request) => {
  const body = await readJson<{ source?: unknown; name?: unknown }>(req);
  if (!isSource(body.source)) return fail(400, "Choose Factory or Nobox.");
  const session = await requireManager(body.source);

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return fail(400, "Give the category a name.");
  if (name.length > 60) return fail(400, "Category names must be 60 characters or fewer.");

  const row = await queryOne(
    "INSERT INTO categories (source, name, created_by) VALUES ($1, $2, $3) RETURNING id, name",
    [body.source, name, session.sub],
  );
  return ok(row, { status: 201 });
});
