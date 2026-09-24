import { query } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { fail, handle, ok } from "@/lib/api";
import { isSource } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ kind: string }> };

/** The workbook's three stock logs. Reservation_Log is served by /api/reservations. */
const LOGS: Record<string, { table: string; columns: string; search: string[] }> = {
  issues: {
    table: "stock_issues",
    columns: `l.ref, l.created_at, COALESCE(u.full_name, l.issued_by_name) AS by_name, COALESCE(u.email, l.issued_by_email) AS by_email,
              l.reservation_ref, l.project, l.quantity::float8 AS quantity, l.notes`,
    search: ["l.ref", "l.reservation_ref", "l.project", "l.issued_by_name", "l.notes"],
  },
  additions: {
    table: "stock_additions",
    columns: `l.ref, l.created_at, COALESCE(u.full_name, l.recorded_by_name) AS by_name, COALESCE(u.email, l.recorded_by_email) AS by_email,
              l.quantity::float8 AS quantity, l.supplier_ref, l.document_ref, l.notes`,
    search: ["l.ref", "l.supplier_ref", "l.document_ref", "l.recorded_by_name", "l.notes"],
  },
  adjustments: {
    table: "stock_adjustments",
    columns: `l.ref, l.created_at, COALESCE(u.full_name, l.adjusted_by_name) AS by_name, u.email AS by_email,
              l.related_ref, l.adjustment_type, l.quantity::float8 AS quantity, l.stock_impact::float8 AS stock_impact,
              l.reserved_impact::float8 AS reserved_impact, l.issued_impact::float8 AS issued_impact, l.notes`,
    search: ["l.ref", "l.related_ref", "l.adjustment_type", "l.adjusted_by_name", "l.notes"],
  },
};

const BY_COLUMN: Record<string, string> = { issues: "issued_by", additions: "recorded_by", adjustments: "adjusted_by" };

export const GET = handle(async (req: Request, ctx: Ctx) => {
  await requireSession();
  const { kind } = await ctx.params;
  const log = LOGS[kind];
  if (!log) return fail(404, "Unknown log.");

  const p = new URL(req.url).searchParams;
  const where: string[] = [];
  const params: unknown[] = [];
  const source = p.get("source");
  if (isSource(source)) {
    params.push(source);
    where.push(`l.source = $${params.length}`);
  }
  const q = p.get("q")?.trim();
  if (q) {
    params.push(`%${q.toLowerCase()}%`);
    const n = params.length;
    where.push(`(${[...log.search, "i.sku", "i.name"].map((c) => `lower(coalesce(${c},'')) LIKE $${n}`).join(" OR ")})`);
  }
  const pageSize = Math.min(200, Math.max(1, Number(p.get("pageSize")) || 50));
  const page = Math.max(1, Number(p.get("page")) || 1);
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const from = `FROM ${log.table} l JOIN items i ON i.id = l.item_id LEFT JOIN users u ON u.id = l.${BY_COLUMN[kind]}`;

  const [items, totals] = await Promise.all([
    query(
      `SELECT l.id, l.source, ${log.columns}, i.id AS item_id, i.sku, i.name AS item_name, i.unit
         ${from} ${whereSql}
        ORDER BY l.created_at DESC
        LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
      params,
    ),
    query<{ n: number; total: number }>(`SELECT COUNT(*)::int AS n, COALESCE(SUM(l.quantity),0)::float8 AS total ${from} ${whereSql}`, params),
  ]);
  return ok({ items, total: totals[0].n, quantity: totals[0].total, page, pageSize });
});
