import { query, queryOne } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { fail, handle, ok, readJson } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  await requirePermission("supplier:read");
  const rows = await query(
    `SELECT s.*, (SELECT COUNT(*)::int FROM products p WHERE p.supplier_id = s.id) AS product_count,
            (SELECT COUNT(*)::int FROM goods_receipts g WHERE g.supplier_id = s.id AND g.status = 'POSTED') AS receipt_count
       FROM suppliers s ORDER BY s.name`,
  );
  return ok({ items: rows });
});

export const POST = handle(async (req: Request) => {
  await requirePermission("supplier:write");
  const body = await readJson<Record<string, string | boolean | undefined>>(req);
  const name = String(body.name ?? "").trim();
  if (!name) return fail(400, "A supplier name is required.");

  const row = await queryOne(
    `INSERT INTO suppliers (name, contact_person, email, phone, address, is_approved, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [
      name, body.contactPerson ?? null, body.email ?? null, body.phone ?? null,
      body.address ?? null, Boolean(body.isApproved), body.notes ?? null,
    ],
  );
  return ok(row, { status: 201 });
});
