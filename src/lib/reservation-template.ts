import * as XLSX from "xlsx";
import type { PoolClient } from "pg";
import { hasLocations, LOCATION_LABELS, LOCATIONS, SOURCE_LABELS, SOURCE_LIST, SOURCES, type Location, type ReservedFor, type Source } from "./rbac";
import { createReservation, type Person } from "./reservations";
import { RESERVED_SQL } from "./items";
import { MAX_ROWS, number, text, type TemplateError } from "./template";

/**
 * The reservation upload: the Reservation_Form's fields, one row per material.
 * Designer Name and Email come from the signed-in account.
 */
export const RESERVATION_COLUMNS_TEMPLATE = [
  { header: "Material_Code", width: 16, rule: "Required. The material's code, as shown in the inventory (e.g. SV13)." },
  { header: "Material_Name", width: 30, rule: "Optional. Needed only when several materials share the code (e.g. YXJ-0042 MATT GOLD and YXJ-0042 ROSE GOLD)." },
  { header: "From", width: 10, rule: `Required. ${SOURCE_LIST}.` },
  { header: "Location", width: 10, rule: "Nobox only: Lagos or Abuja. May be left blank when the material is held in just one of them." },
  { header: "Quantity_Requested", width: 18, rule: "Required. More than 0 and no more than the Available Qty." },
  { header: "Project_Name", width: 30, rule: "Required. The project or client this is for." },
  { header: "Purpose_Notes", width: 40, rule: "Optional. e.g. EXHIBITION, CLOSETS, TV UNIT." },
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
    ["SV13", "PANT RACK", "Nobox", "Lagos", 2, "DAGGASH", "CLOSETS"],
  ]);
  guide["!cols"] = [{ wch: 16 }, { wch: 90 }];
  XLSX.utils.book_append_sheet(book, guide, "Instructions");
  return XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

type Row = {
  row: number; sku: string; name: string | null; source: Source; location: Location | null; quantity: number; project: string; notes: string | null;
};

export type ReservationPreview = {
  row: number; sku: string; source: Source; location: Location | null; name: string; unit: string; quantity: number; project: string; available: number;
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
    if (!sku) fail("Material_Code", "Missing required fields: Material_Code.");
    // "Ready Cabinets", "ReadyCabinets" and "ready_cabinets" all mean the same side.
    const letters = (v: string) => v.toLowerCase().replace(/[^a-z]/g, "");
    const from = letters(text(cells[2]));
    const source: Source | null = SOURCES.find((s) => letters(SOURCE_LABELS[s]) === from) ?? null;
    if (!source) fail("From", `"${text(cells[2])}" must be ${SOURCE_LIST}.`);
    const place = letters(text(cells[3]));
    const location = LOCATIONS.find((l) => letters(LOCATION_LABELS[l]) === place) ?? null;
    if (place && (!location || (source && !hasLocations(source)))) {
      fail("Location", source && !hasLocations(source) ? `Leave Location blank for ${SOURCE_LABELS[source]}.` : `"${text(cells[3])}" must be Lagos or Abuja.`);
    }
    const quantity = number(cells[4]);
    if (quantity === null || quantity <= 0) fail("Quantity_Requested", `"${text(cells[4])}" must be a number greater than zero.`);
    const project = text(cells[5]);
    if (!project) fail("Project_Name", "Missing required fields: Project_Name.");

    if (errors.length > before) continue;
    rows.push({
      row: rowNo, sku, name: text(cells[1]) || null, source: source!, location, quantity: quantity!, project, notes: text(cells[6]) || null,
    });
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
  opts: { who: Person; commit: boolean; reservedFor: ReservedFor },
): Promise<{ preview: ReservationPreview[]; errors: TemplateError[]; applied: boolean }> {
  const parsed = parse(buffer);
  if (parsed.fatal) return { preview: [], errors: parsed.errors, applied: false };

  const errors = [...parsed.errors];
  const preview: ReservationPreview[] = [];
  const claimed = new Map<string, number>();
  const ids = new Map<number, string>();

  for (const r of parsed.rows) {
    const { rows } = await client.query<{
      id: string; sku: string; name: string; location: Location | null; dimensions: string | null; unit: string;
      in_stock: number; reserved: number; available: number;
    }>(
      `SELECT i.id, i.sku, i.name, i.location, i.dimensions, i.unit, i.quantity::float8 AS in_stock, (${RESERVED_SQL})::float8 AS reserved,
              (i.quantity - ${RESERVED_SQL})::float8 AS available
         FROM items i
        WHERE i.source = $1 AND lower(i.sku) = lower($2)
          AND ($3::text IS NULL OR i.location = $3) AND ($4::text IS NULL OR lower(i.name) = lower($4))
        ORDER BY i.location, i.name`,
      [r.source, r.sku, r.location, r.name],
    );
    const where = `${SOURCE_LABELS[r.source]}${r.location ? ` ${LOCATION_LABELS[r.location]}` : ""}`;
    if (!rows.length) {
      errors.push({ row: r.row, column: "Material_Code", message: `No ${where} material with code ${r.sku}${r.name ? ` called ${r.name}` : ""}.` });
      continue;
    }
    if (rows.length > 1) {
      const list = rows.map((x) => [x.name, x.dimensions, x.location && LOCATION_LABELS[x.location]].filter(Boolean).join(" · ")).join("; ");
      const places = new Set(rows.map((x) => x.location)).size > 1;
      errors.push({
        row: r.row,
        column: places && !r.location ? "Location" : "Material_Name",
        message: `${rows.length} ${where} materials have code ${r.sku} (${list}). ${places && !r.location ? "Say Lagos or Abuja in Location" : "Give the Material_Name"} to pick one.`,
      });
      continue;
    }
    const item = rows[0];
    const left = item.available - (claimed.get(item.id) ?? 0);
    if (r.quantity > left) {
      errors.push({
        row: r.row,
        column: "Quantity_Requested",
        message: (() => {
          const held = item.reserved + (claimed.get(item.id) ?? 0);
          const why = held > 0 ? `${held} ${item.unit} already reserved${claimed.has(item.id) ? " (counting earlier rows in this file)" : ""}, so ` : "";
          return left <= 0
            ? `OUT OF STOCK: ${why}none of the ${item.in_stock} ${item.unit} of ${item.sku} | ${item.name} are available.`
            : `Insufficient available quantity: ${why}only ${left} of ${item.in_stock} ${item.unit} of ${item.sku} | ${item.name} are available.`;
        })(),
      });
      continue;
    }
    claimed.set(item.id, (claimed.get(item.id) ?? 0) + r.quantity);
    ids.set(r.row, item.id);
    preview.push({
      row: r.row, sku: r.sku, source: r.source, location: item.location, name: item.name, unit: item.unit, quantity: r.quantity,
      project: r.project, available: item.available,
    });
  }

  errors.sort((a, b) => (a.row ?? 0) - (b.row ?? 0));
  if (errors.length || !opts.commit) return { preview: errors.length ? [] : preview, errors, applied: false };

  for (const r of parsed.rows) {
    await createReservation(
      client,
      { itemId: ids.get(r.row)!, quantity: r.quantity, project: r.project, notes: r.notes, reservedFor: opts.reservedFor },
      opts.who,
    );
  }
  return { preview, errors: [], applied: true };
}
