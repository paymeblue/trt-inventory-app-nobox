"use client";

import * as React from "react";
import Link from "next/link";
import {
  Package, Warehouse, TriangleAlert, PackageX, ClipboardCheck,
  PackageCheck, FolderKanban, ArrowRight, Boxes,
} from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { PageHeader } from "@/components/page-header";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty";
import { PageLoading } from "@/components/ui/spinner";
import { ProductImage } from "@/components/product-image";
import { MovementBadge, RequisitionStatus } from "@/components/status";
import { Badge } from "@/components/ui/badge";
import { MovementTrend, LocationBars } from "./charts";
import { apiFetch, toQuery } from "@/lib/client";
import { useCompanyScope } from "@/components/company-scope";
import { cn, plural, qty, relativeTime } from "@/lib/utils";

type Data = {
  totals: Record<string, string>;
  trend: { day: string; inbound: number; outbound: number }[];
  byLocation: { id: string; name: string; code: string; kind: string; value: number; units: number; skus: number; company_name: string | null }[];
  byCompany: { id: string; code: string; name: string; colour: string; value: number; units: number; skus: number; locations: number }[];
  byCategory: { name: string; value: number }[];
  criticalStock: {
    id: string; sku: string; name: string; unit: string; image_id: string | null;
    reorder_level: number; on_hand: number; supplier_name: string | null;
  }[];
  recentMovements: {
    id: string; movement_type: string; quantity: number; created_at: string;
    sku: string; product_name: string; unit: string; image_id: string | null;
    from_location: string | null; to_location: string | null; created_by_name: string | null;
  }[];
  openRequisitions: {
    id: string; ref: string; title: string; status: string; priority: string;
    needed_by: string | null; project_code: string | null; requested_by_name: string | null;
  }[];
};

export function DashboardView({ firstName }: { firstName: string }) {
  const { companyId, company, setCompanyId } = useCompanyScope();
  const [data, setData] = React.useState<Data | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    // Guard against an earlier, slower request landing after a newer one and
    // overwriting the scoped figures with the previous scope's.
    let active = true;
    setData(null);
    apiFetch<Data>(`/api/dashboard${toQuery({ company: companyId ?? undefined })}`)
      .then((d) => active && setData(d))
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [companyId]);

  if (error) {
    return (
      <EmptyState
        icon={TriangleAlert}
        title="Could not load the dashboard"
        description={error}
      />
    );
  }
  if (!data) return <PageLoading label="Loading your inventory" />;

  const t = data.totals;
  const lowStock = Number(t.low_stock);
  const outOfStock = Number(t.out_of_stock);

  return (
    <>
      <PageHeader
        title={`Good to see you, ${firstName}`}
        description={
          company
            ? `Showing ${company.name} only — every figure below is that company's stock.`
            : "Live position across the whole group — TRT and every company under it."
        }
      />

      {data.byCompany.length > 1 ? (
        <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.byCompany.map((c) => (
            <button
              key={c.id}
              onClick={() => setCompanyId(companyId === c.id ? null : c.id)}
              className={cn(
                "flex items-center gap-3 rounded-[var(--radius-card)] border p-4 text-left transition-colors",
                companyId === c.id
                  ? "border-accent bg-accent-soft"
                  : "border-border bg-surface hover:border-border-strong",
              )}
            >
              <span className="h-9 w-1.5 shrink-0 rounded-full" style={{ background: c.colour }} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-semibold">{c.name}</span>
                <span className="tabular block truncate text-[11.5px] text-fg-subtle">
                  {plural(c.skus, "material")} · {plural(c.locations, "location")}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="tabular block text-[16px] font-semibold leading-none">{qty(c.units)}</span>
                <span className="block text-[11px] text-fg-subtle">units</span>
              </span>
            </button>
          ))}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="Units in stock"
          value={qty(t.total_units)}
          sub={`Across ${plural(data.byLocation.length, "stocking location")}`}
          icon={Warehouse}
          tone="accent"
          href="/stock"
        />
        <StatCard
          label="Active materials"
          value={Number(t.active_skus).toLocaleString()}
          sub={plural(data.byLocation.length, "stocking location")}
          icon={Package}
          href="/products"
        />
        <StatCard
          label="Low stock"
          value={lowStock}
          sub={lowStock ? "At or below reorder level" : "Nothing below threshold"}
          icon={TriangleAlert}
          tone={lowStock ? "warn" : "ok"}
          href="/alerts"
        />
        <StatCard
          label="Out of stock"
          value={outOfStock}
          sub={outOfStock ? "Reorder needed now" : "Every material in stock"}
          icon={PackageX}
          tone={outOfStock ? "danger" : "ok"}
          href="/alerts"
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="Awaiting approval"
          value={Number(t.pending_approval)}
          sub="Requisitions submitted"
          icon={ClipboardCheck}
          tone={Number(t.pending_approval) ? "info" : "neutral"}
          href="/requisitions?status=SUBMITTED"
        />
        <StatCard
          label="Ready to issue"
          value={Number(t.awaiting_issue)}
          sub="Approved, waiting on store"
          icon={Boxes}
          tone={Number(t.awaiting_issue) ? "accent" : "neutral"}
          href="/requisitions?status=APPROVED"
        />
        <StatCard
          label="Draft receipts"
          value={Number(t.draft_receipts)}
          sub="Deliveries not yet posted"
          icon={PackageCheck}
          tone={Number(t.draft_receipts) ? "warn" : "neutral"}
          href="/receipts"
        />
        <StatCard
          label="Active projects"
          value={Number(t.active_projects)}
          sub="In planning, production or install"
          icon={FolderKanban}
          href="/projects"
        />
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader
            title="Material flow"
            description="Units received versus issued over the last 14 days"
          />
          <CardBody className="pl-1 pr-3 sm:pl-2">
            <MovementTrend data={data.trend} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Stock by location" description="Where the material is sitting" />
          <CardBody>
            {data.byLocation.some((l) => l.value > 0) ? (
              <LocationBars data={data.byLocation} />
            ) : (
              <p className="py-8 text-center text-[13px] text-fg-subtle">
                No stock has been received yet.
              </p>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Needs reordering"
            description="Lowest cover first"
            action={
              <Link href="/alerts" className="flex items-center gap-1 text-[13px] font-medium text-accent hover:underline">
                All alerts <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            }
          />
          {data.criticalStock.length ? (
            <div className="divide-y divide-border">
              {data.criticalStock.map((item) => (
                <Link
                  key={item.id}
                  href={`/products/${item.id}`}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2/50 sm:px-5"
                >
                  <ProductImage imageId={item.image_id} name={item.name} className="h-10 w-10" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-medium">{item.name}</p>
                    <p className="code truncate text-[11.5px] text-fg-subtle">
                      {item.sku}
                      {item.supplier_name ? ` · ${item.supplier_name}` : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={`tabular text-[13.5px] font-semibold ${item.on_hand <= 0 ? "text-danger" : "text-warn"}`}>
                      {qty(item.on_hand)} {item.unit}
                    </p>
                    <p className="tabular text-[11px] text-fg-subtle">min {qty(item.reorder_level)}</p>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={PackageCheck}
              title="Everything is above its reorder level"
              description="Nothing needs restocking right now."
              className="py-12"
            />
          )}
        </Card>

        <Card>
          <CardHeader
            title="Open requisitions"
            description="Highest priority first"
            action={
              <Link href="/requisitions" className="flex items-center gap-1 text-[13px] font-medium text-accent hover:underline">
                All <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            }
          />
          {data.openRequisitions.length ? (
            <div className="divide-y divide-border">
              {data.openRequisitions.map((r) => (
                <Link
                  key={r.id}
                  href={`/requisitions/${r.id}`}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2/50 sm:px-5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="code text-[12px] font-semibold text-accent">{r.ref}</span>
                      {r.priority === "URGENT" || r.priority === "HIGH" ? (
                        <Badge tone={r.priority === "URGENT" ? "danger" : "warn"}>{r.priority}</Badge>
                      ) : null}
                    </div>
                    <p className="mt-0.5 truncate text-[13.5px]">{r.title}</p>
                    <p className="truncate text-[11.5px] text-fg-subtle">
                      {r.requested_by_name ?? "Unknown"}
                      {r.project_code ? ` · ${r.project_code}` : ""}
                    </p>
                  </div>
                  <RequisitionStatus status={r.status} />
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={ClipboardCheck}
              title="No open requisitions"
              description="Requests awaiting approval or issue will appear here."
              className="py-12"
            />
          )}
        </Card>
      </div>

      <Card className="mt-3">
        <CardHeader
          title="Latest movements"
          description="Every receipt, issue, transfer and adjustment as it happens"
          action={
            <Link href="/movements" className="flex items-center gap-1 text-[13px] font-medium text-accent hover:underline">
              Full ledger <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          }
        />
        {data.recentMovements.length ? (
          <div className="divide-y divide-border">
            {data.recentMovements.map((m) => (
              <div key={m.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                <ProductImage imageId={m.image_id} name={m.product_name} className="h-9 w-9" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-medium">{m.product_name}</p>
                  <p className="truncate text-[11.5px] text-fg-subtle">
                    {m.from_location ? `${m.from_location} → ` : ""}
                    {m.to_location ?? "consumed"}
                    {m.created_by_name ? ` · ${m.created_by_name}` : ""}
                  </p>
                </div>
                <div className="hidden shrink-0 sm:block">
                  <MovementBadge type={m.movement_type} />
                </div>
                <div className="shrink-0 text-right">
                  <p className="tabular text-[13px] font-semibold">
                    {qty(m.quantity)} {m.unit}
                  </p>
                  <p className="text-[11px] text-fg-subtle">{relativeTime(m.created_at)}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Boxes}
            title="No stock movements yet"
            description="Import your material list or post a goods receipt to get started."
            className="py-12"
          />
        )}
      </Card>

      {data.byCategory.length ? (
        <Card className="mt-3">
          <CardHeader title="Stock by category" description="Units held, by material group" />
          <CardBody className="space-y-3">
            {data.byCategory.map((c) => {
              const max = data.byCategory[0].value || 1;
              return (
                <div key={c.name}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-3">
                    <span className="truncate text-[13px]">{c.name}</span>
                    <span className="tabular shrink-0 text-[12.5px] text-fg-muted">{qty(c.value)} units</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                    <div
                      className="h-full rounded-full bg-accent transition-all"
                      style={{ width: `${Math.max(2, (c.value / max) * 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </CardBody>
        </Card>
      ) : null}
    </>
  );
}
