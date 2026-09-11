import * as XLSX from "xlsx";
import { requirePermission } from "@/lib/session";
import { fail, handle, ok } from "@/lib/api";
import { guessMapping } from "@/lib/import-map";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_ROWS = 5000;

export const POST = handle(async (req: Request) => {
  await requirePermission("product:import");

  const form = await req.formData();
  const file = form.get("file");
  const sheetName = form.get("sheet");

  if (!(file instanceof File)) return fail(400, "No spreadsheet was uploaded.");
  if (file.size > MAX_BYTES) return fail(413, "Spreadsheets must be 10MB or smaller.");

  const buffer = Buffer.from(await file.arrayBuffer());
  let book: XLSX.WorkBook;
  try {
    book = XLSX.read(buffer, { type: "buffer", cellDates: true });
  } catch {
    return fail(400, "That file could not be read. Save it as .xlsx or .csv and try again.");
  }

  if (!book.SheetNames.length) return fail(400, "The workbook has no sheets.");
  const chosen = typeof sheetName === "string" && book.SheetNames.includes(sheetName)
    ? sheetName
    : book.SheetNames[0];

  const sheet = book.Sheets[chosen];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, defval: "" });
  if (!matrix.length) return fail(400, `Sheet "${chosen}" is empty.`);

  // Header row = the first row with 2+ non-empty cells. TRT sheets often open
  // with a merged title row above the real headers.
  let headerIndex = 0;
  for (let i = 0; i < Math.min(matrix.length, 15); i += 1) {
    const filled = (matrix[i] ?? []).filter((c) => String(c ?? "").trim() !== "").length;
    if (filled >= 2) {
      headerIndex = i;
      break;
    }
  }

  const rawHeaders = (matrix[headerIndex] ?? []).map((h, i) => {
    const text = String(h ?? "").trim();
    return text || `Column ${i + 1}`;
  });

  // De-duplicate repeated header labels so row keys stay distinct.
  const seen = new Map<string, number>();
  const headers = rawHeaders.map((h) => {
    const n = (seen.get(h) ?? 0) + 1;
    seen.set(h, n);
    return n === 1 ? h : `${h} (${n})`;
  });

  const rows: Record<string, string>[] = [];
  for (let i = headerIndex + 1; i < matrix.length && rows.length < MAX_ROWS; i += 1) {
    const raw = matrix[i] ?? [];
    if (raw.every((c) => String(c ?? "").trim() === "")) continue;
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      const cell = raw[idx];
      row[h] = cell instanceof Date ? cell.toISOString().slice(0, 10) : String(cell ?? "").trim();
    });
    rows.push(row);
  }

  if (!rows.length) return fail(400, `Sheet "${chosen}" has headers but no data rows.`);

  return ok({
    sheets: book.SheetNames,
    sheet: chosen,
    headers,
    mapping: guessMapping(headers),
    rows,
    truncated: rows.length >= MAX_ROWS,
    filename: file.name,
  });
});
