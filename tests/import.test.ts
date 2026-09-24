import { after, before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { Pool } from "pg";
import { importStock } from "../src/lib/items";
import { TEMPLATE_COLUMNS } from "../src/lib/template";
import { inTransaction, makeUser, resetSchema, testPool, workbook } from "./db";

const HEADERS = TEMPLATE_COLUMNS.map((c) => c.header);

let pool: Pool;
let userId: string;

/** Uploads a stock sheet to FACTORY through the same code POST /api/items/import runs. */
function upload(rows: unknown[][], opts: { commit?: boolean; headers?: unknown[] } = {}) {
  const file = workbook("Items", [opts.headers ?? HEADERS, ...rows]);
  return inTransaction(pool, (client) =>
    importStock(client, "FACTORY", file, { userId, filename: "test.xlsx", commit: opts.commit ?? true }),
  );
}

async function items() {
  const { rows } = await pool.query<{
    sku: string; name: string; category: string | null; colour: string | null; spec: string | null;
    unit: string; quantity: number; reorder_level: number; description: string | null;
  }>(
    `SELECT sku, name, category, colour, spec, unit, quantity::float8 AS quantity,
            reorder_level::float8 AS reorder_level, description
       FROM items WHERE source = 'FACTORY' ORDER BY sku`,
  );
  return rows;
}

const row = (sku: string, name: string, quantity: unknown, extra: Partial<Record<string, unknown>> = {}) => [
  sku, name, extra.category ?? "", extra.colour ?? "", extra.spec ?? "", extra.unit ?? "",
  quantity, extra.reorder ?? "", extra.description ?? "",
];

before(async () => {
  pool = testPool();
});

beforeEach(async () => {
  await resetSchema(pool);
  userId = await makeUser(pool, "factory@test.local", "FACTORY_MANAGER");
});

after(async () => {
  await pool.end();
});

describe("Excel stock import", () => {
  test("rows with a SKU are written to the database with every column", async () => {
    const result = await upload([
      row("MEL-18-WHT", "18mm White Melamine", 40, { category: "Boards", colour: "White", spec: "18mm", unit: "sheet", reorder: 10, description: "Gloss" }),
      row("hnd-160", "160mm Handle", 12),
    ]);
    assert.equal(result.applied, true, JSON.stringify(result.errors));

    assert.deepEqual(await items(), [
      { sku: "HND-160", name: "160mm Handle", category: null, colour: null, spec: null, unit: "pcs", quantity: 12, reorder_level: 0, description: null },
      { sku: "MEL-18-WHT", name: "18mm White Melamine", category: "Boards", colour: "White", spec: "18mm", unit: "sheet", quantity: 40, reorder_level: 10, description: "Gloss" },
    ]);

    const { rows: log } = await pool.query("SELECT kind, delta::float8 AS delta FROM item_movements ORDER BY delta");
    assert.deepEqual(log, [{ kind: "IMPORT", delta: 12 }, { kind: "IMPORT", delta: 40 }]);
    const { rows: cats } = await pool.query("SELECT name FROM categories WHERE source = 'FACTORY' AND name = 'Boards'");
    assert.equal(cats.length, 1, "a category named in the file exists afterwards");
  });

  test("a row without a SKU is created with a code made from its name", async () => {
    const result = await upload([row("", "Soft Close Hinge 35mm", 100)]);
    assert.equal(result.applied, true, JSON.stringify(result.errors));
    const [item] = await items();
    assert.equal(item.sku, "SOFT-CLOSE-HINGE-35MM");
    assert.equal(item.name, "Soft Close Hinge 35mm");
    assert.equal(item.quantity, 100);
  });

  test("a row without a SKU adds to the item with that name instead of duplicating it", async () => {
    await upload([row("HNG-35", "Soft Close Hinge", 100)]);
    const result = await upload([row("", "soft close hinge", 25)]);
    assert.equal(result.applied, true, JSON.stringify(result.errors));
    assert.equal(result.changes[0].action, "update");

    const all = await items();
    assert.equal(all.length, 1, "no second item was created");
    assert.equal(all[0].sku, "HNG-35", "the existing SKU is kept");
    assert.equal(all[0].quantity, 125);
  });

  test("uploading the same SKU-less file twice adds stock twice, still one item", async () => {
    const file = [row("", "Brass Knob", 10)];
    await upload(file);
    await upload(file);
    const all = await items();
    assert.equal(all.length, 1);
    assert.equal(all[0].quantity, 20);
  });

  test("a generated SKU never collides with an existing one", async () => {
    await upload([row("BRASS-KNOB", "Something else entirely", 1)]);
    await upload([row("", "Brass Knob", 5)]);
    const skus = (await items()).map((i) => i.sku);
    assert.deepEqual(skus, ["BRASS-KNOB", "BRASS-KNOB-2"]);
  });

  test("blank cells on an existing item leave its details untouched", async () => {
    await upload([row("MEL-18-WHT", "18mm White Melamine", 40, { category: "Boards", colour: "White", spec: "18mm", unit: "sheet", reorder: 10 })]);
    await upload([row("MEL-18-WHT", "", 5)]);
    const [item] = await items();
    assert.deepEqual(
      { name: item.name, category: item.category, colour: item.colour, spec: item.spec, unit: item.unit, reorder: item.reorder_level },
      { name: "18mm White Melamine", category: "Boards", colour: "White", spec: "18mm", unit: "sheet", reorder: 10 },
    );
    assert.equal(item.quantity, 45);
  });

  test("a row with neither SKU nor Name is rejected and nothing is written", async () => {
    const result = await upload([row("GOOD-1", "Good", 5), row("", "", 3)]);
    assert.equal(result.applied, false);
    assert.equal(result.errors[0].row, 3);
    assert.deepEqual(await items(), []);
  });

  test("a SKU-less name that matches two items asks for the SKU", async () => {
    await upload([row("A-1", "Handle", 1), row("A-2", "Handle", 1)]);
    const result = await upload([row("", "Handle", 5)]);
    assert.equal(result.applied, false);
    assert.match(result.errors[0].message, /Add the SKU/);
    assert.deepEqual((await items()).map((i) => i.quantity), [1, 1]);
  });

  test("any bad row rejects the whole file", async () => {
    await upload([row("MEL-18-WHT", "Board", 10)]);
    const result = await upload([
      row("MEL-18-WHT", "", 5),
      row("NEW-1", "New item", -2),
      row("MEL-18-OAK", "Oak", "lots"),
    ]);
    assert.equal(result.applied, false);
    assert.deepEqual(result.errors.map((e) => e.row), [3, 4]);
    const all = await items();
    assert.equal(all.length, 1);
    assert.equal(all[0].quantity, 10, "the valid row was not applied either");
  });

  test("stock can never go below zero", async () => {
    await upload([row("MEL-18-WHT", "Board", 10)]);
    const result = await upload([row("MEL-18-WHT", "", -11)]);
    assert.equal(result.applied, false);
    assert.equal((await items())[0].quantity, 10);
  });

  test("a check without commit writes nothing", async () => {
    const result = await upload([row("MEL-18-WHT", "Board", 10)], { commit: false });
    assert.equal(result.changes.length, 1);
    assert.deepEqual(await items(), []);
  });

  test("a sheet whose headers differ from the template is rejected", async () => {
    const headers: string[] = [...HEADERS];
    headers[1] = "Item Name";
    const result = await upload([row("MEL-18-WHT", "Board", 10)], { headers });
    assert.equal(result.applied, false);
    assert.match(result.errors[0].message, /must be exactly/);
    assert.deepEqual(await items(), []);
  });
});
