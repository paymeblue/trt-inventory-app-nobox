import { query, queryOne } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { fail, handle, ok, readJson } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  await requirePermission("product:read");
  const rows = await query(
    `SELECT c.id, c.name, c.description,
            (SELECT COUNT(*)::int FROM products p WHERE p.category_id = c.id AND p.is_active) AS product_count
       FROM categories c ORDER BY c.name`,
  );
  return ok({ items: rows });
});

export const POST = handle(async (req: Request) => {
  await requirePermission("product:write");
  const body = await readJson<{ name?: string; description?: string }>(req);
  const name = body.name?.trim();
  if (!name) return fail(400, "A category name is required.");

  const row = await queryOne(
    `INSERT INTO categories (name, description) VALUES ($1,$2)
     ON CONFLICT (name) DO UPDATE SET description = COALESCE(EXCLUDED.description, categories.description)
     RETURNING id, name`,
    [name, body.description ?? null],
  );
  return ok(row, { status: 201 });
});
