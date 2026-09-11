import { query, queryOne } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { fail, handle, ok, readJson } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_req: Request, ctx: Ctx) => {
  await requirePermission("project:read");
  const { id } = await ctx.params;

  const project = await queryOne(
    `SELECT p.*, u.full_name AS supervisor_name FROM projects p
       LEFT JOIN users u ON u.id = p.supervisor_id WHERE p.id = $1`,
    [id],
  );
  if (!project) return fail(404, "Project not found.");

  const materials = await query(
    `SELECT pr.id, pr.sku, pr.name, pr.unit, pr.image_id,
            SUM(CASE WHEN m.movement_type = 'ISSUE' THEN m.quantity ELSE 0 END)::float AS issued,
            SUM(CASE WHEN m.movement_type = 'RETURN' THEN m.quantity ELSE 0 END)::float AS returned
       FROM stock_movements m JOIN products pr ON pr.id = m.product_id
      WHERE m.project_id = $1
      GROUP BY pr.id, pr.sku, pr.name, pr.unit, pr.image_id
      ORDER BY issued DESC`,
    [id],
  );

  const requisitions = await query(
    `SELECT r.id, r.ref, r.title, r.status, r.created_at, r.needed_by
       FROM requisitions r WHERE r.project_id = $1 ORDER BY r.created_at DESC`,
    [id],
  );

  return ok({ project, materials, requisitions });
});

export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  await requirePermission("project:write");
  const { id } = await ctx.params;
  const b = await readJson<Record<string, string | undefined>>(req);

  const row = await queryOne(
    `UPDATE projects SET
       name = COALESCE($1, name),
       client_name = COALESCE($2, client_name),
       site_address = COALESCE($3, site_address),
       status = COALESCE($4, status),
       supervisor_id = COALESCE($5, supervisor_id),
       start_date = COALESCE($6, start_date),
       target_date = COALESCE($7, target_date),
       notes = COALESCE($8, notes)
     WHERE id = $9 RETURNING id`,
    [b.name ?? null, b.clientName ?? null, b.siteAddress ?? null, b.status ?? null,
     b.supervisorId || null, b.startDate || null, b.targetDate || null, b.notes ?? null, id],
  );
  if (!row) return fail(404, "Project not found.");
  return ok(row);
});
