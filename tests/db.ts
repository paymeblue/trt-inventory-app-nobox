import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Pool, type PoolClient } from "pg";
import * as XLSX from "xlsx";

/**
 * Tests run against a real, throwaway Postgres. They wipe it, so they only
 * accept a database whose name contains "test", and never read DATABASE_URL.
 */
export function testPool(): Pool {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("Set TEST_DATABASE_URL to an empty Postgres database whose name contains 'test'.");
  const name = new URL(url).pathname.slice(1);
  if (!/test/i.test(name)) throw new Error(`Refusing to wipe "${name}": the test database name must contain "test".`);
  return new Pool({ connectionString: url, ssl: /sslmode=require/.test(url) ? { rejectUnauthorized: false } : undefined });
}

/** Rebuilds the schema from scripts/sql, exactly as production gets it. */
export async function resetSchema(pool: Pool) {
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  const dir = join(process.cwd(), "scripts", "sql");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    await pool.query(readFileSync(join(dir, file), "utf8"));
  }
}

export async function makeUser(pool: Pool, email: string, role: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    "INSERT INTO users (email, password_hash, full_name, role) VALUES ($1, 'x', $1, $2) RETURNING id",
    [email, role],
  );
  return rows[0].id;
}

/** Runs `fn` in a transaction, like the API routes do, committing on success. */
export async function inTransaction<T>(pool: Pool, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/** An .xlsx file in memory, with `rows` on the named sheet. */
export function workbook(sheet: string, rows: unknown[][]): Buffer {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), sheet);
  return XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
