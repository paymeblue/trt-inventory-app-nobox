"use client";

import * as React from "react";
import { ClipboardList, FileSpreadsheet, Plus, Truck, X } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Field, Input, Select } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/empty";
import { DEFAULT_PAGE_SIZE, Pagination, PAGE_SIZES } from "@/components/ui/pagination";
import { TableWrap, Th, Td, Tr } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { SearchInput, useDebounced } from "@/components/search-input";
import { LiveIndicator, LocationBadge, ReservedForBadge, SourceBadge } from "@/components/status";
import { useRequiredSession } from "@/components/session-context";
import { useLiveVersion } from "@/components/items/use-items";
import { ReserveModal, type Reservation } from "@/components/reservations/reserve-modal";
import { ReserveUploadModal } from "@/components/reservations/reserve-upload-modal";
import { StockIssueForm } from "@/components/forms/stock-forms";
import { apiFetch, toQuery } from "@/lib/client";
import { canManage, canReserve, sideOf, SOURCE_LABELS, SOURCES, type Source } from "@/lib/rbac";
import { cn, formatDateTime, qty, relativeTime } from "@/lib/utils";
import { CardGlare, MotionGroup } from "@/components/motion";


const STATUSES = [
  { value: "OPEN", label: "Waiting to issue" },
  { value: "ISSUED", label: "Issued" },
  { value: "CANCELLED", label: "Released / cancelled" },
  { value: "", label: "All" },
] as const;

const STATUS_BADGE: Record<Reservation["status"], React.ReactNode> = {
  RESERVED: <Badge tone="warn" dot>Reserved</Badge>,
  PART_ISSUED: <Badge tone="info" dot>Part Issued</Badge>,
  ISSUED: <Badge tone="ok" dot>Issued</Badge>,
  CANCELLED: <Badge tone="neutral" dot>Released</Badge>,
};

type Response = {
  items: Reservation[];
  total: number;
  counts: { status: string; source: Source; n: number }[];
};

/** The Reservation_Log, and where the inventory team issues against it. */
export function ReservationsView() {
  const me = useRequiredSession();
  const toast = useToast();
  const home: Source | "" = sideOf(me.role) ?? "";
  const reserves = canReserve(me.role);
  const [status, setStatus] = React.useState<string>("OPEN");
  const [source, setSource] = React.useState<string>(home);
  const [mine, setMine] = React.useState(me.role === "DESIGNER" || me.role === "SALES");
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState<number>(DEFAULT_PAGE_SIZE);
  const term = useDebounced(search, 300);

  const [data, setData] = React.useState<Response | null>(null);
  const [syncedAt, setSyncedAt] = React.useState<number | null>(null);
  const [issuing, setIssuing] = React.useState<Reservation | null>(null);
  const [cancelling, setCancelling] = React.useState<Reservation | null>(null);
  const [creating, setCreating] = React.useState<"form" | "excel" | null>(null);

  const qs = toQuery({ status, source, q: term, mine: mine ? "1" : "", page, pageSize });
  const load = React.useCallback(async () => {
    const next = await apiFetch<Response>(`/api/reservations${qs}`);
    setData(next);
    setSyncedAt(Date.now());
  }, [qs]);

  React.useEffect(() => {
    void load().catch(() => undefined);
  }, [load]);
  React.useEffect(() => setPage(1), [status, source, term, mine]);

  const liveAt = useLiveVersion(React.useCallback(() => void load().catch(() => undefined), [load]));

  const waiting = (data?.counts ?? [])
    .filter((c) => (c.status === "RESERVED" || c.status === "PART_ISSUED") && (!source || c.source === source))
    .reduce((n, c) => n + c.n, 0);

  return (
    <>
      <PageHeader
        title="Reservation Log"
        description={reserves
          ? "Stock you, the designers and the sales teams have set aside. The inventory team holding it issues it when it leaves the store for production; only then is it deducted."
          : "What designers and the sales teams have reserved. Issue it, in full or in part, when it leaves the store for production; only then is it deducted."}
        action={
          <>
            <LiveIndicator syncedAt={liveAt} />
            {reserves ? (
              <>
                <Button variant="secondary" onClick={() => setCreating("excel")}><FileSpreadsheet className="h-4 w-4" /> Reserve from Excel</Button>
                <Button onClick={() => setCreating("form")}><Plus className="h-4 w-4" /> New reservation</Button>
              </>
            ) : null}
          </>
        }
      />

      <div className="mb-3 flex flex-wrap rounded-xl border border-border bg-surface-2 p-1" role="tablist" style={{ width: "fit-content" }}>
        {STATUSES.map((s) => (
          <button
            key={s.value}
            role="tab"
            aria-selected={status === s.value}
            onClick={() => setStatus(s.value)}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors",
              status === s.value ? "bg-surface text-fg shadow-sm" : "text-fg-muted hover:text-fg",
            )}
          >
            {s.label}
            {s.value === "OPEN" && waiting ? <span className="tabular rounded-full bg-warn-soft px-1.5 text-[11px] text-warn">{waiting}</span> : null}
          </button>
        ))}
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-2 border-b border-border p-3 sm:flex-row sm:items-center sm:p-4">
          <SearchInput value={search} onChange={setSearch} placeholder="Search REQ number, project, material code or name, who reserved, design or sales…" className="sm:flex-1" />
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <Select value={source} onChange={(e) => setSource(e.target.value)} aria-label="Side" className="sm:w-36">
              <option value="">All sides</option>
              {SOURCES.map((s) => <option key={s} value={s}>{SOURCE_LABELS[s]}</option>)}
            </Select>
            {reserves ? (
              <Select value={mine ? "mine" : "all"} onChange={(e) => setMine(e.target.value === "mine")} aria-label="Whose" className="sm:w-40">
                <option value="all">Everyone&apos;s</option>
                <option value="mine">Only mine</option>
              </Select>
            ) : null}
          </div>
        </div>

        {!data ? (
          <div className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton h-14 rounded-lg" />)}</div>
        ) : !data.items.length ? (
          <EmptyState
            icon={ClipboardList}
            title={status === "OPEN" ? "Nothing waiting to be issued" : "No reservations here"}
            description="Designers and the sales teams reserve stock with the Reservation Form, one material at a time or from Excel."
          />
        ) : (
          <>
          {/* Phones get one card per reservation, with its actions in reach. */}
          <MotionGroup revealKey={data.items.map((r) => r.id).join()} className="space-y-2 p-2.5 sm:hidden">
            {data.items.map((r) => {
              const manager = canManage(me.role, r.source);
              const open = r.status === "RESERVED" || r.status === "PART_ISSUED";
              return (
                <div key={r.id} data-card className="relative overflow-hidden rounded-xl border border-border bg-surface-2/40 p-3.5">
                  <CardGlare />
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="code text-[12.5px] font-semibold">{r.ref} <span className="font-normal text-fg-subtle">· {relativeTime(r.created_at)}</span></p>
                      <p className="mt-1 truncate text-[14px] font-medium">{r.item_name}</p>
                      <p className="code truncate text-[11.5px] text-fg-subtle">{[r.sku, r.dimensions].filter(Boolean).join(" · ")}</p>
                    </div>
                    {STATUS_BADGE[r.status]}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <SourceBadge source={r.source} />
                    <LocationBadge location={r.location} />
                    <ReservedForBadge value={r.reserved_for} company={r.reserved_by_company} />
                  </div>
                  <p className="mt-2 text-[13px]">
                    {r.project}
                    <span className="text-fg-subtle"> · {r.reserved_by === me.sub ? "you" : r.reserved_by_name ?? r.reserved_by_email ?? "—"}</span>
                  </p>
                  {r.notes ? <p className="mt-0.5 line-clamp-2 text-[12px] text-fg-subtle">{r.notes}</p> : null}
                  <div className="mt-3 flex items-end justify-between gap-3 border-t border-border pt-3">
                    <dl className="flex gap-4 text-[11.5px] text-fg-subtle">
                      <div><dt>Reserved</dt><dd className="tabular text-[14px] font-semibold text-fg">{qty(r.quantity)} <span className="text-[11px] font-normal text-fg-subtle">{r.unit}</span></dd></div>
                      {r.issued_qty ? <div><dt>Issued</dt><dd className="tabular text-[14px] font-semibold text-fg-muted">{qty(r.issued_qty)}</dd></div> : null}
                      {open ? <div><dt>Balance</dt><dd className={cn("tabular text-[14px] font-semibold text-fg", r.balance > r.in_stock && "text-danger")}>{qty(r.balance)}</dd></div> : null}
                    </dl>
                    {open ? (
                      <div className="flex shrink-0 items-center gap-1">
                        {manager || r.reserved_by === me.sub ? (
                          <Button size="sm" variant="ghost" onClick={() => setCancelling(r)}>
                            {manager && r.reserved_by !== me.sub ? "Release" : "Cancel"}
                          </Button>
                        ) : null}
                        {manager ? (
                          <Button size="sm" onClick={() => setIssuing(r)}><Truck className="h-3.5 w-3.5" /> Issue</Button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </MotionGroup>
          <TableWrap className="hidden sm:block">
            <thead>
              <tr>
                <Th>Reservation ID</Th>
                <Th>Material</Th>
                <Th>Project</Th>
                <Th align="right">Reserved</Th>
                <Th align="right" className="hidden md:table-cell">Issued</Th>
                <Th align="right">Balance</Th>
                <Th className="hidden lg:table-cell">Reserved By</Th>
                <Th align="center">Status</Th>
                <Th align="right"><span className="sr-only">Actions</span></Th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((r) => {
                const manager = canManage(me.role, r.source);
                const open = r.status === "RESERVED" || r.status === "PART_ISSUED";
                return (
                  <Tr key={r.id}>
                    <Td className="whitespace-nowrap">
                      <span className="code block text-[12.5px] font-semibold">{r.ref}</span>
                      <span className="block text-[11.5px] text-fg-subtle" title={formatDateTime(r.created_at)}>{relativeTime(r.created_at)}</span>
                    </Td>
                    <Td>
                      <span className="flex items-center gap-2">
                        <span className="code shrink-0 text-[12.5px] font-semibold">{r.sku}</span>
                        <SourceBadge source={r.source} className="hidden sm:inline-flex" />
                        <LocationBadge location={r.location} className="hidden sm:inline-flex" />
                      </span>
                      <span className="block max-w-[260px] truncate text-[12.5px] text-fg-muted">{[r.item_name, r.dimensions].filter(Boolean).join(" · ")}</span>
                    </Td>
                    <Td className="text-[13px]">
                      {r.project}
                      {r.notes ? <span className="block max-w-[240px] truncate text-[11.5px] text-fg-subtle" title={r.notes}>{r.notes}</span> : null}
                    </Td>
                    <Td align="right" className="tabular whitespace-nowrap text-[13px]">{qty(r.quantity)} <span className="text-[11px] text-fg-subtle">{r.unit}</span></Td>
                    <Td align="right" className="tabular hidden text-[13px] text-fg-muted md:table-cell">{r.issued_qty ? qty(r.issued_qty) : "—"}</Td>
                    <Td align="right" className={cn("tabular text-[13.5px] font-semibold", open && r.balance > r.in_stock && "text-danger")}>
                      {open ? qty(r.balance) : "—"}
                    </Td>
                    <Td className="hidden whitespace-nowrap text-[12.5px] text-fg-muted lg:table-cell">
                      <span className="flex items-center gap-1.5">
                        {r.reserved_by === me.sub ? "You" : r.reserved_by_name ?? r.reserved_by_email ?? "—"}
                        <ReservedForBadge value={r.reserved_for} company={r.reserved_by_company} />
                      </span>
                      {r.reserved_by !== me.sub && r.reserved_by_title ? <span className="block text-[11.5px] text-fg-subtle">{r.reserved_by_title}</span> : null}
                      {r.closed_by_name ? <span className="block text-[11.5px] text-fg-subtle">closed by {r.closed_by_name}</span> : null}
                    </Td>
                    <Td align="center">
                      {STATUS_BADGE[r.status]}
                      {r.legacy_status ? <span className="mt-0.5 block text-[10.5px] text-fg-subtle" title="Status in the workbook">wb: {r.legacy_status}</span> : null}
                    </Td>
                    <Td align="right">
                      {open ? (
                        <div className="flex items-center justify-end gap-1">
                          {manager ? (
                            <Button size="sm" onClick={() => setIssuing(r)}><Truck className="h-3.5 w-3.5" /> Issue</Button>
                          ) : null}
                          {manager || r.reserved_by === me.sub ? (
                            <Button size="sm" variant="ghost" onClick={() => setCancelling(r)}>
                              {manager && r.reserved_by !== me.sub ? "Release" : "Cancel"}
                            </Button>
                          ) : null}
                        </div>
                      ) : null}
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </TableWrap>
          </>
        )}

        {data && data.total > PAGE_SIZES[0] ? (
          <Pagination page={page} pageSize={pageSize} total={data.total} onPage={setPage} onPageSize={(size) => { setPageSize(size); setPage(1); }} />
        ) : null}
      </Card>

      {issuing ? (
        <StockIssueForm
          source={issuing.source}
          reservationId={issuing.id}
          onClose={() => setIssuing(null)}
          onSaved={() => {
            setIssuing(null);
            void load();
          }}
        />
      ) : null}

      {cancelling ? (
        <CancelModal
          reservation={cancelling}
          ownIt={cancelling.reserved_by === me.sub}
          onClose={() => setCancelling(null)}
          onDone={(message) => {
            setCancelling(null);
            toast(message);
            void load();
          }}
        />
      ) : null}

      {creating === "form" ? (
        <ReserveModal onClose={() => setCreating(null)} onSaved={() => { setCreating(null); void load(); }} />
      ) : null}
      {creating === "excel" ? (
        <ReserveUploadModal onClose={() => setCreating(null)} onApplied={() => { setCreating(null); void load(); }} />
      ) : null}
    </>
  );
}

function CancelModal({
  reservation: r, ownIt, onClose, onDone,
}: { reservation: Reservation; ownIt: boolean; onClose: () => void; onDone: (m: string) => void }) {
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function cancel() {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/reservations/${r.id}`, { method: "POST", body: JSON.stringify({ action: "cancel", note }) });
      onDone(`${r.ref} ${ownIt ? "cancelled" : "released"}. ${qty(r.balance)} ${r.unit} of ${r.sku} is available again.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not cancel");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={`${ownIt ? "Cancel" : "Release"} ${r.ref}?`}
      description={`The ${qty(r.balance)} ${r.unit} of ${r.sku} | ${r.item_name} still reserved for ${r.project} goes back to available. Nothing is deducted.${r.issued_qty ? ` The ${qty(r.issued_qty)} already issued stays issued.` : ""}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Keep it</Button>
          <Button variant="danger" onClick={cancel} loading={busy}><X className="h-4 w-4" /> {ownIt ? "Cancel reservation" : "Release"}</Button>
        </>
      }
    >
      {error ? <p className="mb-3 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2.5 text-[13px] text-danger">{error}</p> : null}
      <Field label="Reason" hint="optional">
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Project postponed, chose another finish…" />
      </Field>
    </Modal>
  );
}
