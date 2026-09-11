"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, PackageCheck, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty";
import { PageLoading } from "@/components/ui/spinner";
import { TableWrap, Th, Td, Tr } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { ProductImage } from "@/components/product-image";
import { ReceiptStatus } from "@/components/status";
import { usePermission } from "@/components/session-context";
import { apiFetch } from "@/lib/client";
import { formatDate, formatDateTime, qty } from "@/lib/utils";

type Item = {
  id: string; qty_expected: number | null; qty_received: number; unit_cost: number;
  condition: string; notes: string | null;
  product_id: string; sku: string; product_name: string; unit: string; image_id: string | null;
};

type Detail = {
  receipt: {
    id: string; ref: string; status: string; waybill_no: string | null; lpo_no: string | null;
    received_at: string; notes: string | null; posted_at: string | null;
    supplier_name: string | null; location_name: string;
    created_by_name: string | null; posted_by_name: string | null;
  };
  items: Item[];
};

const CONDITION_TONE = {
  GOOD: "ok",
  SHORT: "warn",
  DAMAGED: "danger",
  WRONG_SPEC: "danger",
} as const;

export function ReceiptDetail({ id }: { id: string }) {
  const may = usePermission();
  const toast = useToast();
  const [data, setData] = React.useState<Detail | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      setData(await apiFetch<Detail>(`/api/receipts/${id}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load this receipt");
    }
  }, [id]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function post() {
    setBusy(true);
    try {
      const res = await apiFetch<{ ref: string; posted: number; skipped: number }>(
        `/api/receipts/${id}/post`,
        { method: "POST" },
      );
      toast(
        res.skipped
          ? `${res.ref} posted — ${res.posted} lines into stock, ${res.skipped} held back as damaged or wrong spec.`
          : `${res.ref} posted — ${res.posted} lines added to stock.`,
      );
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not post", "error");
    } finally {
      setBusy(false);
    }
  }

  if (error) return <EmptyState icon={TriangleAlert} title="Receipt not found" description={error} />;
  if (!data) return <PageLoading />;

  const r = data.receipt;
  const totalUnits = data.items.reduce((s, i) => s + i.qty_received, 0);
  const variances = data.items.filter(
    (i) => i.qty_expected !== null && Number(i.qty_expected) !== Number(i.qty_received),
  );

  return (
    <>
      <Link
        href="/receipts"
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-fg-muted transition-colors hover:text-fg"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Goods receipts
      </Link>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="code text-[13px] font-semibold text-accent">{r.ref}</span>
            <ReceiptStatus status={r.status} />
          </div>
          <h1 className="mt-1.5 text-[21px] leading-tight tracking-tight sm:text-[24px]">
            {r.supplier_name ?? "Delivery"}
          </h1>
          <p className="mt-1 text-[13px] text-fg-muted">
            Into {r.location_name} · {formatDate(r.received_at)}
          </p>
        </div>
        {r.status === "DRAFT" && may("receipt:post") ? (
          <Button onClick={post} loading={busy}>
            <PackageCheck className="h-4 w-4" /> Post to stock
          </Button>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_300px]">
        <div className="space-y-3">
          {variances.length ? (
            <div className="flex items-start gap-2.5 rounded-xl border border-warn/30 bg-warn-soft px-4 py-3">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
              <p className="text-[13px] text-warn">
                {variances.length} line{variances.length > 1 ? "s differ" : " differs"} from what was expected.
                Flag this with procurement before the payment request goes out.
              </p>
            </div>
          ) : null}

          <Card>
            <CardHeader title="Delivered materials" description={`${data.items.length} lines`} />
            <TableWrap>
              <thead>
                <tr>
                  <Th>Material</Th>
                  <Th align="right" className="hidden sm:table-cell">Expected</Th>
                  <Th align="right">Received</Th>

                  <Th align="center">Condition</Th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => {
                  const variance =
                    item.qty_expected !== null && Number(item.qty_expected) !== Number(item.qty_received);
                  return (
                    <Tr key={item.id}>
                      <Td>
                        <Link href={`/products/${item.product_id}`} className="flex items-center gap-3">
                          <ProductImage imageId={item.image_id} name={item.product_name} className="h-9 w-9" />
                          <span className="min-w-0">
                            <span className="block truncate text-[13.5px] font-medium">{item.product_name}</span>
                            <span className="code block truncate text-[11.5px] text-fg-subtle">{item.sku}</span>
                          </span>
                        </Link>
                      </Td>
                      <Td align="right" className="tabular hidden text-[13px] text-fg-muted sm:table-cell">
                        {item.qty_expected !== null ? qty(item.qty_expected) : "—"}
                      </Td>
                      <Td align="right">
                        <span className={`tabular text-[13.5px] font-semibold ${variance ? "text-warn" : ""}`}>
                          {qty(item.qty_received)}
                        </span>
                        <span className="ml-1 text-[11px] text-fg-subtle">{item.unit}</span>
                      </Td>

                      <Td align="center">
                        <Badge tone={CONDITION_TONE[item.condition as keyof typeof CONDITION_TONE] ?? "neutral"}>
                          {item.condition.replace("_", " ").toLowerCase()}
                        </Badge>
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
            </TableWrap>
            <div className="flex items-center justify-end border-t border-border px-4 py-3 text-[13px] sm:px-5">
              <span className="text-fg-muted">
                Total received
                <span className="tabular ml-1.5 text-[15px] font-semibold text-fg">{qty(totalUnits)}</span>
                <span className="ml-1 text-[11px] text-fg-subtle">units</span>
              </span>
            </div>
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader title="Document" />
          <CardBody>
            <dl className="space-y-2 text-[13px]">
              {[
                ["Waybill", r.waybill_no ?? "—"],
                ["LPO", r.lpo_no ?? "—"],
                ["Supplier", r.supplier_name ?? "—"],
                ["Store", r.location_name],
                ["Received", formatDate(r.received_at)],
                ["Recorded by", r.created_by_name ?? "—"],
                ["Posted by", r.posted_by_name ?? "—"],
                ["Posted at", r.posted_at ? formatDateTime(r.posted_at) : "Not posted"],
              ].map(([label, value]) => (
                <div key={label} className="flex items-baseline justify-between gap-3">
                  <dt className="shrink-0 text-fg-muted">{label}</dt>
                  <dd className="tabular truncate text-right font-medium">{value}</dd>
                </div>
              ))}
            </dl>
            {r.notes ? (
              <p className="mt-3 border-t border-border pt-3 text-[12.5px] leading-relaxed text-fg-muted">
                {r.notes}
              </p>
            ) : null}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
