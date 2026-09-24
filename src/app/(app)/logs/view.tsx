"use client";

import * as React from "react";
import Link from "next/link";
import { ScrollText } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/empty";
import { Pagination } from "@/components/ui/pagination";
import { TableWrap, Th, Td, Tr } from "@/components/ui/table";
import { SearchInput, useDebounced } from "@/components/search-input";
import { LiveIndicator, SourceBadge } from "@/components/status";
import { useSession } from "@/components/session-context";
import { useLiveVersion } from "@/components/items/use-items";
import { apiFetch, toQuery } from "@/lib/client";
import type { Source } from "@/lib/rbac";
import { cn, formatDateTime, qty } from "@/lib/utils";

type Kind = "issues" | "additions" | "adjustments";

const TABS: { value: Kind; label: string; description: string }[] = [
  { value: "issues", label: "Stock Issue Log", description: "Every posted issue against a reservation." },
  { value: "additions", label: "Stock Addition Log", description: "Every posted line of new incoming stock." },
  { value: "adjustments", label: "Stock Adjustment Log", description: "Returns, extra issue, releases, count gains and losses, write-offs, with their signed impacts." },
];

type Row = {
  id: string; ref: string; source: Source; created_at: string; by_name: string | null; by_email: string | null;
  sku: string; item_name: string; unit: string; quantity: number; notes: string | null;
  reservation_ref?: string | null; project?: string | null;
  supplier_ref?: string | null; document_ref?: string | null;
  related_ref?: string | null; adjustment_type?: string; stock_impact?: number; reserved_impact?: number; issued_impact?: number;
};

const PAGE_SIZE = 50;
const signed = (v: number | undefined) => (!v ? "0" : v > 0 ? `+${qty(v)}` : qty(v));

/** The workbook's Stock_Issue_Log, Stock_Addition_Log and Stock_Adjustment_Log. */
export function LogsView() {
  const me = useSession();
  const home = me?.role === "FACTORY_MANAGER" ? "FACTORY" : me?.role === "NOBOX_MANAGER" ? "NOBOX" : "";
  const [kind, setKind] = React.useState<Kind>("issues");
  const [source, setSource] = React.useState(home);
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(1);
  const term = useDebounced(search, 300);
  const [data, setData] = React.useState<{ items: Row[]; total: number; quantity: number } | null>(null);

  const qs = toQuery({ source, q: term, page, pageSize: PAGE_SIZE });
  const load = React.useCallback(async () => {
    setData(await apiFetch(`/api/logs/${kind}${qs}`));
  }, [kind, qs]);

  React.useEffect(() => {
    setData(null);
    void load().catch(() => undefined);
  }, [load]);
  React.useEffect(() => setPage(1), [kind, source, term]);
  const liveAt = useLiveVersion(React.useCallback(() => void load().catch(() => undefined), [load]));

  const tab = TABS.find((t) => t.value === kind)!;

  return (
    <>
      <PageHeader
        title="Logs"
        description="The approved movement sources. Every reservation, issue, addition and adjustment, with who posted it and when."
        action={<LiveIndicator syncedAt={liveAt} />}
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap rounded-xl border border-border bg-surface-2 p-1" role="tablist">
          <Link href="/reservations" className="rounded-lg px-3 py-1.5 text-[13px] font-medium text-fg-muted transition-colors hover:text-fg">
            Reservation Log
          </Link>
          {TABS.map((t) => (
            <button
              key={t.value}
              role="tab"
              aria-selected={kind === t.value}
              onClick={() => setKind(t.value)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors",
                kind === t.value ? "bg-surface text-fg shadow-sm" : "text-fg-muted hover:text-fg",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-2 border-b border-border p-3 sm:flex-row sm:items-center sm:p-4">
          <p className="text-[12.5px] text-fg-muted sm:flex-1">
            {tab.description}
            {data ? <span className="ml-1 tabular">{data.total.toLocaleString()} rows · {qty(data.quantity)} units.</span> : null}
          </p>
          <SearchInput value={search} onChange={setSearch} placeholder="Search ID, material, project, person…" className="sm:w-80" />
          <Select value={source} onChange={(e) => setSource(e.target.value)} aria-label="Side" className="sm:w-36">
            <option value="">Both sides</option>
            <option value="FACTORY">Factory</option>
            <option value="NOBOX">Nobox</option>
          </Select>
        </div>

        {!data ? (
          <div className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-12 rounded-lg" />)}</div>
        ) : !data.items.length ? (
          <EmptyState icon={ScrollText} title="Nothing posted here yet" />
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>ID</Th>
                <Th className="hidden md:table-cell">When</Th>
                <Th>Material</Th>
                {kind === "issues" ? <><Th>Reservation</Th><Th className="hidden lg:table-cell">Project</Th></> : null}
                {kind === "additions" ? <><Th className="hidden lg:table-cell">Supplier / Reference</Th><Th className="hidden lg:table-cell">Document Ref</Th></> : null}
                {kind === "adjustments" ? <><Th>Type</Th><Th className="hidden lg:table-cell">Related ID</Th></> : null}
                <Th align="right">Qty</Th>
                {kind === "adjustments" ? <Th align="right" className="hidden xl:table-cell">Stock / Reserved / Issued</Th> : null}
                <Th className="hidden md:table-cell">By</Th>
                <Th className="hidden xl:table-cell">Notes</Th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((r) => (
                <Tr key={r.id}>
                  <Td className="code whitespace-nowrap text-[12px] font-semibold">{r.ref}</Td>
                  <Td className="hidden whitespace-nowrap text-[12px] text-fg-muted md:table-cell">{formatDateTime(r.created_at)}</Td>
                  <Td>
                    <span className="flex items-center gap-2">
                      <span className="code text-[12.5px] font-semibold">{r.sku}</span>
                      <SourceBadge source={r.source} className="hidden sm:inline-flex" />
                    </span>
                    <span className="block max-w-[240px] truncate text-[12px] text-fg-muted">{r.item_name}</span>
                  </Td>
                  {kind === "issues" ? (
                    <>
                      <Td className="code whitespace-nowrap text-[12px]">{r.reservation_ref ?? "—"}</Td>
                      <Td className="hidden text-[12.5px] lg:table-cell">{r.project ?? "—"}</Td>
                    </>
                  ) : null}
                  {kind === "additions" ? (
                    <>
                      <Td className="hidden text-[12.5px] lg:table-cell">{r.supplier_ref ?? "—"}</Td>
                      <Td className="hidden text-[12.5px] lg:table-cell">{r.document_ref ?? "—"}</Td>
                    </>
                  ) : null}
                  {kind === "adjustments" ? (
                    <>
                      <Td><Badge tone={(r.stock_impact ?? 0) < 0 ? "danger" : (r.stock_impact ?? 0) > 0 ? "ok" : "info"}>{r.adjustment_type}</Badge></Td>
                      <Td className="code hidden text-[12px] lg:table-cell">{r.related_ref ?? "—"}</Td>
                    </>
                  ) : null}
                  <Td align="right" className="tabular whitespace-nowrap text-[13px] font-semibold">
                    {qty(r.quantity)} <span className="text-[11px] font-normal text-fg-subtle">{r.unit}</span>
                  </Td>
                  {kind === "adjustments" ? (
                    <Td align="right" className="tabular hidden whitespace-nowrap text-[12px] text-fg-muted xl:table-cell">
                      {signed(r.stock_impact)} / {signed(r.reserved_impact)} / {signed(r.issued_impact)}
                    </Td>
                  ) : null}
                  <Td className="hidden whitespace-nowrap text-[12.5px] md:table-cell">
                    {r.by_name ?? "—"}
                    {r.by_email ? <span className="block text-[11px] text-fg-subtle">{r.by_email}</span> : null}
                  </Td>
                  <Td className="hidden max-w-[220px] truncate text-[12px] text-fg-muted xl:table-cell" title={r.notes ?? undefined}>{r.notes ?? ""}</Td>
                </Tr>
              ))}
            </tbody>
          </TableWrap>
        )}
        {data && data.total > PAGE_SIZE ? <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPage={setPage} /> : null}
      </Card>
    </>
  );
}
