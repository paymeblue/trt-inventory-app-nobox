import "./env";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { Pool } from "pg";
import { importStock } from "../src/lib/items";
import { isSource } from "../src/lib/rbac";

/**
 * Uploads a stock workbook to one side, exactly as Import from Excel does,
 * recorded against an existing account. Without --commit it only checks.
 *
 *   npm run db:import-stock -- "<file.xlsx>" NOBOX <account email> [--commit]
 */
const [file, source, email] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const commit = process.argv.includes("--commit");
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
const pool = new Pool({ connectionString: url, ssl: /sslmode=(require|verify)/.test(url) ? { rejectUnauthorized: false } : undefined });

async function main() {
  if (!file || !isSource(source) || !email) {
    console.error('Usage: npm run db:import-stock -- "<file.xlsx>" <FACTORY|NOBOX|READY_CABINETS|GERMANA> <account email> [--commit]');
    process.exit(1);
  }
  const client = await pool.connect();
  try {
    const { rows } = await client.query<{ id: string; full_name: string; email: string }>(
      "SELECT id, full_name, email FROM users WHERE lower(email) = lower($1)", [email],
    );
    if (!rows[0]) throw new Error(`No account ${email}`);
    await client.query("BEGIN");
    const result = await importStock(client, source, readFileSync(file), {
      userId: rows[0].id, userName: rows[0].full_name, userEmail: rows[0].email, filename: basename(file), commit,
    });
    await client.query(result.applied ? "COMMIT" : "ROLLBACK");
    for (const e of result.errors) console.log(`  row ${e.row ?? "-"} ${e.column ?? ""}: ${e.message}`);
    const created = result.changes.filter((c) => c.action === "create").length;
    console.log(`${result.applied ? "applied" : commit ? "NOT applied" : "check only"}: ${result.errors.length} problems, ${created} new, ${result.changes.length - created} updated, ${result.changes.reduce((s, c) => s + c.delta, 0)} units`);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
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
