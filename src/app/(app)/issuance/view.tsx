"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Truck } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/empty";
import { DEFAULT_PAGE_SIZE, Pagination, PAGE_SIZES } from "@/components/ui/pagination";
import { TableWrap, Th, Td, Tr } from "@/components/ui/table";
import { SearchInput, useDebounced } from "@/components/search-input";
import { LiveIndicator, LocationBadge, ReservedForBadge, SourceBadge } from "@/components/status";
import { useRequiredSession } from "@/components/session-context";
import { useLiveVersion } from "@/components/items/use-items";
import { StockIssueForm } from "@/components/forms/stock-forms";
import { apiFetch, toQuery } from "@/lib/client";
import { isManager, SOURCE_LABELS, SOURCE_LIST, SOURCES, sideOf, type Location, type ReservedFor, type Source } from "@/lib/rbac";
import { formatDateTime, qty, relativeTime } from "@/lib/utils";

type Row = {
  id: string; ref: string; source: Source; created_at: string; by_name: string | null; by_email: string | null;
  sku: string; item_name: string; unit: string; quantity: number; notes: string | null; location: Location | null;
  reservation_ref: string | null; project: string | null;
  reserved_by_name: string | null; reserved_by_email: string | null; reserved_by_title: string | null; reserved_for: ReservedFor | null;
  reserved_by_company: Source | null;
  purpose: string | null; reserved_qty: number | null; balance: number | null; reservation_status: string | null;
};


/** The Stock_Issue_Log: what left the store, for whom (Design or Sales) and which project. */
export function IssuanceView({ startIssuing }: { startIssuing: boolean }) {
  const me = useRequiredSession();
  const router = useRouter();
  const home = sideOf(me.role);
  const issues = isManager(me.role);
  const [source, setSource] = React.useState<string>(home ?? "");
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState<number>(DEFAULT_PAGE_SIZE);
  const [issuing, setIssuing] = React.useState(startIssuing && issues);
  const term = useDebounced(search, 300);
  const [data, setData] = React.useState<{ items: Row[]; total: number; quantity: number } | null>(null);

  const qs = toQuery({ source, q: term, page, pageSize });
  const load = React.useCallback(async () => {
    setData(await apiFetch(`/api/logs/issues${qs}`));
  }, [qs]);

  React.useEffect(() => {
    void load().catch(() => undefined);
  }, [load]);
  React.useEffect(() => setPage(1), [source, term]);
  React.useEffect(() => setIssuing(startIssuing && issues), [startIssuing, issues]);
  const liveAt = useLiveVersion(React.useCallback(() => void load().catch(() => undefined), [load]));

  function closeForm() {
    setIssuing(false);
    if (startIssuing) router.replace("/issuance");
  }

  return (
    <>
      <PageHeader
        title="Issuance Log"
        description="Everything issued out of the store against a reservation from Design or Sales: who reserved it, for which project, and what is still to go."
        action={
          <>
            <LiveIndicator syncedAt={liveAt} />
            {issues ? <Button onClick={() => setIssuing(true)}><Truck className="h-4 w-4" /> Issue Stock</Button> : null}
          </>
        }
      />

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-2 border-b border-border p-3 sm:flex-row sm:items-center sm:p-4">
          <p className="text-[12.5px] text-fg-muted sm:flex-1">
            {data ? <span className="tabular">{data.total.toLocaleString()} issues · {qty(data.quantity)} units issued.</span> : null}
          </p>
          <SearchInput value={search} onChange={setSearch} placeholder="Search ISS or REQ number, who reserved, project, material…" className="sm:w-96" />
          <Select value={source} onChange={(e) => setSource(e.target.value)} aria-label="Side" className="sm:w-36">
            <option value="">All sides</option>
            {SOURCES.map((s) => <option key={s} value={s}>{SOURCE_LABELS[s]}</option>)}
          </Select>
        </div>

        {!data ? (
          <div className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-12 rounded-lg" />)}</div>
        ) : !data.items.length ? (
          <EmptyState
            icon={Truck}
            title="Nothing issued yet"
            description={issues ? "Issue a reservation from the Reservation Log, or with Issue Stock." : `Items appear here when ${SOURCE_LIST} issues them.`}
          />
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Issue / Reservation ID</Th>
                <Th>Material</Th>
                <Th align="right">Qty Issued</Th>
                <Th>Reserved By</Th>
                <Th className="hidden md:table-cell">Project</Th>
                <Th align="right" className="hidden lg:table-cell">Still to issue</Th>
                <Th className="hidden lg:table-cell">Issued By</Th>
                <Th className="hidden xl:table-cell">Notes</Th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((r) => (
                <Tr key={r.id}>
                  <Td className="whitespace-nowrap">
                    <span className="code block text-[12px] font-semibold">{r.ref}</span>
                    <span className="code block text-[11.5px] text-fg-muted">{r.reservation_ref ?? "—"}</span>
                    <span className="block text-[11.5px] text-fg-subtle" title={formatDateTime(r.created_at)}>{relativeTime(r.created_at)}</span>
                  </Td>
                  <Td>
                    <span className="flex items-center gap-2">
                      <span className="code text-[12.5px] font-semibold">{r.sku}</span>
                      <SourceBadge source={r.source} className="hidden sm:inline-flex" />
                      <LocationBadge location={r.location} className="hidden sm:inline-flex" />
                    </span>
                    <span className="block max-w-[240px] truncate text-[12px] text-fg-muted">{r.item_name}</span>
                  </Td>
                  <Td align="right" className="tabular whitespace-nowrap text-[13px] font-semibold">
                    {qty(r.quantity)} <span className="text-[11px] font-normal text-fg-subtle">{r.unit}</span>
                    {r.reserved_qty !== null ? <span className="block text-[11px] font-normal text-fg-subtle">of {qty(r.reserved_qty)} reserved</span> : null}
                  </Td>
                  <Td className="whitespace-nowrap text-[12.5px]">
                    <span className="flex items-center gap-1.5">{r.reserved_by_name ?? "—"} <ReservedForBadge value={r.reserved_for} company={r.reserved_by_company} /></span>
                    {r.reserved_by_title ? <span className="block text-[11.5px] text-fg-subtle">{r.reserved_by_title}</span> : null}
                    {r.reserved_by_email ? <span className="block text-[11px] text-fg-subtle">{r.reserved_by_email}</span> : null}
                  </Td>
                  <Td className="hidden text-[12.5px] md:table-cell">
                    {r.project ?? "—"}
                    {r.purpose ? <span className="block max-w-[220px] truncate text-[11.5px] text-fg-subtle" title={r.purpose}>{r.purpose}</span> : null}
                  </Td>
                  <Td align="right" className="tabular hidden whitespace-nowrap text-[12.5px] lg:table-cell">
                    {r.balance ? <span className="font-semibold text-warn">{qty(r.balance)} {r.unit}</span> : <span className="text-fg-subtle">—</span>}
                  </Td>
                  <Td className="hidden whitespace-nowrap text-[12.5px] lg:table-cell">
                    {r.by_name ?? "—"}
                    <span className="block text-[11px] text-fg-subtle">{formatDateTime(r.created_at)}</span>
                  </Td>
                  <Td className="hidden max-w-[220px] truncate text-[12px] text-fg-muted xl:table-cell" title={r.notes ?? undefined}>{r.notes ?? ""}</Td>
                </Tr>
              ))}
            </tbody>
          </TableWrap>
        )}
        {data && data.total > PAGE_SIZES[0] ? (
          <Pagination page={page} pageSize={pageSize} total={data.total} onPage={setPage} onPageSize={(size) => { setPageSize(size); setPage(1); }} />
        ) : null}
      </Card>

      {issuing ? (
        <StockIssueForm
          source={home ?? ((source || null) as Source | null)}
          onClose={closeForm}
          onSaved={() => {
            closeForm();
            void load();
          }}
        />
      ) : null}
    </>
  );
}
