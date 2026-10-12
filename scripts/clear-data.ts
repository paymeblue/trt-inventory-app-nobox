import "./env";
import { Pool } from "pg";

/**
 * Empties the inventory: every material, photo, category, reservation and
 * stock log, on every side. Accounts are kept, so everyone can still sign in.
 * Reference numbers (REQ-, ISS-, ADD-, ADJ-) start again from 00001.
 *
 *   npm run db:clear-data -- --confirm
 */
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
const pool = new Pool({ connectionString: url, ssl: /sslmode=(require|verify)/.test(url) ? { rejectUnauthorized: false } : undefined });

const TABLES = [
  "reservation_events", "stock_issues", "stock_additions", "stock_adjustments", "reservations",
  "item_movements", "items", "images", "categories",
];
const SEQUENCES = ["reservation_ref_seq", "stock_issue_ref_seq", "stock_addition_ref_seq", "stock_adjustment_ref_seq"];

async function main() {
  if (!process.argv.includes("--confirm")) {
    console.error(`This deletes all inventory data in ${new URL(url!).host} (accounts are kept). Re-run with --confirm.`);
    process.exit(1);
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const table of TABLES) {
      const { rowCount } = await client.query(`DELETE FROM ${table}`);
      console.log(`  ${table}: ${rowCount} deleted`);
    }
    for (const seq of SEQUENCES) await client.query(`ALTER SEQUENCE ${seq} RESTART WITH 1`);
    const { rows } = await client.query<{ n: number }>("SELECT COUNT(*)::int AS n FROM users");
    await client.query("COMMIT");
    console.log(`inventory cleared; ${rows[0].n} accounts kept`);
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
