"use client";

import * as React from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { ImageUpload } from "@/components/image-upload";
import { useToast } from "@/components/ui/toast";
import type { Item } from "@/components/items/use-items";
import { apiFetch } from "@/lib/client";
import { SOURCE_LABELS, type Source } from "@/lib/rbac";
import { slugToSku } from "@/lib/utils";

const UNITS = ["pcs", "sheet", "board", "m", "m²", "kg", "litre", "roll", "pack", "set", "carton"];

export function ItemForm({
  source,
  item,
  categories,
  onClose,
  onSaved,
}: {
  source: Source;
  item: Item | null;
  categories: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const editing = Boolean(item);
  const [form, setForm] = React.useState({
    sku: item?.sku ?? "",
    name: item?.name ?? "",
    category: item?.category ?? "",
    colour: item?.colour ?? "",
    spec: item?.spec ?? "",
    unit: item?.unit ?? "pcs",
    reorderLevel: item ? String(item.reorder_level) : "",
    description: item?.description ?? "",
    quantity: "",
  });
  const [imageId, setImageId] = React.useState<string | null>(item?.image_id ?? null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  // Suggest a SKU from the name until the user types their own.
  const skuTouched = React.useRef(editing);
  React.useEffect(() => {
    if (!skuTouched.current) setForm((f) => ({ ...f, sku: slugToSku(f.name) }));
  }, [form.name]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const payload = {
      sku: form.sku,
      name: form.name,
      category: form.category,
      colour: form.colour,
      spec: form.spec,
      unit: form.unit,
      reorderLevel: form.reorderLevel || 0,
      description: form.description,
      imageId,
    };
    try {
      if (item) {
        await apiFetch(`/api/items/${item.id}`, { method: "PATCH", body: JSON.stringify(payload) });
        toast(`${form.name} updated.`);
      } else {
        await apiFetch("/api/items", {
          method: "POST",
          body: JSON.stringify({ ...payload, source, quantity: form.quantity || 0 }),
        });
        toast(`${form.name} added to ${SOURCE_LABELS[source]}.`);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={editing ? `Edit ${item!.name}` : `New ${SOURCE_LABELS[source]} item`}
      description={editing ? "Change the details. Use Adjust to change the quantity." : undefined}
      footer={
        <>
          <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
          <Button form="item-form" type="submit" loading={busy}>
            {editing ? "Save changes" : "Add item"}
          </Button>
        </>
      }
    >
      <form id="item-form" onSubmit={submit} className="space-y-4">
        {error ? (
          <p className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2.5 text-[13px] text-danger">{error}</p>
        ) : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[180px_1fr]">
          <ImageUpload value={imageId} onChange={setImageId} />
          <div className="space-y-3">
            <Field label="Name">
              <Input required value={form.name} onChange={set("name")} placeholder="18mm White Melamine Board" />
            </Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="SKU">
                <Input
                  required
                  value={form.sku}
                  onChange={(e) => {
                    skuTouched.current = true;
                    set("sku")(e);
                  }}
                  placeholder="MEL-18-WHT"
                  className="code"
                />
              </Field>
              <Field label="Unit">
                <Input list="item-units" required value={form.unit} onChange={set("unit")} />
                <datalist id="item-units">
                  {UNITS.map((u) => <option key={u} value={u} />)}
                </datalist>
              </Field>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Category">
            <Input list="item-categories" value={form.category} onChange={set("category")} placeholder="Boards & Panels" />
            <datalist id="item-categories">
              {categories.map((c) => <option key={c} value={c} />)}
            </datalist>
          </Field>
          <Field label="Colour / finish">
            <Input value={form.colour} onChange={set("colour")} placeholder="White gloss" />
          </Field>
          <Field label="Specification">
            <Input value={form.spec} onChange={set("spec")} placeholder="2440 × 1220 × 18mm" />
          </Field>
          <Field label="Reorder level" hint="flag as low at or below">
            <Input
              type="number" min="0" step="any" inputMode="decimal"
              value={form.reorderLevel} onChange={set("reorderLevel")} placeholder="0" className="tabular"
            />
          </Field>
        </div>

        {!editing ? (
          <Field label="Quantity in stock now">
            <Input
              type="number" min="0" step="any" inputMode="decimal"
              value={form.quantity} onChange={set("quantity")} placeholder="0" className="tabular"
            />
          </Field>
        ) : null}

        <Field label="Description">
          <Textarea value={form.description} onChange={set("description")} placeholder="Anything the design team should know." />
        </Field>
      </form>
    </Modal>
  );
}
