"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Trash2, AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { ProductPicker, type PickedProduct } from "@/components/product-picker";
import { ProductImage } from "@/components/product-image";
import { useLookups } from "@/lib/lookups";
import { apiFetch } from "@/lib/client";
import { qty } from "@/lib/utils";

type Line = {
  product: PickedProduct;
  qtyExpected: string;
  qtyReceived: string;
  unitCost: string;
  condition: string;
};

const CONDITIONS = [
  { value: "GOOD", label: "Good" },
  { value: "SHORT", label: "Short delivery" },
  { value: "DAMAGED", label: "Damaged" },
  { value: "WRONG_SPEC", label: "Wrong spec" },
];

export function NewReceiptView() {
  const router = useRouter();
  const toast = useToast();
  const { locations, suppliers } = useLookups();

  const [supplierId, setSupplierId] = React.useState("");
  const [locationId, setLocationId] = React.useState("");
  const [waybillNo, setWaybill] = React.useState("");
  const [lpoNo, setLpo] = React.useState("");
  const [receivedAt, setReceivedAt] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = React.useState("");
  const [lines, setLines] = React.useState<Line[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!locationId && locations.length) {
      setLocationId((locations.find((l) => l.kind === "WAREHOUSE") ?? locations[0]).id);
    }
  }, [locations, locationId]);

  function addLine(product: PickedProduct) {
    setLines((prev) =>
      prev.some((l) => l.product.id === product.id)
        ? prev
        : [
            ...prev,
            {
              product,
              qtyExpected: "",
              qtyReceived: "",
              unitCost: product.unit_cost ? String(product.unit_cost) : "",
              condition: "GOOD",
            },
          ],
    );
  }

  const totalUnits = lines.reduce((sum, l) => sum + (Number(l.qtyReceived) || 0), 0);
  const rejected = lines.filter((l) => l.condition === "DAMAGED" || l.condition === "WRONG_SPEC").length;

  async function save(postNow: boolean) {
    setBusy(true);
    setError(null);
    try {
      const data = await apiFetch<{ id: string; ref: string }>("/api/receipts", {
        method: "POST",
        body: JSON.stringify({
          supplierId: supplierId || null,
          locationId,
          waybillNo: waybillNo.trim() || null,
          lpoNo: lpoNo.trim() || null,
          receivedAt: receivedAt || null,
          notes: notes.trim() || null,
          lines: lines.map((l) => ({
            productId: l.product.id,
            qtyExpected: l.qtyExpected ? Number(l.qtyExpected) : null,
            qtyReceived: Number(l.qtyReceived),
            unitCost: Number(l.unitCost) || 0,
            condition: l.condition,
          })),
        }),
      });

      if (postNow) {
        await apiFetch(`/api/receipts/${data.id}/post`, { method: "POST" });
        toast(`${data.ref} posted — stock is now in the store.`);
      } else {
        toast(`${data.ref} saved as a draft.`);
      }
      router.push(`/receipts/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the receipt");
      setBusy(false);
    }
  }

  const valid = locationId && lines.length > 0 && lines.every((l) => Number(l.qtyReceived) > 0);

  return (
    <>
      <Link
        href="/receipts"
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-fg-muted transition-colors hover:text-fg"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Goods receipts
      </Link>

      <PageHeader
        title="Record a delivery"
        description="Verify quantity, quality and specification before the stock is posted."
      />

      {error ? (
        <div className="mb-3 flex items-start gap-2.5 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
          <p className="text-[13px] text-danger">{error}</p>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_320px]">
        <div className="space-y-3">
          <Card>
            <CardHeader title="Delivery details" />
            <CardBody className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Supplier">
                  <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                    <option value="">Not recorded</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Received into">
                  <Select value={locationId} onChange={(e) => setLocationId(e.target.value)} required>
                    {locations.map((l) => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </Select>
                </Field>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Field label="Waybill number">
                  <Input value={waybillNo} onChange={(e) => setWaybill(e.target.value)} placeholder="WB-00123" />
                </Field>
                <Field label="LPO number">
                  <Input value={lpoNo} onChange={(e) => setLpo(e.target.value)} placeholder="LPO-2026-045" />
                </Field>
                <Field label="Received on">
                  <Input type="date" value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)} />
                </Field>
              </div>
              <Field label="Notes">
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Inspection findings, discrepancies reported to procurement…"
                />
              </Field>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Delivered materials" description={`${lines.length} line${lines.length === 1 ? "" : "s"}`} />
            <CardBody className="space-y-3">
              <ProductPicker
                onPick={addLine}
                locationId={locationId}
                exclude={lines.map((l) => l.product.id)}
                placeholder="Search the material that was delivered…"
              />

              {lines.length ? (
                <div className="space-y-2">
                  {lines.map((line, i) => {
                    const update = (patch: Partial<Line>) =>
                      setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
                    const flagged = line.condition === "DAMAGED" || line.condition === "WRONG_SPEC";
                    return (
                      <div key={line.product.id} className="rounded-xl border border-border p-3">
                        <div className="flex items-center gap-3">
                          <ProductImage imageId={line.product.image_id} name={line.product.name} className="h-10 w-10" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13.5px] font-medium">{line.product.name}</p>
                            <p className="tabular truncate text-[11.5px] text-fg-subtle">
                              {line.product.sku} · per {line.product.unit}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== i))}
                            className="shrink-0 rounded-lg p-1.5 text-fg-subtle transition-colors hover:bg-danger-soft hover:text-danger"
                            aria-label="Remove line"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>

                        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                          <Field label="Expected">
                            <Input
                              type="number" step="0.001" min="0" inputMode="decimal"
                              value={line.qtyExpected}
                              onChange={(e) => update({ qtyExpected: e.target.value })}
                              placeholder="—"
                              className="tabular h-9"
                            />
                          </Field>
                          <Field label="Received">
                            <Input
                              type="number" step="0.001" min="0.001" required inputMode="decimal"
                              value={line.qtyReceived}
                              onChange={(e) => update({ qtyReceived: e.target.value })}
                              placeholder="0"
                              className="tabular h-9"
                            />
                          </Field>
                          <Field label="Condition">
                            <Select
                              value={line.condition}
                              onChange={(e) => update({ condition: e.target.value })}
                              className="h-9"
                            >
                              {CONDITIONS.map((c) => (
                                <option key={c.value} value={c.value}>{c.label}</option>
                              ))}
                            </Select>
                          </Field>
                        </div>

                        {flagged ? (
                          <p className="mt-2 flex items-center gap-1.5 text-[12px] text-warn">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            Recorded for the discrepancy report — this line will not be added to stock.
                          </p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-[13px] text-fg-subtle">
                  Search above to add what was delivered.
                </p>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="lg:sticky lg:top-[72px] lg:h-fit">
          <Card>
            <CardHeader title="Summary" />
            <CardBody className="space-y-3">
              <div className="space-y-2 text-[13px]">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-fg-muted">Lines</span>
                  <span className="tabular font-medium">{lines.length}</span>
                </div>
                {rejected ? (
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-warn">Not stockable</span>
                    <span className="tabular font-medium text-warn">{rejected}</span>
                  </div>
                ) : null}
                <div className="flex items-baseline justify-between gap-3 border-t border-border pt-2">
                  <span className="text-fg-muted">Units received</span>
                  <span className="tabular text-[15px] font-semibold">{qty(totalUnits)}</span>
                </div>
              </div>

              <div className="space-y-2 pt-1">
                <Button className="w-full" onClick={() => save(true)} loading={busy} disabled={!valid}>
                  Post to stock
                </Button>
                <Button variant="secondary" className="w-full" onClick={() => save(false)} disabled={busy || !valid}>
                  Save as draft
                </Button>
              </div>

              <p className="text-[12px] leading-relaxed text-fg-subtle">
                Posting writes a receipt movement for every good line. Damaged and wrong-spec lines are
                kept on the record but never added to stock.
              </p>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
