import { query, transaction } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { handle, ok, readJson } from "@/lib/api";
import { isSource } from "@/lib/rbac";
import { createReservation, RESERVATION_COLUMNS, RESERVATION_FROM } from "@/lib/reservations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The reservation log. Filters: status, source, item, mine=1, q. */
export const GET = handle(async (req: Request) => {
  const session = await requireSession();
  const p = new URL(req.url).searchParams;
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (sql: (n: number) => string, value: unknown) => {
    params.push(value);
    where.push(sql(params.length));
  };

  const status = p.get("status");
  if (status && ["RESERVED", "ISSUED", "CANCELLED"].includes(status)) add((n) => `r.status = $${n}`, status);
  const source = p.get("source");
  if (isSource(source)) add((n) => `r.source = $${n}`, source);
  const item = p.get("item");
  if (item && /^[0-9a-f-]{36}$/i.test(item)) add((n) => `r.item_id = $${n}`, item);
  if (p.get("mine") === "1") add((n) => `r.reserved_by = $${n}`, session.sub);
  const q = p.get("q")?.trim();
  if (q) {
    add(
      (n) => `(lower(r.ref) LIKE $${n} OR lower(r.project) LIKE $${n} OR lower(i.name) LIKE $${n}
               OR lower(i.sku) LIKE $${n} OR lower(coalesce(ru.full_name,'')) LIKE $${n})`,
      `%${q.toLowerCase()}%`,
    );
  }

  const pageSize = Math.min(200, Math.max(1, Number(p.get("pageSize")) || 50));
  const page = Math.max(1, Number(p.get("page")) || 1);
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const [items, totals, counts] = await Promise.all([
    query(
      `SELECT ${RESERVATION_COLUMNS} ${RESERVATION_FROM} ${whereSql}
        ORDER BY (r.status = 'RESERVED') DESC, r.created_at DESC
        LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
      params,
    ),
    query<{ n: number }>(`SELECT COUNT(*)::int AS n ${RESERVATION_FROM} ${whereSql}`, params),
    query<{ status: string; source: string; n: number }>(
      "SELECT status, source, COUNT(*)::int AS n FROM reservations GROUP BY 1, 2",
    ),
  ]);
  return ok({ items, total: totals[0].n, counts, page, pageSize });
});

export const POST = handle(async (req: Request) => {
  const session = await requireSession();
  const body = await readJson<{ itemId?: string; quantity?: number; project?: string; notes?: string }>(req);
  const created = await transaction((client) =>
    createReservation(
      client,
      { itemId: String(body.itemId ?? ""), quantity: Number(body.quantity), project: String(body.project ?? ""), notes: body.notes },
      session.sub,
    ),
  );
  return ok(created, { status: 201 });
});
