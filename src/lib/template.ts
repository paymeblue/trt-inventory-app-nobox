import * as XLSX from "xlsx";

/**
 * The upload template. Factory and Nobox use the same one. An upload is only
 * accepted when its first row is exactly these headers, in this order.
 */
export const TEMPLATE_COLUMNS = [
  { key: "sku", header: "SKU", width: 16, rule: "Optional. The item's code. If given, it matches an existing item or creates one with that code. If blank, the row matches an existing item by Name, or creates a new one with a code made from its name." },
  { key: "name", header: "Name", width: 34, rule: "Required for new items and whenever SKU is blank. Otherwise blank keeps the existing name." },
  { key: "category", header: "Category", width: 20, rule: "Optional. Blank keeps the current value." },
  { key: "colour", header: "Colour", width: 16, rule: "Optional. Blank keeps the current value." },
  { key: "spec", header: "Specification", width: 24, rule: "Optional. Size, thickness, finish. Blank keeps the current value." },
  { key: "unit", header: "Unit", width: 10, rule: "Optional. pcs, sheet, roll, m, kg… New items default to pcs." },
  { key: "quantity", header: "Quantity", width: 11, rule: "Required. Added to current stock. Use a negative number to remove stock. New items need 0 or more." },
  { key: "reorderLevel", header: "Reorder Level", width: 14, rule: "Optional. Flag the item as low stock at or below this number." },
  { key: "description", header: "Description", width: 36, rule: "Optional. Anything the design team should know." },
] as const;

export type TemplateKey = (typeof TEMPLATE_COLUMNS)[number]["key"];

export const TEMPLATE_SHEET = "Items";
export const MAX_ROWS = 5000;

export type TemplateRow = {
  /** Spreadsheet row number, as the user sees it in Excel. */
  row: number;
  /** Null when the cell was left blank; the item is then matched by name. */
  sku: string | null;
  name: string | null;
  category: string | null;
  colour: string | null;
  spec: string | null;
  unit: string | null;
  quantity: number;
  reorderLevel: number | null;
  description: string | null;
};

export type TemplateError = { row: number | null; column: string | null; message: string };

export function buildTemplate(): Buffer {
  const book = XLSX.utils.book_new();

  const items = XLSX.utils.aoa_to_sheet([TEMPLATE_COLUMNS.map((c) => c.header)]);
  items["!cols"] = TEMPLATE_COLUMNS.map((c) => ({ wch: c.width }));
  items["!autofilter"] = { ref: `A1:${XLSX.utils.encode_col(TEMPLATE_COLUMNS.length - 1)}1` };
  XLSX.utils.book_append_sheet(book, items, TEMPLATE_SHEET);

  const guide = XLSX.utils.aoa_to_sheet([
    ["TRT Nobox inventory upload template"],
    [],
    ["Fill in the Items sheet, one row per item, and upload it from the Factory or Nobox dashboard."],
    ["Do not rename, reorder, add or remove columns. A file whose headers differ is rejected."],
    ["If any row has a problem, nothing is uploaded. Fix the rows listed and upload again."],
    ["Each SKU (or, for rows without a SKU, each Name) may appear only once per file."],
    [],
    ["Column", "Rule"],
    ...TEMPLATE_COLUMNS.map((c) => [c.header, c.rule]),
    [],
    ["Example rows (for reference only, do not paste into Items unless you mean them)"],
    TEMPLATE_COLUMNS.map((c) => c.header),
    ["MEL-18-WHT", "18mm White Melamine Board", "Boards & Panels", "White", "2440 × 1220 × 18mm", "sheet", 20, 10, ""],
    ["MEL-18-WHT", "", "", "", "", "", -4, "", "4 sheets used on a job"],
  ]);
  guide["!cols"] = [{ wch: 18 }, { wch: 96 }];
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
    const fail = (key: TemplateKey | null, message: string) =>
      errors.push({
        row: rowNo,
        column: key ? TEMPLATE_COLUMNS.find((c) => c.key === key)!.header : null,
        message,
      });

    const sku = text(cell("sku")).toUpperCase();
    const name = text(cell("name"));
    // Rows without a SKU are identified by their name instead.
    const key = sku ? `sku:${sku.toLowerCase()}` : `name:${name.toLowerCase()}`;
    if (!sku && !name) fail("sku", "Give a SKU or a Name, so the row can be matched to an item.");
    else if (sku.length > 48) fail("sku", "SKU must be 48 characters or fewer.");
    else if (seen.has(key)) {
      fail(sku ? "sku" : "name", `${sku || name} is already on row ${seen.get(key)}. Each item may appear once per file.`);
    } else seen.set(key, rowNo);

    const quantityCell = text(cell("quantity"));
    const quantity = number(cell("quantity"));
    if (!quantityCell) fail("quantity", "Quantity is required. Use 0 to change details only.");
    else if (quantity === null) fail("quantity", `"${quantityCell}" is not a number.`);

    const reorderCell = text(cell("reorderLevel"));
    const reorderLevel = number(cell("reorderLevel"));
    if (reorderCell && (reorderLevel === null || reorderLevel < 0)) {
      fail("reorderLevel", `"${reorderCell}" is not a number of 0 or more.`);
    }

    if (errors.length > errorsBefore) continue;
    rows.push({
      row: rowNo,
      sku: sku || null,
      name: name || null,
      category: text(cell("category")) || null,
      colour: text(cell("colour")) || null,
      spec: text(cell("spec")) || null,
      unit: text(cell("unit")) || null,
      quantity: quantity ?? 0,
      reorderLevel: reorderCell ? reorderLevel : null,
      description: text(cell("description")) || null,
    });
  }

  if (!dataRows) return fatal(`The "${sheetName}" sheet has headers but no rows.`);
  return { rows, errors, fatal: false };
}
