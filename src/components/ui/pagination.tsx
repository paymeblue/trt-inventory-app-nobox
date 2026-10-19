"use client";

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { Button } from "./button";

/** Tables show at most this many rows a page. */
export const PAGE_SIZES = [10, 20] as const;
export const DEFAULT_PAGE_SIZE = 20;

const SELECT =
  "h-8 cursor-pointer rounded-lg border border-border bg-surface-2 px-2 text-[13px] text-fg tabular " +
  "hover:border-border-strong focus:border-accent focus:outline-none focus:ring-4 focus:ring-[var(--ring)]";

export function Pagination({
  page,
  pageSize,
  total,
  onPage,
  onPageSize,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  /** Offers a rows-per-page choice; the caller goes back to page 1. */
  onPageSize?: (size: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
      <div className="flex items-center gap-3 text-[13px] text-fg-muted">
        <p>
          <span className="tabular">{from}</span>–<span className="tabular">{to}</span> of{" "}
          <span className="tabular">{total.toLocaleString()}</span>
        </p>
        {onPageSize ? (
          <label className="flex items-center gap-1.5">
            <span className="hidden sm:inline">Rows</span>
            <select aria-label="Rows per page" className={SELECT} value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))}>
              {PAGE_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
        ) : null}
      </div>
      <div className="flex items-center gap-1">
        <Button size="sm" variant="ghost" aria-label="First page" disabled={page <= 1} onClick={() => onPage(1)} className="hidden sm:inline-flex">
          <ChevronsLeft className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="secondary" aria-label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Prev</span>
        </Button>
        <label className="flex items-center gap-1.5 px-1.5 text-[13px] text-fg-muted">
          <span className="hidden sm:inline">Page</span>
          <select aria-label="Page" className={SELECT} value={page} onChange={(e) => onPage(Number(e.target.value))}>
            {Array.from({ length: pages }, (_, i) => i + 1).map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <span className="tabular">of {pages}</span>
        </label>
        <Button size="sm" variant="secondary" aria-label="Next page" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          <span className="hidden sm:inline">Next</span>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="ghost" aria-label="Last page" disabled={page >= pages} onClick={() => onPage(pages)} className="hidden sm:inline-flex">
          <ChevronsRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
