import { after, before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { Pool } from "pg";
import { importStock } from "../src/lib/items";
import { recalculateReorder, refreshReorderIfStale } from "../src/lib/reorder";
import { createReservation, issueReservation, type Person } from "../src/lib/reservations";
import { reservedForOf } from "../src/lib/rbac";
import { adjustStock } from "../src/lib/stock";
import { templateColumns } from "../src/lib/template";
import { inTransaction, makeUser, resetSchema, testPool, workbook } from "./db";

let pool: Pool;
let manager: Person;
let itemId: string;

async function figures() {
  const { rows } = await pool.query<{ level: number; quantity: number; level_manual: boolean; quantity_manual: boolean }>(
    `SELECT reorder_level::float8 AS level, reorder_quantity::float8 AS quantity,
            reorder_level_manual AS level_manual, reorder_quantity_manual AS quantity_manual
       FROM items WHERE id = $1`,
    [itemId],
  );
  return rows[0];
}

/** Posts an issue of `quantity` the given number of days ago, as the Stock Issue form would log it. */
async function issuedDaysAgo(quantity: number, days: number) {
  await pool.query(
    `INSERT INTO stock_issues (item_id, source, quantity, created_at) VALUES ($1, 'FACTORY', $2, now() - make_interval(days => $3))`,
    [itemId, quantity, days],
  );
}

const recalc = () => inTransaction(pool, (c) => recalculateReorder(c, { itemId }));

before(() => {
  pool = testPool();
});

beforeEach(async () => {
  await resetSchema(pool);
  manager = { id: await makeUser(pool, "factory@test.local", "FACTORY_MANAGER"), name: "Factory", email: "factory@test.local" };
  // Thirty days on record, so the usage window is 30 days.
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO items (source, sku, name, unit, opening_qty, quantity, created_at)
     VALUES ('FACTORY', 'FINSA 116', 'LISSA OAK 18MM', 'Sheet', 500, 500, now() - interval '30 days') RETURNING id`,
  );
  itemId = rows[0].id;
});

after(async () => {
  await pool.end();
});

describe("Automatic Reorder_Level and Reorder_Quantity", () => {
  test("a material nothing has been issued from needs no reorder", async () => {
    await recalc();
    assert.deepEqual(await figures(), { level: 0, quantity: 0, level_manual: false, quantity_manual: false });
  });

  test("lead-time demand plus safety stock, and days of cover, from the issues", async () => {
    // 30 issued over 30 days: 1 a day on average; 10 on three days and 0 on the rest gives σ = 3.
    await issuedDaysAgo(10, 2);
    await issuedDaysAgo(10, 9);
    await issuedDaysAgo(10, 20);
    await recalc();
    // Level: 1 × 14 + 1.65 × 3 × √14 = 32.52, rounded up. Quantity: 1 × 30.
    assert.deepEqual(await figures(), { level: 33, quantity: 30, level_manual: false, quantity_manual: false });
  });

  test("issues older than the usage window are left out", async () => {
    await pool.query("UPDATE items SET created_at = now() - interval '400 days' WHERE id = $1", [itemId]);
    await issuedDaysAgo(100, 120);
    await recalc();
    assert.equal((await figures()).level, 0);
  });

  test("a material's own lead time, and the side's settings, change the figures", async () => {
    for (const d of [1, 2, 3]) await issuedDaysAgo(10, d);
    await pool.query("UPDATE items SET lead_time_days = 7 WHERE id = $1", [itemId]);
    await recalc();
    // 1/day, σ = 3: 1 × 7 + 1.65 × 3 × √7 = 20.10.
    assert.equal((await figures()).level, 21);

    await pool.query("UPDATE side_settings SET cover_days = 60 WHERE source = 'FACTORY'");
    await inTransaction(pool, (c) => recalculateReorder(c, { source: "FACTORY" }));
    assert.equal((await figures()).quantity, 60);
  });

  test("values set by hand are kept", async () => {
    await issuedDaysAgo(30, 1);
    await pool.query("UPDATE items SET reorder_level = 5, reorder_level_manual = true WHERE id = $1", [itemId]);
    await recalc();
    const f = await figures();
    assert.equal(f.level, 5);
    assert.equal(f.quantity, 30);
  });

  test("issuing a reservation and a Return to Stock work the figures out again", async () => {
    const designer: Person = { id: await makeUser(pool, "design@test.local", "DESIGNER"), name: "D", email: "design@test.local" };
    const r = await inTransaction(pool, (c) =>
      createReservation(c, { itemId, quantity: 30, project: "DAGGASH", reservedFor: "DESIGN" }, designer));
    await inTransaction(pool, (c) => issueReservation(c, r.id, manager));
    // 30 in one day over 30 days: 1/day, σ = √29, so 14 + 1.65 × √29 × √14 = 47.25.
    assert.deepEqual(await figures(), { level: 48, quantity: 30, level_manual: false, quantity_manual: false });

    await inTransaction(pool, (c) => adjustStock(c, { itemId, type: "Return to Stock", quantity: 15, notes: "offcuts" }, manager));
    // The return is netted off the same day: 15 used over 30 days.
    assert.equal((await figures()).quantity, 15);
  });

  test("the hourly refresh runs once however many pages ask for it", async () => {
    await issuedDaysAgo(30, 1);
    await inTransaction(pool, refreshReorderIfStale);
    assert.equal((await figures()).quantity, 30);

    await issuedDaysAgo(30, 2);
    await inTransaction(pool, refreshReorderIfStale);
    assert.equal((await figures()).quantity, 30, "not stale yet, so nothing is worked out again");

    await pool.query("UPDATE side_settings SET reorder_calculated_at = now() - interval '2 hours'");
    await inTransaction(pool, refreshReorderIfStale);
    assert.equal((await figures()).quantity, 60);
  });
});

describe("Reorder columns in the stock upload", () => {
  const COLUMNS = templateColumns("FACTORY");
  const row = (extra: Record<string, unknown>) =>
    COLUMNS.map((c) => (c.key === "sku" ? "FINSA 116" : c.key === "name" ? "LISSA OAK 18MM" : (extra[c.key] ?? "")));
  const upload = (rows: unknown[][]) =>
    inTransaction(pool, (c) =>
      importStock(c, "FACTORY", workbook("Inventory_Master", [COLUMNS.map((c) => c.header), ...rows]), {
        userId: manager.id, userName: "Factory", userEmail: "factory@test.local", filename: "t.xlsx", commit: true,
      }));

  test("a number sets the value by hand, AUTO goes back to the calculation, blank keeps the setting", async () => {
    await issuedDaysAgo(30, 1);

    let result = await upload([row({ reorderLevel: 8, leadTimeDays: 21 })]);
    assert.equal(result.applied, true, JSON.stringify(result.errors));
    assert.deepEqual(await figures(), { level: 8, quantity: 30, level_manual: true, quantity_manual: false });

    result = await upload([row({})]);
    assert.equal(result.applied, true);
    assert.equal((await figures()).level_manual, true);

    result = await upload([row({ reorderLevel: "auto" })]);
    assert.equal(result.applied, true);
    const f = await figures();
    assert.equal(f.level_manual, false);
    // 1/day, σ = √29 with a 21-day lead time: 21 + 1.65 × √29 × √21 = 61.72.
    assert.equal(f.level, 62);
  });

  test("a lead time of 0 is rejected", async () => {
    const result = await upload([row({ leadTimeDays: 0 })]);
    assert.equal(result.applied, false);
    assert.equal(result.errors[0].column, "Lead_Time_Days");
  });
});

describe("Sales reservations", () => {
  test("Design or Sales comes from the role; an administrator may choose", () => {
    assert.equal(reservedForOf("DESIGNER", "SALES"), "DESIGN");
    assert.equal(reservedForOf("SALES"), "SALES");
    assert.equal(reservedForOf("ADMIN"), "DESIGN");
    assert.equal(reservedForOf("ADMIN", "SALES"), "SALES");
  });

  test("a sales reservation is recorded as Sales", async () => {
    const sales: Person = { id: await makeUser(pool, "sales@test.local", "SALES"), name: "Sales", email: "sales@test.local" };
    const r = await inTransaction(pool, (c) =>
      createReservation(c, { itemId, quantity: 2, project: "Showroom order", reservedFor: reservedForOf("SALES") }, sales));
    const { rows } = await pool.query("SELECT reserved_for, designer_name FROM reservations WHERE id = $1", [r.id]);
    assert.deepEqual(rows[0], { reserved_for: "SALES", designer_name: "Sales" });
  });
});
