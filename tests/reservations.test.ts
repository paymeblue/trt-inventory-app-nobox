import { after, before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { Pool } from "pg";
import { ITEM_COLUMNS, ITEM_FROM } from "../src/lib/items";
import { createReservation, issueReservation, releaseReservation, type Person } from "../src/lib/reservations";
import { importReservations } from "../src/lib/reservation-template";
import { addStock, adjustStock, adjustmentImpacts } from "../src/lib/stock";
import { inTransaction, makeUser, resetSchema, testPool, workbook } from "./db";

let pool: Pool;
let designer: Person;
let manager: Person;
let itemId: string;

async function item() {
  const { rows } = await pool.query<{
    quantity: number; reserved: number; available: number; issued: number; added: number; reorder_status: string;
  }>(`SELECT ${ITEM_COLUMNS} ${ITEM_FROM} WHERE i.id = $1`, [itemId]);
  const r = rows[0];
  return { quantity: r.quantity, reserved: r.reserved, available: r.available, issued: r.issued, added: r.added, status: r.reorder_status };
}

async function reservation(id: string) {
  const { rows } = await pool.query(
    "SELECT status, issued_qty::float8 AS issued, released_qty::float8 AS released FROM reservations WHERE id = $1",
    [id],
  );
  return rows[0];
}

const reserve = (quantity: number, project = "DAGGASH") =>
  inTransaction(pool, (c) => createReservation(c, { itemId, quantity, project, notes: "CLOSETS" }, designer));
const issue = (id: string, quantity?: number) =>
  inTransaction(pool, (c) => issueReservation(c, id, manager, { quantity, notes: "sent to production" }));
const adjust = (type: string, quantity: number, relatedRef?: string) =>
  inTransaction(pool, (c) => adjustStock(c, { itemId, type, quantity, relatedRef, notes: "count" }, manager));

before(() => {
  pool = testPool();
});

beforeEach(async () => {
  await resetSchema(pool);
  designer = { id: await makeUser(pool, "design@test.local", "DESIGNER"), name: "Sunday Agbocheni", email: "design@test.local" };
  manager = { id: await makeUser(pool, "factory@test.local", "FACTORY_MANAGER"), name: "Osamudiamen A.", email: "factory@test.local" };
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO items (source, sku, name, unit, opening_qty, quantity, reorder_level, reorder_quantity)
     VALUES ('FACTORY', 'FINSA 116', 'LISSA OAK 18MM', 'Sheet', 10, 10, 2, 4) RETURNING id`,
  );
  itemId = rows[0].id;
});

after(async () => {
  await pool.end();
});

describe("Reservation form", () => {
  test("reserving sets stock aside without deducting it, and records the designer", async () => {
    const r = await reserve(4);
    assert.match(r.ref, /^REQ-\d{5}$/);
    assert.deepEqual(await item(), { quantity: 10, reserved: 4, available: 6, issued: 0, added: 0, status: "OK" });
    const { rows } = await pool.query("SELECT designer_name, designer_email, available_at_request::float8 AS avail, notes FROM reservations");
    assert.deepEqual(rows[0], { designer_name: "Sunday Agbocheni", designer_email: "design@test.local", avail: 10, notes: "CLOSETS" });
  });

  test("Insufficient available quantity, then OUT OF STOCK", async () => {
    await reserve(8);
    await assert.rejects(reserve(3), /Insufficient available quantity: 2 Sheet/);
    await reserve(2);
    await assert.rejects(reserve(1), /OUT OF STOCK/);
  });
});

describe("Stock issue form", () => {
  test("issuing part of a reservation leaves it Part Issued with the balance still reserved", async () => {
    const r = await reserve(6);
    const out = await issue(r.id, 4);
    assert.equal(out.status, "PART_ISSUED");
    assert.equal(out.balance, 2);
    assert.match(out.issueRef, /^ISS-\d{5}$/);
    assert.deepEqual(await reservation(r.id), { status: "PART_ISSUED", issued: 4, released: 0 });
    assert.deepEqual(await item(), { quantity: 6, reserved: 2, available: 4, issued: 4, added: 0, status: "OK" });

    await issue(r.id, 2);
    assert.deepEqual(await reservation(r.id), { status: "ISSUED", issued: 6, released: 0 });
    assert.deepEqual(await item(), { quantity: 4, reserved: 0, available: 4, issued: 6, added: 0, status: "OK" });
  });

  test("Issue exceeds remaining reservation balance", async () => {
    const r = await reserve(3);
    await assert.rejects(issue(r.id, 4), /Issue exceeds remaining reservation balance/);
    assert.equal((await item()).quantity, 10);
  });

  test("issuing is refused when the stock is not physically there", async () => {
    const r = await reserve(8);
    await pool.query("UPDATE items SET quantity = 5 WHERE id = $1", [itemId]);
    await assert.rejects(issue(r.id, 8), /Not enough in stock: only 5 Sheet/);
    assert.equal((await reservation(r.id)).status, "RESERVED");
    assert.equal((await item()).quantity, 5);
  });

  test("a fully issued reservation cannot be issued again", async () => {
    const r = await reserve(2);
    await issue(r.id);
    await assert.rejects(issue(r.id, 1), /already fully issued/);
  });

  test("every issue is in Stock_Issue_Log with who issued it", async () => {
    const r = await reserve(5);
    await issue(r.id, 2);
    await issue(r.id, 3);
    const { rows } = await pool.query(
      "SELECT reservation_ref, quantity::float8 AS q, project, issued_by_name, notes FROM stock_issues ORDER BY created_at",
    );
    assert.deepEqual(rows.map((x) => [x.reservation_ref, x.q, x.project, x.issued_by_name, x.notes]), [
      [r.ref, 2, "DAGGASH", "Osamudiamen A.", "sent to production"],
      [r.ref, 3, "DAGGASH", "Osamudiamen A.", "sent to production"],
    ]);
  });
});

describe("Stock addition form", () => {
  test("posts to Stock_Addition_Log and increases stock", async () => {
    const out = await inTransaction(pool, (c) =>
      addStock(c, { itemId, quantity: 58, supplierRef: "Finsa Lagos", documentRef: "INV-1" }, manager),
    );
    assert.match(out.ref, /^ADD-\d{5}$/);
    assert.deepEqual(await item(), { quantity: 68, reserved: 0, available: 68, issued: 0, added: 58, status: "OK" });
  });

  test("Quantity must be greater than zero", async () => {
    await assert.rejects(inTransaction(pool, (c) => addStock(c, { itemId, quantity: 0 }, manager)), /greater than zero/);
  });
});

describe("Stock adjustment form", () => {
  test("the three signed impacts are the workbook's formulas", () => {
    assert.deepEqual(adjustmentImpacts("Return to Stock", 3), { stock: 3, reserved: 0, issued: -3 });
    assert.deepEqual(adjustmentImpacts("Additional Issue", 3), { stock: -3, reserved: 0, issued: 3 });
    assert.deepEqual(adjustmentImpacts("Reservation Release", 3), { stock: 0, reserved: -3, issued: 0 });
    assert.deepEqual(adjustmentImpacts("Damage / Write-off", 3), { stock: -3, reserved: 0, issued: 0 });
    assert.deepEqual(adjustmentImpacts("Count Gain", 3), { stock: 3, reserved: 0, issued: 0 });
    assert.deepEqual(adjustmentImpacts("Count Loss", 3), { stock: -3, reserved: 0, issued: 0 });
  });

  test("gains and losses move the stock on the shelf once", async () => {
    await adjust("Count Gain", 5);
    assert.equal((await item()).quantity, 15);
    await adjust("Damage / Write-off", 2);
    await adjust("Count Loss", 1);
    assert.equal((await item()).quantity, 12);
  });

  test("Return to Stock and Additional Issue move stock once and show in Issued_Qty", async () => {
    await adjust("Additional Issue", 3);
    assert.deepEqual(await item(), { quantity: 7, reserved: 0, available: 7, issued: 3, added: 0, status: "OK" });
    await adjust("Return to Stock", 1);
    assert.deepEqual(await item(), { quantity: 8, reserved: 0, available: 8, issued: 2, added: 0, status: "OK" });
  });

  test("Reservation Release frees part of a reservation by its ID", async () => {
    const r = await reserve(6);
    await adjust("Reservation Release", 4, r.ref);
    assert.deepEqual(await reservation(r.id), { status: "RESERVED", issued: 0, released: 4 });
    assert.equal((await item()).reserved, 2);
    await adjust("Reservation Release", 2, r.ref);
    assert.equal((await reservation(r.id)).status, "CANCELLED");
    assert.equal((await item()).quantity, 10, "nothing was deducted");
  });

  test("Reservation Release needs the reservation as its Related ID", async () => {
    await assert.rejects(adjust("Reservation Release", 1), /needs the reservation's ID/);
  });

  test("a deduction cannot eat into reserved stock or go below zero", async () => {
    await reserve(7);
    await assert.rejects(adjust("Damage / Write-off", 4), /7 Sheet of LISSA OAK 18MM are reserved, so at most 3/);
    await adjust("Damage / Write-off", 3);
    assert.deepEqual(await item(), { quantity: 7, reserved: 7, available: 0, issued: 0, added: 0, status: "OUT OF STOCK" });
  });

  test("every adjustment is in Stock_Adjustment_Log with its signed impacts", async () => {
    await adjust("Count Loss", 2);
    const { rows } = await pool.query(
      "SELECT adjustment_type, quantity::float8 AS q, stock_impact::float8 AS s, reserved_impact::float8 AS r, issued_impact::float8 AS i FROM stock_adjustments",
    );
    assert.deepEqual(rows, [{ adjustment_type: "Count Loss", q: 2, s: -2, r: 0, i: 0 }]);
  });
});

describe("Bad stock", () => {
  const bad = async () => (await pool.query("SELECT bad_qty::float8 AS b FROM items WHERE id = $1", [itemId])).rows[0].b;
  const withReason = (type: string, quantity: number, notes: string | undefined) =>
    inTransaction(pool, (c) => adjustStock(c, { itemId, type, quantity, notes }, manager));

  test("moving to bad stock needs a reason, takes it out of usable stock and keeps it on record", async () => {
    await assert.rejects(withReason("Move to Bad Stock", 3, ""), /Give a reason for the Move to Bad Stock/);
    await withReason("Move to Bad Stock", 3, "Chipped edges");
    assert.equal(await bad(), 3);
    assert.deepEqual(await item(), { quantity: 7, reserved: 0, available: 7, issued: 0, added: 0, status: "OK" });
    const { rows } = await pool.query("SELECT notes, bad_impact::float8 AS b, stock_impact::float8 AS s FROM stock_adjustments");
    assert.deepEqual(rows, [{ notes: "Chipped edges", b: 3, s: -3 }]);
  });

  test("restoring from bad stock brings it back, never more than is there", async () => {
    await withReason("Move to Bad Stock", 3, "Water damage");
    await assert.rejects(withReason("Restore from Bad Stock", 4, "repaired"), /Only 3 Sheet of LISSA OAK 18MM are in bad stock/);
    await withReason("Restore from Bad Stock", 2, "repaired");
    assert.equal(await bad(), 1);
    assert.equal((await item()).quantity, 9);
  });

  test("write-offs and count losses also need a reason", async () => {
    await assert.rejects(withReason("Damage / Write-off", 1, undefined), /Give a reason/);
    await assert.rejects(withReason("Count Loss", 1, " "), /Give a reason/);
  });
});

describe("Reorder_Status", () => {
  const statusAt = async (available: number) => {
    await pool.query("UPDATE items SET quantity = $1, reorder_level = 4 WHERE id = $2", [available, itemId]);
    return (await item()).status;
  };
  test("OUT OF STOCK, REORDER NOW, LOW (≤ 1.25 × level), OK", async () => {
    assert.equal(await statusAt(0), "OUT OF STOCK");
    assert.equal(await statusAt(4), "REORDER NOW");
    assert.equal(await statusAt(5), "LOW");
    assert.equal(await statusAt(6), "OK");
  });
});

describe("Cancel and log", () => {
  test("cancelling releases what is left and deducts nothing", async () => {
    const r = await reserve(4);
    await issue(r.id, 1);
    await inTransaction(pool, (c) => releaseReservation(c, r.id, designer, { action: "CANCELLED" }));
    assert.deepEqual(await reservation(r.id), { status: "ISSUED", issued: 1, released: 3 });
    assert.deepEqual(await item(), { quantity: 9, reserved: 0, available: 9, issued: 1, added: 0, status: "OK" });
  });

  test("every step is written to the reservation log", async () => {
    const a = await reserve(2);
    const b = await reserve(3, "Palm Springs");
    await issue(a.id);
    await inTransaction(pool, (c) => releaseReservation(c, b.id, manager));
    const { rows } = await pool.query("SELECT action, quantity::float8 AS q FROM reservation_events ORDER BY created_at");
    assert.deepEqual(rows.map((r) => [r.action, r.q]), [["RESERVED", 2], ["RESERVED", 3], ["ISSUED", 2], ["RELEASED", 3]]);
  });
});

describe("Excel reservation import", () => {
  const HEADERS = ["Material_Code", "From", "Quantity_Requested", "Project_Name", "Purpose_Notes"];
  const upload = (rows: unknown[][], commit = true) =>
    inTransaction(pool, (c) => importReservations(c, workbook("Reservations", [HEADERS, ...rows]), { who: designer, commit }));

  test("valid rows become reservations in the database", async () => {
    const result = await upload([["finsa 116", "Factory", 3, "DAGGASH", "CLOSETS"]]);
    assert.equal(result.applied, true, JSON.stringify(result.errors));
    const { rows } = await pool.query("SELECT quantity::float8 AS quantity, project, notes, status, designer_email FROM reservations");
    assert.deepEqual(rows, [{ quantity: 3, project: "DAGGASH", notes: "CLOSETS", status: "RESERVED", designer_email: "design@test.local" }]);
  });

  test("rows in one file cannot together reserve more than is available", async () => {
    const result = await upload([
      ["FINSA 116", "Factory", 6, "Job A", ""],
      ["FINSA 116", "Factory", 6, "Job B", ""],
    ]);
    assert.equal(result.applied, false);
    assert.equal(result.errors[0].row, 3);
    assert.match(result.errors[0].message, /Insufficient available quantity/);
    const { rows } = await pool.query("SELECT COUNT(*)::int AS n FROM reservations");
    assert.equal(rows[0].n, 0, "nothing was reserved");
  });

  test("an unknown code or side is rejected", async () => {
    const result = await upload([
      ["NOPE-1", "Factory", 1, "Job", ""],
      ["FINSA 116", "Nobox", 1, "Job", ""],
      ["FINSA 116", "Warehouse", 1, "Job", ""],
    ]);
    assert.equal(result.applied, false);
    assert.deepEqual(result.errors.map((e) => e.row), [2, 3, 4]);
  });
});
