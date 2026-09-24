"use client";

import * as React from "react";
import {
  Boxes, ClipboardList, Download, History, Minus, PackageX, Pencil, Plus, Tags, Trash2, TriangleAlert, Upload,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button, buttonClass } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty";
import { Pagination } from "@/components/ui/pagination";
import { TableWrap, Th, Td, Tr } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { StatCard } from "@/components/stat-card";
import { ProductImage } from "@/components/product-image";
import { LiveIndicator, StockStatus } from "@/components/status";
import { ItemFilters, useFilters } from "@/components/items/filters";
import { useItems, type Item } from "@/components/items/use-items";
import { ItemForm } from "./item-form";
import { AdjustModal, type AdjustMode } from "./adjust-modal";
import { CategoriesModal } from "./categories-modal";
import { useReservationAlerts } from "@/components/reservations/use-reservation-alerts";
import { TEMPLATE_URL, UploadModal } from "./upload-modal";
import { apiFetch } from "@/lib/client";
import { SOURCE_LABELS, type Source } from "@/lib/rbac";
import { cn, qty, relativeTime } from "@/lib/utils";

const PAGE_SIZE = 50;

type Activity = {
  id: string; kind: "CREATE" | "ADJUST" | "IMPORT" | "ISSUE"; delta: number; balance_after: number;
  note: string | null; created_at: string; item_id: string; sku: string; name: string; unit: string;
  by_name: string | null;
};

export function ManageView({ source }: { source: Source }) {
  const toast = useToast();
  const label = SOURCE_LABELS[source];
  const [page, setPage] = React.useState(1);
  const { filters, setFilters, params, active } = useFilters();
  const { data, loading, error, syncedAt, liveAt, changed, reload } = useItems({ ...params, source, page, pageSize: PAGE_SIZE });

  const [creating, setCreating] = React.useState(false);
  const [editing, setEditing] = React.useState<Item | null>(null);
  const [adjusting, setAdjusting] = React.useState<{ item: Item; mode: AdjustMode } | null>(null);
  const [managingCategories, setManagingCategories] = React.useState(false);
  const [waiting, setWaiting] = React.useState<number | null>(null);
  const [deleting, setDeleting] = React.useState<Item | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [activity, setActivity] = React.useState<Activity[] | null>(null);

  React.useEffect(() => {
    setPage(1);
  }, [params.q, params.category, params.status]);

  // Follow the item list's refresh cadence so the log and the reservation
  // count never lag the table.
  React.useEffect(() => {
    if (!syncedAt) return;
    apiFetch<{ items: Activity[] }>(`/api/items/activity?source=${source}`)
      .then((d) => setActivity(d.items))
      .catch(() => undefined);
    apiFetch<{ total: number }>(`/api/reservations?status=RESERVED&source=${source}&pageSize=1`)
      .then((d) => setWaiting(d.total))
      .catch(() => undefined);
  }, [syncedAt, source]);
  useReservationAlerts(syncedAt, source);

  const refresh = () => void reload(true);

  async function remove(item: Item) {
    try {
      await apiFetch(`/api/items/${item.id}`, { method: "DELETE" });
      toast(`${item.name} removed from ${label}.`);
      setDeleting(null);
      refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not delete", "error");
    }
  }

  const items = data?.items ?? [];
  const counts = data?.counts;
  const total = counts ? (source === "FACTORY" ? counts.factory : counts.nobox) : null;

  return (
    <>
      <PageHeader
        title={`${label} inventory`}
        description={`Add, change and remove ${label} items. Designers see every change within seconds.`}
        action={
          <>
            <LiveIndicator syncedAt={liveAt} error={error} />
            <a href={TEMPLATE_URL} className={buttonClass("ghost", "md", "hidden sm:inline-flex")}>
              <Download className="h-4 w-4" /> Template
            </a>
            <Button variant="ghost" onClick={() => setManagingCategories(true)}>
              <Tags className="h-4 w-4" /> Categories
            </Button>
            <Button variant="secondary" onClick={() => setUploading(true)}>
              <Upload className="h-4 w-4" /> Upload Excel
            </Button>
            <Button onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" /> Add item
            </Button>
          </>
        }
      />

      <div className="mb-3 grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        <a href="/reservations?status=RESERVED" className="text-left">
          <StatCard label="Waiting to issue" value={waiting ?? "—"} sub="reservations" icon={ClipboardList} tone={waiting ? "warn" : "neutral"} />
        </a>
        <button className="text-left" onClick={() => setFilters({ ...filters, status: "" })}>
          <StatCard label="Items" value={total ?? "—"} icon={Boxes} tone={source === "FACTORY" ? "accent" : "info"} />
        </button>
        <button className="text-left" onClick={() => setFilters({ ...filters, status: "low" })}>
          <StatCard label="Low stock" value={counts?.low ?? "—"} icon={TriangleAlert} tone="warn" />
        </button>
        <button className="text-left" onClick={() => setFilters({ ...filters, status: "out" })}>
          <StatCard label="Out of stock" value={counts?.out ?? "—"} icon={PackageX} tone="danger" />
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 2xl:grid-cols-[1fr_340px]">
        <Card className="min-w-0 overflow-hidden">
          <div className="border-b border-border p-3 sm:p-4">
            <ItemFilters filters={filters} onChange={setFilters} categories={data?.categories ?? []} active={active} />
          </div>

          {loading && !data ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-14 rounded-lg" />)}
            </div>
          ) : !items.length ? (
            <EmptyState
              icon={Boxes}
              title={active ? "Nothing matches those filters" : `No ${label} items yet`}
              description={active ? "Try a broader search or clear the filters." : "Add items one at a time, or upload the Excel template to add many at once."}
              action={
                active ? undefined : (
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button variant="secondary" onClick={() => setUploading(true)}><Upload className="h-4 w-4" /> Upload Excel</Button>
                    <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Add item</Button>
                  </div>
                )
              }
            />
          ) : (
            <TableWrap className={cn(loading && "opacity-60")}>
              <thead>
                <tr>
                  <Th>Item</Th>
                  <Th className="hidden lg:table-cell">Category</Th>
                  <Th align="right">In stock</Th>
                  <Th align="center" className="hidden md:table-cell">Status</Th>
                  <Th align="right">
                    <span className="sr-only">Actions</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <Tr key={item.id} className={cn(changed.has(item.id) && "animate-flash")}>
                    <Td>
                      <div className="flex items-center gap-3">
                        <ProductImage imageId={item.image_id} name={item.name} className="hidden h-10 w-10 sm:flex" />
                        <span className="min-w-0">
                          <span className="block truncate text-[13.5px] font-medium">{item.name}</span>
                          <span className="code block truncate text-[11.5px] text-fg-subtle">
                            {item.sku}
                            {item.colour ? ` · ${item.colour}` : ""}
                            {item.reorder_level ? ` · min ${qty(item.reorder_level)}` : ""}
                          </span>
                        </span>
                      </div>
                    </Td>
                    <Td className="hidden text-[13px] text-fg-muted lg:table-cell">{item.category ?? "—"}</Td>
                    <Td align="right" className="whitespace-nowrap">
                      <span className="tabular text-[14px] font-semibold">{qty(item.quantity)}</span>
                      <span className="ml-1 text-[11px] text-fg-subtle">{item.unit}</span>
                      {item.reserved > 0 ? (
                        <span className="tabular block text-[11px] text-warn">{qty(item.reserved)} reserved</span>
                      ) : null}
                    </Td>
                    <Td align="center" className="hidden md:table-cell">
                      <StockStatus onHand={item.available} reorder={item.reorder_level} />
                    </Td>
                    <Td align="right">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="secondary" onClick={() => setAdjusting({ item, mode: "add" })} aria-label={`Add stock to ${item.name}`}>
                          <Plus className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Add</span>
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setAdjusting({ item, mode: "deduct" })}
                          disabled={item.available <= 0}
                          className="text-danger"
                          aria-label={`Deduct stock from ${item.name}`}
                        >
                          <Minus className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Deduct</span>
                        </Button>
                        <IconButton label={`Edit ${item.name}`} onClick={() => setEditing(item)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </IconButton>
                        <IconButton label={`Delete ${item.name}`} onClick={() => setDeleting(item)} danger>
                          <Trash2 className="h-3.5 w-3.5" />
                        </IconButton>
                      </div>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </TableWrap>
          )}

          {data && data.total > PAGE_SIZE ? (
            <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPage={setPage} />
          ) : null}
        </Card>

        <Card className="self-start">
          <CardHeader title="Recent changes" description={`Last 25 changes to ${label} stock`} />
          {!activity ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton h-10 rounded-lg" />)}
            </div>
          ) : !activity.length ? (
            <EmptyState icon={History} title="No changes yet" className="py-10" />
          ) : (
            <ul className="scrollbar-thin max-h-[560px] divide-y divide-border overflow-y-auto">
              {activity.map((a) => (
                <li key={a.id} className="flex items-start justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium">{a.name}</p>
                    <p className="truncate text-[11.5px] text-fg-subtle">
                      {a.kind === "CREATE" ? "New item" : a.kind === "IMPORT" ? "Excel upload" : a.kind === "ISSUE" ? "Issued" : a.delta < 0 ? "Deducted" : "Added"}
                      {a.by_name ? ` · ${a.by_name}` : ""} · {relativeTime(a.created_at)}
                    </p>
                    {a.note && (a.kind === "ADJUST" || a.kind === "ISSUE") ? <p className="mt-0.5 truncate text-[11.5px] text-fg-muted">{a.note}</p> : null}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={cn("tabular text-[13px] font-semibold", a.delta > 0 ? "text-ok" : a.delta < 0 ? "text-danger" : "text-fg-subtle")}>
                      {a.delta > 0 ? "+" : ""}{qty(a.delta)}
                    </p>
                    <p className="tabular text-[11px] text-fg-subtle">→ {qty(a.balance_after)} {a.unit}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {creating || editing ? (
        <ItemForm
          source={source}
          item={editing}
          categories={data?.categories ?? []}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            refresh();
          }}
        />
      ) : null}

      {adjusting ? (
        <AdjustModal
          item={items.find((i) => i.id === adjusting.item.id) ?? adjusting.item}
          initialMode={adjusting.mode}
          onClose={() => setAdjusting(null)}
          onSaved={() => {
            setAdjusting(null);
            refresh();
          }}
        />
      ) : null}

      {uploading ? (
        <UploadModal
          source={source}
          onClose={() => setUploading(false)}
          onApplied={() => {
            setUploading(false);
            refresh();
          }}
        />
      ) : null}

      {managingCategories ? (
        <CategoriesModal
          source={source}
          onClose={() => setManagingCategories(false)}
          onChanged={refresh}
        />
      ) : null}

      {deleting ? (
        <Modal
          open
          onClose={() => setDeleting(null)}
          size="sm"
          title={`Delete ${deleting.name}?`}
          description={`It disappears from ${label} and from the designers' view, along with its change history. This cannot be undone.`}
          footer={
            <>
              <Button variant="ghost" onClick={() => setDeleting(null)}>Keep it</Button>
              <Button variant="danger" onClick={() => remove(deleting)}>Delete item</Button>
            </>
          }
        >
          <p className="text-[13px] text-fg-muted">
            <span className="code">{deleting.sku}</span> · {qty(deleting.quantity)} {deleting.unit} in stock
          </p>
        </Modal>
      ) : null}
    </>
  );
}

function IconButton({
  label, onClick, danger, className, children,
}: { label: string; onClick: () => void; danger?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "rounded-lg p-1.5 text-fg-subtle transition-colors",
        danger ? "hover:bg-danger-soft hover:text-danger" : "hover:bg-surface-2 hover:text-fg",
        className,
      )}
    >
      {children}
    </button>
  );
}
