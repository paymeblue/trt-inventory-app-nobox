import * as XLSX from "xlsx";

/**
 * The stock upload template, on the workbook's Inventory_Master column names.
 * Factory and Nobox use the same one. An upload is only accepted when its first
 * row is exactly these headers, in this order.
 */
export const TEMPLATE_COLUMNS = [
  { key: "sku", header: "Material_Code", width: 16, rule: "Optional. Matches an existing material, or creates one with this code. If blank, the row matches an existing material by Material_Name, or creates one with a code made from its name." },
  { key: "name", header: "Material_Name", width: 36, rule: "Required for new materials and whenever Material_Code is blank. Otherwise blank keeps the existing name." },
  { key: "category", header: "Category", width: 20, rule: "Optional. e.g. BOARDS, EDGE TAPES (PVC), HANDLES. Blank keeps the current value." },
  { key: "subcategory", header: "Subcategory", width: 26, rule: "Optional. e.g. FINSA (MEASURED IN SHEETS). Blank keeps the current value." },
  { key: "spec", header: "Specification", width: 16, rule: "Optional. e.g. 18MM. Blank keeps the current value." },
  { key: "dimensions", header: "Dimensions", width: 14, rule: "Optional. e.g. 60 X 60. Blank keeps the current value." },
  { key: "unit", header: "Unit", width: 8, rule: "Optional. Sheet, Pcs, Unit, Slab. New materials default to Unit." },
  { key: "quantity", header: "Quantity_Added", width: 15, rule: "Optional, 0 or more. For a new material it is the Opening_Qty; for an existing one it is posted as a Stock Addition. To remove stock use the Stock Adjustment form." },
  { key: "reorderLevel", header: "Reorder_Level", width: 14, rule: "Optional. REORDER NOW when available is at or below this; LOW up to 1.25× it." },
  { key: "reorderQuantity", header: "Reorder_Quantity", width: 16, rule: "Optional. How many to reorder." },
  { key: "supplierRef", header: "Supplier_or_Reference", width: 22, rule: "Optional. Recorded on the Stock Addition." },
  { key: "documentRef", header: "Document_Ref", width: 14, rule: "Optional. Recorded on the Stock Addition." },
  { key: "notes", header: "Notes", width: 30, rule: "Optional. Kept on the material." },
] as const;

export type TemplateKey = (typeof TEMPLATE_COLUMNS)[number]["key"];

export const TEMPLATE_SHEET = "Inventory_Master";
export const MAX_ROWS = 5000;

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
  quantity: number;
  reorderLevel: number | null;
  reorderQuantity: number | null;
  supplierRef: string | null;
  documentRef: string | null;
  notes: string | null;
};

export type TemplateError = { row: number | null; column: string | null; message: string };

export function buildTemplate(): Buffer {
  const book = XLSX.utils.book_new();

  const items = XLSX.utils.aoa_to_sheet([TEMPLATE_COLUMNS.map((c) => c.header)]);
  items["!cols"] = TEMPLATE_COLUMNS.map((c) => ({ wch: c.width }));
  items["!autofilter"] = { ref: `A1:${XLSX.utils.encode_col(TEMPLATE_COLUMNS.length - 1)}1` };
  XLSX.utils.book_append_sheet(book, items, TEMPLATE_SHEET);

  const guide = XLSX.utils.aoa_to_sheet([
    ["TRT Nobox stock upload template"],
    [],
    ["Fill in the Inventory_Master sheet, one row per material, and upload it from the Factory or Nobox dashboard."],
    ["Do not rename, reorder, add or remove columns. A file whose headers differ is rejected."],
    ["If any row has a problem, nothing is uploaded. Fix the rows listed and upload again."],
    ["Each Material_Code (or, for rows without one, each Material_Name) may appear only once per file."],
    [],
    ["Column", "Rule"],
    ...TEMPLATE_COLUMNS.map((c) => [c.header, c.rule]),
    [],
    ["Example rows (for reference only, do not paste into Inventory_Master unless you mean them)"],
    TEMPLATE_COLUMNS.map((c) => c.header),
    ["FINSA 116", "LISSA OAK 18MM", "BOARDS", "FINSA (MEASURED IN SHEETS)", "18MM", "", "Sheet", 58, 2, 4, "Finsa Lagos", "INV-2231", ""],
    ["LCQD 106", "DRAWER FACE (OFFWHITE) FLAT", "BOARDS", "LACQUERED (MEASURED IN PCS)", "", "60 X 60", "Pcs", 9, 2, 4, "", "", ""],
  ]);
  guide["!cols"] = [{ wch: 22 }, { wch: 110 }];
  XLSX.utils.book_append_sheet(book, guide, "Instructions");

  return XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export function text(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
}

export function number(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const s = text(value).replace(/,/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Reads an uploaded workbook against the template. Returns the rows that are
 * well formed plus every problem found. `fatal` means the file itself is wrong
 * (unreadable, wrong headers, empty), so there is nothing further to check.
 */
export function parseTemplate(
  buffer: Buffer,
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

  const headers = (matrix[0] ?? []).map(text);
  while (headers.length && headers[headers.length - 1] === "") headers.pop();
  const expected = TEMPLATE_COLUMNS.map((c) => c.header);
  const matches =
    headers.length === expected.length &&
    headers.every((h, i) => h.toLowerCase() === expected[i].toLowerCase());
  if (!matches) {
    return fatal(
      `Row 1 of "${sheetName}" must be exactly: ${expected.join(", ")}. Found: ${headers.join(", ") || "nothing"}. Download a fresh template.`,
      1,
    );
  }

  const rows: TemplateRow[] = [];
  const errors: TemplateError[] = [];
  const seen = new Map<string, number>();
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

    const cell = (key: TemplateKey) => cells[TEMPLATE_COLUMNS.findIndex((c) => c.key === key)];
    const header = (key: TemplateKey) => TEMPLATE_COLUMNS.find((c) => c.key === key)!.header;
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
    // Rows without a code are identified by their name instead.
    const key = sku ? `sku:${sku.toLowerCase()}` : `name:${name.toLowerCase()}`;
    if (!sku && !name) fail("sku", "Give a Material_Code or a Material_Name, so the row can be matched to a material.");
    else if (sku.length > 48) fail("sku", "Material_Code must be 48 characters or fewer.");
    else if (seen.has(key)) {
      fail(sku ? "sku" : "name", `${sku || name} is already on row ${seen.get(key)}. Each material may appear once per file.`);
    } else seen.set(key, rowNo);

    const quantity = optionalNumber("quantity") ?? 0;
    const reorderLevel = optionalNumber("reorderLevel");
    const reorderQuantity = optionalNumber("reorderQuantity");

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
      quantity,
      reorderLevel,
      reorderQuantity,
      supplierRef: opt("supplierRef"),
      documentRef: opt("documentRef"),
      notes: opt("notes"),
    });
  }

  if (!dataRows) return fatal(`The "${sheetName}" sheet has headers but no rows.`);
  return { rows, errors, fatal: false };
}
