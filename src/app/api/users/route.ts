import bcrypt from "bcryptjs";
import { query, queryOne } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { fail, handle, ok, readJson } from "@/lib/api";
import { isRole } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  await requireAdmin();
  const rows = await query(
    `SELECT u.id, u.email, u.full_name, u.role, u.phone, u.is_active,
            u.last_login_at, u.created_at
       FROM users u
      ORDER BY u.is_active DESC, u.full_name`,
  );
  return ok({ items: rows });
});

export const POST = handle(async (req: Request) => {
  await requireAdmin();
  const b = await readJson<Record<string, string | undefined>>(req);

  const email = b.email?.trim().toLowerCase();
  const fullName = b.fullName?.trim();
  const password = b.password ?? "";
  const role = b.role ?? "DESIGNER";

  if (!email || !fullName) return fail(400, "Name and email are required.");
  if (password.length < 8) return fail(400, "Password must be at least 8 characters.");
  if (!isRole(role)) return fail(400, "Unknown role.");

  const hash = await bcrypt.hash(password, 10);
  const row = await queryOne(
    `INSERT INTO users (email, password_hash, full_name, role, phone)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [email, hash, fullName, role, b.phone ?? null],
  );
  return ok(row, { status: 201 });
});
