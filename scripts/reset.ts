import "./env";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  console.log("schema dropped and recreated");
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
