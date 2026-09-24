import * as XLSX from "xlsx";
import type { PoolClient } from "pg";
import { SOURCE_LABELS, type Source } from "./rbac";
import { createReservation } from "./reservations";
import { RESERVED_SQL } from "./items";
import { MAX_ROWS, number, text, type TemplateError } from "./template";

/** The reservation upload. Designers fill one row per item they want set aside. */
export const RESERVATION_COLUMNS_TEMPLATE = [
  { header: "SKU", width: 16, rule: "Required. The item's code, as shown in the inventory." },
  { header: "From", width: 10, rule: "Required. Factory or Nobox." },
  { header: "Quantity", width: 11, rule: "Required. How many to reserve. Must be more than 0 and no more than is available." },
  { header: "Project", width: 30, rule: "Required. The project or client this is for." },
  { header: "Notes", width: 36, rule: "Optional." },
] as const;

export const RESERVATION_SHEET = "Reservations";

export function buildReservationTemplate(): Buffer {
  const book = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([RESERVATION_COLUMNS_TEMPLATE.map((c) => c.header)]);
  sheet["!cols"] = RESERVATION_COLUMNS_TEMPLATE.map((c) => ({ wch: c.width }));
  XLSX.utils.book_append_sheet(book, sheet, RESERVATION_SHEET);

  const guide = XLSX.utils.aoa_to_sheet([
    ["TRT Nobox reservation template"],
    [],
    ["One row per item. Upload it from the Inventory page with Reserve from Excel."],
    ["Do not rename, reorder, add or remove columns. A file whose headers differ is rejected."],
    ["If any row has a problem, nothing is reserved. Fix the rows listed and upload again."],
    [],
    ["Column", "Rule"],
    ...RESERVATION_COLUMNS_TEMPLATE.map((c) => [c.header, c.rule]),
    [],
    ["Example"],
    RESERVATION_COLUMNS_TEMPLATE.map((c) => c.header),
    ["MEL-18-WHT", "Factory", 6, "Ikoyi Kitchen", "Island and tall units"],
  ]);
  guide["!cols"] = [{ wch: 16 }, { wch: 90 }];
  XLSX.utils.book_append_sheet(book, guide, "Instructions");
  return XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

type Row = { row: number; sku: string; source: Source; quantity: number; project: string; notes: string | null };

export type ReservationPreview = {
  row: number; sku: string; source: Source; name: string; unit: string; quantity: number; project: string; available: number;
};

function parse(buffer: Buffer): { rows: Row[]; errors: TemplateError[]; fatal: boolean } {
  const fatal = (message: string, row: number | null = null) => ({ rows: [], errors: [{ row, column: null, message }], fatal: true });
  let book: XLSX.WorkBook;
  try {
    book = XLSX.read(buffer, { type: "buffer" });
  } catch {
    return fatal("That file could not be read. Upload the .xlsx reservation template.");
  }
  const name = book.SheetNames.includes(RESERVATION_SHEET) ? RESERVATION_SHEET : book.SheetNames[0];
  if (!name) return fatal("The workbook has no sheets.");
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[name], { header: 1, blankrows: true, defval: "", raw: true });

  const headers = (matrix[0] ?? []).map(text);
  while (headers.length && headers[headers.length - 1] === "") headers.pop();
  const expected = RESERVATION_COLUMNS_TEMPLATE.map((c) => c.header);
  if (headers.length !== expected.length || headers.some((h, i) => h.toLowerCase() !== expected[i].toLowerCase())) {
    return fatal(`Row 1 must be exactly: ${expected.join(", ")}. Found: ${headers.join(", ") || "nothing"}. Download a fresh reservation template.`, 1);
  }

  const rows: Row[] = [];
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
    const before = errors.length;
    const fail = (column: string, message: string) => errors.push({ row: rowNo, column, message });

    const sku = text(cells[0]).toUpperCase();
    if (!sku) fail("SKU", "SKU is required.");
    const from = text(cells[1]).toLowerCase();
    const source: Source | null = from === "factory" ? "FACTORY" : from === "nobox" ? "NOBOX" : null;
    if (!source) fail("From", `"${text(cells[1])}" must be Factory or Nobox.`);
    const quantity = number(cells[2]);
    if (quantity === null || quantity <= 0) fail("Quantity", `"${text(cells[2])}" must be a number more than 0.`);
    const project = text(cells[3]);
    if (!project) fail("Project", "Project is required.");

    if (errors.length > before) continue;
    rows.push({ row: rowNo, sku, source: source!, quantity: quantity!, project, notes: text(cells[4]) || null });
  }
  if (!dataRows) return fatal(`The "${name}" sheet has headers but no rows.`);
  return { rows, errors, fatal: false };
}

/**
 * Checks every row against current availability (counting earlier rows in the
 * same file) and, when `commit` is set and nothing is wrong, reserves them all.
 */
export async function importReservations(
  client: PoolClient,
  buffer: Buffer,
  opts: { userId: string; commit: boolean },
): Promise<{ preview: ReservationPreview[]; errors: TemplateError[]; applied: boolean }> {
  const parsed = parse(buffer);
  if (parsed.fatal) return { preview: [], errors: parsed.errors, applied: false };

  const errors = [...parsed.errors];
  const preview: ReservationPreview[] = [];
  const claimed = new Map<string, number>();
  const ids = new Map<number, string>();

  for (const r of parsed.rows) {
    const { rows } = await client.query<{ id: string; name: string; unit: string; available: number }>(
      `SELECT i.id, i.name, i.unit, (i.quantity - ${RESERVED_SQL})::float8 AS available
         FROM items i WHERE i.source = $1 AND lower(i.sku) = lower($2)`,
      [r.source, r.sku],
    );
    const item = rows[0];
    if (!item) {
      errors.push({ row: r.row, column: "SKU", message: `No ${SOURCE_LABELS[r.source]} item with SKU ${r.sku}.` });
      continue;
    }
    const left = item.available - (claimed.get(item.id) ?? 0);
    if (r.quantity > left) {
      errors.push({
        row: r.row,
        column: "Quantity",
        message: `Only ${Math.max(0, left)} ${item.unit} of ${item.name} available${claimed.has(item.id) ? " after earlier rows in this file" : ""}.`,
      });
      continue;
    }
    claimed.set(item.id, (claimed.get(item.id) ?? 0) + r.quantity);
    ids.set(r.row, item.id);
    preview.push({ row: r.row, sku: r.sku, source: r.source, name: item.name, unit: item.unit, quantity: r.quantity, project: r.project, available: item.available });
  }

  errors.sort((a, b) => (a.row ?? 0) - (b.row ?? 0));
  if (errors.length || !opts.commit) return { preview: errors.length ? [] : preview, errors, applied: false };

  for (const r of parsed.rows) {
    await createReservation(client, { itemId: ids.get(r.row)!, quantity: r.quantity, project: r.project, notes: r.notes }, opts.userId);
  }
  return { preview, errors: [], applied: true };
}
