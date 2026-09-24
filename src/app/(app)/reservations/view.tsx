"use client";

import * as React from "react";
import { ArrowRight, ClipboardList, PackageCheck, Truck, X } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Field, Input, Select } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/empty";
import { Pagination } from "@/components/ui/pagination";
import { TableWrap, Th, Td, Tr } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { SearchInput, useDebounced } from "@/components/search-input";
import { ProductImage } from "@/components/product-image";
import { LiveIndicator, SourceBadge } from "@/components/status";
import { useRequiredSession } from "@/components/session-context";
import { useLiveVersion, type Item } from "@/components/items/use-items";
import type { Reservation } from "@/components/reservations/reserve-modal";
import { useReservationAlerts } from "@/components/reservations/use-reservation-alerts";
import { apiFetch, toQuery } from "@/lib/client";
import { canManage, SOURCE_LABELS, type Source } from "@/lib/rbac";
import { cn, formatDateTime, qty, relativeTime } from "@/lib/utils";

const PAGE_SIZE = 50;

const STATUSES = [
  { value: "RESERVED", label: "Waiting to issue" },
  { value: "ISSUED", label: "Issued" },
  { value: "CANCELLED", label: "Cancelled" },
  { value: "", label: "All" },
] as const;

const STATUS_BADGE = {
  RESERVED: <Badge tone="warn" dot>reserved</Badge>,
  ISSUED: <Badge tone="ok" dot>issued</Badge>,
  CANCELLED: <Badge tone="neutral" dot>cancelled</Badge>,
};

type Response = {
  items: Reservation[];
  total: number;
  counts: { status: string; source: Source; n: number }[];
};

export function ReservationsView() {
  const me = useRequiredSession();
  const toast = useToast();
  // A manager lands on their own side; everyone else sees both.
  const home: Source | "" = me.role === "FACTORY_MANAGER" ? "FACTORY" : me.role === "NOBOX_MANAGER" ? "NOBOX" : "";
  const [status, setStatus] = React.useState<string>(() => {
    if (typeof window === "undefined") return "RESERVED";
    return new URLSearchParams(window.location.search).get("status") ?? "RESERVED";
  });
  const [source, setSource] = React.useState<string>(home);
  const [mine, setMine] = React.useState(me.role === "DESIGNER");
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(1);
  const term = useDebounced(search, 300);

  const [data, setData] = React.useState<Response | null>(null);
  const [syncedAt, setSyncedAt] = React.useState<number | null>(null);
  const [issuing, setIssuing] = React.useState<Reservation | null>(null);
  const [cancelling, setCancelling] = React.useState<Reservation | null>(null);

  const qs = toQuery({ status, source, q: term, mine: mine ? "1" : "", page, pageSize: PAGE_SIZE });
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
  useReservationAlerts(syncedAt, home || undefined);

  const waiting = (s: Source | "") =>
    (data?.counts ?? []).filter((c) => c.status === "RESERVED" && (!s || c.source === s)).reduce((n, c) => n + c.n, 0);

  return (
    <>
      <PageHeader
        title="Reservations"
        description="Stock set aside for projects. The Factory or Nobox issues it when the items leave the store for production, and only then is it taken out of stock."
        action={<LiveIndicator syncedAt={liveAt} />}
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap rounded-xl border border-border bg-surface-2 p-1" role="tablist">
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
              {s.value === "RESERVED" && waiting(source as Source | "") ? (
                <span className="tabular rounded-full bg-warn-soft px-1.5 text-[11px] text-warn">{waiting(source as Source | "")}</span>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-2 border-b border-border p-3 sm:flex-row sm:items-center sm:p-4">
          <SearchInput value={search} onChange={setSearch} placeholder="Search project, item, SKU, RES number, person…" className="sm:flex-1" />
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <Select value={source} onChange={(e) => setSource(e.target.value)} aria-label="Side" className="sm:w-36">
              <option value="">Both sides</option>
              <option value="FACTORY">Factory</option>
              <option value="NOBOX">Nobox</option>
            </Select>
            <Select value={mine ? "mine" : "all"} onChange={(e) => setMine(e.target.value === "mine")} aria-label="Whose" className="sm:w-40">
              <option value="all">Everyone&apos;s</option>
              <option value="mine">Only mine</option>
            </Select>
          </div>
        </div>

        {!data ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton h-14 rounded-lg" />)}
          </div>
        ) : !data.items.length ? (
          <EmptyState
            icon={ClipboardList}
            title={status === "RESERVED" ? "Nothing waiting to be issued" : "No reservations here"}
            description="Designers reserve stock from the Inventory page, one item at a time or from Excel."
          />
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Item</Th>
                <Th align="right">Qty</Th>
                <Th>Project</Th>
                <Th className="hidden md:table-cell">Reserved</Th>
                <Th className="hidden lg:table-cell">Closed</Th>
                <Th align="center">Status</Th>
                <Th align="right"><span className="sr-only">Actions</span></Th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((r) => {
                const manager = canManage(me.role, r.source);
                const open = r.status === "RESERVED";
                return (
                  <Tr key={r.id}>
                    <Td>
                      <div className="flex items-center gap-3">
                        <ProductImage imageId={r.image_id} name={r.item_name} className="hidden h-10 w-10 sm:flex" />
                        <span className="min-w-0">
                          <span className="flex items-center gap-2">
                            <span className="truncate text-[13.5px] font-medium">{r.item_name}</span>
                            <SourceBadge source={r.source} />
                          </span>
                          <span className="code block truncate text-[11.5px] text-fg-subtle">{r.ref} · {r.sku}</span>
                        </span>
                      </div>
                    </Td>
                    <Td align="right" className="tabular whitespace-nowrap text-[13.5px] font-semibold">
                      {qty(r.quantity)} <span className="text-[11px] font-normal text-fg-subtle">{r.unit}</span>
                    </Td>
                    <Td className="text-[13px]">
                      {r.project}
                      {r.notes ? <span className="block truncate text-[11.5px] text-fg-subtle">{r.notes}</span> : null}
                    </Td>
                    <Td className="hidden whitespace-nowrap text-[12.5px] text-fg-muted md:table-cell" title={formatDateTime(r.created_at)}>
                      {r.reserved_by === me.sub ? "You" : r.reserved_by_name ?? "—"}
                      <span className="block text-[11.5px] text-fg-subtle">{relativeTime(r.created_at)}</span>
                    </Td>
                    <Td className="hidden whitespace-nowrap text-[12.5px] text-fg-muted lg:table-cell" title={r.closed_at ? formatDateTime(r.closed_at) : undefined}>
                      {r.closed_at ? (
                        <>
                          {r.closed_by_name ?? "—"}
                          <span className="block text-[11.5px] text-fg-subtle">{relativeTime(r.closed_at)}</span>
                        </>
                      ) : "—"}
                    </Td>
                    <Td align="center">{STATUS_BADGE[r.status]}</Td>
                    <Td align="right">
                      {open ? (
                        <div className="flex items-center justify-end gap-1">
                          {manager ? (
                            <Button size="sm" onClick={() => setIssuing(r)}>
                              <Truck className="h-3.5 w-3.5" /> Issue
                            </Button>
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
        )}

        {data && data.total > PAGE_SIZE ? <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPage={setPage} /> : null}
      </Card>

      {issuing ? (
        <IssueModal
          reservation={issuing}
          onClose={() => setIssuing(null)}
          onDone={(message) => {
            setIssuing(null);
            toast(message);
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
    </>
  );
}

/**
 * Issuing is the moment the items leave the store for production. It is only
 * allowed when the stock is physically there; the server checks again inside
 * the transaction, so a stale screen can never issue what is not in stock.
 */
function IssueModal({ reservation: r, onClose, onDone }: { reservation: Reservation; onClose: () => void; onDone: (m: string) => void }) {
  const [item, setItem] = React.useState<Item | null>(null);
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    apiFetch<Item>(`/api/items/${r.item_id}`).then(setItem).catch((e) => setError(e.message));
  }, [r.item_id]);

  const enough = item ? item.quantity >= r.quantity : false;

  async function issue() {
    setBusy(true);
    setError(null);
    try {
      const done = await apiFetch<{ ref: string; balance: number }>(`/api/reservations/${r.id}`, {
        method: "POST",
        body: JSON.stringify({ action: "issue", note }),
      });
      onDone(`${done.ref} issued. ${qty(r.quantity)} ${r.unit} of ${r.item_name} deducted; ${qty(done.balance)} left.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not issue");
      apiFetch<Item>(`/api/items/${r.item_id}`).then(setItem).catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={`Issue ${r.ref}`}
      description={`${r.item_name} for ${r.project}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Not yet</Button>
          <Button onClick={issue} loading={busy} disabled={!item || !enough}>
            <PackageCheck className="h-4 w-4" /> Issue and deduct
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-[13px] text-fg-muted">
          Confirm the items have left the {SOURCE_LABELS[r.source]} store for production. This completes the reservation and takes them out of stock.
        </p>
        {!item ? (
          <div className="skeleton h-16 rounded-xl" />
        ) : (
          <div className={cn("rounded-xl border px-4 py-3", enough ? "border-border bg-surface-2/50" : "border-danger/40 bg-danger-soft")}>
            <div className="flex items-center justify-center gap-3">
              <span className="text-center">
                <span className="block text-[11px] text-fg-subtle">In stock</span>
                <span className="tabular text-[18px] font-semibold">{qty(item.quantity)}</span>
              </span>
              <span className="text-center">
                <span className="block text-[11px] text-fg-subtle">Issue</span>
                <span className="tabular text-[18px] font-semibold text-danger">−{qty(r.quantity)}</span>
              </span>
              <ArrowRight className="h-4 w-4 text-fg-subtle" />
              <span className="text-center">
                <span className="block text-[11px] text-fg-subtle">Left</span>
                <span className="tabular text-[18px] font-semibold">{enough ? qty(item.quantity - r.quantity) : "—"}</span>
              </span>
            </div>
            {!enough ? (
              <p className="mt-2 text-center text-[12.5px] font-medium text-danger">
                Not enough in stock: {qty(item.quantity)} {item.unit} on hand, this needs {qty(r.quantity)}. Add stock first.
              </p>
            ) : null}
          </div>
        )}
        {error ? <p className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2.5 text-[13px] text-danger">{error}</p> : null}
        <Field label="Note" hint="optional">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Sent to production, collected by Kenneth…" />
        </Field>
      </div>
    </Modal>
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
      onDone(`${r.ref} ${ownIt ? "cancelled" : "released"}. ${qty(r.quantity)} ${r.unit} of ${r.item_name} is available again.`);
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
      description={`${qty(r.quantity)} ${r.unit} of ${r.item_name} for ${r.project} goes back to available. Nothing is deducted.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Keep it</Button>
          <Button variant="danger" onClick={cancel} loading={busy}>
            <X className="h-4 w-4" /> {ownIt ? "Cancel reservation" : "Release"}
          </Button>
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
