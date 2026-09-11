import { query, queryOne, transaction } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { handle, ok, readJson, fail } from "@/lib/api";
import { companyParam } from "@/lib/company";
import { postMovement, logActivity } from "@/lib/inventory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SORTS: Record<string, string> = {
  name: "p.name",
  sku: "p.sku",
  stock: "COALESCE(sl.total, 0)",
  value: "COALESCE(sl.total, 0) * p.unit_cost",
  created: "p.created_at",
  updated: "p.updated_at",
};

export const GET = handle(async (req: Request) => {
  await requirePermission("product:read");
  const url = new URL(req.url);

  const search = url.searchParams.get("q")?.trim() ?? "";
  const category = url.searchParams.get("category") ?? "";
  const supplier = url.searchParams.get("supplier") ?? "";
  const location = url.searchParams.get("location") ?? "";
  const company = companyParam(url);
  const status = url.searchParams.get("status") ?? ""; // ok | low | out
  const includeInactive = url.searchParams.get("inactive") === "1";
  const sort = SORTS[url.searchParams.get("sort") ?? "name"] ?? SORTS.name;
  const dir = url.searchParams.get("dir") === "desc" ? "DESC" : "ASC";
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const pageSize = Math.min(100, Math.max(5, Number(url.searchParams.get("pageSize") ?? 24)));

  const where: string[] = [];
  const params: unknown[] = [];

  if (!includeInactive) where.push("p.is_active = true");
  if (search) {
    params.push(`%${search}%`);
    where.push(`(p.name ILIKE $${params.length} OR p.sku ILIKE $${params.length} OR p.description ILIKE $${params.length} OR p.colour ILIKE $${params.length})`);
  }
  if (category) {
    params.push(category);
    where.push(`p.category_id = $${params.length}`);
  }
  if (supplier) {
    params.push(supplier);
    where.push(`p.supplier_id = $${params.length}`);
  }

  // The stock subquery is narrowed to one location, or to every location
  // owned by one company, so "on hand" always means what the filter implies.
  let scope = "";
  if (location) {
    params.push(location);
    scope = `WHERE location_id = $${params.length}`;
  } else if (company) {
    params.push(company);
    scope = `WHERE location_id IN (SELECT id FROM locations WHERE company_id = $${params.length})`;
  }
  const stockJoin = `LEFT JOIN (
      SELECT product_id, SUM(on_hand) AS total, SUM(reserved) AS reserved_total
        FROM stock_levels ${scope} GROUP BY product_id
    ) sl ON sl.product_id = p.id`;

  if (status === "out") where.push("COALESCE(sl.total, 0) <= 0");
  if (status === "low") where.push("COALESCE(sl.total, 0) > 0 AND p.reorder_level > 0 AND COALESCE(sl.total, 0) <= p.reorder_level");
  if (status === "ok") where.push("COALESCE(sl.total, 0) > 0 AND (p.reorder_level <= 0 OR COALESCE(sl.total, 0) > p.reorder_level)");

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const countRow = await queryOne<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM products p ${stockJoin} ${whereSql}`,
    params,
  );

  params.push(pageSize, (page - 1) * pageSize);
  const rows = await query(
    `SELECT p.id, p.sku, p.name, p.description, p.unit, p.unit_cost, p.reorder_level,
            p.image_id, p.colour, p.spec, p.shelf_ref, p.is_active, p.created_at, p.updated_at,
            c.id AS category_id, c.name AS category_name,
            s.id AS supplier_id, s.name AS supplier_name,
            COALESCE(sl.total, 0)::float AS on_hand,
            COALESCE(sl.reserved_total, 0)::float AS reserved
       FROM products p
       ${stockJoin}
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN suppliers s ON s.id = p.supplier_id
       ${whereSql}
      ORDER BY ${sort} ${dir} NULLS LAST, p.name ASC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  return ok({ items: rows, total: Number(countRow!.n), page, pageSize });
});


/**
 * An image reference is cosmetic, so a stale or missing one must never block a
 * save — a page left open across a reseed would otherwise fail with a raw
 * foreign-key error. Unknown ids resolve to null and the material keeps its
 * placeholder until someone uploads again.
 */
async function resolveImageId(
  client: { query: (text: string, params: unknown[]) => Promise<{ rows: unknown[] }> },
  imageId: string | null | undefined,
): Promise<string | null> {
  if (!imageId) return null;
  const { rows } = await client.query("SELECT 1 FROM images WHERE id = $1", [imageId]);
  return rows.length ? imageId : null;
}

type CreateBody = {
  sku?: string;
  name?: string;
  description?: string;
  categoryId?: string | null;
  supplierId?: string | null;
  unit?: string;
  unitCost?: number;
  reorderLevel?: number;
  imageId?: string | null;
  colour?: string | null;
  spec?: string | null;
  shelfRef?: string | null;
  openingQty?: number;
  openingLocationId?: string | null;
};

export const POST = handle(async (req: Request) => {
  const session = await requirePermission("product:write");
  const body = await readJson<CreateBody>(req);

  const sku = body.sku?.trim();
  const name = body.name?.trim();
  if (!sku) return fail(400, "A SKU / material code is required.");
  if (!name) return fail(400, "A material name is required.");

  return transaction(async (client) => {
    const imageId = await resolveImageId(client, body.imageId);
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO products
         (sku, name, description, category_id, supplier_id, unit, unit_cost,
          reorder_level, image_id, colour, spec, shelf_ref, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING id`,
      [
        sku, name, body.description ?? null, body.categoryId || null, body.supplierId || null,
        body.unit?.trim() || "pcs", Number(body.unitCost ?? 0), Number(body.reorderLevel ?? 0),
        imageId, body.colour ?? null, body.spec ?? null, body.shelfRef ?? null,
        session.sub,
      ],
    );
    const id = rows[0].id;

    const opening = Number(body.openingQty ?? 0);
    if (opening > 0 && body.openingLocationId) {
      await postMovement(client, {
        productId: id,
        type: "OPENING",
        quantity: opening,
        toLocationId: body.openingLocationId,
        unitCost: Number(body.unitCost ?? 0),
        reference: "Opening balance",
        userId: session.sub,
      });
    }

    await logActivity(client, session.sub, "CREATE", "product", id, `${sku} — ${name}`);
    return ok({ id }, { status: 201 });
  });
});
