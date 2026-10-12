import { after, before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { Pool } from "pg";
import { importStock } from "../src/lib/items";
import { buildTemplate, templateColumns, type TemplateMaterial } from "../src/lib/template";
import type { Source } from "../src/lib/rbac";
import { inTransaction, makeUser, resetSchema, testPool, workbook } from "./db";

const COLUMNS = templateColumns("FACTORY");
const HEADERS = COLUMNS.map((c) => c.header);

let pool: Pool;
let userId: string;

/** Uploads a stock sheet (to FACTORY by default) through the same code POST /api/items/import runs. */
function upload(rows: unknown[][], opts: { commit?: boolean; headers?: unknown[]; source?: Source } = {}) {
  return uploadFile(workbook("Inventory_Master", [opts.headers ?? HEADERS, ...rows]), opts);
}

function uploadFile(file: Buffer, opts: { commit?: boolean; source?: Source } = {}) {
  return inTransaction(pool, (client) =>
    importStock(client, opts.source ?? "FACTORY", file, {
      userId, userName: "Factory Manager", userEmail: "factory@test.local", filename: "test.xlsx", commit: opts.commit ?? true,
    }),
  );
}

async function items() {
  const { rows } = await pool.query<{
    sku: string; name: string; category: string | null; subcategory: string | null; spec: string | null;
    dimensions: string | null; unit: string; opening_qty: number; quantity: number; reorder_level: number;
    reorder_quantity: number;
  }>(
    `SELECT sku, name, category, subcategory, spec, dimensions, unit, opening_qty::float8 AS opening_qty,
            quantity::float8 AS quantity, reorder_level::float8 AS reorder_level, reorder_quantity::float8 AS reorder_quantity
       FROM items WHERE source = 'FACTORY' ORDER BY sku`,
  );
  return rows;
}

/** One template row: Material_Code, Material_Name, Quantity_Added, then any other column by key. */
const row = (sku: string, name: string, quantity: unknown, extra: Partial<Record<string, unknown>> = {}) =>
  COLUMNS.map((c) =>
    c.key === "sku" ? sku : c.key === "name" ? name : c.key === "quantity" ? quantity : (extra[c.key] ?? ""),
  );

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

describe("Excel stock import (Inventory_Master columns)", () => {
  test("new materials are written to the database with every column, their quantity as Opening_Qty", async () => {
    const result = await upload([
      row("FINSA 116", "LISSA OAK 18MM", 58, {
        category: "BOARDS", subcategory: "FINSA (MEASURED IN SHEETS)", spec: "18MM", unit: "Sheet", reorderLevel: 2, reorderQuantity: 4,
      }),
      row("lcqd 106", "DRAWER FACE (OFFWHITE) FLAT", 9, { dimensions: "60 X 60", unit: "Pcs" }),
    ]);
    assert.equal(result.applied, true, JSON.stringify(result.errors));

    const all = await items();
    assert.deepEqual(all[0], { sku: "FINSA 116", name: "LISSA OAK 18MM", category: all[0].category, subcategory: "FINSA (MEASURED IN SHEETS)", spec: "18MM", dimensions: null, unit: "Sheet", opening_qty: 58, quantity: 58, reorder_level: 2, reorder_quantity: 4 });
    assert.equal(all[0].category?.toLowerCase(), "boards");
    assert.deepEqual(all[1], { sku: "LCQD 106", name: "DRAWER FACE (OFFWHITE) FLAT", category: null, subcategory: null, spec: null, dimensions: "60 X 60", unit: "Pcs", opening_qty: 9, quantity: 9, reorder_level: 0, reorder_quantity: 0 });
  });

  test("on an existing material the quantity is posted as a Stock Addition with its references", async () => {
    await upload([row("FINSA 116", "LISSA OAK 18MM", 10)]);
    const result = await upload([row("FINSA 116", "", 58, { supplierRef: "Finsa Lagos", documentRef: "INV-2231" })]);
    assert.equal(result.applied, true, JSON.stringify(result.errors));

    const [item] = await items();
    assert.equal(item.opening_qty, 10, "Opening_Qty is unchanged");
    assert.equal(item.quantity, 68);
    const { rows: log } = await pool.query(
      "SELECT quantity::float8 AS quantity, supplier_ref, document_ref, recorded_by_name FROM stock_additions",
    );
    assert.deepEqual(log, [{ quantity: 58, supplier_ref: "Finsa Lagos", document_ref: "INV-2231", recorded_by_name: "Factory Manager" }]);
  });

  test("a row without a Material_Code is created with a code made from its name", async () => {
    const result = await upload([row("", "Soft Close Hinge 35mm", 100)]);
    assert.equal(result.applied, true, JSON.stringify(result.errors));
    const [item] = await items();
    assert.equal(item.sku, "SOFT-CLOSE-HINGE-35MM");
    assert.equal(item.quantity, 100);
  });

  test("a row without a Material_Code adds to the material with that name instead of duplicating it", async () => {
    await upload([row("HNG-35", "Soft Close Hinge", 100)]);
    const result = await upload([row("", "soft close hinge", 25)]);
    assert.equal(result.applied, true, JSON.stringify(result.errors));
    assert.equal(result.changes[0].action, "update");
    const all = await items();
    assert.equal(all.length, 1, "no second material was created");
    assert.equal(all[0].sku, "HNG-35");
    assert.equal(all[0].quantity, 125);
  });

  test("uploading the same code-less file twice adds stock twice, still one material", async () => {
    const file = [row("", "Brass Knob", 10)];
    await upload(file);
    await upload(file);
    const all = await items();
    assert.equal(all.length, 1);
    assert.equal(all[0].quantity, 20);
  });

  test("a generated code never collides with an existing one", async () => {
    await upload([row("BRASS-KNOB", "Something else entirely", 1)]);
    await upload([row("", "Brass Knob", 5)]);
    assert.deepEqual((await items()).map((i) => i.sku), ["BRASS-KNOB", "BRASS-KNOB-2"]);
  });

  test("blank cells on an existing material leave its details untouched", async () => {
    await upload([row("FINSA 116", "LISSA OAK 18MM", 40, { subcategory: "FINSA (MEASURED IN SHEETS)", spec: "18MM", unit: "Sheet", reorderLevel: 2 })]);
    await upload([row("FINSA 116", "", 5)]);
    const [item] = await items();
    assert.deepEqual(
      { name: item.name, subcategory: item.subcategory, spec: item.spec, unit: item.unit, reorder: item.reorder_level },
      { name: "LISSA OAK 18MM", subcategory: "FINSA (MEASURED IN SHEETS)", spec: "18MM", unit: "Sheet", reorder: 2 },
    );
    assert.equal(item.quantity, 45);
  });

  test("a row with neither Material_Code nor Material_Name is rejected and nothing is written", async () => {
    const result = await upload([row("GOOD-1", "Good", 5), row("", "", 3)]);
    assert.equal(result.applied, false);
    assert.equal(result.errors[0].row, 3);
    assert.deepEqual(await items(), []);
  });

  test("a code-less name that matches two materials asks for the code", async () => {
    await upload([row("A-1", "Handle", 1), row("A-2", "Handle", 1)]);
    const result = await upload([row("", "Handle", 5)]);
    assert.equal(result.applied, false);
    assert.match(result.errors[0].message, /Add the Material_Code/);
    assert.deepEqual((await items()).map((i) => i.quantity), [1, 1]);
  });

  test("any bad row rejects the whole file", async () => {
    await upload([row("FINSA 116", "Board", 10)]);
    const result = await upload([
      row("FINSA 116", "", 5),
      row("NEW-1", "New item", -2),
      row("FINSA 117", "Oak", "lots"),
    ]);
    assert.equal(result.applied, false);
    assert.deepEqual(result.errors.map((e) => e.row), [3, 4]);
    const all = await items();
    assert.equal(all.length, 1);
    assert.equal(all[0].quantity, 10, "the valid row was not applied either");
  });

  test("a check without commit writes nothing", async () => {
    const result = await upload([row("FINSA 116", "Board", 10)], { commit: false });
    assert.equal(result.changes.length, 1);
    assert.deepEqual(await items(), []);
  });

  test("a sheet whose headers differ from the template is rejected", async () => {
    const headers: string[] = [...HEADERS];
    headers[1] = "Item Name";
    const result = await upload([row("FINSA 116", "Board", 10)], { headers });
    assert.equal(result.applied, false);
    assert.match(result.errors[0].message, /columns the template does not: Item Name/);
    assert.deepEqual(await items(), []);
  });
});

describe("Shared codes and repeated rows", () => {
  test("one code used for several finishes and sizes makes one material each", async () => {
    const file = [
      row("YXJ-0042", "MATT GOLD", 179, { dimensions: "1 METRE" }),
      row("YXJ-0042", "ROSE GOLD", 19, { dimensions: "1 METRE" }),
      row("YXJ-0042", "MATT GOLD", 885, { dimensions: "25CM" }),
    ];
    assert.equal((await upload(file)).applied, true);
    assert.deepEqual((await items()).map((i) => [i.name, i.dimensions, i.quantity]).sort(), [
      ["MATT GOLD", "1 METRE", 179], ["MATT GOLD", "25CM", 885], ["ROSE GOLD", "1 METRE", 19],
    ]);

    // The same file again tops up each of them rather than creating more.
    const again = await upload(file);
    assert.equal(again.applied, true, JSON.stringify(again.errors));
    assert.deepEqual(again.changes.map((c) => c.action), ["update", "update", "update"]);
    assert.deepEqual((await items()).map((i) => i.quantity).sort((a, b) => a - b), [38, 358, 1770]);
  });

  test("a shared code with nothing to tell the materials apart is rejected", async () => {
    await upload([row("H001", "LED DRIVER", 1), row("H001", "LIGHT WITH PROFILE", 1)]);
    const result = await upload([row("H001", "", 5)]);
    assert.equal(result.applied, false);
    assert.match(result.errors[0].message, /2 materials match H001/);
  });

  test("a repeated row with no quantity is ignored; with a quantity it is rejected", async () => {
    const ok = await upload([row("CK 905-6", "TALL UNIT BASKET", 41, { unit: "CARTON" }), row("CK 905-6", "TALL UNIT BASKET", "")]);
    assert.equal(ok.applied, true, JSON.stringify(ok.errors));
    assert.deepEqual((await items()).map((i) => [i.quantity, i.unit]), [[41, "CARTON"]]);

    const bad = await upload([row("SV13", "PANT RACK", 3), row("SV13", "PANT RACK", 4)]);
    assert.equal(bad.applied, false);
    assert.match(bad.errors[0].message, /already on row 2/);
  });

  test("the filled-in export uploads again without creating anything", async () => {
    await upload([row("YXJ-0042", "MATT GOLD", 5, { dimensions: "25CM" }), row("YXJ-0042", "ROSE GOLD", 5), row("", "Brass Knob", 2)]);
    const { rows: materials } = await pool.query<TemplateMaterial>(
      `SELECT sku, name, category, subcategory, spec, dimensions, unit, reorder_level::float8 AS reorder_level,
              reorder_quantity::float8 AS reorder_quantity, description FROM items`,
    );
    const result = await uploadFile(buildTemplate("FACTORY", materials));
    assert.equal(result.applied, true, JSON.stringify(result.errors));
    assert.deepEqual(result.changes.map((c) => c.action), ["update", "update", "update"]);
    assert.equal((await items()).length, 3);
  });
});

describe("Nobox Lagos and Abuja", () => {
  const NOBOX = templateColumns("NOBOX").map((c) => c.header);
  const nobox = (cells: Record<string, unknown>) => NOBOX.map((h) => cells[h] ?? "");
  const stock = async () =>
    (await pool.query<{ sku: string; name: string; location: string; quantity: number }>(
      "SELECT sku, name, location, quantity::float8 AS quantity FROM items WHERE source = 'NOBOX' ORDER BY sku, name, location",
    )).rows;

  test("each store's quantity goes to that store, and the workbook's own headers are accepted", async () => {
    const headers = ["Material_Code", "Material_Name", "Category", "Subcategory", "Specification ", "Dimensions (W*D*H)MM", "Unit",
      "Quantity_Added (lag)", "Quantity_Added (Abj)", "Reorder_Level", "Reorder_Quantity", "Supplier_or_Reference", "Document_Ref", "Notes"];
    const result = await upload([
      ["SV13", "PANT RACK", "WARDROBE ACCESSORIES", "TROUSER HANGER", "", "406*430*115", "CARTON", 33, 10, "", "", "", "", ""],
      ["MG802", "MAGIC CORNER", "KITCHEN ACCESSORIES", "", "", "", "CARTON", 39, "", "", "", "", "", ""],
      ["GZ09", "ROUND HOOK", "", "", "", "", "PCS", "", "", "", "", "", "", ""],
    ], { headers, source: "NOBOX" });
    assert.equal(result.applied, true, JSON.stringify(result.errors));
    assert.deepEqual(await stock(), [
      { sku: "GZ09", name: "ROUND HOOK", location: "LAGOS", quantity: 0 },
      { sku: "MG802", name: "MAGIC CORNER", location: "LAGOS", quantity: 39 },
      { sku: "SV13", name: "PANT RACK", location: "ABUJA", quantity: 10 },
      { sku: "SV13", name: "PANT RACK", location: "LAGOS", quantity: 33 },
    ]);
  });

  test("an Abuja quantity tops up Abuja only, and a code-less row shares one code across stores", async () => {
    await upload([nobox({ Material_Code: "SV13", Material_Name: "PANT RACK", "Quantity_Added (Lagos)": 5, "Quantity_Added (Abuja)": 1 })], { headers: NOBOX, source: "NOBOX" });
    await upload([
      nobox({ Material_Code: "SV13", "Quantity_Added (Abuja)": 4 }),
      nobox({ Material_Name: "Brass Knob", "Quantity_Added (Lagos)": 2, "Quantity_Added (Abuja)": 3 }),
    ], { headers: NOBOX, source: "NOBOX" });
    assert.deepEqual((await stock()).map((s) => [s.sku, s.location, s.quantity]), [
      ["BRASS-KNOB", "ABUJA", 3], ["BRASS-KNOB", "LAGOS", 2], ["SV13", "ABUJA", 5], ["SV13", "LAGOS", 5],
    ]);
  });

  test("Nobox needs the two store columns and other sides refuse them", async () => {
    const nb = await upload([row("SV13", "PANT RACK", 1)], { source: "NOBOX" });
    assert.match(nb.errors[0].message, /split between Lagos and Abuja/);
    const factory = await upload([nobox({ Material_Code: "SV13", Material_Name: "PANT RACK" })], { headers: NOBOX });
    assert.match(factory.errors[0].message, /Only Nobox/);
  });
});
