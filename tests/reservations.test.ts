import { after, before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { Pool } from "pg";
import { adjustQuantity } from "../src/lib/items";
import { cancelReservation, createReservation, issueReservation } from "../src/lib/reservations";
import { importReservations } from "../src/lib/reservation-template";
import { inTransaction, makeUser, resetSchema, testPool, workbook } from "./db";

let pool: Pool;
let designer: string;
let manager: string;
let itemId: string;

async function stock() {
  const { rows } = await pool.query<{ quantity: number; reserved: number }>(
    `SELECT i.quantity::float8 AS quantity,
            COALESCE((SELECT SUM(quantity) FROM reservations r WHERE r.item_id = i.id AND r.status = 'RESERVED'), 0)::float8 AS reserved
       FROM items i WHERE i.id = $1`,
    [itemId],
  );
  return rows[0];
}

const reserve = (quantity: number, project = "Ikoyi Kitchen") =>
  inTransaction(pool, (c) => createReservation(c, { itemId, quantity, project }, designer));

before(() => {
  pool = testPool();
});

beforeEach(async () => {
  await resetSchema(pool);
  designer = await makeUser(pool, "design@test.local", "DESIGNER");
  manager = await makeUser(pool, "factory@test.local", "FACTORY_MANAGER");
  const { rows } = await pool.query<{ id: string }>(
    "INSERT INTO items (source, sku, name, unit, quantity) VALUES ('FACTORY', 'MEL-18-WHT', 'White Board', 'sheet', 10) RETURNING id",
  );
  itemId = rows[0].id;
});

after(async () => {
  await pool.end();
});

describe("reservations and issuance", () => {
  test("reserving sets stock aside without deducting it", async () => {
    await reserve(4);
    assert.deepEqual(await stock(), { quantity: 10, reserved: 4 });
  });

  test("cannot reserve more than is available", async () => {
    await reserve(8);
    await assert.rejects(reserve(3), /Only 2 sheet of White Board available/);
    assert.deepEqual(await stock(), { quantity: 10, reserved: 8 });
  });

  test("issuing deducts the reserved quantity and completes the reservation", async () => {
    const r = await reserve(4);
    await inTransaction(pool, (c) => issueReservation(c, r.id, manager, "sent to production"));
    assert.deepEqual(await stock(), { quantity: 6, reserved: 0 });
    const { rows } = await pool.query("SELECT status FROM reservations WHERE id = $1", [r.id]);
    assert.equal(rows[0].status, "ISSUED");
    const { rows: log } = await pool.query("SELECT kind, delta::float8 AS delta FROM item_movements WHERE kind = 'ISSUE'");
    assert.deepEqual(log, [{ kind: "ISSUE", delta: -4 }]);
  });

  test("issuing is refused when the stock is not physically there", async () => {
    const r = await reserve(8);
    // Stock written off directly, bypassing the app's checks (a miscount, say).
    await pool.query("UPDATE items SET quantity = 5 WHERE id = $1", [itemId]);
    await assert.rejects(
      inTransaction(pool, (c) => issueReservation(c, r.id, manager)),
      /Only 5 sheet of White Board in stock; RES-\d+ needs 8/,
    );
    const { rows } = await pool.query("SELECT status FROM reservations WHERE id = $1", [r.id]);
    assert.equal(rows[0].status, "RESERVED", "the reservation is still open");
    assert.equal((await stock()).quantity, 5, "nothing was deducted");
  });

  test("a reservation can only be issued once", async () => {
    const r = await reserve(2);
    await inTransaction(pool, (c) => issueReservation(c, r.id, manager));
    await assert.rejects(inTransaction(pool, (c) => issueReservation(c, r.id, manager)), /already issued/);
    assert.equal((await stock()).quantity, 8);
  });

  test("cancelling releases the stock and deducts nothing", async () => {
    const r = await reserve(4);
    await inTransaction(pool, (c) => cancelReservation(c, r.id, designer));
    assert.deepEqual(await stock(), { quantity: 10, reserved: 0 });
  });

  test("a manual deduction cannot eat into reserved stock", async () => {
    await reserve(7);
    await assert.rejects(
      inTransaction(pool, (c) => adjustQuantity(c, itemId, -4, { kind: "ADJUST", userId: manager })),
      /7 of White Board are reserved, so only 3 can be deducted/,
    );
    await inTransaction(pool, (c) => adjustQuantity(c, itemId, -3, { kind: "ADJUST", userId: manager }));
    assert.deepEqual(await stock(), { quantity: 7, reserved: 7 });
  });

  test("every step is written to the reservation log", async () => {
    const a = await reserve(2);
    const b = await reserve(3, "Palm Springs");
    await inTransaction(pool, (c) => issueReservation(c, a.id, manager));
    await inTransaction(pool, (c) => cancelReservation(c, b.id, manager));
    const { rows } = await pool.query("SELECT action FROM reservation_events ORDER BY created_at");
    assert.deepEqual(rows.map((r) => r.action), ["RESERVED", "RESERVED", "ISSUED", "CANCELLED"]);
  });
});

describe("Excel reservation import", () => {
  const HEADERS = ["SKU", "From", "Quantity", "Project", "Notes"];
  const upload = (rows: unknown[][], commit = true) =>
    inTransaction(pool, (c) => importReservations(c, workbook("Reservations", [HEADERS, ...rows]), { userId: designer, commit }));

  test("valid rows become reservations in the database", async () => {
    const result = await upload([["mel-18-wht", "Factory", 3, "Ikoyi Kitchen", "island"]]);
    assert.equal(result.applied, true, JSON.stringify(result.errors));
    const { rows } = await pool.query("SELECT quantity::float8 AS quantity, project, notes, status, reserved_by FROM reservations");
    assert.deepEqual(rows, [{ quantity: 3, project: "Ikoyi Kitchen", notes: "island", status: "RESERVED", reserved_by: designer }]);
  });

  test("rows in one file cannot together reserve more than is available", async () => {
    const result = await upload([
      ["MEL-18-WHT", "Factory", 6, "Job A", ""],
      ["MEL-18-WHT", "Factory", 6, "Job B", ""],
    ]);
    assert.equal(result.applied, false);
    assert.equal(result.errors[0].row, 3);
    const { rows } = await pool.query("SELECT COUNT(*)::int AS n FROM reservations");
    assert.equal(rows[0].n, 0, "nothing was reserved");
  });

  test("an unknown SKU or side is rejected", async () => {
    const result = await upload([
      ["NOPE-1", "Factory", 1, "Job", ""],
      ["MEL-18-WHT", "Nobox", 1, "Job", ""],
      ["MEL-18-WHT", "Warehouse", 1, "Job", ""],
    ]);
    assert.equal(result.applied, false);
    assert.deepEqual(result.errors.map((e) => e.row), [2, 3, 4]);
  });
});
