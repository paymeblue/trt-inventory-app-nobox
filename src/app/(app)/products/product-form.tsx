"use client";

import * as React from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { ImageUpload } from "@/components/image-upload";
import { useToast } from "@/components/ui/toast";
import { useLookups, invalidateLookups } from "@/lib/lookups";
import { apiFetch } from "@/lib/client";
import { slugToSku } from "@/lib/utils";
import type { ProductRow } from "./view";

const UNITS = ["pcs", "sheet", "board", "m", "m²", "m³", "kg", "litre", "roll", "pack", "set", "carton", "bundle"];

export function ProductForm({
  product,
  onClose,
  onSaved,
}: {
  product: ProductRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const { categories, suppliers, locations } = useLookups();
  const editing = Boolean(product);

  const [form, setForm] = React.useState({
    sku: product?.sku ?? "",
    name: product?.name ?? "",
    description: product?.description ?? "",
    categoryId: product?.category_id ?? "",
    supplierId: product?.supplier_id ?? "",
    unit: product?.unit ?? "pcs",
    unitCost: String(product?.unit_cost ?? ""),
    reorderLevel: String(product?.reorder_level ?? ""),
    colour: product?.colour ?? "",
    spec: product?.spec ?? "",
    shelfRef: product?.shelf_ref ?? "",
    openingQty: "",
    openingLocationId: "",
  });
  const [imageId, setImageId] = React.useState<string | null>(product?.image_id ?? null);
  const [newCategory, setNewCategory] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const set = (key: keyof typeof form) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) => setForm((f) => ({ ...f, [key]: e.target.value }));

  // Suggest a SKU from the name until the user types their own.
  const skuTouched = React.useRef(editing);
  React.useEffect(() => {
    if (skuTouched.current) return;
    setForm((f) => ({ ...f, sku: slugToSku(f.name) }));
  }, [form.name]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      let categoryId = form.categoryId;
      if (categoryId === "__new" && newCategory.trim()) {
        const cat = await apiFetch<{ id: string }>("/api/categories", {
          method: "POST",
          body: JSON.stringify({ name: newCategory.trim() }),
        });
        categoryId = cat.id;
        invalidateLookups();
      } else if (categoryId === "__new") {
        categoryId = "";
      }

      const payload = {
        sku: form.sku.trim(),
        name: form.name.trim(),
        description: form.description.trim() || null,
        categoryId: categoryId || null,
        supplierId: form.supplierId || null,
        unit: form.unit,
        unitCost: Number(form.unitCost || 0),
        reorderLevel: Number(form.reorderLevel || 0),
        imageId,
        colour: form.colour.trim() || null,
        spec: form.spec.trim() || null,
        shelfRef: form.shelfRef.trim() || null,
        ...(editing
          ? {}
          : {
              openingQty: Number(form.openingQty || 0),
              openingLocationId: form.openingLocationId || null,
            }),
      };

      if (editing) {
        await apiFetch(`/api/products/${product!.id}`, { method: "PATCH", body: JSON.stringify(payload) });
        toast(`${payload.name} updated.`);
      } else {
        await apiFetch("/api/products", { method: "POST", body: JSON.stringify(payload) });
        toast(`${payload.name} added to the catalogue.`);
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
      title={editing ? "Edit material" : "New material"}
      description={
        editing
          ? "Update the catalogue record. Stock levels are changed through movements."
          : "Register a material so it becomes visible to design, production and procurement."
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose} type="button">Cancel</Button>
          <Button form="product-form" type="submit" loading={busy}>
            {editing ? "Save changes" : "Create material"}
          </Button>
        </>
      }
    >
      <form id="product-form" onSubmit={submit} className="space-y-4">
        {error ? (
          <p className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2.5 text-[13px] text-danger">
            {error}
          </p>
        ) : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[180px_1fr]">
          <div>
            <ImageUpload value={imageId} onChange={setImageId} />
          </div>

          <div className="space-y-3">
            <Field label="Material name">
              <Input
                required
                value={form.name}
                onChange={set("name")}
                placeholder="18mm White Melamine Board"
              />
            </Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="SKU / code">
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
              <Field label="Unit of measure">
                <Select value={form.unit} onChange={set("unit")}>
                  {UNITS.map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </Select>
              </Field>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Category">
            <Select value={form.categoryId} onChange={set("categoryId")}>
              <option value="">No category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
              <option value="__new">+ New category…</option>
            </Select>
          </Field>
          <Field label="Supplier">
            <Select value={form.supplierId} onChange={set("supplierId")}>
              <option value="">No supplier</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
          </Field>
        </div>

        {form.categoryId === "__new" ? (
          <Field label="New category name">
            <Input
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              placeholder="Boards, Edge tapes, Accessories…"
              autoFocus
            />
          </Field>
        ) : null}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Unit cost" hint="₦">
            <Input
              type="number" step="0.01" min="0" inputMode="decimal"
              value={form.unitCost} onChange={set("unitCost")}
              placeholder="0.00" className="tabular"
            />
          </Field>
          <Field label="Reorder level" hint="alert below">
            <Input
              type="number" step="0.001" min="0" inputMode="decimal"
              value={form.reorderLevel} onChange={set("reorderLevel")}
              placeholder="0" className="tabular"
            />
          </Field>
          <Field label="Shelf reference">
            <Input value={form.shelfRef} onChange={set("shelfRef")} placeholder="A-03" />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Colour / finish">
            <Input value={form.colour} onChange={set("colour")} placeholder="White gloss" />
          </Field>
          <Field label="Specification">
            <Input value={form.spec} onChange={set("spec")} placeholder="2440 × 1220 × 18mm" />
          </Field>
        </div>

        <Field label="Description">
          <Textarea
            value={form.description}
            onChange={set("description")}
            placeholder="Anything the design or production team should know."
          />
        </Field>

        {!editing ? (
          <div className="rounded-xl border border-border bg-surface-2/50 p-3.5">
            <p className="mb-3 text-[13px] font-medium">Opening stock <span className="font-normal text-fg-subtle">(optional)</span></p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Quantity on hand">
                <Input
                  type="number" step="0.001" min="0" inputMode="decimal"
                  value={form.openingQty} onChange={set("openingQty")}
                  placeholder="0" className="tabular"
                />
              </Field>
              <Field label="Held at">
                <Select value={form.openingLocationId} onChange={set("openingLocationId")}>
                  <option value="">Choose a location</option>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </Select>
              </Field>
            </div>
          </div>
        ) : null}
      </form>
    </Modal>
  );
}
