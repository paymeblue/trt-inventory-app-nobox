"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ClipboardList, Plus, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty";
import { TableWrap, Th, Td, Tr } from "@/components/ui/table";
import { SearchInput, useDebounced } from "@/components/search-input";
import { RequisitionStatus } from "@/components/status";
import { usePermission } from "@/components/session-context";
import { apiFetch, toQuery } from "@/lib/client";
import { cn, formatDate, relativeTime } from "@/lib/utils";

type Row = {
  id: string; ref: string; title: string; status: string; priority: string;
  needed_by: string | null; created_at: string;
  project_name: string | null; project_code: string | null;
  from_location: string | null; to_location: string | null;
  requested_by_name: string | null; approved_by_name: string | null;
  line_count: number; est_value: number;
};

const TABS = [
  { value: "", label: "All" },
  { value: "SUBMITTED", label: "Awaiting approval" },
  { value: "APPROVED", label: "Ready to issue" },
  { value: "ISSUED", label: "Issued" },
  { value: "RECEIVED", label: "Received" },
  { value: "DRAFT", label: "Drafts" },
  { value: "CLOSED", label: "Closed" },
];

export function RequisitionsView() {
  const may = usePermission();
  const params = useSearchParams();

  const [status, setStatus] = React.useState(params.get("status") ?? "");
  const [search, setSearch] = React.useState("");
  const [data, setData] = React.useState<{ items: Row[]; counts: { status: string; n: string }[] } | null>(null);
  const [loading, setLoading] = React.useState(true);

  const term = useDebounced(search, 300);

  React.useEffect(() => {
    let active = true;
    setLoading(true);
    apiFetch<{ items: Row[]; counts: { status: string; n: string }[] }>(
      `/api/requisitions${toQuery({ status, q: term })}`,
    )
      .then((d) => active && setData(d))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [status, term]);

  const countFor = (value: string) =>
    value ? Number(data?.counts.find((c) => c.status === value)?.n ?? 0) : undefined;

  return (
    <>
      <PageHeader
        title="Requisitions"
        description="Material requests from plan to approval, issue and site receipt."
        action={
          may("requisition:create") ? (
            <Link href="/requisitions/new">
              <Button>
                <Plus className="h-4 w-4" /> New requisition
              </Button>
            </Link>
          ) : null
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
          <SearchInput value={search} onChange={setSearch} placeholder="Search by reference or title…" />
        </div>

        {loading && !data ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="skeleton h-14 rounded-lg" />
            ))}
          </div>
        ) : !data?.items.length ? (
          <EmptyState
            icon={ClipboardList}
            title="No requisitions here"
            description={
              status
                ? "Nothing sits at this stage right now."
                : "Raise a requisition when site or a production section needs material from store."
            }
            action={
              may("requisition:create") ? (
                <Link href="/requisitions/new">
                  <Button><Plus className="h-4 w-4" /> New requisition</Button>
                </Link>
              ) : undefined
            }
          />
        ) : (
          <>
            {/* Card list on phones, table from sm up */}
            <div className="divide-y divide-border sm:hidden">
              {data.items.map((r) => (
                <Link key={r.id} href={`/requisitions/${r.id}`} className="flex items-center gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="code text-[12px] font-semibold text-accent">{r.ref}</span>
                      <RequisitionStatus status={r.status} />
                    </div>
                    <p className="mt-1 truncate text-[13.5px] font-medium">{r.title}</p>
                    <p className="mt-0.5 truncate text-[11.5px] text-fg-subtle">
                      {r.line_count} line{r.line_count > 1 ? "s" : ""} · {relativeTime(r.created_at)}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-fg-subtle" />
                </Link>
              ))}
            </div>

            <div className="hidden sm:block">
              <TableWrap>
                <thead>
                  <tr>
                    <Th>Reference</Th>
                    <Th>Status</Th>
                    <Th className="hidden lg:table-cell">Route</Th>
                    <Th className="hidden xl:table-cell">Project</Th>
                    <Th align="right">Lines</Th>

                    <Th align="right" className="hidden lg:table-cell">Needed</Th>
                    <Th align="right">Raised</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((r) => (
                    <Tr key={r.id}>
                      <Td>
                        <Link href={`/requisitions/${r.id}`} className="block min-w-0">
                          <span className="flex items-center gap-2">
                            <span className="code text-[12.5px] font-semibold text-accent">{r.ref}</span>
                            {r.priority === "URGENT" || r.priority === "HIGH" ? (
                              <Badge tone={r.priority === "URGENT" ? "danger" : "warn"}>{r.priority}</Badge>
                            ) : null}
                          </span>
                          <span className="mt-0.5 block truncate text-[13.5px]">{r.title}</span>
                          <span className="block truncate text-[11.5px] text-fg-subtle">
                            {r.requested_by_name ?? "—"}
                          </span>
                        </Link>
                      </Td>
                      <Td><RequisitionStatus status={r.status} /></Td>
                      <Td className="hidden whitespace-nowrap text-[12.5px] text-fg-muted lg:table-cell">
                        {r.from_location}
                        {r.to_location ? ` → ${r.to_location}` : ""}
                      </Td>
                      <Td className="hidden text-[12.5px] text-fg-muted xl:table-cell">
                        {r.project_code ?? "—"}
                      </Td>
                      <Td align="right" className="tabular text-[13px]">{r.line_count}</Td>

                      <Td align="right" className="hidden whitespace-nowrap text-[12.5px] text-fg-muted lg:table-cell">
                        {formatDate(r.needed_by)}
                      </Td>
                      <Td align="right" className="whitespace-nowrap text-[12px] text-fg-subtle">
                        {relativeTime(r.created_at)}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </TableWrap>
            </div>
          </>
        )}
      </Card>
    </>
  );
}
