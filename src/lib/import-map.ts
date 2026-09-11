/** Column aliases seen across the TRT stock sheets and typical supplier lists. */
export const FIELD_ALIASES: Record<string, string[]> = {
  sku: ["sku", "code", "material code", "item code", "product code", "part no", "part number", "ref", "reference", "material id", "stock code"],
  name: ["name", "material", "material name", "item", "item name", "product", "product name", "particulars", "material description", "item description"],
  description: ["description", "details", "remark", "remarks", "note", "notes", "comment"],
  category: ["category", "class", "classification", "type", "group", "material type", "material category"],
  unit: ["unit", "uom", "u/m", "unit of measure", "measure", "units"],
  unitCost: ["unit cost", "cost", "price", "unit price", "rate", "amount", "unit rate", "cost price", "value"],
  quantity: ["quantity", "qty", "opening", "opening balance", "opening stock", "stock", "balance", "on hand", "qty on hand", "closing balance", "current stock", "available", "stock balance"],
  reorderLevel: ["reorder", "reorder level", "re-order level", "min", "minimum", "min level", "minimum level", "threshold", "restock level", "minimum stock"],
  supplier: ["supplier", "vendor", "supplier name", "vendor name", "source"],
  colour: ["colour", "color", "shade", "finish"],
  spec: ["spec", "specification", "size", "dimension", "dimensions", "thickness", "specs"],
  shelfRef: ["shelf", "shelf ref", "shelf location", "bin", "rack", "column", "shelf column", "position", "aisle"],
};

export const FIELD_LABELS: Record<string, string> = {
  sku: "SKU / material code",
  name: "Material name",
  description: "Description",
  category: "Category",
  unit: "Unit of measure",
  unitCost: "Unit cost",
  quantity: "Opening quantity",
  reorderLevel: "Reorder level",
  supplier: "Supplier",
  colour: "Colour",
  spec: "Specification",
  shelfRef: "Shelf reference",
};

export const IMPORT_FIELDS = Object.keys(FIELD_ALIASES);

function normalise(header: string) {
  return header.toLowerCase().replace(/[^a-z0-9/ ]+/g, " ").replace(/\s+/g, " ").trim();
}

/** Best-effort header -> field guess. Exact alias wins over a substring match. */
export function guessMapping(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  const taken = new Set<string>();

  for (const pass of ["exact", "loose"] as const) {
    for (const header of headers) {
      if (mapping[header]) continue;
      const norm = normalise(header);
      if (!norm) continue;

      for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
        if (taken.has(field)) continue;
        const hit =
          pass === "exact"
            ? aliases.includes(norm)
            : aliases.some((a) => norm.includes(a) || a.includes(norm));
        if (hit) {
          mapping[header] = field;
          taken.add(field);
          break;
        }
      }
    }
  }
  return mapping;
}

export function toNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value !== "string") return 0;
  const cleaned = value.replace(/[^0-9.\-]/g, "");
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

export function toText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}
