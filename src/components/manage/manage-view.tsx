"use client";

import * as React from "react";
import Link from "next/link";
import {
  Ban, Boxes, ClipboardList, Download, History, PackageMinus, PackagePlus, Pencil, Plus, SlidersHorizontal,
  Tags, Trash2, TriangleAlert, Truck, Upload,
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
import { LiveIndicator } from "@/components/status";
import { ItemFilters, useFilters } from "@/components/items/filters";
import { useItems, type Item } from "@/components/items/use-items";
import { ReorderBadge } from "@/components/forms/form-parts";
import { StockAdditionForm, StockAdjustmentForm, StockIssueForm } from "@/components/forms/stock-forms";
import { ItemForm } from "./item-form";
import { CategoriesModal } from "./categories-modal";
import { TEMPLATE_URL, UploadModal } from "./upload-modal";
import { apiFetch } from "@/lib/client";
import { SOURCE_LABELS, type Source } from "@/lib/rbac";
import { cn, qty, relativeTime } from "@/lib/utils";

const PAGE_SIZE = 50;

type Dashboard = {
  total_materials: number; opening_qty: number; available_qty: number; reserved_qty: number; issued_qty: number;
  low_stock_skus: number; reorder_now: number; out_of_stock: number;
  reorder: { id: string; sku: string; name: string; unit: string; available: number; reorder_level: number; reorder_quantity: number; reorder_status: string }[];
};

type Activity = {
  id: string; kind: string; delta: number; balance_after: number; note: string | null; created_at: string;
  sku: string; name: string; unit: string; by_name: string | null;
};

const KIND_LABEL: Record<string, string> = {
  CREATE: "New material", OPENING: "Opening_Qty", IMPORT: "Excel upload", ADDITION: "Stock addition",
  ISSUE: "Stock issue", ADJUST: "Adjustment",
};

type Form =
  | { kind: "addition"; item?: Item }
  | { kind: "issue" }
  | { kind: "adjustment"; item?: Item; type?: string };

/**
 * The inventory team's screen for one side: the workbook's Dashboard, its three
 * forms (Stock Addition, Stock Issue, Stock Adjustment) and Inventory_Master.
 */
export function ManageView({ source }: { source: Source }) {
  const toast = useToast();
  const label = SOURCE_LABELS[source];
  const [page, setPage] = React.useState(1);
  const { filters, setFilters, params, active } = useFilters();
  const { data, loading, error, syncedAt, liveAt, changed, reload } = useItems({ ...params, source, page, pageSize: PAGE_SIZE });

  const [form, setForm] = React.useState<Form | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [editing, setEditing] = React.useState<Item | null>(null);
  const [deleting, setDeleting] = React.useState<Item | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [managingCategories, setManagingCategories] = React.useState(false);
  const [dashboard, setDashboard] = React.useState<Dashboard | null>(null);
  const [waiting, setWaiting] = React.useState<number | null>(null);
  const [activity, setActivity] = React.useState<Activity[] | null>(null);

  React.useEffect(() => setPage(1), [params.q, params.category, params.status]);

  // Follow the list's refresh cadence so the figures never lag the table.
  React.useEffect(() => {
    if (!syncedAt) return;
    apiFetch<Dashboard>(`/api/dashboard?source=${source}`).then(setDashboard).catch(() => undefined);
    apiFetch<{ total: number }>(`/api/reservations?status=OPEN&source=${source}&pageSize=1`).then((d) => setWaiting(d.total)).catch(() => undefined);
    apiFetch<{ items: Activity[] }>(`/api/items/activity?source=${source}`).then((d) => setActivity(d.items)).catch(() => undefined);
  }, [syncedAt, source]);

  const refresh = () => void reload(true);
  const done = () => {
    setForm(null);
    refresh();
  };

  async function remove(item: Item) {
    try {
      await apiFetch(`/api/items/${item.id}`, { method: "DELETE" });
      toast(`${item.sku} | ${item.name} removed from ${label}.`);
      setDeleting(null);
      refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not delete", "error");
    }
  }

  const items = data?.items ?? [];
  const d = dashboard;

  return (
    <>
      <PageHeader
        title={`${label} inventory`}
        description="Inventory team: record additions, issue against reservations, and post adjustments. Every change reaches the designers within seconds."
        action={
          <>
            <LiveIndicator syncedAt={liveAt} error={error} />
            <Button onClick={() => setForm({ kind: "issue" })}><Truck className="h-4 w-4" /> Stock Issue</Button>
            <Button variant="secondary" onClick={() => setForm({ kind: "addition" })}><PackagePlus className="h-4 w-4" /> Stock Addition</Button>
            <Button variant="secondary" onClick={() => setForm({ kind: "adjustment" })}><SlidersHorizontal className="h-4 w-4" /> Stock Adjustment</Button>
          </>
        }
      />

      {/* The workbook's Dashboard sheet. */}
      <div className="mb-3 grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Total Materials" value={d ? d.total_materials.toLocaleString() : "—"} icon={Boxes} tone={source === "FACTORY" ? "accent" : "info"} />
        <StatCard label="Opening Qty" value={d ? qty(d.opening_qty) : "—"} icon={History} />
        <StatCard label="Available Qty" value={d ? qty(d.available_qty) : "—"} icon={PackagePlus} tone="ok" />
        <Link href="/reservations" className="block">
          <StatCard label="Reserved Qty" value={d ? qty(d.reserved_qty) : "—"} sub={waiting !== null ? `${waiting} reservations to issue` : undefined} icon={ClipboardList} tone={waiting ? "warn" : "neutral"} />
        </Link>
        <Link href="/logs" className="block">
          <StatCard label="Issued Qty" value={d ? qty(d.issued_qty) : "—"} icon={PackageMinus} />
        </Link>
        <button className="text-left" onClick={() => setFilters({ ...filters, status: "attention" })}>
          <StatCard label="Low Stock SKUs" value={d ? d.low_stock_skus.toLocaleString() : "—"} sub={d ? `${d.reorder_now} reorder now · ${d.out_of_stock} out` : undefined} icon={TriangleAlert} tone="danger" />
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 2xl:grid-cols-[1fr_360px]">
        <Card className="min-w-0 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 pt-3 sm:px-4 sm:pt-4">
            <h2 className="text-sm font-semibold">Inventory_Master</h2>
            <div className="flex flex-wrap gap-1">
              <Button size="sm" variant="ghost" onClick={() => setCreating(true)}><Plus className="h-3.5 w-3.5" /> Material</Button>
              <Button size="sm" variant="ghost" onClick={() => setUploading(true)}><Upload className="h-3.5 w-3.5" /> Upload Excel</Button>
              <a href={TEMPLATE_URL} className={buttonClass("ghost", "sm")}><Download className="h-3.5 w-3.5" /> Template</a>
              <Button size="sm" variant="ghost" onClick={() => setManagingCategories(true)}><Tags className="h-3.5 w-3.5" /> Categories</Button>
            </div>
          </div>
          <div className="border-b border-border p-3 sm:p-4">
            <ItemFilters filters={filters} onChange={setFilters} categories={data?.categories ?? []} active={active} />
          </div>

          {loading && !data ? (
            <div className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-12 rounded-lg" />)}</div>
          ) : !items.length ? (
            <EmptyState
              icon={Boxes}
              title={active ? "Nothing matches those filters" : `No ${label} materials yet`}
              description={active ? "Try a broader search or clear the filters." : "Add materials one at a time, or upload the Excel template."}
            />
          ) : (
            <TableWrap className={cn(loading && "opacity-60")}>
              <thead>
                <tr>
                  <Th>Material</Th>
                  <Th className="hidden lg:table-cell">Unit</Th>
                  <Th align="right" className="hidden xl:table-cell">Opening</Th>
                  <Th align="right" className="hidden xl:table-cell">Added</Th>
                  <Th align="right" className="hidden md:table-cell">Reserved</Th>
                  <Th align="right" className="hidden xl:table-cell">Issued</Th>
                  <Th align="right" className="hidden lg:table-cell">Bad</Th>
                  <Th align="right">In stock</Th>
                  <Th align="right">Available</Th>
                  <Th align="center" className="hidden sm:table-cell">Reorder_Status</Th>
                  <Th align="right"><span className="sr-only">Actions</span></Th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <Tr key={item.id} className={cn(changed.has(item.id) && "animate-flash")}>
                    <Td>
                      <span className="code block text-[12.5px] font-semibold">{item.sku}</span>
                      <span className="block max-w-[280px] truncate text-[12.5px]">{item.name}</span>
                      <span className="block max-w-[280px] truncate text-[11px] text-fg-subtle">
                        {[item.subcategory ?? item.category, item.spec, item.dimensions].filter(Boolean).join(" · ")}
                      </span>
                    </Td>
                    <Td className="hidden text-[12.5px] text-fg-muted lg:table-cell">{item.unit}</Td>
                    <Td align="right" className="tabular hidden text-[12.5px] text-fg-muted xl:table-cell">{qty(item.opening_qty)}</Td>
                    <Td align="right" className="tabular hidden text-[12.5px] text-fg-muted xl:table-cell">{item.added ? qty(item.added) : "—"}</Td>
                    <Td align="right" className="tabular hidden text-[12.5px] text-warn md:table-cell">{item.reserved ? qty(item.reserved) : "—"}</Td>
                    <Td align="right" className="tabular hidden text-[12.5px] text-fg-muted xl:table-cell">{item.issued ? qty(item.issued) : "—"}</Td>
                    <Td align="right" className="tabular hidden text-[12.5px] text-danger lg:table-cell">{item.bad_qty ? qty(item.bad_qty) : "—"}</Td>
                    <Td align="right" className="tabular text-[13px]">{qty(item.quantity)}</Td>
                    <Td align="right" className={cn("tabular text-[13.5px] font-semibold", item.available < 0 && "text-danger")}>{qty(item.available)}</Td>
                    <Td align="center" className="hidden sm:table-cell"><ReorderBadge status={item.reorder_status} /></Td>
                    <Td align="right">
                      <div className="flex items-center justify-end gap-0.5">
                        <IconButton label={`Stock Addition for ${item.sku}`} onClick={() => setForm({ kind: "addition", item })}><PackagePlus className="h-3.5 w-3.5" /></IconButton>
                        <IconButton label={`Move ${item.sku} to bad stock`} onClick={() => setForm({ kind: "adjustment", item, type: "Move to Bad Stock" })} danger><Ban className="h-3.5 w-3.5" /></IconButton>
                        <IconButton label={`Stock Adjustment for ${item.sku}`} onClick={() => setForm({ kind: "adjustment", item })}><SlidersHorizontal className="h-3.5 w-3.5" /></IconButton>
                        <IconButton label={`Edit ${item.sku}`} onClick={() => setEditing(item)}><Pencil className="h-3.5 w-3.5" /></IconButton>
                        <IconButton label={`Delete ${item.sku}`} onClick={() => setDeleting(item)} danger><Trash2 className="h-3.5 w-3.5" /></IconButton>
                      </div>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </TableWrap>
          )}
          {data && data.total > PAGE_SIZE ? <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPage={setPage} /> : null}
        </Card>

        <div className="space-y-3 self-start">
          <Card>
            <CardHeader title="Reorder alert" description="REORDER NOW and OUT OF STOCK, with the suggested Reorder_Quantity" />
            {!d ? (
              <div className="space-y-2 p-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-9 rounded-lg" />)}</div>
            ) : !d.reorder.length ? (
              <p className="px-4 py-6 text-center text-[13px] text-fg-muted">Nothing needs reordering.</p>
            ) : (
              <ul className="scrollbar-thin max-h-[380px] divide-y divide-border overflow-y-auto">
                {d.reorder.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-2">
                    <div className="min-w-0">
                      <p className="code text-[12px] font-semibold">{r.sku}</p>
                      <p className="truncate text-[12px] text-fg-muted">{r.name}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <ReorderBadge status={r.reorder_status} />
                      <p className="tabular mt-0.5 text-[11px] text-fg-subtle">
                        {qty(r.available)} avail · min {qty(r.reorder_level)}{r.reorder_quantity ? ` · order ${qty(r.reorder_quantity)}` : ""}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Recent changes" description={`Last 25 changes to ${label} stock`} />
            {!activity ? (
              <div className="space-y-2 p-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-9 rounded-lg" />)}</div>
            ) : !activity.length ? (
              <EmptyState icon={History} title="No changes yet" className="py-8" />
            ) : (
              <ul className="scrollbar-thin max-h-[420px] divide-y divide-border overflow-y-auto">
                {activity.map((a) => (
                  <li key={a.id} className="flex items-start justify-between gap-3 px-4 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-[12.5px]"><span className="code font-semibold">{a.sku}</span> {a.name}</p>
                      <p className="truncate text-[11.5px] text-fg-subtle">
                        {KIND_LABEL[a.kind] ?? a.kind}{a.by_name ? ` · ${a.by_name}` : ""} · {relativeTime(a.created_at)}
                      </p>
                      {a.note ? <p className="truncate text-[11px] text-fg-muted">{a.note}</p> : null}
                    </div>
                    <p className={cn("tabular shrink-0 text-[13px] font-semibold", a.delta > 0 ? "text-ok" : a.delta < 0 ? "text-danger" : "text-fg-subtle")}>
                      {a.delta > 0 ? "+" : ""}{qty(a.delta)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      {form?.kind === "addition" ? <StockAdditionForm source={source} item={form.item} onClose={() => setForm(null)} onSaved={done} /> : null}
      {form?.kind === "issue" ? <StockIssueForm source={source} onClose={() => setForm(null)} onSaved={done} /> : null}
      {form?.kind === "adjustment" ? <StockAdjustmentForm source={source} item={form.item} type={form.type} onClose={() => setForm(null)} onSaved={done} /> : null}

      {creating || editing ? (
        <ItemForm
          source={source}
          item={editing}
          categories={data?.categories ?? []}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => { setCreating(false); setEditing(null); refresh(); }}
        />
      ) : null}
      {uploading ? <UploadModal source={source} onClose={() => setUploading(false)} onApplied={() => { setUploading(false); refresh(); }} /> : null}
      {managingCategories ? <CategoriesModal source={source} onClose={() => setManagingCategories(false)} onChanged={refresh} /> : null}

      {deleting ? (
        <Modal
          open
          onClose={() => setDeleting(null)}
          size="sm"
          title={`Delete ${deleting.sku}?`}
          description={`${deleting.name} disappears from ${label} and from the designers' view, with all its reservations, issues, additions and adjustments. This cannot be undone. To correct stock, use a Stock Adjustment instead.`}
          footer={
            <>
              <Button variant="ghost" onClick={() => setDeleting(null)}>Keep it</Button>
              <Button variant="danger" onClick={() => remove(deleting)}>Delete material</Button>
            </>
          }
        >
          <p className="text-[13px] text-fg-muted">{qty(deleting.quantity)} {deleting.unit} in stock · {qty(deleting.reserved)} reserved</p>
        </Modal>
      ) : null}
    </>
  );
}

function IconButton({ label, onClick, danger, children }: { label: string; onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "rounded-lg p-1.5 text-fg-subtle transition-colors",
        danger ? "hover:bg-danger-soft hover:text-danger" : "hover:bg-surface-2 hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}
