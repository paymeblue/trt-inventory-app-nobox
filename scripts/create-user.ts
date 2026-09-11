import "./env";
import bcrypt from "bcryptjs";
import { Pool } from "pg";
import { ROLES } from "../src/lib/rbac";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

/**
 * Creates or updates one account from the command line. Useful for bootstrapping
 * the first administrator on a fresh database, and for resetting a password when
 * nobody can sign in to do it through the UI.
 *
 *   npm run db:user -- <email> <password> "<full name>" [ROLE] [LOCATION_CODE]
 */
async function main() {
  const [email, password, fullName, role = "ADMIN", locationCode] = process.argv.slice(2);

  if (!email || !password || !fullName) {
    console.error(
      'Usage: npm run db:user -- <email> <password> "<full name>" [ROLE] [LOCATION_CODE]\n' +
        `Roles: ${ROLES.join(", ")}`,
    );
    process.exit(1);
  }
  if (!(ROLES as readonly string[]).includes(role)) {
    console.error(`Unknown role "${role}". Choose one of: ${ROLES.join(", ")}`);
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("Password must be at least 8 characters.");
    process.exit(1);
  }

  let locationId: string | null = null;
  if (locationCode) {
    const { rows } = await pool.query<{ id: string }>(
      "SELECT id FROM locations WHERE upper(code) = upper($1)",
      [locationCode],
    );
    if (!rows[0]) {
      console.error(`No location with code "${locationCode}".`);
      process.exit(1);
    }
    locationId = rows[0].id;
  }

  const hash = await bcrypt.hash(password, 10);
  const { rows } = await pool.query<{ id: string; created: boolean }>(
    `INSERT INTO users (email, password_hash, full_name, role, location_id)
          VALUES (lower($1), $2, $3, $4, $5)
     ON CONFLICT (email) DO UPDATE
        SET password_hash = EXCLUDED.password_hash,
            full_name     = EXCLUDED.full_name,
            role          = EXCLUDED.role,
            location_id   = COALESCE(EXCLUDED.location_id, users.location_id),
            is_active     = true,
            updated_at    = now()
     RETURNING id, (xmax = 0) AS created`,
    [email, hash, fullName, role, locationId],
  );

  console.log(`${rows[0].created ? "Created" : "Updated"} ${email} as ${role}`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
