import bcrypt from "bcryptjs";
import { query, queryOne } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { fail, handle, ok, readJson } from "@/lib/api";
import { hasCompany, isRole, isSource, SOURCE_LIST } from "@/lib/rbac";
import { isValidEmail } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  await requireAdmin();
  const rows = await query(
    `SELECT u.id, u.email, u.full_name, u.role, u.job_title, u.phone, u.company, u.is_active,
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
  if (!isValidEmail(email)) return fail(400, `"${email}" is not a valid email address.`);
  if (password.length < 8) return fail(400, "Password must be at least 8 characters.");
  if (!isRole(role)) return fail(400, "Unknown role.");
  const company = hasCompany(role) && b.company ? b.company : null;
  if (company !== null && !isSource(company)) return fail(400, `Choose ${SOURCE_LIST}.`);
  if (role === "SALES" && !company) return fail(400, `Choose the company this sales person works for: ${SOURCE_LIST}.`);

  const hash = await bcrypt.hash(password, 10);
  const row = await queryOne(
    `INSERT INTO users (email, password_hash, full_name, role, phone, job_title, company)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [email, hash, fullName, role, b.phone ?? null, b.jobTitle?.trim() || null, company],
  );
  return ok(row, { status: 201 });
});
