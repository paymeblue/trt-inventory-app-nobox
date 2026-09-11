import { query, transaction } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { fail, handle, ok, readJson } from "@/lib/api";
import { logActivity, nextRef } from "@/lib/inventory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request) => {
  await requirePermission("requisition:read");
  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? "";
  const search = url.searchParams.get("q")?.trim() ?? "";
  const projectId = url.searchParams.get("project") ?? "";

  const where: string[] = [];
  const params: unknown[] = [];

  if (status) {
    params.push(status);
    where.push(`r.status = $${params.length}`);
  }
  if (projectId) {
    params.push(projectId);
    where.push(`r.project_id = $${params.length}`);
  }
  if (search) {
    params.push(`%${search}%`);
    where.push(`(r.ref ILIKE $${params.length} OR r.title ILIKE $${params.length})`);
  }

  const items = await query(
    `SELECT r.id, r.ref, r.title, r.status, r.priority, r.needed_by, r.created_at,
            r.approved_at, r.issued_at, r.received_at,
            p.name AS project_name, p.code AS project_code,
            fl.name AS from_location, tl.name AS to_location,
            req.full_name AS requested_by_name,
            apr.full_name AS approved_by_name,
            (SELECT COUNT(*)::int FROM requisition_items i WHERE i.requisition_id = r.id) AS line_count,
            COALESCE((
              SELECT SUM(i.qty_requested * pr.unit_cost)
                FROM requisition_items i JOIN products pr ON pr.id = i.product_id
               WHERE i.requisition_id = r.id
            ), 0)::float AS est_value
       FROM requisitions r
       LEFT JOIN projects p ON p.id = r.project_id
       LEFT JOIN locations fl ON fl.id = r.from_location_id
       LEFT JOIN locations tl ON tl.id = r.to_location_id
       LEFT JOIN users req ON req.id = r.requested_by
       LEFT JOIN users apr ON apr.id = r.approved_by
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY r.created_at DESC
      LIMIT 200`,
    params,
  );

  const counts = await query<{ status: string; n: string }>(
    "SELECT status, COUNT(*)::text AS n FROM requisitions GROUP BY status",
  );

  return ok({ items, counts });
});

type Line = { productId: string; qty: number; notes?: string };
type Body = {
  title?: string;
  projectId?: string | null;
  fromLocationId?: string;
  toLocationId?: string | null;
  priority?: string;
  neededBy?: string | null;
  notes?: string;
  lines?: Line[];
  submit?: boolean;
};

export const POST = handle(async (req: Request) => {
  const session = await requirePermission("requisition:create");
  const body = await readJson<Body>(req);

  const title = body.title?.trim();
  const lines = (body.lines ?? []).filter((l) => l.productId && Number(l.qty) > 0);

  if (!title) return fail(400, "Give the requisition a title.");
  if (!body.fromLocationId) return fail(400, "Choose the store this is issued from.");
  if (!lines.length) return fail(400, "Add at least one material.");

  const result = await transaction(async (client) => {
    const ref = await nextRef(client, "requisitions", "MIV");
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO requisitions
         (ref, title, project_id, from_location_id, to_location_id, status, priority, needed_by, notes, requested_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [
        ref, title, body.projectId || null, body.fromLocationId, body.toLocationId || null,
        body.submit ? "SUBMITTED" : "DRAFT", body.priority ?? "NORMAL",
        body.neededBy || null, body.notes ?? null, session.sub,
      ],
    );
    const id = rows[0].id;

    for (const line of lines) {
      await client.query(
        `INSERT INTO requisition_items (requisition_id, product_id, qty_requested, notes)
         VALUES ($1,$2,$3,$4)`,
        [id, line.productId, Number(line.qty), line.notes ?? null],
      );
    }

    await logActivity(client, session.sub, body.submit ? "SUBMIT" : "CREATE", "requisition", id, ref);
    return { id, ref };
  });

  return ok(result, { status: 201 });
});
