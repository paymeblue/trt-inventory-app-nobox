import { query, queryOne } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { fail, handle, ok, readJson } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  await requirePermission("project:read");
  const rows = await query(
    `SELECT p.*, u.full_name AS supervisor_name,
            (SELECT COUNT(*)::int FROM requisitions r WHERE r.project_id = p.id) AS requisition_count,
            COALESCE((
              SELECT SUM(m.quantity * COALESCE(m.unit_cost, pr.unit_cost))
                FROM stock_movements m JOIN products pr ON pr.id = m.product_id
               WHERE m.project_id = p.id AND m.movement_type = 'ISSUE'
            ), 0)::float AS materials_value
       FROM projects p
       LEFT JOIN users u ON u.id = p.supervisor_id
      ORDER BY p.created_at DESC`,
  );
  return ok({ items: rows });
});

export const POST = handle(async (req: Request) => {
  await requirePermission("project:write");
  const b = await readJson<Record<string, string | undefined>>(req);
  const code = b.code?.trim().toUpperCase();
  const name = b.name?.trim();
  if (!code || !name) return fail(400, "A project code and name are required.");

  const row = await queryOne(
    `INSERT INTO projects (code, name, client_name, site_address, status, supervisor_id, start_date, target_date, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [code, name, b.clientName ?? null, b.siteAddress ?? null, b.status ?? "PLANNING",
     b.supervisorId || null, b.startDate || null, b.targetDate || null, b.notes ?? null],
  );
  return ok(row, { status: 201 });
});
