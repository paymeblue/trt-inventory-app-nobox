"use client";

import * as React from "react";
import { Trash2, ArrowRight } from "lucide-react";
import { Modal } from "./ui/modal";
import { Button } from "./ui/button";
import { Field, Input, Select } from "./ui/field";
import { useToast } from "./ui/toast";
import { ProductPicker, type PickedProduct } from "./product-picker";
import { ProductImage } from "./product-image";
import { useLookups } from "@/lib/lookups";
import { apiFetch } from "@/lib/client";
import { qty } from "@/lib/utils";

type Line = { product: PickedProduct; quantity: string };

export function StockTransferModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const { locations, projects } = useLookups();

  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [lines, setLines] = React.useState<Line[]>([]);
  const [reference, setReference] = React.useState("");
  const [projectId, setProjectId] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!locations.length) return;
    const store = locations.find((l) => l.kind === "WAREHOUSE") ?? locations[0];
    if (!from) setFrom(store.id);
    if (!to) {
      const other = locations.find((l) => l.id !== store.id);
      if (other) setTo(other.id);
    }
  }, [locations, from, to]);

  function addLine(product: PickedProduct) {
    setLines((prev) => (prev.some((l) => l.product.id === product.id) ? prev : [...prev, { product, quantity: "" }]));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/api/stock/transfer", {
        method: "POST",
        body: JSON.stringify({
          fromLocationId: from,
          toLocationId: to,
          reference: reference.trim() || null,
          projectId: projectId || null,
          lines: lines.map((l) => ({ productId: l.product.id, quantity: Number(l.quantity) })),
        }),
      });
      toast(`${lines.length} material${lines.length > 1 ? "s" : ""} transferred.`);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Transfer failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="Transfer stock"
      description="Move materials between the warehouse, factory and a site."
      footer={
        <>
          <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
          <Button form="transfer-form" type="submit" loading={busy} disabled={!lines.length}>
            Transfer {lines.length ? `${lines.length} line${lines.length > 1 ? "s" : ""}` : ""}
          </Button>
        </>
      }
    >
      <form id="transfer-form" onSubmit={submit} className="space-y-4">
        {error ? (
          <p className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2.5 text-[13px] text-danger">
            {error}
          </p>
        ) : null}

        <div className="grid items-end gap-3 sm:grid-cols-[1fr_auto_1fr]">
          <Field label="From">
            <Select value={from} onChange={(e) => setFrom(e.target.value)} required>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </Select>
          </Field>
          <ArrowRight className="mx-auto mb-3 hidden h-4 w-4 text-fg-subtle sm:block" />
          <Field label="To">
            <Select value={to} onChange={(e) => setTo(e.target.value)} required>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Add materials">
          <ProductPicker onPick={addLine} locationId={from} exclude={lines.map((l) => l.product.id)} />
        </Field>

        {lines.length ? (
          <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
            {lines.map((line, i) => (
              <div key={line.product.id} className="flex items-center gap-3 p-2.5">
                <ProductImage imageId={line.product.image_id} name={line.product.name} className="h-9 w-9" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium">{line.product.name}</p>
                  <p className="tabular truncate text-[11px] text-fg-subtle">
                    {qty(line.product.on_hand)} {line.product.unit} available
                  </p>
                </div>
                <Input
                  type="number" step="0.001" min="0.001" required inputMode="decimal"
                  value={line.quantity}
                  onChange={(e) =>
                    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, quantity: e.target.value } : l)))
                  }
                  placeholder="Qty"
                  className="tabular h-9 w-24 shrink-0 text-right"
                />
                <button
                  type="button"
                  onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== i))}
                  className="shrink-0 rounded-lg p-1.5 text-fg-subtle transition-colors hover:bg-danger-soft hover:text-danger"
                  aria-label="Remove line"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-[13px] text-fg-subtle">
            Search above to add the materials you are moving.
          </p>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Reference" hint="waybill / note">
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Optional" />
          </Field>
          <Field label="Project">
            <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">Not project-related</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
              ))}
            </Select>
          </Field>
        </div>
      </form>
    </Modal>
  );
}
