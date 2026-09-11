"use client";

import * as React from "react";
import Link from "next/link";
import { TrendingDown, TrendingUp, Trash2, Activity, Clock, BarChart3 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty";
import { PageLoading } from "@/components/ui/spinner";
import { TableWrap, Th, Td, Tr } from "@/components/ui/table";
import { StatCard } from "@/components/stat-card";
import { ProductImage } from "@/components/product-image";
import { MovementBadge, ProjectStatus } from "@/components/status";
import { apiFetch } from "@/lib/client";
import { cn, qty, relativeTime } from "@/lib/utils";

type Data = {
  days: number;
  summary: Record<string, string>;
  consumption: {
    id: string; sku: string; name: string; unit: string; image_id: string | null;
    issued: number; on_hand: number;
  }[];
  ageing: {
    id: string; sku: string; name: string; unit: string; image_id: string | null;
    on_hand: number; last_moved_at: string | null;
  }[];
  byProject: {
    id: string; code: string; name: string; status: string;
    issued_units: number; returned_units: number;
  }[];
  byType: { movement_type: string; count: number; units: number }[];
  activity: {
    id: string; action: string; entity: string; detail: string | null;
    created_at: string; user_name: string | null;
  }[];
};

const RANGES = [7, 30, 90, 365];

export function ReportsView() {
  const [days, setDays] = React.useState(30);
  const [data, setData] = React.useState<Data | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let active = true;
    setLoading(true);
    apiFetch<Data>(`/api/reports?days=${days}`)
      .then((d) => active && setData(d))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [days]);

  if (!data) return <PageLoading label="Crunching the numbers" />;

  const s = data.summary;
  const maxTypeUnits = Math.max(...data.byType.map((t) => t.units), 1);

  return (
    <>
      <PageHeader
        title="Reports"
        description="Consumption, ageing stock and the audit trail behind every movement."
        action={
          <div className="flex items-center gap-0.5 rounded-lg border border-border bg-surface-2 p-0.5">
            {RANGES.map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={cn(
                  "rounded-[6px] px-2.5 py-1.5 text-[12.5px] font-medium transition-colors",
                  days === d ? "bg-surface text-fg shadow-sm" : "text-fg-subtle hover:text-fg",
                )}
              >
                {d === 365 ? "1y" : `${d}d`}
              </button>
            ))}
          </div>
        }
      />

      <div className={cn("grid grid-cols-2 gap-3 md:grid-cols-4", loading && "opacity-60")}>
        <StatCard
          label="Units received"
          value={qty(s.units_in)}
          sub={`Into stock over ${data.days} days`}
          icon={TrendingUp}
          tone="ok"
        />
        <StatCard
          label="Units issued"
          value={qty(s.units_out)}
          sub="Consumed by production and site"
          icon={TrendingDown}
          tone="accent"
        />
        <StatCard
          label="Units wasted"
          value={qty(s.waste_units)}
          sub="Damaged or scrapped"
          icon={Trash2}
          tone={Number(s.waste_units) > 0 ? "danger" : "neutral"}
        />
        <StatCard
          label="Movements logged"
          value={Number(s.movement_count).toLocaleString()}
          sub={`over the last ${data.days} days`}
          icon={Activity}
        />
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader
            title="Highest consumption"
            description={`Materials by quantity issued over ${data.days} days`}
          />
          {data.consumption.length ? (
            <TableWrap>
              <thead>
                <tr>
                  <Th>Material</Th>
                  <Th align="right">Issued</Th>
                  <Th align="right">Left in stock</Th>
                </tr>
              </thead>
              <tbody>
                {data.consumption.map((c) => (
                  <Tr key={c.id}>
                    <Td>
                      <Link href={`/products/${c.id}`} className="flex items-center gap-3">
                        <ProductImage imageId={c.image_id} name={c.name} className="h-9 w-9" />
                        <span className="min-w-0">
                          <span className="block truncate text-[13.5px] font-medium">{c.name}</span>
                          <span className="code block truncate text-[11.5px] text-fg-subtle">{c.sku}</span>
                        </span>
                      </Link>
                    </Td>
                    <Td align="right" className="tabular text-[13px]">
                      {qty(c.issued)}
                      <span className="ml-1 text-[11px] text-fg-subtle">{c.unit}</span>
                    </Td>
                    <Td align="right" className="tabular text-[13px] font-semibold">{qty(c.on_hand)}</Td>
                  </Tr>
                ))}
              </tbody>
            </TableWrap>
          ) : (
            <EmptyState
              icon={BarChart3}
              title="Nothing issued in this window"
              description="Try a longer date range."
              className="py-12"
            />
          )}
        </Card>

        <Card>
          <CardHeader title="Movement mix" description="Units by movement type" />
          <CardBody className="space-y-3.5">
            {data.byType.length ? (
              data.byType.map((t) => (
                <div key={t.movement_type}>
                  <div className="mb-1.5 flex items-center justify-between gap-3">
                    <MovementBadge type={t.movement_type} />
                    <span className="tabular text-[12.5px] text-fg-muted">
                      {qty(t.units)} <span className="text-fg-subtle">· {t.count} entries</span>
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{ width: `${Math.max(2, (t.units / maxTypeUnits) * 100)}%` }}
                    />
                  </div>
                </div>
              ))
            ) : (
              <p className="py-8 text-center text-[13px] text-fg-subtle">No movements in this window.</p>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Slow-moving stock"
            description={`Held but not touched in ${data.days} days — the ageing review`}
          />
          {data.ageing.length ? (
            <TableWrap>
              <thead>
                <tr>
                  <Th>Material</Th>
                  <Th align="right">On hand</Th>
                  <Th align="right" className="hidden 2xl:table-cell">Last moved</Th>
                </tr>
              </thead>
              <tbody>
                {data.ageing.map((a) => (
                  <Tr key={a.id}>
                    <Td>
                      <Link href={`/products/${a.id}`} className="flex items-center gap-3">
                        <ProductImage imageId={a.image_id} name={a.name} className="h-9 w-9" />
                        <span className="min-w-0">
                          <span className="block truncate text-[13.5px] font-medium">{a.name}</span>
                          <span className="code block truncate text-[11.5px] text-fg-subtle">{a.sku}</span>
                        </span>
                      </Link>
                    </Td>
                    <Td align="right" className="tabular text-[13px]">
                      {qty(a.on_hand)}
                      <span className="ml-1 text-[11px] text-fg-subtle">{a.unit}</span>
                    </Td>

                    <Td align="right" className="hidden whitespace-nowrap text-[12px] text-fg-subtle 2xl:table-cell">
                      {a.last_moved_at ? relativeTime(a.last_moved_at) : "never"}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </TableWrap>
          ) : (
            <EmptyState
              icon={Clock}
              title="Everything is moving"
              description="No stock has been sitting untouched for this long."
              className="py-12"
            />
          )}
        </Card>

        <Card>
          <CardHeader title="Materials by project" description="Where the stock went" />
          {data.byProject.length ? (
            <TableWrap>
              <thead>
                <tr>
                  <Th>Project</Th>
                  <Th align="right">Issued</Th>
                  <Th align="right">Returned</Th>
                </tr>
              </thead>
              <tbody>
                {data.byProject.map((p) => (
                  <Tr key={p.id}>
                    <Td>
                      <Link href={`/projects/${p.id}`} className="block min-w-0">
                        <span className="code block text-[12px] font-semibold text-accent">{p.code}</span>
                        <span className="mt-0.5 block truncate text-[13px]">{p.name}</span>
                        <span className="mt-1 block"><ProjectStatus status={p.status} /></span>
                      </Link>
                    </Td>
                    <Td align="right" className="tabular text-[13px]">{qty(p.issued_units)}</Td>
                    <Td align="right" className="tabular text-[13px] text-fg-muted">
                      {p.returned_units > 0 ? qty(p.returned_units) : "—"}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </TableWrap>
          ) : (
            <EmptyState
              icon={BarChart3}
              title="No project consumption yet"
              description="Issue a requisition against a project and it will appear here."
              className="py-12"
            />
          )}
        </Card>
      </div>

      <Card className="mt-3">
        <CardHeader title="Audit trail" description="Recent activity across the system" />
        {data.activity.length ? (
          <div className="divide-y divide-border">
            {data.activity.map((a) => (
              <div key={a.id} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
                <span className="tabular w-[88px] shrink-0 text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">
                  {a.action.toLowerCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px]">
                    {a.detail ?? a.entity.replace(/_/g, " ")}
                  </span>
                  <span className="block truncate text-[11.5px] text-fg-subtle">
                    {a.user_name ?? "System"} · {a.entity.replace(/_/g, " ")}
                  </span>
                </span>
                <span className="shrink-0 whitespace-nowrap text-[11.5px] text-fg-subtle">
                  {relativeTime(a.created_at)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon={Activity} title="No activity recorded yet" className="py-12" />
        )}
      </Card>
    </>
  );
}
