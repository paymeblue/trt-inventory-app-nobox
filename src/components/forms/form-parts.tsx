"use client";

import * as React from "react";
import { CheckCircle2, ChevronDown, Search, TriangleAlert, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Item } from "@/components/items/use-items";
import { useDebounced } from "@/components/search-input";
import { apiFetch, toQuery } from "@/lib/client";
import type { Source } from "@/lib/rbac";
import { cn, qty } from "@/lib/utils";

/** The workbook's Reorder_Status, with its four values. */
export function ReorderBadge({ status }: { status: string }) {
  const tone = status === "OUT OF STOCK" ? "danger" : status === "REORDER NOW" ? "warn" : status === "LOW" ? "info" : "ok";
  return <Badge tone={tone} dot>{status}</Badge>;
}

/**
 * The workbook's green "system lookup" cells: read-only values pulled from
 * Inventory_Master (or the reservation) once the inputs are chosen.
 */
export function Lookup({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 rounded-xl border border-ok/25 bg-ok-soft/40 px-3.5 py-3 text-[12.5px] sm:grid-cols-2">
      {rows.map(([label, value]) => (
        <div key={label} className="flex min-w-0 items-baseline justify-between gap-3">
          <dt className="shrink-0 text-fg-muted">{label}</dt>
          <dd className="truncate text-right font-medium">{value === null || value === undefined || value === "" ? "—" : value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * The workbook's "Status Check" cell. The form can only be submitted when it
 * reads "Ready to submit".
 */
export function StatusCheck({ message }: { message: string | null }) {
  const ready = message === null;
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-medium",
        ready ? "bg-ok-soft text-ok" : "bg-warn-soft text-warn",
      )}
    >
      {ready ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <TriangleAlert className="h-4 w-4 shrink-0" />}
      <span>Status Check: {ready ? "Ready to submit" : message}</span>
    </div>
  );
}

/** Numbers in a form, rendered the way the workbook shows them. */
export const n = (v: number | null | undefined) => (v === null || v === undefined ? "—" : qty(v));

/**
 * "Material (Code | Name)": a searchable picker over Inventory_Master, as the
 * workbook's dropdown was. Optionally limited to one side.
 */
export function MaterialPicker({
  value,
  onChange,
  source,
  autoFocus,
}: {
  value: Item | null;
  onChange: (item: Item | null) => void;
  source?: Source;
  autoFocus?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [term, setTerm] = React.useState("");
  const [results, setResults] = React.useState<Item[]>([]);
  const [loading, setLoading] = React.useState(false);
  const q = useDebounced(term, 200);
  const box = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    let live = true;
    setLoading(true);
    apiFetch<{ items: Item[] }>(`/api/items${toQuery({ q, source, sort: "code", pageSize: 30 })}`)
      .then((d) => live && setResults(d.items))
      .catch(() => live && setResults([]))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [q, source, open]);

  React.useEffect(() => {
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  if (value && !open) {
    return (
      <div className="flex h-10 items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 text-sm">
        <span className="code shrink-0 font-semibold">{value.sku}</span>
        <span className="text-fg-subtle">|</span>
        <span className="min-w-0 flex-1 truncate">{value.name}</span>
        <button type="button" onClick={() => onChange(null)} className="rounded p-0.5 text-fg-subtle hover:text-fg" aria-label="Choose another material">
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div ref={box} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
        <input
          autoFocus={autoFocus}
          value={term}
          onChange={(e) => {
            setTerm(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Type a code or name, e.g. FINSA 116 or LISSA OAK"
          className="h-10 w-full rounded-lg border border-border bg-surface-2 pl-9 pr-9 text-sm placeholder:text-fg-subtle focus:border-accent focus:outline-none focus:ring-4 focus:ring-[var(--ring)]"
        />
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
      </div>
      {open ? (
        <ul className="scrollbar-thin absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-border bg-surface py-1 shadow-[var(--shadow)]">
          {loading && !results.length ? <li className="px-3 py-2 text-[13px] text-fg-muted">Searching…</li> : null}
          {!loading && !results.length ? <li className="px-3 py-2 text-[13px] text-fg-muted">No material matches.</li> : null}
          {results.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => {
                  onChange(item);
                  setOpen(false);
                  setTerm("");
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] hover:bg-surface-2"
              >
                <span className="code w-24 shrink-0 truncate font-semibold">{item.sku}</span>
                <span className="min-w-0 flex-1 truncate">{item.name}</span>
                <span className="tabular shrink-0 text-[11.5px] text-fg-subtle">{n(item.available)} {item.unit}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
