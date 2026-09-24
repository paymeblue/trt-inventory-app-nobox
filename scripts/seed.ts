import "./env";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import bcrypt from "bcryptjs";
import { Pool, type PoolClient } from "pg";
import { ensureCategory } from "../src/lib/items";
import { slugToSku } from "../src/lib/utils";

/**
 * Seeds an empty database for testing with the real materials and categories
 * from the TRT inventory workbook (Inventory_Master only: codes, names,
 * categories, specs, units, Opening_Qty and reorder settings; no people and no
 * logs). To load the workbook's reservations and issues too, use
 * `npm run db:import-workbook` instead.
 */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const USERS = [
  // email, name, role
  ["admin@trtnobox.com", "Chidi Nwosu", "ADMIN"],
  ["factory@trtnobox.com", "Tunde Balogun", "FACTORY_MANAGER"],
  ["nobox@trtnobox.com", "Adaeze Okafor", "NOBOX_MANAGER"],
  ["design@trtnobox.com", "Zainab Bello", "DESIGNER"],
] as const;

type Row = [string, string, string, string, string, string, string, number, number, number];

const title = (s: string) =>
  s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/\bPvc\b/, "PVC").replace(/\bMfc\b/, "MFC");

async function seed(client: PoolClient) {
  const already = await client.query("SELECT COUNT(*)::int AS n FROM users");
  if (already.rows[0].n > 0) {
    console.log("Database already has users — seeding would duplicate data. Run db:reset first.");
    return;
  }

  const password = await bcrypt.hash("trtnobox2026", 10);
  const ids = new Map<string, string>();
  for (const [email, name, role] of USERS) {
    const { rows } = await client.query<{ id: string }>(
      "INSERT INTO users (email, password_hash, full_name, role) VALUES ($1,$2,$3,$4) RETURNING id",
      [email, password, name, role],
    );
    ids.set(role, rows[0].id);
  }
  console.log(`  ${USERS.length} users (password: trtnobox2026)`);

  const data = JSON.parse(readFileSync(join(process.cwd(), "scripts", "data", "materials.json"), "utf8")) as { rows: Row[] };
  const used = new Set<string>();
  let count = 0;
  for (const [rawCode, name, category, subcategory, spec, dimensions, unit, opening, reorderLevel, reorderQuantity] of data.rows) {
    // As the workbook marks them: the Germana sinks are held at Nobox.
    const source = /\bnobox\b/i.test(subcategory) ? "NOBOX" : "FACTORY";
    const base = (rawCode || slugToSku(name)).toUpperCase();
    let code = base;
    for (let n = 2; used.has(`${source}|${code}`); n += 1) code = `${base}-${n}`;
    used.add(`${source}|${code}`);
    const userId = ids.get(source === "NOBOX" ? "NOBOX_MANAGER" : "FACTORY_MANAGER")!;
    const cat = await ensureCategory(client, source, category ? title(category) : null, userId);
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO items (source, sku, name, category, subcategory, spec, dimensions, unit, opening_qty, quantity,
                          reorder_level, reorder_quantity, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,$10,$11,$12,$12) RETURNING id`,
      [source, code, name, cat, subcategory || null, spec || null, dimensions || null, unit, opening,
       reorderLevel, reorderQuantity, userId],
    );
    await client.query(
      `INSERT INTO item_movements (item_id, source, kind, delta, balance_after, note, created_by)
       VALUES ($1,$2,'OPENING',$3,$3,'Opening_Qty from the inventory workbook',$4)`,
      [rows[0].id, source, opening, userId],
    );
    count += 1;
  }
  console.log(`  ${count} materials from the inventory workbook, in its categories`);
}

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await seed(client);
    await client.query("COMMIT");
    console.log("seed complete");
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
