"use client";

import * as React from "react";
import Link from "next/link";
import { Bookmark, FileSpreadsheet, LayoutGrid, List as ListIcon, LogIn, PackageSearch } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button, buttonClass } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty";
import { Pagination } from "@/components/ui/pagination";
import { TableWrap, Th, Td, Tr } from "@/components/ui/table";
import { ProductImage } from "@/components/product-image";
import { LiveIndicator, SourceBadge } from "@/components/status";
import { ReorderBadge } from "@/components/forms/form-parts";
import { ItemFilters, useFilters } from "@/components/items/filters";
import { ItemDetail } from "@/components/items/item-detail";
import { useItems, type Item } from "@/components/items/use-items";
import { useDeductionAlerts } from "@/components/items/use-deduction-alerts";
import { ReserveModal } from "@/components/reservations/reserve-modal";
import { ReserveUploadModal } from "@/components/reservations/reserve-upload-modal";
import { useReservationAlerts } from "@/components/reservations/use-reservation-alerts";
import { signInHref, useSession } from "@/components/session-context";
import { apiFetch } from "@/lib/client";
import { cn, qty, relativeTime } from "@/lib/utils";

const PAGE_SIZE = 48;

/** A request to reserve, made while signed out, survives the trip through /login in the URL. */
type Intent = { kind: "reserve"; item: Item | null } | { kind: "upload" };

const TABS = [
  { value: "", label: "Everything" },
  { value: "FACTORY", label: "Factory" },
  { value: "NOBOX", label: "Nobox" },
] as const;

export function InventoryView() {
  const [source, setSource] = React.useState("");
  const [view, setView] = React.useState<"grid" | "table">("grid");
  const [page, setPage] = React.useState(1);
  const [open, setOpen] = React.useState<Item | null>(null);
  const [intent, setIntent] = React.useState<Intent | null>(null);
  const [signIn, setSignIn] = React.useState<{ title: string; returnTo: string } | null>(null);
  const { filters, setFilters, params, active } = useFilters();
  const session = useSession();

  const { data, loading, error, syncedAt, liveAt, changed, reload } = useItems({ ...params, source, page, pageSize: PAGE_SIZE });
  useDeductionAlerts(syncedAt);
  useReservationAlerts(syncedAt);

  // Coming back from /login: carry on with what the visitor was doing.
  React.useEffect(() => {
    if (!session) return;
    const url = new URL(window.location.href);
    const reserve = url.searchParams.get("reserve");
    if (reserve === "new") {
      url.searchParams.delete("reserve");
      window.history.replaceState(null, "", url.pathname + url.search);
      setIntent({ kind: "reserve", item: null });
      return;
    }
    const upload = url.searchParams.get("upload");
    if (!reserve && !upload) return;
    url.searchParams.delete("reserve");
    url.searchParams.delete("upload");
    window.history.replaceState(null, "", url.pathname + url.search);
    if (upload) setIntent({ kind: "upload" });
    if (reserve) {
      apiFetch<Item>(`/api/items/${reserve}`)
        .then((item) => setIntent({ kind: "reserve", item }))
        .catch(() => undefined);
    }
  }, [session]);

  function reserve(item: Item) {
    setOpen(null);
    if (session) setIntent({ kind: "reserve", item });
    else setSignIn({ title: `Sign in to reserve ${item.name}`, returnTo: `/inventory?reserve=${item.id}` });
  }

  function newReservation() {
    if (session) setIntent({ kind: "reserve", item: null });
    else setSignIn({ title: "Sign in to reserve", returnTo: "/inventory?reserve=new" });
  }

  function uploadReservations() {
    if (session) setIntent({ kind: "upload" });
    else setSignIn({ title: "Sign in to reserve from Excel", returnTo: "/inventory?upload=reservations" });
  }

  React.useEffect(() => {
    setPage(1);
  }, [params.q, params.category, params.status, source]);

  const counts = data?.counts;
  const tabCount = (value: string) =>
    !counts ? null : value === "FACTORY" ? counts.factory : value === "NOBOX" ? counts.nobox : counts.factory + counts.nobox;

  const items = data?.items ?? [];

  return (
    <>
      <PageHeader
        title="Inventory"
        description="Everything in the Factory and at Nobox, in one place. Quantities update on their own."
        action={
          <>
            <LiveIndicator syncedAt={liveAt} error={error} />
            <Button variant="secondary" onClick={uploadReservations}>
              <FileSpreadsheet className="h-4 w-4" /> Reserve from Excel
            </Button>
            <Button onClick={newReservation}>
              <Bookmark className="h-4 w-4" /> New reservation
            </Button>
          </>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl border border-border bg-surface-2 p-1" role="tablist">
          {TABS.map((tab) => (
            <button
              key={tab.value}
              role="tab"
              aria-selected={source === tab.value}
              onClick={() => setSource(tab.value)}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors sm:px-4",
                source === tab.value ? "bg-surface text-fg shadow-sm" : "text-fg-muted hover:text-fg",
              )}
            >
              {tab.label}
              <span className="tabular text-[11.5px] text-fg-subtle">{tabCount(tab.value) ?? ""}</span>
            </button>
          ))}
        </div>
        {counts && (counts.low || counts.out || counts.reserved) ? (
          <div className="flex gap-1.5 text-[12.5px]">
            {counts.reserved ? (
              <button
                onClick={() => setFilters({ ...filters, status: "reserved" })}
                className="rounded-lg bg-info-soft px-2.5 py-1.5 font-medium text-info"
              >
                {counts.reserved} reserved
              </button>
            ) : null}
            {counts.low ? (
              <button
                onClick={() => setFilters({ ...filters, status: "low" })}
                className="rounded-lg bg-warn-soft px-2.5 py-1.5 font-medium text-warn"
              >
                {counts.low} low
              </button>
            ) : null}
            {counts.out ? (
              <button
                onClick={() => setFilters({ ...filters, status: "out" })}
                className="rounded-lg bg-danger-soft px-2.5 py-1.5 font-medium text-danger"
              >
                {counts.out} out
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <Card className="overflow-hidden">
        <div className="border-b border-border p-3 sm:p-4">
          <ItemFilters
            filters={filters}
            onChange={setFilters}
            categories={data?.categories ?? []}
            active={active}
            trailing={
              <div className="hidden shrink-0 items-center gap-0.5 rounded-lg border border-border bg-surface-2 p-0.5 md:flex">
                {([["grid", LayoutGrid], ["table", ListIcon]] as const).map(([mode, Icon]) => (
                  <button
                    key={mode}
                    onClick={() => setView(mode)}
                    aria-label={`${mode} view`}
                    className={cn(
                      "rounded-[6px] p-2 transition-colors",
                      view === mode ? "bg-surface text-fg shadow-sm" : "text-fg-subtle hover:text-fg",
                    )}
                  >
                    <Icon className="h-[15px] w-[15px]" />
                  </button>
                ))}
              </div>
            }
          />
        </div>

        {loading && !data ? (
          <div className="grid grid-cols-2 gap-3 p-4 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="skeleton h-56 rounded-xl" />
            ))}
          </div>
        ) : !items.length ? (
          <EmptyState
            icon={PackageSearch}
            title={active ? "Nothing matches those filters" : "No items yet"}
            description={
              active
                ? "Try a broader search or clear the filters."
                : "Items appear here as soon as the Factory or Nobox adds them."
            }
          />
        ) : view === "grid" ? (
          <div className={cn("grid grid-cols-2 gap-2.5 p-2.5 sm:gap-3 sm:p-4 lg:grid-cols-3 xl:grid-cols-4", loading && "opacity-60")}>
            {items.map((item) => (
              <div
                key={item.id}
                role="button"
                tabIndex={0}
                onClick={() => setOpen(item)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setOpen(item);
                  }
                }}
                className={cn(
                  "group flex cursor-pointer flex-col overflow-hidden rounded-xl border border-border bg-surface text-left transition-all hover:border-border-strong hover:shadow-[var(--shadow)]",
                  changed.has(item.id) && "animate-flash",
                )}
              >
                <div className="relative aspect-[4/3] w-full overflow-hidden bg-surface-2">
                  <ProductImage
                    imageId={item.image_id}
                    name={item.name}
                    className="h-full w-full rounded-none border-0 transition-transform duration-300 group-hover:scale-[1.03]"
                    iconClassName="h-7 w-7"
                  />
                  <SourceBadge source={item.source} className="absolute left-2 top-2 shadow-sm" />
                </div>
                <div className="flex flex-1 flex-col p-2.5 sm:p-3">
                  <p className="code truncate text-[11px] text-fg-subtle">{item.sku}</p>
                  <h3 className="mt-0.5 line-clamp-2 text-[13.5px] font-medium leading-snug">{item.name}</h3>
                  <p className="mt-1 truncate text-[11.5px] text-fg-subtle">
                    {[item.category, item.colour].filter(Boolean).join(" · ") || "—"}
                  </p>
                  <div className="mt-auto pt-2.5">
                    <div className="flex flex-wrap items-end justify-between gap-2 border-t border-border pt-2.5">
                      <div>
                        <p className="tabular text-[16px] font-semibold leading-none">
                          {qty(item.available)} <span className="text-[11px] font-normal text-fg-subtle">{item.unit} available</span>
                        </p>
                        {item.reserved > 0 ? (
                          <p className="tabular mt-1 text-[11px] text-warn">{qty(item.reserved)} reserved of {qty(item.quantity)}</p>
                        ) : null}
                      </div>
                      <ReorderBadge status={item.reorder_status} />
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        reserve(item);
                      }}
                      disabled={item.available <= 0}
                      className={buttonClass("secondary", "sm", "mt-2.5 w-full")}
                    >
                      <Bookmark className="h-3.5 w-3.5" /> Reserve
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className={cn(loading && "opacity-60")}>
            <TableWrap>
              <thead>
                <tr>
                  <Th>Item</Th>
                  <Th>From</Th>
                  <Th className="hidden lg:table-cell">Category</Th>
                  <Th className="hidden xl:table-cell">Specification</Th>
                  <Th align="right">Available</Th>
                  <Th align="right" className="hidden md:table-cell">Reserved</Th>
                  <Th align="center" className="hidden sm:table-cell">Status</Th>
                  <Th align="right" className="hidden md:table-cell">Changed</Th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <Tr
                    key={item.id}
                    onClick={() => setOpen(item)}
                    className={cn("cursor-pointer", changed.has(item.id) && "animate-flash")}
                  >
                    <Td>
                      <div className="flex items-center gap-3">
                        <ProductImage imageId={item.image_id} name={item.name} className="h-10 w-10" />
                        <span className="min-w-0">
                          <span className="block truncate text-[13.5px] font-medium">{item.name}</span>
                          <span className="code block truncate text-[11.5px] text-fg-subtle">
                            {item.sku}
                            {item.colour ? ` · ${item.colour}` : ""}
                          </span>
                        </span>
                      </div>
                    </Td>
                    <Td><SourceBadge source={item.source} /></Td>
                    <Td className="hidden text-[13px] text-fg-muted lg:table-cell">{item.category ?? "—"}</Td>
                    <Td className="hidden text-[13px] text-fg-muted xl:table-cell">{item.spec ?? "—"}</Td>
                    <Td align="right">
                      <span className="tabular text-[13.5px] font-semibold">{qty(item.available)}</span>
                      <span className="ml-1 text-[11px] text-fg-subtle">{item.unit}</span>
                    </Td>
                    <Td align="right" className="tabular hidden text-[13px] text-warn md:table-cell">
                      {item.reserved > 0 ? qty(item.reserved) : <span className="text-fg-subtle">—</span>}
                    </Td>
                    <Td align="center" className="hidden sm:table-cell">
                      <ReorderBadge status={item.reorder_status} />
                    </Td>
                    <Td align="right" className="hidden whitespace-nowrap text-[12px] text-fg-subtle md:table-cell">
                      {relativeTime(item.updated_at)}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </TableWrap>
          </div>
        )}

        {data && data.total > PAGE_SIZE ? (
          <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPage={setPage} />
        ) : null}
      </Card>

      {open ? (
        <ItemDetail
          item={items.find((i) => i.id === open.id) ?? open}
          onClose={() => setOpen(null)}
          onReserve={() => reserve(items.find((i) => i.id === open.id) ?? open)}
        />
      ) : null}

      {intent?.kind === "reserve" && session ? (
        <ReserveModal
          item={intent.item ? items.find((i) => i.id === intent.item!.id) ?? intent.item : null}
          onClose={() => setIntent(null)}
          onSaved={() => {
            setIntent(null);
            void reload(true);
          }}
        />
      ) : null}

      {intent?.kind === "upload" && session ? (
        <ReserveUploadModal
          onClose={() => setIntent(null)}
          onApplied={() => {
            setIntent(null);
            void reload(true);
          }}
        />
      ) : null}

      {signIn ? (
        <Modal
          open
          onClose={() => setSignIn(null)}
          size="sm"
          title={signIn.title}
          description="Anyone can browse the inventory. Reserving needs your TRT Nobox account, so the factory knows who it is for."
          footer={
            <>
              <Button variant="ghost" onClick={() => setSignIn(null)}>Not now</Button>
              <Link href={signInHref(signIn.returnTo)} className={buttonClass("primary", "md")}>
                <LogIn className="h-4 w-4" /> Sign in
              </Link>
            </>
          }
        >
          <p className="text-[13px] text-fg-muted">You will come straight back here to finish.</p>
        </Modal>
      ) : null}
    </>
  );
}
