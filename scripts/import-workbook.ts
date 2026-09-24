import "./env";
import { Pool, type PoolClient } from "pg";
import * as XLSX from "xlsx";
import { ensureCategory } from "../src/lib/items";
import { slugToSku } from "../src/lib/utils";

/**
 * Loads the TRT "Inventory Reservation and Stock Monitoring" workbook:
 * Inventory_Master (materials and Opening_Qty), Reservation_Log,
 * Stock_Issue_Log and Stock_Addition_Log. Every row is kept with its original
 * ID and timestamp, and the result is reconciled against the workbook's own
 * Available_Qty.
 *
 *   npm run db:import-workbook -- "<file.xlsx>"            dry run: report only
 *   npm run db:import-workbook -- "<file.xlsx>" --commit   write it
 *
 * Safe to run again: materials are matched by code, log rows by their ID.
 */

type Row = Record<string, unknown>;
type Source = "FACTORY" | "NOBOX";

const text = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());
const num = (v: unknown) => {
  const n = typeof v === "number" ? v : Number(text(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};

/** Excel serial date → instant. The workbook's clock is Lagos time (UTC+1). */
function excelDate(v: unknown): Date | null {
  const n = num(v);
  if (n === null || n < 30000) return null;
  return new Date(Math.round((n - 25569) * 86400000) - 3600000);
}

const EXCEL_TITLE = (s: string) =>
  s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/\bPvc\b/, "PVC").replace(/\bMfc\b/, "MFC");

function sheet(book: XLSX.WorkBook, name: string): Row[] {
  const ws = book.Sheets[name];
  if (!ws) throw new Error(`The workbook has no "${name}" sheet.`);
  // Row 1 is a title; the headers are on row 2.
  return XLSX.utils.sheet_to_json<Row>(ws, { range: 1, defval: "" });
}

type Report = { notes: string[]; add: (s: string) => void };
const report: Report = { notes: [], add: (s) => report.notes.push(s) };

async function run(client: PoolClient, file: string) {
  const book = XLSX.readFile(file);
  const master = sheet(book, "Inventory_Master");
  const resLog = sheet(book, "Reservation_Log");
  const issueLog = sheet(book, "Stock_Issue_Log");
  const addLog = sheet(book, "Stock_Addition_Log");

  const { rows: admins } = await client.query<{ id: string }>("SELECT id FROM users WHERE role = 'ADMIN' ORDER BY created_at LIMIT 1");
  const importer = admins[0]?.id ?? null;
  const { rows: users } = await client.query<{ id: string; email: string }>("SELECT id, lower(email) AS email FROM users");
  const userByEmail = new Map(users.map((u) => [u.email, u.id]));

  // ------------------------------------------------------------ materials
  type Material = {
    code: string; source: Source; name: string; category: string | null; subcategory: string | null;
    spec: string | null; dimensions: string | null; unit: string; opening: number; added: number; issued: number;
    adjNet: number; available: number; reorderLevel: number; reorderQty: number; row: number;
  };
  const materials: Material[] = [];
  const byCode = new Map<string, Material>();
  const used = new Set<string>();

  master.forEach((m, i) => {
    const row = i + 3;
    const name = text(m.Material_Name);
    if (!name) return;
    let code = text(m.Material_Code).toUpperCase();
    if (!code) {
      code = slugToSku(name).slice(0, 40);
      report.add(`Inventory_Master row ${row}: "${name}" has no Material_Code; given ${code}.`);
    }
    if (used.has(code)) {
      const original = code;
      for (let n = 2; used.has(code); n += 1) code = `${original}-${n}`;
      report.add(
        `Inventory_Master row ${row}: Material_Code ${original} is also used by "${byCode.get(original)?.name}"; ` +
          `"${name}" is imported as ${code}. Log rows for ${original} stay with the first one.`,
      );
    }
    used.add(code);
    const subcategory = text(m.Subcategory) || null;
    const material: Material = {
      code,
      // The workbook marks the Germana sinks as held at Nobox; everything else is the Factory's.
      source: /\bnobox\b/i.test(subcategory ?? "") ? "NOBOX" : "FACTORY",
      name,
      category: text(m.Category) ? EXCEL_TITLE(text(m.Category)) : null,
      subcategory,
      spec: text(m.Specification) || null,
      dimensions: text(m.Dimensions) || null,
      unit: text(m.Unit) || "Unit",
      opening: num(m.Opening_Qty) ?? 0,
      added: num(m.Stock_Added) ?? 0,
      issued: num(m.Issued_Qty) ?? 0,
      adjNet: num(m.Adjustment_Net_Stock) ?? 0,
      available: num(m.Available_Qty) ?? 0,
      reorderLevel: Math.max(0, num(m.Reorder_Level) ?? 0),
      reorderQty: Math.max(0, num(m.Reorder_Quantity) ?? 0),
      row,
    };
    materials.push(material);
    if (!byCode.has(code)) byCode.set(code, material);
    if (!byCode.has(text(m.Material_Code).toUpperCase()) && text(m.Material_Code)) byCode.set(text(m.Material_Code).toUpperCase(), material);
  });

  const itemIds = new Map<string, string>();
  for (const m of materials) {
    const category = await ensureCategory(client, m.source, m.category, importer);
    // Stock on the shelf, as the workbook computes it: Opening + Added + Adjustments − Issued.
    const onHand = Math.max(0, m.opening + m.added + m.adjNet - m.issued);
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO items (source, sku, name, category, subcategory, spec, dimensions, unit, opening_qty, quantity,
                          reorder_level, reorder_quantity, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13)
       ON CONFLICT (source, lower(sku)) DO UPDATE SET
         name = EXCLUDED.name, category = EXCLUDED.category, subcategory = EXCLUDED.subcategory,
         spec = EXCLUDED.spec, dimensions = EXCLUDED.dimensions, unit = EXCLUDED.unit,
         opening_qty = EXCLUDED.opening_qty, quantity = EXCLUDED.quantity,
         reorder_level = EXCLUDED.reorder_level, reorder_quantity = EXCLUDED.reorder_quantity, updated_at = now()
       RETURNING id`,
      [m.source, m.code, m.name, category, m.subcategory, m.spec, m.dimensions, m.unit, m.opening, onHand,
       m.reorderLevel, m.reorderQty, importer],
    );
    itemIds.set(m.code, rows[0].id);
  }

  // --------------------------------------------------------- stock issues
  type Issue = { ref: string; resRef: string; code: string; qty: number; at: Date | null; by: string; email: string; notes: string | null; project: string };
  const issues: Issue[] = [];
  const issueRefs = new Set<string>();
  issueLog.forEach((r, i) => {
    const row = i + 3;
    let ref = text(r.Issue_ID);
    if (/^\d+$/.test(ref)) ref = `ISS-${ref}`;
    if (!ref) ref = `ISS-ROW-${row}`;
    const original = ref;
    for (let n = 2; issueRefs.has(ref); n += 1) ref = `${original}-${n}`;
    if (ref !== original) report.add(`Stock_Issue_Log row ${row}: Issue_ID ${original} is used twice; imported as ${ref}.`);
    issueRefs.add(ref);
    issues.push({
      ref, resRef: text(r.Reservation_ID), code: text(r.Material_Code).toUpperCase(), qty: num(r.Qty_Issued) ?? 0,
      at: excelDate(r.Issued_Timestamp), by: text(r.Issued_By), email: text(r.Issuer_Email).toLowerCase(),
      // The workbook's submit wrote the issue note into Inventory_Notified.
      notes: [text(r.Inventory_Notified), text(r.Notes)].filter(Boolean).join(" · ") || null,
      project: text(r.Project_Name),
    });
  });

  // --------------------------------------------------------- reservations
  const resRefs = new Set<string>();
  const reservationIds = new Map<string, string>(); // `${ref}|${code}` → id
  let lastAt: Date | null = null;
  const statusCount: Record<string, number> = {};

  for (const [i, r] of resLog.entries()) {
    const row = i + 3;
    const code = text(r.Material_Code).toUpperCase();
    const material = byCode.get(code);
    const originalRef = text(r.Reservation_ID) || `REQ-ROW-${row}`;
    if (!material) {
      report.add(`Reservation_Log row ${row}: ${originalRef} is for "${code}", which is not in Inventory_Master; skipped.`);
      continue;
    }
    let ref = originalRef;
    for (let n = 2; resRefs.has(ref); n += 1) ref = `${originalRef}-${n}`;
    if (ref !== originalRef) report.add(`Reservation_Log row ${row}: Reservation_ID ${originalRef} is used twice; the ${code} line is imported as ${ref}.`);
    resRefs.add(ref);

    const qty = Math.max(0, num(r.Qty_Reserved) ?? 0);
    const issued = issues.filter((x) => x.resRef === originalRef && (x.code === code || !x.code)).reduce((s, x) => s + x.qty, 0);
    const legacy = text(r.Reservation_Status);
    let status: string;
    let issuedQty = issued;
    let released = 0;
    if (legacy === "Issued") {
      // Closed in the workbook. Anything not matched by an issue row was issued before the logs began.
      issuedQty = Math.max(issued, qty);
      status = issuedQty > 0 ? "ISSUED" : "CANCELLED";
    } else {
      const balance = qty - issued;
      if (balance > 0) status = issued > 0 ? "PART_ISSUED" : "RESERVED";
      else status = issued > 0 ? "ISSUED" : "CANCELLED";
      if (qty === 0 && issued === 0) released = 0;
    }
    statusCount[status] = (statusCount[status] ?? 0) + 1;

    const at: Date | null = excelDate(r.Submitted_Timestamp) ?? lastAt;
    if (!excelDate(r.Submitted_Timestamp)) report.add(`Reservation_Log row ${row}: ${ref} has no timestamp; dated with the row before it.`);
    lastAt = at;
    const designerName = text(r.Designer_Name);
    const email = text(r.Designer_Email).toLowerCase();
    // The workbook's submit wrote the Purpose / Notes into Available_At_Request.
    const availRaw = text(r.Available_At_Request);
    const availNum = num(r.Available_At_Request);
    const notes = [availNum === null ? availRaw : "", text(r.Notes)].filter(Boolean).join(" · ") || null;

    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO reservations (ref, item_id, source, quantity, project, notes, status, issued_qty, released_qty,
                                 reserved_by, designer_name, designer_email, available_at_request, legacy_status,
                                 closed_at, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$16)
       ON CONFLICT (ref) DO UPDATE SET status = EXCLUDED.status, issued_qty = EXCLUDED.issued_qty,
         quantity = EXCLUDED.quantity, notes = EXCLUDED.notes
       RETURNING id`,
      [ref, itemIds.get(material.code), material.source, qty, text(r.Project_Name) || "(no project)", notes, status,
       issuedQty, released, userByEmail.get(email) ?? null,
       designerName && designerName !== "Legacy import" ? designerName : null, email || null,
       availNum, legacy, status === "RESERVED" || status === "PART_ISSUED" ? null : at, at ?? new Date()],
    );
    reservationIds.set(`${originalRef}|${code}`, rows[0].id);
    if (!reservationIds.has(`${originalRef}|`)) reservationIds.set(`${originalRef}|`, rows[0].id);
    await client.query(
      `INSERT INTO reservation_events (reservation_id, action, quantity, note, created_by, created_at)
       SELECT $1, 'RESERVED', $2, $3, $4, $5
        WHERE NOT EXISTS (SELECT 1 FROM reservation_events WHERE reservation_id = $1 AND action = 'RESERVED')`,
      [rows[0].id, qty, notes, userByEmail.get(email) ?? null, at ?? new Date()],
    );
  }

  let issuedImported = 0;
  for (const x of issues) {
    let code = x.code;
    const resId = reservationIds.get(`${x.resRef}|${code}`) ?? reservationIds.get(`${x.resRef}|`) ?? null;
    if (!code && resId) {
      const { rows } = await client.query<{ sku: string }>("SELECT i.sku FROM reservations r JOIN items i ON i.id = r.item_id WHERE r.id = $1", [resId]);
      code = rows[0]?.sku ?? "";
    }
    const material = byCode.get(code);
    if (!material || x.qty <= 0) {
      report.add(`Stock_Issue_Log: ${x.ref} (${x.qty} of "${x.code || "no material"}" against ${x.resRef}) cannot be placed on a material; skipped, as the workbook's own totals skip it.`);
      continue;
    }
    let linkedId = resId;
    if (!linkedId) {
      // The reservation ID on the issue is not in the log (usually a typo, e.g.
      // REQ-…522 for REQ-…522A). The workbook subtracts every issue from the
      // material's Reserved_Qty regardless, so attach it to that material's
      // reservation with the closest ID, else the oldest one still holding stock.
      const { rows: open } = await client.query<{ id: string; ref: string }>(
        `SELECT id, ref FROM reservations
          WHERE item_id = $1 AND status IN ('RESERVED','PART_ISSUED') AND quantity - issued_qty - released_qty > 0
          ORDER BY (ref ILIKE $2 || '%') DESC, created_at
          LIMIT 1`,
        [itemIds.get(material.code), x.resRef],
      );
      if (open[0]) {
        linkedId = open[0].id;
        await client.query(
          `UPDATE reservations SET issued_qty = issued_qty + $1,
                  status = CASE WHEN quantity - issued_qty - $1 - released_qty > 0 THEN 'PART_ISSUED' ELSE 'ISSUED' END
            WHERE id = $2`,
          [x.qty, linkedId],
        );
        report.add(`Stock_Issue_Log: ${x.ref} is against ${x.resRef}, which is not in Reservation_Log; applied to ${open[0].ref} (same material).`);
      } else {
        report.add(`Stock_Issue_Log: ${x.ref} is against ${x.resRef}, which is not in Reservation_Log, and ${material.code} has no open reservation; imported as an issue without a reservation.`);
      }
    }
    const { rowCount } = await client.query(
      `INSERT INTO stock_issues (ref, reservation_id, reservation_ref, item_id, source, quantity, project, notes,
                                 issued_by, issued_by_name, issued_by_email, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (ref) DO NOTHING`,
      [x.ref, linkedId, x.resRef, itemIds.get(material.code), material.source, x.qty, x.project || null, x.notes,
       userByEmail.get(x.email) ?? null, x.by || null, x.email || null, x.at ?? lastAt ?? new Date()],
    );
    if (rowCount && linkedId) {
      await client.query(
        "INSERT INTO reservation_events (reservation_id, action, quantity, note, created_by, created_at) VALUES ($1,'ISSUED',$2,$3,$4,$5)",
        [linkedId, x.qty, x.notes, userByEmail.get(x.email) ?? null, x.at ?? new Date()],
      );
    }
    issuedImported += 1;
  }

  // ------------------------------------------------------- stock additions
  let addedImported = 0;
  for (const [i, a] of addLog.entries()) {
    const code = text(a.Material_Code).toUpperCase();
    const material = byCode.get(code);
    const qty = num(a.Qty_Added) ?? 0;
    if (!material || qty <= 0) {
      report.add(`Stock_Addition_Log row ${i + 3}: ${text(a.Addition_ID)} (${qty} of "${code}") skipped.`);
      continue;
    }
    const email = text(a.Recorder_Email).toLowerCase();
    await client.query(
      `INSERT INTO stock_additions (ref, item_id, source, quantity, supplier_ref, document_ref, notes,
                                    recorded_by, recorded_by_name, recorded_by_email, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (ref) DO NOTHING`,
      [text(a.Addition_ID), itemIds.get(material.code), material.source, qty, text(a.Supplier_or_Reference) || null,
       text(a.Document_Ref) || null, text(a.Notes) || null, userByEmail.get(email) ?? null,
       text(a.Recorded_By) || null, email || null, excelDate(a.Recorded_Timestamp) ?? new Date()],
    );
    addedImported += 1;
  }

  // In stock follows the logs, as the workbook's governance says the master
  // should: Opening_Qty + Stock_Addition_Log − Stock_Issue_Log. (The master's
  // saved Issued_Qty is stale for some rows, so it is not used.)
  await client.query(
    `UPDATE items i SET quantity = GREATEST(0, i.opening_qty
        + COALESCE((SELECT SUM(d.quantity) FROM stock_additions d WHERE d.item_id = i.id), 0)
        - COALESCE((SELECT SUM(s.quantity) FROM stock_issues s WHERE s.item_id = i.id), 0))
      WHERE i.id = ANY($1::uuid[])`,
    [[...itemIds.values()]],
  );

  // Ledger: one opening line per material, so "Recent changes" has a start.
  await client.query(
    `INSERT INTO item_movements (item_id, source, kind, delta, balance_after, note, created_by, created_at)
     SELECT i.id, i.source, 'OPENING', i.opening_qty, i.opening_qty, 'Opening_Qty from the inventory workbook', $1, now() - interval '1 year'
       FROM items i
      WHERE i.id = ANY($2::uuid[])
        AND NOT EXISTS (SELECT 1 FROM item_movements m WHERE m.item_id = i.id AND m.kind = 'OPENING')`,
    [importer, [...itemIds.values()]],
  );

  // ---------------------------------------------------------- reconcile
  const { rows: now } = await client.query<{ sku: string; available: number; reserved: number; quantity: number }>(
    `SELECT i.sku, i.quantity::float8 AS quantity,
            COALESCE((SELECT SUM(GREATEST(r.quantity - r.issued_qty - r.released_qty, 0)) FROM reservations r
                       WHERE r.item_id = i.id AND r.status IN ('RESERVED','PART_ISSUED')), 0)::float8 AS reserved
       FROM items i WHERE i.id = ANY($1::uuid[])`,
    [[...itemIds.values()]],
  );
  // What the workbook's formulas give when recomputed from its logs, with its
  // exact-text matching (a code with a stray space matches nothing).
  const OPEN = new Set(["Submitted", "Reserved", "Approved", "Part Issued"]);
  const recomputed = (code: string, m: Material) => {
    const added = addLog.filter((a) => String(a.Material_Code) === code && text(a.Addition_Status) === "Posted").reduce((s, a) => s + (num(a.Qty_Added) ?? 0), 0);
    const issued = issueLog.filter((x) => String(x.Material_Code) === code && text(x.Issue_Status) === "Posted").reduce((s, x) => s + (num(x.Qty_Issued) ?? 0), 0);
    const reserved = resLog.filter((x) => String(x.Material_Code) === code && OPEN.has(text(x.Reservation_Status))).reduce((s, x) => s + (num(x.Qty_Reserved) ?? 0), 0) - issued;
    return m.opening + added - reserved - issued;
  };

  const differences: string[] = [];
  let staleSaved = 0;
  for (const r of now) {
    const m = materials.find((x) => x.code === r.sku)!;
    const available = r.quantity - r.reserved;
    const formula = recomputed(m.code, m);
    if (Math.abs(formula - m.available) > 1e-6) staleSaved += 1;
    if (Math.abs(available - formula) > 1e-6) {
      differences.push(
        `${m.code} | ${m.name}: app ${available} (in stock ${r.quantity} − reserved ${r.reserved}); ` +
          `workbook formula ${formula}${Math.abs(formula - m.available) > 1e-6 ? `, saved value ${m.available}` : ""}`,
      );
    }
  }

  return {
    materials: materials.length,
    factory: materials.filter((m) => m.source === "FACTORY").length,
    nobox: materials.filter((m) => m.source === "NOBOX").map((m) => m.code),
    reservations: resLog.length,
    reservationStatuses: statusCount,
    issues: issuedImported,
    additions: addedImported,
    matchingAvailable: now.length - differences.length,
    staleSaved,
    differences,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith("--"));
  const commit = args.includes("--commit");
  if (!file) {
    console.error('Usage: npm run db:import-workbook -- "<file.xlsx>" [--commit]');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await run(client, file);
    await client.query(commit ? "COMMIT" : "ROLLBACK");

    console.log(`\n${commit ? "IMPORTED" : "DRY RUN (nothing written; add --commit to import)"}\n`);
    console.log(`  Materials:     ${result.materials} (${result.factory} Factory, ${result.nobox.length} Nobox: ${result.nobox.join(", ")})`);
    console.log(`  Reservations:  ${result.reservations} rows → ${JSON.stringify(result.reservationStatuses)}`);
    console.log(`  Stock issues:  ${result.issues}`);
    console.log(`  Additions:     ${result.additions}`);
    console.log(`  Available_Qty matches the workbook's formulas for ${result.matchingAvailable} of ${result.materials} materials.`);
    console.log(`  (The Available_Qty saved in the file is out of date for ${result.staleSaved} materials; the comparison uses the formulas recomputed from the logs.)`);
    if (report.notes.length) {
      console.log(`\n  Workbook problems found and how they were handled (${report.notes.length}):`);
      for (const n of report.notes) console.log(`   - ${n}`);
    }
    if (result.differences.length) {
      console.log(`\n  Available_Qty differs from the workbook (${result.differences.length}):`);
      for (const d of result.differences) console.log(`   - ${d}`);
    }
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
