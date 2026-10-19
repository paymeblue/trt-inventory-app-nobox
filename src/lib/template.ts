import * as XLSX from "xlsx";
import { hasLocations, LOCATION_LABELS, SOURCE_LABELS, type Location, type Source } from "./rbac";

/**
 * The stock upload template, on the workbook's Inventory_Master column names.
 * Every side uses the same columns, except that Nobox splits Quantity_Added
 * between its Lagos and Abuja stores. Columns are recognised by their header,
 * so their order does not matter and common spellings of a header (as in
 * "Quantity_Added (lag)" or "Dimensions (W*D*H)MM") are accepted.
 */
type Column = { key: TemplateKey; header: string; width: number; rule: string; aliases: string[] };

export type TemplateKey =
  | "sku" | "name" | "category" | "subcategory" | "spec" | "dimensions" | "unit"
  | "quantity" | "quantityLagos" | "quantityAbuja"
  | "reorderLevel" | "reorderQuantity" | "leadTimeDays" | "supplierRef" | "documentRef" | "notes";

const QUANTITY_RULE =
  "Optional, 0 or more. For a new material it is the Opening_Qty; for an existing one it is posted as a Stock Addition. To remove stock use the Stock Adjustment form.";

const ALL_COLUMNS: Column[] = [
  { key: "sku", header: "Material_Code", width: 16, aliases: ["code", "sku", "materialcode"],
    rule: "Optional. The code on the material. Several materials may share a code (one per finish or size) when their name, specification or dimensions differ. If blank, the row is matched by Material_Name, or the material gets a code made from its name." },
  { key: "name", header: "Material_Name", width: 36, aliases: ["name", "materialname"],
    rule: "Required for new materials and whenever Material_Code is blank. On an existing material, blank keeps its name." },
  { key: "category", header: "Category", width: 22, aliases: ["category"],
    rule: "Optional. e.g. WARDROBE ACCESSORIES, KITCHEN ACCESSORIES, HANDLE. Blank keeps the current value." },
  { key: "subcategory", header: "Subcategory", width: 22, aliases: ["subcategory", "subcat"],
    rule: "Optional. e.g. TROUSER HANGER, MAGIC CORNER. Blank keeps the current value." },
  { key: "spec", header: "Specification", width: 16, aliases: ["specification", "spec", "specs"],
    rule: "Optional. e.g. 18MM, 12 VOLTS. Blank keeps the current value." },
  { key: "dimensions", header: "Dimensions (W*D*H)MM", width: 20, aliases: ["dimensions", "dimension", "dimensionswdhmm", "dimensionswdh", "dimensionsmm", "size"],
    rule: "Optional. Width*Depth*Height in millimetres, e.g. 864*545*545. Blank keeps the current value." },
  { key: "unit", header: "Unit", width: 9, aliases: ["unit", "uom"],
    rule: "Optional. e.g. PCS, PACK, CARTON, SHEET, ROLL. New materials default to Unit." },
  { key: "quantity", header: "Quantity_Added", width: 15, aliases: ["quantityadded", "quantity", "qty", "qtyadded"], rule: QUANTITY_RULE },
  { key: "quantityLagos", header: "Quantity_Added (Lagos)", width: 21,
    aliases: ["quantityaddedlagos", "quantityaddedlag", "quantitylagos", "quantitylag", "qtylagos", "qtylag", "lagos", "lag"],
    rule: `${QUANTITY_RULE} Goes to the Lagos store.` },
  { key: "quantityAbuja", header: "Quantity_Added (Abuja)", width: 21,
    aliases: ["quantityaddedabuja", "quantityaddedabj", "quantityabuja", "quantityabj", "qtyabuja", "qtyabj", "abuja", "abj"],
    rule: `${QUANTITY_RULE} Goes to the Abuja store.` },
  { key: "reorderLevel", header: "Reorder_Level", width: 14, aliases: ["reorderlevel", "reorderpoint", "minlevel"],
    rule: "Optional. REORDER NOW when available is at or below this; LOW up to 1.25× it. Worked out automatically from the material's usage unless a number is given here; AUTO goes back to the automatic value. Blank keeps the current setting." },
  { key: "reorderQuantity", header: "Reorder_Quantity", width: 16, aliases: ["reorderquantity", "reorderqty"],
    rule: "Optional. How many to reorder. Worked out automatically (enough for the side's days of cover) unless a number is given here; AUTO goes back to the automatic value. Blank keeps the current setting." },
  { key: "leadTimeDays", header: "Lead_Time_Days", width: 15, aliases: ["leadtimedays", "leadtime", "leadtimeindays"],
    rule: "Optional. Days from placing an order to the stock arriving, used to work out the Reorder_Level. AUTO uses the side's default. Blank keeps the current setting." },
  { key: "supplierRef", header: "Supplier_or_Reference", width: 22, aliases: ["supplierorreference", "supplier", "supplierref", "reference"],
    rule: "Optional. Recorded on the Stock Addition." },
  { key: "documentRef", header: "Document_Ref", width: 14, aliases: ["documentref", "docref", "document", "invoice"],
    rule: "Optional. Recorded on the Stock Addition." },
  { key: "notes", header: "Notes", width: 30, aliases: ["notes", "note", "remarks", "comments"],
    rule: "Optional. Kept on the material." },
];

/** The columns of one side's template, in the order the template lays them out. */
export function templateColumns(source: Source): Column[] {
  const skip: TemplateKey[] = hasLocations(source) ? ["quantity"] : ["quantityLagos", "quantityAbuja"];
  return ALL_COLUMNS.filter((c) => !skip.includes(c.key));
}

const LOCATION_COLUMNS: Record<Location, TemplateKey> = { LAGOS: "quantityLagos", ABUJA: "quantityAbuja" };

export const TEMPLATE_SHEET = "Inventory_Master";
export const MAX_ROWS = 5000;

/** Where a row's quantity goes: one entry per location (a single null-location entry off Nobox). */
export type RowQuantity = { location: Location | null; quantity: number | null };

export type TemplateRow = {
  /** Spreadsheet row number, as the user sees it in Excel. */
  row: number;
  /** Null when the cell was left blank; the material is then matched by name. */
  sku: string | null;
  name: string | null;
  category: string | null;
  subcategory: string | null;
  spec: string | null;
  dimensions: string | null;
  unit: string | null;
  /** Null quantity means the cell was blank. */
  quantities: RowQuantity[];
  /** A number set by hand, "auto" to go back to the calculated value, or null for blank. */
  reorderLevel: number | "auto" | null;
  reorderQuantity: number | "auto" | null;
  leadTimeDays: number | "auto" | null;
  supplierRef: string | null;
  documentRef: string | null;
  notes: string | null;
};

export type TemplateError = { row: number | null; column: string | null; message: string };

/** A material as the filled-in template lists it. */
export type TemplateMaterial = {
  sku: string; name: string; category: string | null; subcategory: string | null; spec: string | null;
  dimensions: string | null; unit: string; description: string | null;
  /** Only values set by hand; calculated ones are left blank so a re-upload does not pin them. */
  reorder_level: number | null; reorder_quantity: number | null; lead_time_days: number | null;
};

const EXAMPLES: Partial<Record<TemplateKey, string | number>>[] = [
  { sku: "SV13", name: "PANT RACK", category: "WARDROBE ACCESSORIES", subcategory: "TROUSER HANGER", dimensions: "406*430*115", unit: "CARTON",
    quantity: 33, quantityLagos: 33, quantityAbuja: 10, reorderLevel: 5, reorderQuantity: 20, leadTimeDays: 21, supplierRef: "Supplier name", documentRef: "INV-0001" },
  { sku: "YXJ-0042", name: "MATT GOLD", category: "HANDLE", spec: "", dimensions: "1 METRE", unit: "PCS", quantity: 179, quantityLagos: 179, reorderLevel: "AUTO" },
  { sku: "YXJ-0042", name: "MATT GOLD", category: "HANDLE", dimensions: "25CM", unit: "PCS", quantity: 885, quantityLagos: 885, quantityAbuja: "" },
];

/**
 * The template for one side. With `materials` it comes back filled in with
 * that side's current materials (quantities left blank), ready to edit and
 * upload again.
 */
export function buildTemplate(source: Source, materials: TemplateMaterial[] = []): Buffer {
  const columns = templateColumns(source);
  const book = XLSX.utils.book_new();

  const valueOf = (m: TemplateMaterial, key: TemplateKey): string | number => {
    const v = {
      sku: m.sku, name: m.name, category: m.category, subcategory: m.subcategory, spec: m.spec, dimensions: m.dimensions,
      unit: m.unit, reorderLevel: m.reorder_level, reorderQuantity: m.reorder_quantity, leadTimeDays: m.lead_time_days,
      notes: m.description,
    }[key as string];
    return v ?? "";
  };
  const sheet = XLSX.utils.aoa_to_sheet([
    columns.map((c) => c.header),
    ...materials.map((m) => columns.map((c) => valueOf(m, c.key))),
  ]);
  sheet["!cols"] = columns.map((c) => ({ wch: c.width }));
  sheet["!autofilter"] = { ref: `A1:${XLSX.utils.encode_col(columns.length - 1)}${Math.max(1, materials.length + 1)}` };
  XLSX.utils.book_append_sheet(book, sheet, TEMPLATE_SHEET);

  const side = SOURCE_LABELS[source];
  const guide = XLSX.utils.aoa_to_sheet([
    [`TRT Nobox stock upload template · ${side}`],
    [],
    [`Fill in the ${TEMPLATE_SHEET} sheet, one row per material, and upload it with Import from Excel on the ${side} dashboard.`],
    ...(hasLocations(source)
      ? [[`${side} stock is held in Lagos and Abuja. Put each store's quantity in its own column. A row with quantities in both creates or updates the material in both stores. A new material with both blank is created in Lagos.`]]
      : []),
    ["Keep the header row. Columns are matched by name, so their order does not matter and optional columns may be left out, but unknown columns are rejected."],
    ["If any row has a problem, nothing is uploaded. Fix the rows listed and upload again."],
    ["A material should appear once per file. A repeated row with no quantity is ignored."],
    ["Product photos are added in the app after uploading: click the photo square beside a material in Inventory_Master."],
    [],
    ["Column", "Rule"],
    ...columns.map((c) => [c.header, c.rule]),
    [],
    ["Example rows (for reference only, do not paste into Inventory_Master unless you mean them)"],
    columns.map((c) => c.header),
    ...EXAMPLES.map((e) => columns.map((c) => e[c.key] ?? "")),
  ]);
  guide["!cols"] = [{ wch: 24 }, { wch: 120 }];
  XLSX.utils.book_append_sheet(book, guide, "Instructions");

  return XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export function text(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).replace(/\s+/g, " ").trim();
}

export function number(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const s = text(value).replace(/,/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const normalise = (header: string) => header.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Reads an uploaded workbook against one side's template. Returns the rows
 * that are well formed plus every problem found. `fatal` means the file itself
 * is wrong (unreadable, wrong headers, empty), so there is nothing further to check.
 */
export function parseTemplate(
  buffer: Buffer,
  source: Source,
): { rows: TemplateRow[]; errors: TemplateError[]; fatal: boolean } {
  const fatal = (message: string, row: number | null = null) => ({
    rows: [],
    errors: [{ row, column: null, message }],
    fatal: true,
  });

  let book: XLSX.WorkBook;
  try {
    book = XLSX.read(buffer, { type: "buffer" });
  } catch {
    return fatal("That file could not be read. Upload the .xlsx template.");
  }

  const sheetName = book.SheetNames.includes(TEMPLATE_SHEET) ? TEMPLATE_SHEET : book.SheetNames[0];
  if (!sheetName) return fatal("The workbook has no sheets.");

  const matrix = XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[sheetName], {
    header: 1,
    blankrows: true,
    defval: "",
    raw: true,
  });

  const side = SOURCE_LABELS[source];
  const columns = templateColumns(source);
  const expected = columns.map((c) => c.header).join(", ");
  const index = new Map<TemplateKey, number>();
  const unknown: string[] = [];
  const headers = (matrix[0] ?? []).map(text);
  for (const [i, h] of headers.entries()) {
    if (!h) continue;
    const column = ALL_COLUMNS.find((c) => c.aliases.includes(normalise(h)));
    if (!column) unknown.push(h);
    else if (index.has(column.key)) return fatal(`Row 1 has two ${column.header} columns. Keep one.`, 1);
    else index.set(column.key, i);
  }
  if (unknown.length) {
    return fatal(`Row 1 of "${sheetName}" has columns the template does not: ${unknown.join(", ")}. The ${side} template's columns are: ${expected}. Download a fresh template.`, 1);
  }
  if (!index.has("sku") || !index.has("name")) {
    return fatal(`Row 1 of "${sheetName}" needs Material_Code and Material_Name columns. The ${side} template's columns are: ${expected}.`, 1);
  }
  if (hasLocations(source) && index.has("quantity")) {
    return fatal(`${side} stock is split between Lagos and Abuja. Replace Quantity_Added with Quantity_Added (Lagos) and Quantity_Added (Abuja). Download a fresh ${side} template.`, 1);
  }
  if (!hasLocations(source) && (index.has("quantityLagos") || index.has("quantityAbuja"))) {
    return fatal(`Only Nobox stock is split between Lagos and Abuja. Use a single Quantity_Added column for ${side}. Download a fresh ${side} template.`, 1);
  }

  const rows: TemplateRow[] = [];
  const errors: TemplateError[] = [];
  let dataRows = 0;

  for (let i = 1; i < matrix.length; i += 1) {
    const cells = matrix[i] ?? [];
    if (cells.every((c) => text(c) === "")) continue;
    const rowNo = i + 1;
    if (++dataRows > MAX_ROWS) {
      errors.push({ row: rowNo, column: null, message: `Uploads are limited to ${MAX_ROWS} rows.` });
      break;
    }
    const errorsBefore = errors.length;

    const cell = (key: TemplateKey) => (index.has(key) ? cells[index.get(key)!] : "");
    const header = (key: TemplateKey) => ALL_COLUMNS.find((c) => c.key === key)!.header;
    const fail = (key: TemplateKey | null, message: string) =>
      errors.push({ row: rowNo, column: key ? header(key) : null, message });
    const optionalNumber = (key: TemplateKey) => {
      const raw = text(cell(key));
      if (!raw) return null;
      const n = number(cell(key));
      if (n === null || n < 0) {
        fail(key, `"${raw}" is not a number of 0 or more.`);
        return null;
      }
      return n;
    };

    const sku = text(cell("sku")).toUpperCase();
    const name = text(cell("name"));
    if (!sku && !name) fail("sku", "Give a Material_Code or a Material_Name, so the row can be matched to a material.");
    else if (sku.length > 100) fail("sku", "Material_Code must be 100 characters or fewer.");

    const quantities: RowQuantity[] = hasLocations(source)
      ? (Object.keys(LOCATION_COLUMNS) as Location[]).map((location) => ({ location, quantity: optionalNumber(LOCATION_COLUMNS[location]) }))
      : [{ location: null, quantity: optionalNumber("quantity") }];
    const orAuto = (key: TemplateKey) => (text(cell(key)).toLowerCase() === "auto" ? "auto" : optionalNumber(key));
    const reorderLevel = orAuto("reorderLevel");
    const reorderQuantity = orAuto("reorderQuantity");
    const leadTimeDays = orAuto("leadTimeDays");
    if (leadTimeDays === 0) fail("leadTimeDays", "Lead_Time_Days must be more than 0, or AUTO for the side's default.");

    if (errors.length > errorsBefore) continue;
    const opt = (k: TemplateKey) => text(cell(k)) || null;
    rows.push({
      row: rowNo,
      sku: sku || null,
      name: name || null,
      category: opt("category"),
      subcategory: opt("subcategory"),
      spec: opt("spec"),
      dimensions: opt("dimensions"),
      unit: opt("unit"),
      quantities,
      reorderLevel,
      reorderQuantity,
      leadTimeDays,
      supplierRef: opt("supplierRef"),
      documentRef: opt("documentRef"),
      notes: opt("notes"),
    });
  }

  if (!dataRows) return fatal(`The "${sheetName}" sheet has headers but no rows.`);
  return { rows, errors, fatal: false };
}

/** "Lagos" / "Abuja" / "" for a location, for messages. */
export function placeLabel(location: Location | null): string {
  return location ? LOCATION_LABELS[location] : "";
}
