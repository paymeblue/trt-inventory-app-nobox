"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ListChecks, ChevronRight, Workflow } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty";
import { SearchInput } from "@/components/search-input";
import { RunStatus, Progress } from "@/components/flow-status";
import { apiFetch, toQuery } from "@/lib/client";
import { cn, plural, relativeTime } from "@/lib/utils";

type Run = {
  id: string; ref: string; title: string; status: string;
  started_at: string; completed_at: string | null;
  flow_code: string; flow_name: string; flow_category: string;
  project_code: string | null; company_name: string | null;
  started_by_name: string | null;
  total_stages: number; done_stages: number; next_stage: string | null;
};

const TABS = [
  { value: "ACTIVE", label: "Active" },
  { value: "ON_HOLD", label: "On hold" },
  { value: "COMPLETED", label: "Completed" },
  { value: "", label: "All" },
];

export function RunsView() {
  const params = useSearchParams();
  const [status, setStatus] = React.useState(params.get("status") ?? "ACTIVE");
  const [search, setSearch] = React.useState("");
  const [data, setData] = React.useState<{ items: Run[]; counts: { status: string; n: string }[] } | null>(null);

  React.useEffect(() => {
    let active = true;
    setData(null);
    apiFetch<{ items: Run[]; counts: { status: string; n: string }[] }>(
      `/api/runs${toQuery({ status })}`,
    ).then((d) => active && setData(d));
    return () => {
      active = false;
    };
  }, [status]);

  const countFor = (value: string) =>
    value ? Number(data?.counts.find((c) => c.status === value)?.n ?? 0) : undefined;

  const term = search.trim().toLowerCase();
  const items = (data?.items ?? []).filter(
    (r) => !term || `${r.ref} ${r.title} ${r.flow_name}`.toLowerCase().includes(term),
  );

  return (
    <>
      <PageHeader
        title="Active runs"
        description="Every process being worked through right now, and where each one has got to."
        action={
          <Link href="/flows">
            <Button variant="secondary">
              <Workflow className="h-4 w-4" /> Start from a flow
            </Button>
          </Link>
        }
      />

      <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
        {TABS.map((tab) => {
          const n = countFor(tab.value);
          const active = status === tab.value;
          return (
            <button
              key={tab.value || "all"}
              onClick={() => setStatus(tab.value)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] font-medium transition-colors",
                active
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-border bg-surface text-fg-muted hover:text-fg",
              )}
            >
              {tab.label}
              {n ? (
                <span className={cn("tabular rounded px-1.5 text-[11px]", active ? "bg-accent/15" : "bg-surface-2")}>
                  {n}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <Card className="overflow-hidden">
        <div className="border-b border-border p-3 sm:p-4">
          <SearchInput value={search} onChange={setSearch} placeholder="Search by reference, title or flow…" />
        </div>

        {!data ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="skeleton h-16 rounded-lg" />
            ))}
          </div>
        ) : !items.length ? (
          <EmptyState
            icon={ListChecks}
            title={status === "ACTIVE" ? "Nothing running right now" : "No runs here"}
            description="Open a process flow and start a run to work through its stages."
            action={
              <Link href="/flows">
                <Button><Workflow className="h-4 w-4" /> Browse process flows</Button>
              </Link>
            }
          />
        ) : (
          <div className="divide-y divide-border">
            {items.map((r) => (
              <Link
                key={r.id}
                href={`/runs/${r.id}`}
                className="flex flex-wrap items-center gap-3 px-4 py-3.5 transition-colors hover:bg-surface-2/50 sm:px-5"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="code text-[12px] font-semibold text-accent">{r.ref}</span>
                    <RunStatus status={r.status} />
                    <span className="text-[11.5px] text-fg-subtle">{r.flow_name}</span>
                  </div>
                  <p className="mt-1 truncate text-[13.5px] font-medium">{r.title}</p>
                  <p className="truncate text-[11.5px] text-fg-subtle">
                    {r.next_stage ? (
                      <>Next: <span className="text-fg-muted">{r.next_stage}</span></>
                    ) : (
                      "All stages settled"
                    )}
                    {r.project_code ? ` · ${r.project_code}` : ""} · {relativeTime(r.started_at)}
                  </p>
                </div>
                <div className="w-full sm:w-44">
                  <Progress done={r.done_stages} total={r.total_stages} />
                </div>
                <ChevronRight className="hidden h-4 w-4 shrink-0 text-fg-subtle sm:block" />
              </Link>
            ))}
          </div>
        )}
      </Card>

      {data?.items.length ? (
        <p className="mt-3 text-[12.5px] text-fg-subtle">
          {plural(data.items.length, "run")} shown.
        </p>
      ) : null}
    </>
  );
}
