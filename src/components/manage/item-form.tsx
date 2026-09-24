"use client";

import * as React from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { ImageUpload } from "@/components/image-upload";
import { useToast } from "@/components/ui/toast";
import type { Item } from "@/components/items/use-items";
import { apiFetch } from "@/lib/client";
import { SOURCE_LABELS, type Source } from "@/lib/rbac";
import { slugToSku } from "@/lib/utils";

const UNITS = ["Sheet", "Pcs", "Unit", "Slab", "m", "kg", "litre", "roll", "pack", "set"];

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
    subcategory: item?.subcategory ?? "",
    spec: item?.spec ?? "",
    dimensions: item?.dimensions ?? "",
    unit: item?.unit ?? "Unit",
    reorderLevel: item ? String(item.reorder_level) : "",
    reorderQuantity: item ? String(item.reorder_quantity) : "",
    description: item?.description ?? "",
    quantity: "0",
  });
  const NEW = "__new";
  const [newCategory, setNewCategory] = React.useState("");
  const [imageId, setImageId] = React.useState<string | null>(item?.image_id ?? null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
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
      category: form.category === NEW ? newCategory : form.category,
      subcategory: form.subcategory,
      spec: form.spec,
      dimensions: form.dimensions,
      reorderQuantity: form.reorderQuantity || 0,
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
      title={editing ? `Edit ${item!.sku}` : `New ${SOURCE_LABELS[source]} material`}
      description={editing ? "Change the details. Quantities change only through Stock Addition, Issue and Adjustment." : undefined}
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
            <Field label="Material Name">
              <Input required value={form.name} onChange={set("name")} placeholder="LISSA OAK 18MM" />
            </Field>
            <Field label="Material Code">
              <Input
                required
                value={form.sku}
                onChange={(e) => {
                  skuTouched.current = true;
                  set("sku")(e);
                }}
                placeholder="FINSA 116"
                className="code"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              {!editing ? (
                <Field label="Opening Qty">
                  <Input
                    type="number" min="0" step="any" inputMode="decimal" required
                    value={form.quantity} onChange={set("quantity")} onFocus={(e) => e.target.select()}
                    className="tabular font-semibold"
                  />
                </Field>
              ) : null}
              <Field label="Unit" className={editing ? "col-span-2" : undefined}>
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
            <Select value={form.category} onChange={set("category")}>
              <option value="">No category</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              {form.category && form.category !== NEW && !categories.includes(form.category) ? (
                <option value={form.category}>{form.category}</option>
              ) : null}
              <option value={NEW}>+ New category…</option>
            </Select>
            {form.category === NEW ? (
              <Input
                autoFocus required className="mt-2" maxLength={60}
                value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="New category name"
              />
            ) : null}
          </Field>
          <Field label="Subcategory">
            <Input value={form.subcategory} onChange={set("subcategory")} placeholder="FINSA (MEASURED IN SHEETS)" />
          </Field>
          <Field label="Specification">
            <Input value={form.spec} onChange={set("spec")} placeholder="18MM" />
          </Field>
          <Field label="Dimensions">
            <Input value={form.dimensions} onChange={set("dimensions")} placeholder="60 X 60" />
          </Field>
          <Field label="Reorder Quantity" hint="suggested order">
            <Input type="number" min="0" step="any" inputMode="decimal" value={form.reorderQuantity} onChange={set("reorderQuantity")} placeholder="0" className="tabular" />
          </Field>
          <Field label="Reorder Level" hint="REORDER NOW at or below">
            <Input
              type="number" min="0" step="any" inputMode="decimal"
              value={form.reorderLevel} onChange={set("reorderLevel")} placeholder="0" className="tabular"
            />
          </Field>
        </div>

        <Field label="Description">
          <Textarea value={form.description} onChange={set("description")} placeholder="Anything the design team should know." />
        </Field>
      </form>
    </Modal>
  );
}
