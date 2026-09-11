import { query, transaction } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { fail, handle, ok, readJson } from "@/lib/api";
import { logActivity, nextRef } from "@/lib/inventory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request) => {
  await requirePermission("receipt:read");
  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? "";

  const params: unknown[] = [];
  let where = "";
  if (status) {
    params.push(status);
    where = `WHERE g.status = $${params.length}`;
  }

  const items = await query(
    `SELECT g.id, g.ref, g.waybill_no, g.lpo_no, g.status, g.received_at, g.notes, g.posted_at,
            s.name AS supplier_name, l.name AS location_name,
            u.full_name AS created_by_name,
            (SELECT COUNT(*)::int FROM goods_receipt_items i WHERE i.receipt_id = g.id) AS line_count,
            COALESCE((
              SELECT SUM(i.qty_received * i.unit_cost) FROM goods_receipt_items i WHERE i.receipt_id = g.id
            ), 0)::float AS total_value
       FROM goods_receipts g
       LEFT JOIN suppliers s ON s.id = g.supplier_id
       LEFT JOIN locations l ON l.id = g.location_id
       LEFT JOIN users u ON u.id = g.created_by
       ${where}
      ORDER BY g.created_at DESC
      LIMIT 200`,
    params,
  );
  return ok({ items });
});

type Line = {
  productId: string;
  qtyExpected?: number | null;
  qtyReceived: number;
  unitCost?: number;
  condition?: string;
  notes?: string;
};
type Body = {
  supplierId?: string | null;
  locationId?: string;
  waybillNo?: string;
  lpoNo?: string;
  receivedAt?: string;
  notes?: string;
  lines?: Line[];
  post?: boolean;
};

export const POST = handle(async (req: Request) => {
  const session = await requirePermission("receipt:write");
  const body = await readJson<Body>(req);

  if (!body.locationId) return fail(400, "Choose the store receiving the delivery.");
  const lines = (body.lines ?? []).filter((l) => l.productId && Number(l.qtyReceived) > 0);
  if (!lines.length) return fail(400, "Add at least one delivered material.");

  const result = await transaction(async (client) => {
    const ref = await nextRef(client, "goods_receipts", "GRN");
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO goods_receipts
         (ref, supplier_id, location_id, waybill_no, lpo_no, status, received_at, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,'DRAFT',COALESCE($6::timestamptz, now()),$7,$8)
       RETURNING id`,
      [ref, body.supplierId || null, body.locationId, body.waybillNo ?? null,
       body.lpoNo ?? null, body.receivedAt || null, body.notes ?? null, session.sub],
    );
    const id = rows[0].id;

    for (const line of lines) {
      await client.query(
        `INSERT INTO goods_receipt_items
           (receipt_id, product_id, qty_expected, qty_received, unit_cost, condition, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [id, line.productId, line.qtyExpected ?? null, Number(line.qtyReceived),
         Number(line.unitCost ?? 0), line.condition ?? "GOOD", line.notes ?? null],
      );
    }

    await logActivity(client, session.sub, "CREATE", "goods_receipt", id, ref);
    return { id, ref };
  });

  return ok(result, { status: 201 });
});
