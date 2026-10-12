import "./env";
import bcrypt from "bcryptjs";
import { Pool, type PoolClient } from "pg";

/**
 * Creates the starting accounts in an empty database. It adds no materials,
 * reservations or logs: stock comes in through each side's Excel upload.
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
  ["readycabinets@trtnobox.com", "Ready Cabinets Manager", "READY_CABINETS_MANAGER"],
  ["germana@trtnobox.com", "Germana Manager", "GERMANA_MANAGER"],
  ["design@trtnobox.com", "Zainab Bello", "DESIGNER"],
] as const;

async function seed(client: PoolClient) {
  const already = await client.query("SELECT COUNT(*)::int AS n FROM users");
  if (already.rows[0].n > 0) {
    console.log("Database already has users — seeding would duplicate data. Run db:reset first.");
    return;
  }

  const password = await bcrypt.hash("trtnobox2026", 10);
  for (const [email, name, role] of USERS) {
    await client.query("INSERT INTO users (email, password_hash, full_name, role) VALUES ($1,$2,$3,$4)", [email, password, name, role]);
  }
  console.log(`  ${USERS.length} users (password: trtnobox2026)`);
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
