"use client";

import * as React from "react";
import Link from "next/link";
import { PackageCheck, Plus, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty";
import { TableWrap, Th, Td, Tr } from "@/components/ui/table";
import { ReceiptStatus } from "@/components/status";
import { usePermission } from "@/components/session-context";
import { apiFetch } from "@/lib/client";
import { formatDate, relativeTime } from "@/lib/utils";

type Row = {
  id: string; ref: string; waybill_no: string | null; lpo_no: string | null;
  status: string; received_at: string; notes: string | null; posted_at: string | null;
  supplier_name: string | null; location_name: string; created_by_name: string | null;
  line_count: number; total_value: number;
};

export function ReceiptsView() {
  const may = usePermission();
  const [items, setItems] = React.useState<Row[] | null>(null);

  React.useEffect(() => {
    void apiFetch<{ items: Row[] }>("/api/receipts").then((d) => setItems(d.items));
  }, []);

  return (
    <>
      <PageHeader
        title="Goods receipts"
        description="Deliveries from suppliers, verified and posted into the store."
        action={
          may("receipt:write") ? (
            <Link href="/receipts/new">
              <Button>
                <Plus className="h-4 w-4" /> Record delivery
              </Button>
            </Link>
          ) : null
        }
      />

      <Card className="overflow-hidden">
        {!items ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="skeleton h-14 rounded-lg" />
            ))}
          </div>
        ) : !items.length ? (
          <EmptyState
            icon={PackageCheck}
            title="No deliveries recorded"
            description="When a supplier delivers, record a goods receipt here so stock is verified before it is posted."
            action={
              may("receipt:write") ? (
                <Link href="/receipts/new">
                  <Button><Plus className="h-4 w-4" /> Record delivery</Button>
                </Link>
              ) : undefined
            }
          />
        ) : (
          <>
            <div className="divide-y divide-border sm:hidden">
              {items.map((r) => (
                <Link key={r.id} href={`/receipts/${r.id}`} className="flex items-center gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="code text-[12px] font-semibold text-accent">{r.ref}</span>
                      <ReceiptStatus status={r.status} />
                    </div>
                    <p className="mt-1 truncate text-[13.5px] font-medium">
                      {r.supplier_name ?? "No supplier"}
                    </p>
                    <p className="truncate text-[11.5px] text-fg-subtle">
                      {r.location_name} · {r.line_count} line{r.line_count > 1 ? "s" : ""}
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
                    <Th>Supplier</Th>
                    <Th className="hidden lg:table-cell">Into</Th>
                    <Th className="hidden xl:table-cell">Waybill / LPO</Th>
                    <Th align="right">Lines</Th>

                    <Th align="center">Status</Th>
                    <Th align="right">Received</Th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((r) => (
                    <Tr key={r.id}>
                      <Td>
                        <Link href={`/receipts/${r.id}`} className="code text-[12.5px] font-semibold text-accent">
                          {r.ref}
                        </Link>
                        <span className="block truncate text-[11.5px] text-fg-subtle">
                          {r.created_by_name ?? "—"}
                        </span>
                      </Td>
                      <Td className="text-[13px]">{r.supplier_name ?? "—"}</Td>
                      <Td className="hidden text-[12.5px] text-fg-muted lg:table-cell">{r.location_name}</Td>
                      <Td className="tabular hidden text-[12.5px] text-fg-muted xl:table-cell">
                        {r.waybill_no ?? "—"}
                        {r.lpo_no ? <span className="block">{r.lpo_no}</span> : null}
                      </Td>
                      <Td align="right" className="tabular text-[13px]">{r.line_count}</Td>

                      <Td align="center"><ReceiptStatus status={r.status} /></Td>
                      <Td align="right" className="whitespace-nowrap text-[12px] text-fg-subtle">
                        {formatDate(r.received_at)}
                        <span className="block">{relativeTime(r.received_at)}</span>
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
