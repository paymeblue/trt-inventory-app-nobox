import { query, transaction } from "@/lib/db";
import { requireManager, requireSession } from "@/lib/session";
import { fail, handle, ok, readJson } from "@/lib/api";
import { isSource } from "@/lib/rbac";
import { ITEM_COLUMNS, ITEM_FROM, parseItemBody, recordMovement } from "@/lib/items";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SORTS: Record<string, string> = {
  name: "lower(i.name) ASC, i.sku",
  "qty-desc": "i.quantity DESC, lower(i.name)",
  "qty-asc": "i.quantity ASC, lower(i.name)",
  updated: "i.updated_at DESC",
};

export const GET = handle(async (req: Request) => {
  await requireSession();
  const url = new URL(req.url);
  const p = url.searchParams;

  const source = p.get("source");
  const q = p.get("q")?.trim();
  const category = p.get("category")?.trim();
  const status = p.get("status");
  const sort = SORTS[p.get("sort") ?? "name"] ?? SORTS.name;
  const pageSize = Math.min(200, Math.max(1, Number(p.get("pageSize")) || 48));
  const page = Math.max(1, Number(p.get("page")) || 1);

  // Source scopes everything, including the category list and the counts, so
  // the filters only ever offer values that exist on the side being viewed.
  const scope: string[] = [];
  const scopeParams: unknown[] = [];
  if (isSource(source)) {
    scopeParams.push(source);
    scope.push(`i.source = $${scopeParams.length}`);
  }

  const where = [...scope];
  const params = [...scopeParams];
  if (q) {
    params.push(`%${q.toLowerCase()}%`);
    const n = params.length;
    where.push(
      `(lower(i.name) LIKE $${n} OR lower(i.sku) LIKE $${n} OR lower(coalesce(i.colour,'')) LIKE $${n}
        OR lower(coalesce(i.spec,'')) LIKE $${n} OR lower(coalesce(i.category,'')) LIKE $${n})`,
    );
  }
  if (category) {
    params.push(category);
    where.push(`i.category = $${params.length}`);
  }
  if (status === "out") where.push("i.quantity <= 0");
  if (status === "low") where.push("i.quantity > 0 AND i.reorder_level > 0 AND i.quantity <= i.reorder_level");
  if (status === "ok") where.push("i.quantity > 0 AND (i.reorder_level = 0 OR i.quantity > i.reorder_level)");

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const scopeSql = scope.length ? `WHERE ${scope.join(" AND ")}` : "";

  const [items, totals, categories, counts] = await Promise.all([
    query(
      `SELECT ${ITEM_COLUMNS} ${ITEM_FROM} ${whereSql}
        ORDER BY ${sort} LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
      params,
    ),
    query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM items i ${whereSql}`, params),
    query<{ category: string }>(
      `SELECT DISTINCT i.category FROM items i ${scopeSql}
        ${scopeSql ? "AND" : "WHERE"} i.category IS NOT NULL ORDER BY 1`,
      scopeParams,
    ),
    // Factory and Nobox totals are always group-wide (they label the source
    // tabs); low and out follow the source being viewed.
    query<{ factory: number; nobox: number; low: number; out: number }>(
      `SELECT COUNT(*) FILTER (WHERE source = 'FACTORY')::int AS factory,
              COUNT(*) FILTER (WHERE source = 'NOBOX')::int AS nobox,
              COUNT(*) FILTER (WHERE ($1::text IS NULL OR source = $1)
                AND quantity > 0 AND reorder_level > 0 AND quantity <= reorder_level)::int AS low,
              COUNT(*) FILTER (WHERE ($1::text IS NULL OR source = $1) AND quantity <= 0)::int AS out
         FROM items`,
      [isSource(source) ? source : null],
    ),
  ]);

  return ok({
    items,
    total: totals[0].n,
    categories: categories.map((c) => c.category),
    counts: counts[0],
    page,
    pageSize,
  });
});

export const POST = handle(async (req: Request) => {
  const body = await readJson<Record<string, unknown>>(req);
  if (!isSource(body.source)) return fail(400, "Choose Factory or Nobox.");
  const source = body.source;
  const session = await requireManager(source);

  const fields = parseItemBody(body, { creating: true });
  const quantity = Number(body.quantity ?? 0);
  if (!Number.isFinite(quantity) || quantity < 0) return fail(400, "Starting quantity must be 0 or more.");

  const item = await transaction(async (client) => {
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO items (source, sku, name, category, colour, spec, unit, quantity, reorder_level,
                          description, image_id, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12) RETURNING id`,
      [source, fields.sku, fields.name, fields.category, fields.colour, fields.spec,
       fields.unit ?? "pcs", quantity, fields.reorderLevel ?? 0, fields.description,
       fields.imageId, session.sub],
    );
    await recordMovement(client, {
      itemId: rows[0].id, source, kind: "CREATE", delta: quantity, balance: quantity, userId: session.sub,
    });
    return rows[0];
  });

  return ok(item, { status: 201 });
});
