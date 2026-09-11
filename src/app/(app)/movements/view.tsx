"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeftRight, Download, X } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/empty";
import { Pagination } from "@/components/ui/pagination";
import { TableWrap, Th, Td, Tr } from "@/components/ui/table";
import { SearchInput, useDebounced } from "@/components/search-input";
import { ProductImage } from "@/components/product-image";
import { MovementBadge } from "@/components/status";
import { useLookups } from "@/lib/lookups";
import { useCompanyParam } from "@/components/company-scope";
import { apiFetch, toQuery } from "@/lib/client";
import { cn, formatDateTime, qty } from "@/lib/utils";

type Row = {
  id: string; movement_type: string; quantity: number; reference: string | null;
  notes: string | null; created_at: string; unit_cost: number | null;
  product_id: string; sku: string; product_name: string; unit: string; image_id: string | null;
  from_location: string | null; to_location: string | null;
  created_by_name: string | null; project_name: string | null; project_code: string | null;
};

const TYPES = ["RECEIPT", "ISSUE", "TRANSFER", "RETURN", "ADJUSTMENT", "WASTE", "OPENING"];
const PAGE_SIZE = 30;

export function MovementsView() {
  const { locations, projects } = useLookups();
  const companyId = useCompanyParam();

  const [search, setSearch] = React.useState("");
  const [type, setType] = React.useState("");
  const [location, setLocation] = React.useState("");
  const [project, setProject] = React.useState("");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [data, setData] = React.useState<{ items: Row[]; total: number } | null>(null);
  const [loading, setLoading] = React.useState(true);

  const term = useDebounced(search, 300);
  const filters = { q: term, type, location, project, from, to };
  const activeFilters = [type, location, project, from, to].filter(Boolean).length;

  const requestId = React.useRef(0);
  const load = React.useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    try {
      const next = await apiFetch<{ items: Row[]; total: number }>(
        `/api/movements${toQuery({ ...filters, company: companyId, page, pageSize: PAGE_SIZE })}`,
      );
      if (requestId.current === id) setData(next);
    } finally {
      if (requestId.current === id) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term, type, location, project, from, to, companyId, page]);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    setPage(1);
  }, [term, type, location, project, from, to]);

  function exportCsv() {
    if (!data?.items.length) return;
    const header = ["Date", "Type", "SKU", "Material", "Quantity", "Unit", "From", "To", "Reference", "Project", "By"];
    const escape = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = data.items.map((m) =>
      [
        formatDateTime(m.created_at), m.movement_type, m.sku, m.product_name,
        m.quantity, m.unit, m.from_location ?? "", m.to_location ?? "",
        m.reference ?? "", m.project_code ?? "", m.created_by_name ?? "",
      ].map(escape).join(","),
    );
    const blob = new Blob([[header.map(escape).join(","), ...lines].join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `trt-movements-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <PageHeader
        title="Movement ledger"
        description="Every receipt, issue, transfer, return and adjustment, in order."
        action={
          <Button variant="secondary" onClick={exportCsv} disabled={!data?.items.length}>
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Export page</span>
          </Button>
        }
      />

      <Card className="overflow-hidden">
        <div className="space-y-2 border-b border-border p-3 sm:p-4">
          <SearchInput value={search} onChange={setSearch} placeholder="Search material or reference…" />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <Select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">All types</option>
              {TYPES.map((t) => (
                <option key={t} value={t}>{t.charAt(0) + t.slice(1).toLowerCase()}</option>
              ))}
            </Select>
            <Select value={location} onChange={(e) => setLocation(e.target.value)}>
              <option value="">All locations</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </Select>
            <Select value={project} onChange={(e) => setProject(e.target.value)}>
              <option value="">All projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.code}</option>
              ))}
            </Select>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
          </div>
          {activeFilters ? (
            <button
              onClick={() => {
                setType("");
                setLocation("");
                setProject("");
                setFrom("");
                setTo("");
              }}
              className="flex items-center gap-1.5 text-[12.5px] text-fg-muted transition-colors hover:text-fg"
            >
              <X className="h-3.5 w-3.5" /> Clear {activeFilters} filter{activeFilters > 1 ? "s" : ""}
            </button>
          ) : null}
        </div>

        {loading && !data ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="skeleton h-12 rounded-lg" />
            ))}
          </div>
        ) : !data?.items.length ? (
          <EmptyState
            icon={ArrowLeftRight}
            title="No movements found"
            description="Nothing matches those filters yet."
          />
        ) : (
          <div className={cn(loading && "opacity-60")}>
            <div className="divide-y divide-border sm:hidden">
              {data.items.map((m) => (
                <div key={m.id} className="flex items-start gap-3 px-4 py-3">
                  <ProductImage imageId={m.image_id} name={m.product_name} className="h-10 w-10" />
                  <div className="min-w-0 flex-1">
                    <Link href={`/products/${m.product_id}`} className="block truncate text-[13.5px] font-medium">
                      {m.product_name}
                    </Link>
                    <p className="code truncate text-[11.5px] text-fg-subtle">{m.sku}</p>
                    <p className="mt-0.5 truncate text-[11.5px] text-fg-subtle">
                      {m.from_location ? `${m.from_location} → ` : ""}
                      {m.to_location ?? "consumed"}
                    </p>
                    <div className="mt-1.5"><MovementBadge type={m.movement_type} /></div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="tabular text-[14px] font-semibold leading-none">{qty(m.quantity)}</p>
                    <p className="mt-1 text-[11px] text-fg-subtle">{m.unit}</p>
                    <p className="mt-1.5 text-[11px] text-fg-subtle">{formatDateTime(m.created_at)}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden sm:block">
            <TableWrap>
              <thead>
                <tr>
                  <Th>Material</Th>
                  <Th>Type</Th>
                  <Th align="right">Qty</Th>
                  <Th className="hidden md:table-cell">Route</Th>
                  <Th className="hidden xl:table-cell">Reference</Th>
                  <Th className="hidden lg:table-cell">By</Th>
                  <Th align="right">When</Th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((m) => (
                  <Tr key={m.id}>
                    <Td>
                      <Link href={`/products/${m.product_id}`} className="flex items-center gap-3">
                        <ProductImage imageId={m.image_id} name={m.product_name} className="h-9 w-9" />
                        <span className="min-w-0">
                          <span className="block truncate text-[13.5px] font-medium">{m.product_name}</span>
                          <span className="code block truncate text-[11.5px] text-fg-subtle">{m.sku}</span>
                        </span>
                      </Link>
                    </Td>
                    <Td><MovementBadge type={m.movement_type} /></Td>
                    <Td align="right">
                      <span className="tabular text-[13.5px] font-semibold">{qty(m.quantity)}</span>
                      <span className="ml-1 text-[11px] text-fg-subtle">{m.unit}</span>

                    </Td>
                    <Td className="hidden max-w-[190px] truncate whitespace-nowrap text-[12.5px] text-fg-muted md:table-cell">
                      {m.from_location ? `${m.from_location} → ` : ""}
                      {m.to_location ?? "consumed"}
                    </Td>
                    <Td className="hidden max-w-[150px] truncate text-[12.5px] text-fg-muted xl:table-cell">
                      {m.reference ?? "—"}
                      {m.project_code ? (
                        <span className="block text-[11px] text-accent">{m.project_code}</span>
                      ) : null}
                    </Td>
                    <Td className="hidden max-w-[140px] truncate text-[12.5px] text-fg-muted lg:table-cell">
                      {m.created_by_name ?? "—"}
                    </Td>
                    <Td align="right" className="whitespace-nowrap text-[12px] text-fg-subtle">
                      {formatDateTime(m.created_at)}
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
    </>
  );
}
