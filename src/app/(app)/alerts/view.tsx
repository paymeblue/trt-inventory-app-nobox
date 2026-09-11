"use client";

import * as React from "react";
import Link from "next/link";
import { PackageCheck, TriangleAlert, PackageX, Mail, Phone, ClipboardList } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty";
import { PageLoading } from "@/components/ui/spinner";
import { TableWrap, Th, Td, Tr } from "@/components/ui/table";
import { StatCard } from "@/components/stat-card";
import { ProductImage } from "@/components/product-image";
import { usePermission } from "@/components/session-context";
import { apiFetch, toQuery } from "@/lib/client";
import { useCompanyParam } from "@/components/company-scope";
import { plural, qty, relativeTime } from "@/lib/utils";

type Row = {
  id: string; sku: string; name: string; unit: string; image_id: string | null;
  shelf_ref: string | null; reorder_level: number; unit_cost: number;
  on_hand: number; shortfall: number; category_name: string | null;
  supplier_name: string | null; supplier_phone: string | null; supplier_email: string | null;
  last_received_at: string | null;
};
type Loc = { id: string; name: string; code: string; kind: string };

export function AlertsView() {
  const may = usePermission();
  const companyId = useCompanyParam();
  const [location, setLocation] = React.useState("");
  const [data, setData] = React.useState<{ items: Row[]; locations: Loc[] } | null>(null);

  React.useEffect(() => {
    let active = true;
    setData(null);
    void apiFetch<{ items: Row[]; locations: Loc[] }>(
      `/api/alerts${toQuery({ location, company: companyId })}`,
    ).then((d) => active && setData(d));
    return () => {
      active = false;
    };
  }, [location, companyId]);

  if (!data) return <PageLoading label="Checking stock levels" />;

  const out = data.items.filter((i) => i.on_hand <= 0);
  const low = data.items.filter((i) => i.on_hand > 0);
  const unitsShort = data.items.reduce((sum, i) => sum + i.shortfall, 0);

  return (
    <>
      <PageHeader
        title="Stock alerts"
        description="Materials at or below their reorder level, worst cover first."
        action={
          may("requisition:create") ? (
            <Link href="/requisitions/new">
              <Button>
                <ClipboardList className="h-4 w-4" /> Raise requisition
              </Button>
            </Link>
          ) : null
        }
      />

      <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          label="Out of stock"
          value={out.length}
          sub="Zero balance right now"
          icon={PackageX}
          tone={out.length ? "danger" : "ok"}
        />
        <StatCard
          label="Below reorder level"
          value={low.length}
          sub="Still has cover, but thin"
          icon={TriangleAlert}
          tone={low.length ? "warn" : "ok"}
        />
        <StatCard
          label="Units to restock"
          value={qty(unitsShort)}
          sub="To reach every reorder level"
          icon={PackageCheck}
          tone="accent"
        />
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-3 sm:p-4">
          <p className="text-[13px] text-fg-muted">
            {data.items.length
              ? `${plural(data.items.length, "material")} ${data.items.length === 1 ? "needs" : "need"} attention`
              : "Everything is above threshold"}
          </p>
          <Select
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="w-full sm:w-56"
          >
            <option value="">Across all locations</option>
            {data.locations.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </Select>
        </div>

        {!data.items.length ? (
          <EmptyState
            icon={PackageCheck}
            title="Nothing needs reordering"
            description="Every active material is above its reorder level at this location."
          />
        ) : (
          <>
          <div className="divide-y divide-border sm:hidden">
            {data.items.map((item) => (
              <Link key={item.id} href={`/products/${item.id}`} className="flex items-start gap-3 px-4 py-3">
                <ProductImage imageId={item.image_id} name={item.name} className="h-10 w-10" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-medium">{item.name}</p>
                  <p className="code truncate text-[11.5px] text-fg-subtle">{item.sku}</p>
                  <p className="mt-0.5 truncate text-[11.5px] text-fg-subtle">
                    {item.supplier_name ?? "No supplier set"}
                  </p>
                  <div className="mt-1.5">
                    {item.on_hand <= 0 ? <Badge tone="danger" dot>out of stock</Badge> : <Badge tone="warn" dot>low stock</Badge>}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className={`tabular text-[15px] font-semibold leading-none ${item.on_hand <= 0 ? "text-danger" : "text-warn"}`}>
                    {qty(item.on_hand)}
                  </p>
                  <p className="mt-1 text-[11px] text-fg-subtle">of {qty(item.reorder_level)} {item.unit}</p>
                  <p className="tabular mt-1.5 text-[11px] text-fg-subtle">
                    short {qty(item.shortfall)}
                  </p>
                </div>
              </Link>
            ))}
          </div>

          <div className="hidden sm:block">
          <TableWrap>
            <thead>
              <tr>
                <Th>Material</Th>
                <Th align="right">On hand</Th>
                <Th align="right" className="hidden sm:table-cell">Reorder at</Th>
                <Th align="right">Shortfall</Th>

                <Th className="hidden xl:table-cell">Supplier</Th>
                <Th align="right" className="hidden md:table-cell">Last received</Th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <Tr key={item.id}>
                  <Td>
                    <Link href={`/products/${item.id}`} className="flex items-center gap-3">
                      <ProductImage imageId={item.image_id} name={item.name} className="h-10 w-10" />
                      <span className="min-w-0">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-[13.5px] font-medium">{item.name}</span>
                          {item.on_hand <= 0 ? <Badge tone="danger">out</Badge> : null}
                        </span>
                        <span className="code block truncate text-[11.5px] text-fg-subtle">
                          {item.sku}
                          {item.shelf_ref ? ` · shelf ${item.shelf_ref}` : ""}
                        </span>
                      </span>
                    </Link>
                  </Td>
                  <Td align="right">
                    <span
                      className={`tabular text-[13.5px] font-semibold ${item.on_hand <= 0 ? "text-danger" : "text-warn"}`}
                    >
                      {qty(item.on_hand)}
                    </span>
                    <span className="ml-1 text-[11px] text-fg-subtle">{item.unit}</span>
                  </Td>
                  <Td align="right" className="tabular hidden text-[13px] text-fg-muted sm:table-cell">
                    {qty(item.reorder_level)}
                  </Td>
                  <Td align="right" className="tabular text-[13px] font-medium">
                    {qty(item.shortfall)}
                  </Td>

                  <Td className="hidden xl:table-cell">
                    {item.supplier_name ? (
                      <div className="text-[12.5px]">
                        <p className="truncate font-medium">{item.supplier_name}</p>
                        <div className="mt-0.5 flex items-center gap-2.5 text-fg-subtle">
                          {item.supplier_phone ? (
                            <a href={`tel:${item.supplier_phone}`} className="flex items-center gap-1 hover:text-accent">
                              <Phone className="h-3 w-3" /> {item.supplier_phone}
                            </a>
                          ) : null}
                          {item.supplier_email ? (
                            <a href={`mailto:${item.supplier_email}`} className="flex items-center gap-1 hover:text-accent">
                              <Mail className="h-3 w-3" />
                            </a>
                          ) : null}
                        </div>
                      </div>
                    ) : (
                      <span className="text-[12.5px] text-fg-subtle">No supplier set</span>
                    )}
                  </Td>
                  <Td align="right" className="hidden whitespace-nowrap text-[12px] text-fg-subtle md:table-cell">
                    {item.last_received_at ? relativeTime(item.last_received_at) : "never"}
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
