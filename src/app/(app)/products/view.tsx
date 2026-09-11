"use client";

import * as React from "react";
import Link from "next/link";
import {
  Plus, Package, LayoutGrid, List as ListIcon, SlidersHorizontal, Upload, X,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/empty";
import { Pagination } from "@/components/ui/pagination";
import { TableWrap, Th, Td, Tr } from "@/components/ui/table";
import { SearchInput, useDebounced } from "@/components/search-input";
import { ProductImage } from "@/components/product-image";
import { StockStatus } from "@/components/status";
import { ProductForm } from "./product-form";
import { usePermission } from "@/components/session-context";
import { useLookups } from "@/lib/lookups";
import { useCompanyParam } from "@/components/company-scope";
import { apiFetch, toQuery } from "@/lib/client";
import { cn, qty } from "@/lib/utils";

export type ProductRow = {
  id: string; sku: string; name: string; description: string | null;
  unit: string; unit_cost: number; reorder_level: number;
  image_id: string | null; colour: string | null; spec: string | null;
  shelf_ref: string | null; is_active: boolean;
  category_id: string | null; category_name: string | null;
  supplier_id: string | null; supplier_name: string | null;
  on_hand: number; reserved: number;
};

const PAGE_SIZE = 24;

export function ProductsView() {
  const may = usePermission();
  const companyId = useCompanyParam();
  const { categories, locations, suppliers } = useLookups();

  const [view, setView] = React.useState<"grid" | "table">("table");
  const [search, setSearch] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [location, setLocation] = React.useState("");
  const [supplier, setSupplier] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [sort, setSort] = React.useState("name");
  const [dir, setDir] = React.useState<"asc" | "desc">("asc");
  const [page, setPage] = React.useState(1);
  const [showFilters, setShowFilters] = React.useState(false);

  const [rows, setRows] = React.useState<ProductRow[]>([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [editing, setEditing] = React.useState<ProductRow | null>(null);
  const [creating, setCreating] = React.useState(false);

  const term = useDebounced(search, 300);

  // Prefer the card grid on small screens where a wide table is unreadable.
  React.useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 768) setView("grid");
  }, []);

  // A generation counter so a slower earlier request cannot overwrite the
  // results of a newer one when filters change quickly.
  const requestId = React.useRef(0);
  const load = React.useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    try {
      const data = await apiFetch<{ items: ProductRow[]; total: number }>(
        `/api/products${toQuery({
          q: term, category, location, supplier, status, sort, dir,
          company: companyId, page, pageSize: PAGE_SIZE,
        })}`,
      );
      if (requestId.current !== id) return;
      setRows(data.items);
      setTotal(data.total);
    } finally {
      if (requestId.current === id) setLoading(false);
    }
  }, [term, category, location, supplier, status, sort, dir, companyId, page]);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    setPage(1);
  }, [term, category, location, supplier, status, companyId]);

  const activeFilters = [category, location, supplier, status].filter(Boolean).length;

  function clearFilters() {
    setCategory("");
    setLocation("");
    setSupplier("");
    setStatus("");
  }

  return (
    <>
      <PageHeader
        title="Materials"
        description="Every board, accessory and consumable in the central catalogue."
        action={
          <>
            {may("product:import") ? (
              <Link href="/import">
                <Button variant="secondary" size="md">
                  <Upload className="h-4 w-4" />
                  <span className="hidden sm:inline">Import</span>
                </Button>
              </Link>
            ) : null}
            {may("product:write") ? (
              <Button size="md" onClick={() => setCreating(true)}>
                <Plus className="h-4 w-4" />
                New material
              </Button>
            ) : null}
          </>
        }
      />

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border p-3 sm:p-4">
          <div className="flex items-center gap-2">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Search by name, code, colour…"
              className="flex-1"
            />
            <Button
              variant={showFilters || activeFilters ? "primary" : "secondary"}
              size="icon"
              onClick={() => setShowFilters((v) => !v)}
              aria-label="Filters"
              className="relative shrink-0"
            >
              <SlidersHorizontal className="h-4 w-4" />
              {activeFilters ? (
                <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-danger text-[10px] font-bold text-white">
                  {activeFilters}
                </span>
              ) : null}
            </Button>
            <div className="hidden shrink-0 items-center gap-0.5 rounded-lg border border-border bg-surface-2 p-0.5 md:flex">
              {([
                ["table", ListIcon],
                ["grid", LayoutGrid],
              ] as const).map(([mode, Icon]) => (
                <button
                  key={mode}
                  onClick={() => setView(mode)}
                  aria-label={`${mode} view`}
                  className={cn(
                    "rounded-[6px] p-1.5 transition-colors",
                    view === mode ? "bg-surface text-fg shadow-sm" : "text-fg-subtle hover:text-fg",
                  )}
                >
                  <Icon className="h-[15px] w-[15px]" />
                </button>
              ))}
            </div>
          </div>

          {showFilters ? (
            <div className="grid animate-fade-up gap-2 sm:grid-cols-2 lg:grid-cols-5">
              <Select value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">All categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
              <Select value={location} onChange={(e) => setLocation(e.target.value)}>
                <option value="">All locations</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </Select>
              <Select value={supplier} onChange={(e) => setSupplier(e.target.value)}>
                <option value="">All suppliers</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </Select>
              <Select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">Any stock status</option>
                <option value="ok">In stock</option>
                <option value="low">Low stock</option>
                <option value="out">Out of stock</option>
              </Select>
              <Select
                value={`${sort}:${dir}`}
                onChange={(e) => {
                  const [s, d] = e.target.value.split(":");
                  setSort(s);
                  setDir(d as "asc" | "desc");
                }}
              >
                <option value="name:asc">Name A–Z</option>
                <option value="name:desc">Name Z–A</option>
                <option value="stock:desc">Most stock</option>
                <option value="stock:asc">Least stock</option>
                <option value="updated:desc">Recently updated</option>
                <option value="created:desc">Newest first</option>
              </Select>
              {activeFilters ? (
                <button
                  onClick={clearFilters}
                  className="flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[13px] text-fg-muted transition-colors hover:text-fg lg:col-span-5"
                >
                  <X className="h-3.5 w-3.5" /> Clear {activeFilters} filter{activeFilters > 1 ? "s" : ""}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        {loading && !rows.length ? (
          <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="skeleton h-48 rounded-xl" />
            ))}
          </div>
        ) : !rows.length ? (
          <EmptyState
            icon={Package}
            title={term || activeFilters ? "No materials match those filters" : "No materials yet"}
            description={
              term || activeFilters
                ? "Try a broader search or clear the filters."
                : "Import your existing stock sheet, or add the first material by hand."
            }
            action={
              may("product:write") ? (
                <div className="flex flex-wrap justify-center gap-2">
                  {may("product:import") ? (
                    <Link href="/import">
                      <Button variant="secondary">
                        <Upload className="h-4 w-4" /> Import a spreadsheet
                      </Button>
                    </Link>
                  ) : null}
                  <Button onClick={() => setCreating(true)}>
                    <Plus className="h-4 w-4" /> Add material
                  </Button>
                </div>
              ) : undefined
            }
          />
        ) : view === "grid" ? (
          <div className={cn("grid gap-3 p-3 sm:grid-cols-2 sm:p-4 lg:grid-cols-3 xl:grid-cols-4", loading && "opacity-60")}>
            {rows.map((p) => (
              <Link
                key={p.id}
                href={`/products/${p.id}`}
                className="group overflow-hidden rounded-xl border border-border bg-surface transition-all hover:border-border-strong hover:shadow-[var(--shadow)]"
              >
                <div className="relative aspect-[4/3] w-full overflow-hidden bg-surface-2">
                  <ProductImage
                    imageId={p.image_id}
                    name={p.name}
                    className="h-full w-full rounded-none border-0 transition-transform duration-300 group-hover:scale-[1.03]"
                    iconClassName="h-7 w-7"
                  />
                  <div className="absolute left-2 top-2">
                    <StockStatus onHand={p.on_hand} reorder={p.reorder_level} />
                  </div>
                </div>
                <div className="p-3">
                  <p className="code text-[11px] text-fg-subtle">{p.sku}</p>
                  <h3 className="mt-0.5 line-clamp-2 text-[13.5px] font-medium leading-snug">{p.name}</h3>
                  <p className="mt-1 truncate text-[11.5px] text-fg-subtle">
                    {p.category_name ?? "Uncategorised"}
                  </p>
                  <div className="mt-2.5 flex items-end justify-between gap-2 border-t border-border pt-2.5">
                    <div>
                      <p className="tabular text-[15px] font-semibold leading-none">
                        {qty(p.on_hand)} <span className="text-[11px] font-normal text-fg-subtle">{p.unit}</span>
                      </p>
                      <p className="tabular mt-1 text-[11px] text-fg-subtle">min {qty(p.reorder_level)}</p>
                    </div>

                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className={cn(loading && "opacity-60")}>
            <TableWrap>
              <thead>
                <tr>
                  <Th>Material</Th>
                  <Th className="hidden lg:table-cell">Category</Th>
                  <Th className="hidden xl:table-cell">Supplier</Th>
                  <Th align="right">On hand</Th>
                  <Th align="right" className="hidden sm:table-cell">Reorder</Th>

                  <Th align="center">Status</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <Tr key={p.id} className="cursor-pointer">
                    <Td>
                      <Link href={`/products/${p.id}`} className="flex items-center gap-3">
                        <ProductImage imageId={p.image_id} name={p.name} className="h-10 w-10" />
                        <span className="min-w-0">
                          <span className="block truncate text-[13.5px] font-medium">{p.name}</span>
                          <span className="code block truncate text-[11.5px] text-fg-subtle">
                            {p.sku}
                            {p.colour ? ` · ${p.colour}` : ""}
                          </span>
                        </span>
                      </Link>
                    </Td>
                    <Td className="hidden lg:table-cell">
                      <span className="text-[13px] text-fg-muted">{p.category_name ?? "—"}</span>
                    </Td>
                    <Td className="hidden xl:table-cell">
                      <span className="text-[13px] text-fg-muted">{p.supplier_name ?? "—"}</span>
                    </Td>
                    <Td align="right">
                      <span className="tabular text-[13.5px] font-semibold">{qty(p.on_hand)}</span>
                      <span className="ml-1 text-[11px] text-fg-subtle">{p.unit}</span>
                    </Td>
                    <Td align="right" className="tabular hidden text-[13px] text-fg-muted sm:table-cell">
                      {qty(p.reorder_level)}
                    </Td>

                    <Td align="center">
                      <StockStatus onHand={p.on_hand} reorder={p.reorder_level} />
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </TableWrap>
          </div>
        )}

        {total > PAGE_SIZE ? (
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPage={setPage} />
        ) : null}
      </Card>

      {creating || editing ? (
        <ProductForm
          product={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            void load();
          }}
        />
      ) : null}
    </>
  );
}
