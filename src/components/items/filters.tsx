"use client";

import * as React from "react";
import { X } from "lucide-react";
import { Select } from "@/components/ui/field";
import { SearchInput, useDebounced } from "@/components/search-input";
import { LOCATION_LABELS, LOCATIONS } from "@/lib/rbac";

export type FilterState = { search: string; category: string; status: string; sort: string; location: string };

export const EMPTY_FILTERS: FilterState = { search: "", category: "", status: "", sort: "code", location: "" };

/** Filter state plus the debounced query parameters to send to /api/items. */
export function useFilters() {
  const [filters, setFilters] = React.useState<FilterState>(EMPTY_FILTERS);
  const q = useDebounced(filters.search, 300);
  const params = { q, category: filters.category, status: filters.status, sort: filters.sort, location: filters.location };
  const active = [filters.search, filters.category, filters.status, filters.location].filter(Boolean).length;
  return { filters, setFilters, params, active };
}

export function ItemFilters({
  filters,
  onChange,
  categories,
  active,
  trailing,
  locations,
  manage,
}: {
  filters: FilterState;
  onChange: (next: FilterState) => void;
  categories: string[];
  active: number;
  trailing?: React.ReactNode;
  /** Offer the Lagos / Abuja filter (Nobox). */
  locations?: boolean;
  /** Offer the inventory team's extra filters, such as materials without a photo. */
  manage?: boolean;
}) {
  const set = (key: keyof FilterState) => (e: React.ChangeEvent<HTMLSelectElement>) =>
    onChange({ ...filters, [key]: e.target.value });

  return (
    <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
      <SearchInput
        value={filters.search}
        onChange={(search) => onChange({ ...filters, search })}
        placeholder="Search code, name, subcategory, spec…"
        className="lg:flex-1"
      />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:flex lg:shrink-0">
        {locations ? (
          <Select value={filters.location} onChange={set("location")} aria-label="Location" className="lg:w-36">
            <option value="">All stores</option>
            {LOCATIONS.map((l) => (
              <option key={l} value={l}>{LOCATION_LABELS[l]}</option>
            ))}
          </Select>
        ) : null}
        <Select value={filters.category} onChange={set("category")} aria-label="Category" className="lg:w-44">
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </Select>
        <Select value={filters.status} onChange={set("status")} aria-label="Stock status" className="lg:w-40">
          <option value="">Any status</option>
          <option value="ok">Available</option>
          <option value="low">LOW</option>
          <option value="reorder">REORDER NOW</option>
          <option value="out">OUT OF STOCK</option>
          <option value="attention">Low Stock SKUs (all three)</option>
          <option value="reserved">Has reservations</option>
          {manage ? <option value="nophoto">No photo yet</option> : null}
        </Select>
        <Select value={filters.sort} onChange={set("sort")} aria-label="Sort" className="col-span-2 sm:col-span-1 lg:w-44">
          <option value="code">Material Code</option>
          <option value="name">Name A–Z</option>
          <option value="qty-desc">Most in stock</option>
          <option value="qty-asc">Least in stock</option>
          <option value="updated">Recently changed</option>
        </Select>
      </div>
      {active ? (
        <button
          onClick={() => onChange({ ...EMPTY_FILTERS, sort: filters.sort })}
          className="flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-lg px-3 text-[13px] text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
        >
          <X className="h-3.5 w-3.5" /> Clear
        </button>
      ) : null}
      {trailing}
    </div>
  );
}
