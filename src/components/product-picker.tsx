"use client";

import * as React from "react";
import { Search, X } from "lucide-react";
import { Input } from "./ui/field";
import { ProductImage } from "./product-image";
import { apiFetch, toQuery } from "@/lib/client";
import { cn, qty } from "@/lib/utils";

export type PickedProduct = {
  id: string;
  sku: string;
  name: string;
  unit: string;
  unit_cost: number;
  image_id: string | null;
  on_hand: number;
};

/**
 * Type-ahead material search. Results are debounced and scoped to the given
 * location when one is supplied so pickers show the balance that matters.
 */
export function ProductPicker({
  onPick,
  locationId,
  exclude = [],
  placeholder = "Search materials by name or code…",
  autoFocus,
}: {
  onPick: (product: PickedProduct) => void;
  locationId?: string | null;
  exclude?: string[];
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [term, setTerm] = React.useState("");
  const [results, setResults] = React.useState<PickedProduct[]>([]);
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [highlight, setHighlight] = React.useState(0);
  const boxRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function onClickAway(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickAway);
    return () => document.removeEventListener("mousedown", onClickAway);
  }, []);

  React.useEffect(() => {
    const value = term.trim();
    if (value.length < 1) {
      setResults([]);
      return;
    }
    let active = true;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const data = await apiFetch<{ items: PickedProduct[] }>(
          `/api/products${toQuery({ q: value, pageSize: 12, location: locationId ?? undefined })}`,
        );
        if (!active) return;
        setResults(data.items.filter((p) => !exclude.includes(p.id)));
        setHighlight(0);
        setOpen(true);
      } catch {
        if (active) setResults([]);
      } finally {
        if (active) setLoading(false);
      }
    }, 220);

    return () => {
      active = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term, locationId, exclude.join(",")]);

  function choose(product: PickedProduct) {
    onPick(product);
    setTerm("");
    setResults([]);
    setOpen(false);
  }

  return (
    <div ref={boxRef} className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
      <Input
        value={term}
        autoFocus={autoFocus}
        onChange={(e) => setTerm(e.target.value)}
        onFocus={() => results.length && setOpen(true)}
        onKeyDown={(e) => {
          if (!open || !results.length) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlight((h) => (h + 1) % results.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlight((h) => (h - 1 + results.length) % results.length);
          } else if (e.key === "Enter") {
            e.preventDefault();
            choose(results[highlight]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        placeholder={placeholder}
        className="pl-9 pr-9"
      />
      {term ? (
        <button
          type="button"
          onClick={() => {
            setTerm("");
            setOpen(false);
          }}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-fg-subtle hover:text-fg"
          aria-label="Clear"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}

      {open && (results.length > 0 || loading) ? (
        <div className="absolute inset-x-0 top-full z-30 mt-1.5 max-h-72 animate-fade-up overflow-y-auto rounded-xl border border-border bg-surface p-1 shadow-[var(--shadow)]">
          {loading && !results.length ? (
            <p className="px-3 py-3 text-[13px] text-fg-subtle">Searching…</p>
          ) : null}
          {results.map((p, i) => (
            <button
              key={p.id}
              type="button"
              onMouseEnter={() => setHighlight(i)}
              onClick={() => choose(p)}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors",
                i === highlight ? "bg-surface-2" : "hover:bg-surface-2/60",
              )}
            >
              <ProductImage imageId={p.image_id} name={p.name} className="h-9 w-9" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-medium">{p.name}</span>
                <span className="code block truncate text-[11.5px] text-fg-subtle">{p.sku}</span>
              </span>
              <span className="tabular shrink-0 text-right text-[12px] text-fg-muted">
                {qty(p.on_hand)} {p.unit}
              </span>
            </button>
          ))}
          {!loading && !results.length ? (
            <p className="px-3 py-3 text-[13px] text-fg-subtle">No matching materials.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
