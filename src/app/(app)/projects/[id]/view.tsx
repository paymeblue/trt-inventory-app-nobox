"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, TriangleAlert, Boxes, ClipboardList, Package } from "lucide-react";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty";
import { PageLoading } from "@/components/ui/spinner";
import { TableWrap, Th, Td, Tr } from "@/components/ui/table";
import { StatCard } from "@/components/stat-card";
import { ProductImage } from "@/components/product-image";
import { ProjectStatus, RequisitionStatus } from "@/components/status";
import { apiFetch } from "@/lib/client";
import { formatDate, qty, relativeTime } from "@/lib/utils";

type Detail = {
  project: {
    id: string; code: string; name: string; client_name: string | null;
    site_address: string | null; status: string; supervisor_name: string | null;
    start_date: string | null; target_date: string | null; notes: string | null;
  };
  materials: {
    id: string; sku: string; name: string; unit: string;
    image_id: string | null; issued: number; returned: number;
  }[];
  requisitions: {
    id: string; ref: string; title: string; status: string;
    created_at: string; needed_by: string | null;
  }[];
};

export function ProjectDetail({ id }: { id: string }) {
  const [data, setData] = React.useState<Detail | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    apiFetch<Detail>(`/api/projects/${id}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [id]);

  if (error) return <EmptyState icon={TriangleAlert} title="Project not found" description={error} />;
  if (!data) return <PageLoading />;

  const p = data.project;
  const totalIssued = data.materials.reduce((s, m) => s + m.issued, 0);
  const totalReturned = data.materials.reduce((s, m) => s + m.returned, 0);
  const variance = totalIssued > 0 ? ((totalIssued - totalReturned) / totalIssued) * 100 : 0;

  return (
    <>
      <Link
        href="/projects"
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-fg-muted transition-colors hover:text-fg"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Projects
      </Link>

      <div className="mb-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="code text-[13px] font-semibold text-accent">{p.code}</span>
          <ProjectStatus status={p.status} />
        </div>
        <h1 className="mt-1.5 text-[21px] leading-tight tracking-tight sm:text-[25px]">{p.name}</h1>
        <p className="mt-1 text-[13px] text-fg-muted">
          {p.client_name ?? "No client recorded"}
          {p.site_address ? ` · ${p.site_address}` : ""}
        </p>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Materials issued" value={qty(totalIssued)} sub="units out to this project" icon={Boxes} tone="accent" />
        <StatCard label="Returned" value={qty(totalReturned)} sub="unused stock back in store" icon={Package} tone="ok" />
        <StatCard label="Consumed" value={`${variance.toFixed(1)}%`} sub="of everything issued" icon={TriangleAlert} tone={variance > 95 ? "warn" : "neutral"} />
        <StatCard label="Requisitions" value={data.requisitions.length} sub="raised for this job" icon={ClipboardList} />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_300px]">
        <div className="space-y-3">
          <Card>
            <CardHeader title="Materials against this project" description="Issued versus returned, by material" />
            {data.materials.length ? (
              <TableWrap>
                <thead>
                  <tr>
                    <Th>Material</Th>
                    <Th align="right">Issued</Th>
                    <Th align="right" className="hidden sm:table-cell">Returned</Th>
                    <Th align="right">Used</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.materials.map((m) => (
                    <Tr key={m.id}>
                      <Td>
                        <Link href={`/products/${m.id}`} className="flex items-center gap-3">
                          <ProductImage imageId={m.image_id} name={m.name} className="h-9 w-9" />
                          <span className="min-w-0">
                            <span className="block truncate text-[13.5px] font-medium">{m.name}</span>
                            <span className="code block truncate text-[11.5px] text-fg-subtle">{m.sku}</span>
                          </span>
                        </Link>
                      </Td>
                      <Td align="right" className="tabular text-[13.5px] font-medium">
                        {qty(m.issued)}
                        <span className="ml-1 text-[11px] font-normal text-fg-subtle">{m.unit}</span>
                      </Td>
                      <Td align="right" className="tabular hidden text-[13px] text-fg-muted sm:table-cell">
                        {m.returned > 0 ? qty(m.returned) : "—"}
                      </Td>
                      <Td align="right" className="tabular text-[13px] font-semibold">
                        {qty(m.issued - m.returned)}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </TableWrap>
            ) : (
              <EmptyState
                icon={Boxes}
                title="No materials issued yet"
                description="Once a requisition for this project is issued, the consumption shows here."
                className="py-12"
              />
            )}
          </Card>

          <Card>
            <CardHeader title="Requisitions" />
            {data.requisitions.length ? (
              <div className="divide-y divide-border">
                {data.requisitions.map((r) => (
                  <Link
                    key={r.id}
                    href={`/requisitions/${r.id}`}
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2/50 sm:px-5"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="code text-[12px] font-semibold text-accent">{r.ref}</span>
                      <p className="mt-0.5 truncate text-[13.5px]">{r.title}</p>
                      <p className="text-[11.5px] text-fg-subtle">{relativeTime(r.created_at)}</p>
                    </div>
                    <RequisitionStatus status={r.status} />
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={ClipboardList}
                title="No requisitions"
                description="Nothing has been requested for this project yet."
                className="py-12"
              />
            )}
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader title="Details" />
          <CardBody>
            <dl className="space-y-2 text-[13px]">
              {[
                ["Client", p.client_name ?? "—"],
                ["Supervisor", p.supervisor_name ?? "Unassigned"],
                ["Start date", formatDate(p.start_date)],
                ["Target date", formatDate(p.target_date)],
              ].map(([label, value]) => (
                <div key={label} className="flex items-baseline justify-between gap-3">
                  <dt className="shrink-0 text-fg-muted">{label}</dt>
                  <dd className="truncate text-right font-medium">{value}</dd>
                </div>
              ))}
            </dl>
            {p.site_address ? (
              <p className="mt-3 border-t border-border pt-3 text-[12.5px] leading-relaxed text-fg-muted">
                {p.site_address}
              </p>
            ) : null}
            {p.notes ? (
              <p className="mt-3 border-t border-border pt-3 text-[12.5px] leading-relaxed text-fg-muted">
                {p.notes}
              </p>
            ) : null}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
