"use client";

import * as React from "react";
import { Building2, Check, ChevronDown } from "lucide-react";
import { apiFetch } from "@/lib/client";
import { cn, plural, qty } from "@/lib/utils";

export type Company = {
  id: string;
  code: string;
  name: string;
  short_name: string;
  colour: string;
  parent_id: string | null;
  parent_name: string | null;
  location_count: number;
  sku_count: number;
  total_units: number;
  total_value: number;
};

type Scope = {
  companyId: string | null;
  company: Company | null;
  companies: Company[];
  setCompanyId: (id: string | null) => void;
  loading: boolean;
};

const ScopeContext = React.createContext<Scope | null>(null);
const STORAGE_KEY = "trt.companyScope";

export function CompanyScopeProvider({ children }: { children: React.ReactNode }) {
  const [companies, setCompanies] = React.useState<Company[]>([]);
  const [companyId, setId] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let active = true;
    apiFetch<{ items: Company[] }>("/api/companies")
      .then((d) => {
        if (!active) return;
        setCompanies(d.items);
        try {
          const saved = localStorage.getItem(STORAGE_KEY);
          if (saved && d.items.some((c) => c.id === saved)) setId(saved);
        } catch {
          // Private browsing can throw on storage access; the default scope is fine.
        }
      })
      .catch(() => setCompanies([]))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const setCompanyId = React.useCallback((id: string | null) => {
    setId(id);
    try {
      if (id) localStorage.setItem(STORAGE_KEY, id);
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore — the scope still applies for this session.
    }
  }, []);

  const value = React.useMemo<Scope>(
    () => ({
      companyId,
      company: companies.find((c) => c.id === companyId) ?? null,
      companies,
      setCompanyId,
      loading,
    }),
    [companyId, companies, setCompanyId, loading],
  );

  return <ScopeContext.Provider value={value}>{children}</ScopeContext.Provider>;
}

export function useCompanyScope(): Scope {
  const ctx = React.useContext(ScopeContext);
  if (!ctx) throw new Error("useCompanyScope must be used inside CompanyScopeProvider");
  return ctx;
}

/** The value to pass as the `company` query parameter, or undefined for the group. */
export function useCompanyParam(): string | undefined {
  return useCompanyScope().companyId ?? undefined;
}

export function CompanySwitcher({ className }: { className?: string }) {
  const { companies, companyId, company, setCompanyId } = useCompanyScope();
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function onAway(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onAway);
    return () => document.removeEventListener("mousedown", onAway);
  }, []);

  if (companies.length < 2) return null;

  const groupUnits = companies.reduce((sum, c) => sum + c.total_units, 0);

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex h-9 items-center gap-2 rounded-lg border px-2.5 text-[13px] font-medium transition-colors",
          companyId
            ? "border-accent/40 bg-accent-soft text-accent"
            : "border-border bg-surface-2 text-fg hover:border-border-strong",
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ background: company?.colour ?? "var(--fg-subtle)" }}
        />
        <span className="max-w-[110px] truncate sm:max-w-none">
          {company ? company.short_name : "All companies"}
        </span>
        <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 transition-transform", open && "rotate-180")} />
      </button>

      {open ? (
        <div className="absolute right-0 top-full z-40 mt-1.5 w-[280px] animate-fade-up overflow-hidden rounded-xl border border-border bg-surface shadow-[var(--shadow)]">
          <p className="border-b border-border px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
            Show stock for
          </p>

          <button
            onClick={() => {
              setCompanyId(null);
              setOpen(false);
            }}
            className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-surface-2"
          >
            <Building2 className="h-4 w-4 shrink-0 text-fg-subtle" />
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-medium">All companies</span>
              <span className="tabular block text-[11.5px] text-fg-subtle">
                Whole group · {qty(groupUnits)} units
              </span>
            </span>
            {!companyId ? <Check className="h-4 w-4 shrink-0 text-accent" /> : null}
          </button>

          <div className="border-t border-border">
            {companies.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  setCompanyId(c.id);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-surface-2"
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c.colour }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">
                    {c.name}
                    {c.parent_name ? (
                      <span className="ml-1.5 font-normal text-fg-subtle">under {c.parent_name}</span>
                    ) : null}
                  </span>
                  <span className="tabular block text-[11.5px] text-fg-subtle">
                    {plural(c.sku_count, "material")} · {plural(c.location_count, "location")} ·{" "}
                    {qty(c.total_units)} units
                  </span>
                </span>
                {companyId === c.id ? <Check className="h-4 w-4 shrink-0 text-accent" /> : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
