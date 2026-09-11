"use client";

import * as React from "react";
import { Modal } from "./ui/modal";
import { Button } from "./ui/button";
import { Field, Input, Select, Textarea } from "./ui/field";
import { useToast } from "./ui/toast";
import { ProductPicker, type PickedProduct } from "./product-picker";
import { ProductImage } from "./product-image";
import { useLookups } from "@/lib/lookups";
import { apiFetch } from "@/lib/client";
import { qty } from "@/lib/utils";

const TYPES = [
  { value: "RECEIPT", label: "Receipt — stock coming in", inbound: true },
  { value: "ISSUE", label: "Issue — stock going out", inbound: false },
  { value: "RETURN", label: "Return — unused stock coming back", inbound: true },
  { value: "WASTE", label: "Waste — damaged or scrapped", inbound: false },
  { value: "ADJUSTMENT", label: "Adjustment — correct a count", inbound: true },
] as const;

export function StockAdjustModal({
  product,
  onClose,
  onDone,
}: {
  product?: { id: string; name: string; sku: string; unit: string; image_id: string | null } | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const { locations, projects } = useLookups();

  const [picked, setPicked] = React.useState<PickedProduct | null>(
    product ? { ...product, unit_cost: 0, on_hand: 0 } : null,
  );
  const [type, setType] = React.useState<string>("RECEIPT");
  const [locationId, setLocationId] = React.useState("");
  const [quantity, setQuantity] = React.useState("");
  const [reference, setReference] = React.useState("");
  const [projectId, setProjectId] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (locationId || !locations.length) return;
    setLocationId((locations.find((l) => l.kind === "WAREHOUSE") ?? locations[0]).id);
  }, [locations, locationId]);

  const isAdjustment = type === "ADJUSTMENT";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!picked) {
      setError("Choose a material first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/api/stock/adjust", {
        method: "POST",
        body: JSON.stringify({
          productId: picked.id,
          locationId,
          type,
          quantity: Number(quantity),
          reference: reference.trim() || null,
          projectId: projectId || null,
          notes: notes.trim() || null,
        }),
      });
      toast(`${type.toLowerCase()} posted for ${picked.name}.`);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not post the movement");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Record a stock movement"
      description="Every movement is written to the ledger with your name against it."
      footer={
        <>
          <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
          <Button form="adjust-form" type="submit" loading={busy}>Post movement</Button>
        </>
      }
    >
      <form id="adjust-form" onSubmit={submit} className="space-y-4">
        {error ? (
          <p className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2.5 text-[13px] text-danger">
            {error}
          </p>
        ) : null}

        <Field label="Material">
          {picked ? (
            <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-2 p-2.5">
              <ProductImage imageId={picked.image_id} name={picked.name} className="h-10 w-10" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-medium">{picked.name}</p>
                <p className="code truncate text-[11.5px] text-fg-subtle">{picked.sku}</p>
              </div>
              {!product ? (
                <button
                  type="button"
                  onClick={() => setPicked(null)}
                  className="shrink-0 text-[12px] font-medium text-accent hover:underline"
                >
                  Change
                </button>
              ) : null}
            </div>
          ) : (
            <ProductPicker onPick={setPicked} locationId={locationId} autoFocus />
          )}
        </Field>

        <Field label="Movement type">
          <Select value={type} onChange={(e) => setType(e.target.value)}>
            {TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </Select>
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Location">
            <Select value={locationId} onChange={(e) => setLocationId(e.target.value)} required>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </Select>
          </Field>
          <Field
            label="Quantity"
            hint={picked ? picked.unit : undefined}
            error={isAdjustment ? null : undefined}
          >
            <Input
              type="number"
              step="0.001"
              inputMode="decimal"
              required
              min={isAdjustment ? undefined : 0.001}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder={isAdjustment ? "e.g. -4 to reduce" : "0"}
              className="tabular"
            />
          </Field>
        </div>

        {isAdjustment ? (
          <p className="-mt-1 text-[12px] leading-relaxed text-fg-subtle">
            Use a negative number to reduce the balance after a physical count, and a positive number
            to increase it. {picked ? `Current: ${qty(picked.on_hand)} ${picked.unit}.` : ""}
          </p>
        ) : null}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Reference" hint="waybill, MIV, count sheet">
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

        <Field label="Notes">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional context for the audit trail." />
        </Field>
      </form>
    </Modal>
  );
}
