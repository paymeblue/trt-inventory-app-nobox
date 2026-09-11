"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeftRight, Plus, Warehouse, Factory, MapPin, Truck } from "lucide-react";
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
import { StockAdjustModal } from "@/components/stock-adjust-modal";
import { StockTransferModal } from "@/components/stock-transfer-modal";
import { usePermission } from "@/components/session-context";
import { apiFetch, toQuery } from "@/lib/client";
import { useCompanyParam } from "@/components/company-scope";
import { cn, plural, qty } from "@/lib/utils";

type Level = { locationId: string; onHand: number; reserved: number };
type Row = {
  id: string; sku: string; name: string; unit: string; unit_cost: number;
  reorder_level: number; image_id: string | null; category_name: string | null;
  total_on_hand: number; levels: Level[];
};
type Loc = { id: string; name: string; code: string; kind: string };

const KIND_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  WAREHOUSE: Warehouse,
  FACTORY: Factory,
  SITE: MapPin,
  TRANSIT: Truck,
};

const PAGE_SIZE = 30;

export function StockView() {
  const may = usePermission();
  const companyId = useCompanyParam();
  const [search, setSearch] = React.useState("");
  const [location, setLocation] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [data, setData] = React.useState<{ items: Row[]; locations: Loc[]; total: number } | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [adjusting, setAdjusting] = React.useState(false);
  const [transferring, setTransferring] = React.useState(false);

  const term = useDebounced(search, 300);

  const requestId = React.useRef(0);
  const load = React.useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    try {
      const next = await apiFetch<{ items: Row[]; locations: Loc[]; total: number }>(
        `/api/stock${toQuery({ q: term, location, status, company: companyId, page, pageSize: PAGE_SIZE })}`,
      );
      if (requestId.current === id) setData(next);
    } finally {
      if (requestId.current === id) setLoading(false);
    }
  }, [term, location, status, companyId, page]);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    setPage(1);
    setLocation("");
  }, [companyId]);

  React.useEffect(() => {
    setPage(1);
  }, [term, location, status]);

  const locations = data?.locations ?? [];
  const visibleLocations = location ? locations.filter((l) => l.id === location) : locations;

  return (
    <>
      <PageHeader
        title="Stock levels"
        description="Live balance for every material, split across the warehouse, factory and sites."
        action={
          <>
            {may("stock:transfer") ? (
              <Button variant="secondary" onClick={() => setTransferring(true)}>
                <ArrowLeftRight className="h-4 w-4" />
                <span className="hidden sm:inline">Transfer</span>
              </Button>
            ) : null}
            {may("stock:adjust") ? (
              <Button onClick={() => setAdjusting(true)}>
                <Plus className="h-4 w-4" /> Movement
              </Button>
            ) : null}
          </>
        }
      />

      {locations.length ? (
        <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          <button
            onClick={() => setLocation("")}
            className={cn(
              "rounded-xl border px-3 py-2.5 text-left transition-colors",
              !location ? "border-accent bg-accent-soft" : "border-border bg-surface hover:border-border-strong",
            )}
          >
            <p className={cn("text-[13px] font-medium", !location && "text-accent")}>All locations</p>
            <p className="text-[11.5px] text-fg-subtle">{plural(locations.length, "stocking point")}</p>
          </button>
          {locations.map((l) => {
            const Icon = KIND_ICON[l.kind] ?? Warehouse;
            const active = location === l.id;
            return (
              <button
                key={l.id}
                onClick={() => setLocation(active ? "" : l.id)}
                className={cn(
                  "flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors",
                  active ? "border-accent bg-accent-soft" : "border-border bg-surface hover:border-border-strong",
                )}
              >
                <Icon className={cn("h-4 w-4 shrink-0", active ? "text-accent" : "text-fg-subtle")} />
                <span className="min-w-0">
                  <span className={cn("block truncate text-[13px] font-medium", active && "text-accent")}>
                    {l.name}
                  </span>
                  <span className="block truncate text-[11.5px] capitalize text-fg-subtle">
                    {l.kind.toLowerCase()}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      ) : null}

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-2 border-b border-border p-3 sm:flex-row sm:p-4">
          <SearchInput value={search} onChange={setSearch} placeholder="Search materials…" className="flex-1" />
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="sm:w-52">
            <option value="">All stock</option>
            <option value="low">Low stock only</option>
            <option value="out">Out of stock only</option>
          </Select>
        </div>

        {loading && !data ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="skeleton h-12 rounded-lg" />
            ))}
          </div>
        ) : !data?.items.length ? (
          <EmptyState
            icon={Warehouse}
            title="Nothing to show"
            description="No materials match the current filters."
          />
        ) : (
          <div className={cn(loading && "opacity-60")}>
            {/* Phones get a card list — a nine-column matrix cannot be read at 390px. */}
            <div className="divide-y divide-border sm:hidden">
              {data.items.map((row) => (
                <Link key={row.id} href={`/products/${row.id}`} className="flex items-center gap-3 px-4 py-3">
                  <ProductImage imageId={row.image_id} name={row.name} className="h-10 w-10" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-medium">{row.name}</p>
                    <p className="code truncate text-[11.5px] text-fg-subtle">{row.sku}</p>
                    <div className="mt-1.5">
                      <StockStatus onHand={row.total_on_hand} reorder={row.reorder_level} />
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="tabular text-[15px] font-semibold leading-none">{qty(row.total_on_hand)}</p>
                    <p className="mt-1 text-[11px] text-fg-subtle">{row.unit}</p>

                  </div>
                </Link>
              ))}
            </div>

            <div className="hidden sm:block">
            <TableWrap>
              <thead>
                <tr>
                  <Th>Material</Th>
                  {visibleLocations.map((l) => (
                    <Th key={l.id} align="right" className="hidden whitespace-nowrap md:table-cell">
                      {l.code}
                    </Th>
                  ))}
                  <Th align="right">Total</Th>

                  <Th align="center">Status</Th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((row) => (
                  <Tr key={row.id}>
                    <Td>
                      <Link href={`/products/${row.id}`} className="flex items-center gap-3">
                        <ProductImage imageId={row.image_id} name={row.name} className="h-9 w-9" />
                        <span className="min-w-0">
                          <span className="block truncate text-[13.5px] font-medium">{row.name}</span>
                          <span className="tabular block truncate text-[11.5px] text-fg-subtle">
                            {row.sku}
                            {row.category_name ? ` · ${row.category_name}` : ""}
                          </span>
                        </span>
                      </Link>
                    </Td>
                    {visibleLocations.map((l) => {
                      const level = row.levels.find((x) => x.locationId === l.id);
                      return (
                        <Td key={l.id} align="right" className="tabular hidden text-[13px] md:table-cell">
                          {level && level.onHand !== 0 ? (
                            qty(level.onHand)
                          ) : (
                            <span className="text-fg-subtle">—</span>
                          )}
                        </Td>
                      );
                    })}
                    <Td align="right">
                      <span className="tabular text-[13.5px] font-semibold">{qty(row.total_on_hand)}</span>
                      <span className="ml-1 text-[11px] text-fg-subtle">{row.unit}</span>
                    </Td>

                    <Td align="center">
                      <StockStatus onHand={row.total_on_hand} reorder={row.reorder_level} />
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </TableWrap>
            </div>
          </div>
        )}

        {data && data.total > PAGE_SIZE ? (
          <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPage={setPage} />
        ) : null}
      </Card>

      {adjusting ? (
        <StockAdjustModal
          onClose={() => setAdjusting(false)}
          onDone={() => {
            setAdjusting(false);
            void load();
          }}
        />
      ) : null}
      {transferring ? (
        <StockTransferModal
          onClose={() => setTransferring(false)}
          onDone={() => {
            setTransferring(false);
            void load();
          }}
        />
      ) : null}
    </>
  );
}
