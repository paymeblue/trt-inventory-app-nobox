"use client";

import * as React from "react";
import Link from "next/link";
import { Workflow, ArrowRight, CircleDot, ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty";
import { PageLoading } from "@/components/ui/spinner";
import { SearchInput } from "@/components/search-input";
import { apiFetch } from "@/lib/client";
import { cn, plural } from "@/lib/utils";

type Flow = {
  id: string; code: string; name: string; category: string; summary: string | null;
  app_route: string | null; source_sheet: string;
  stage_count: number; active_runs: number; completed_runs: number;
};

export function FlowsView() {
  const [items, setItems] = React.useState<Flow[] | null>(null);
  const [search, setSearch] = React.useState("");
  const [category, setCategory] = React.useState("");

  React.useEffect(() => {
    let active = true;
    apiFetch<{ items: Flow[] }>("/api/flows").then((d) => active && setItems(d.items));
    return () => {
      active = false;
    };
  }, []);

  if (!items) return <PageLoading label="Loading the process flows" />;

  const categories = Array.from(new Set(items.map((f) => f.category)));
  const term = search.trim().toLowerCase();
  const filtered = items.filter(
    (f) =>
      (!category || f.category === category) &&
      (!term ||
        `${f.name} ${f.code} ${f.category} ${f.summary ?? ""}`.toLowerCase().includes(term)),
  );

  const totalStages = items.reduce((s, f) => s + f.stage_count, 0);
  const grouped = categories
    .map((c) => ({ category: c, flows: filtered.filter((f) => f.category === c) }))
    .filter((g) => g.flows.length);

  return (
    <>
      <PageHeader
        title="Process flows"
        description={`Every documented TRT process — ${items.length} flows, ${totalStages} stages — exactly as written in the process flow workbook. Open one to see the stages, or start a run to work through it.`}
      />

      <div className="mb-3 flex flex-col gap-2 sm:flex-row">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search flows…"
          className="flex-1"
        />
        <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          <button
            onClick={() => setCategory("")}
            className={cn(
              "shrink-0 rounded-lg border px-3 py-1.5 text-[13px] font-medium transition-colors",
              !category
                ? "border-accent bg-accent-soft text-accent"
                : "border-border bg-surface text-fg-muted hover:text-fg",
            )}
          >
            All
          </button>
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(category === c ? "" : c)}
              className={cn(
                "shrink-0 rounded-lg border px-3 py-1.5 text-[13px] font-medium transition-colors",
                category === c
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-border bg-surface text-fg-muted hover:text-fg",
              )}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {!filtered.length ? (
        <Card>
          <EmptyState icon={Workflow} title="No flows match" description="Try a different search." />
        </Card>
      ) : (
        <div className="space-y-5">
          {grouped.map((group) => (
            <div key={group.category}>
              <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">
                {group.category}
              </h2>
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
                {group.flows.map((f) => (
                  <Link
                    key={f.id}
                    href={`/flows/${f.code.toLowerCase()}`}
                    className="group flex flex-col rounded-[var(--radius-card)] border border-border bg-surface p-4 transition-colors hover:border-border-strong hover:bg-surface-2/30"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="code text-[11.5px] font-semibold text-accent">{f.code}</span>
                      {f.app_route ? (
                        <Badge tone="ok">built in</Badge>
                      ) : (
                        <Badge>tracked</Badge>
                      )}
                    </div>
                    <h3 className="mt-1.5 text-[15px] font-semibold leading-snug tracking-tight">
                      {f.name}
                    </h3>
                    {f.summary ? (
                      <p className="mt-1.5 line-clamp-3 text-[12.5px] leading-relaxed text-fg-muted">
                        {f.summary}
                      </p>
                    ) : null}

                    <div className="mt-auto flex items-center justify-between gap-3 border-t border-border pt-3 text-[12px]">
                      <span className="text-fg-subtle">{plural(f.stage_count, "stage")}</span>
                      <span className="flex items-center gap-3">
                        {f.active_runs ? (
                          <span className="flex items-center gap-1 text-info">
                            <CircleDot className="h-3 w-3" /> {f.active_runs} running
                          </span>
                        ) : null}
                        {f.app_route ? (
                          <ExternalLink className="h-3.5 w-3.5 text-fg-subtle" />
                        ) : null}
                        <ArrowRight className="h-3.5 w-3.5 text-fg-subtle transition-transform group-hover:translate-x-0.5" />
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
