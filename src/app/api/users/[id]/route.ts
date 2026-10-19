import bcrypt from "bcryptjs";
import { queryOne, transaction } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { fail, handle, ok, readJson } from "@/lib/api";
import { hasCompany, isRole, isSource, SOURCE_LIST } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const session = await requireAdmin();
  const { id } = await ctx.params;
  const b = await readJson<Record<string, string | boolean | undefined>>(req);

  if (b.role && !isRole(String(b.role))) return fail(400, "Unknown role.");

  // Guard against an admin locking themselves out of the system.
  if (id === session.sub && b.isActive === false) {
    return fail(400, "You cannot deactivate your own account.");
  }
  if (id === session.sub && b.role && b.role !== "ADMIN") {
    return fail(400, "You cannot remove your own administrator role.");
  }

  // The company follows the role: kept or changed for Designers and Sales, cleared for everyone else.
  const current = await queryOne<{ role: string; company: string | null }>("SELECT role, company FROM users WHERE id = $1", [id]);
  if (!current) return fail(404, "User not found.");
  const role = String(b.role ?? current.role);
  const company = !hasCompany(role) ? null : "company" in b ? (b.company ? String(b.company) : null) : current.company;
  if (company !== null && !isSource(company)) return fail(400, `Choose ${SOURCE_LIST}.`);
  if (role === "SALES" && !company) return fail(400, `Choose the company this sales person works for: ${SOURCE_LIST}.`);

  const passwordHash = b.password ? await bcrypt.hash(String(b.password), 10) : null;

  const row = await queryOne(
    `UPDATE users SET
       full_name = COALESCE($1, full_name),
       role = COALESCE($2, role),
       phone = COALESCE($3, phone),
       is_active = COALESCE($4, is_active),
       password_hash = COALESCE($5, password_hash),
       job_title = CASE WHEN $7 THEN NULLIF($8, '') ELSE job_title END,
       company = $9,
       updated_at = now()
     WHERE id = $6 RETURNING id`,
    [b.fullName ?? null, b.role ?? null, b.phone ?? null, b.isActive ?? null, passwordHash, id,
     "jobTitle" in b, String(b.jobTitle ?? "").trim(), company],
  );
  if (!row) return fail(404, "User not found.");
  return ok(row);
});

/**
 * Deletes an account for good. Its reservations keep the designer's name and
 * email, and every log keeps who did what, so history reads the same.
 */
export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  const session = await requireAdmin();
  const { id } = await ctx.params;
  if (!UUID.test(id)) return fail(404, "User not found.");
  if (id === session.sub) return fail(400, "You cannot delete your own account.");

  const user = await queryOne<{ role: string; full_name: string }>("SELECT role, full_name FROM users WHERE id = $1", [id]);
  if (!user) return fail(404, "User not found.");
  if (user.role === "ADMIN") {
    const others = await queryOne<{ n: number }>(
      "SELECT COUNT(*)::int AS n FROM users WHERE role = 'ADMIN' AND is_active AND id <> $1", [id],
    );
    if (!others?.n) return fail(400, "This is the only active administrator. Make someone else an administrator first.");
  }

  await transaction(async (client) => {
    await client.query(
      `UPDATE reservations r SET designer_name = COALESCE(r.designer_name, u.full_name),
              designer_email = COALESCE(r.designer_email, u.email)
         FROM users u WHERE u.id = $1 AND r.reserved_by = u.id`,
      [id],
    );
    await client.query("DELETE FROM users WHERE id = $1", [id]);
  });
  return ok({ id, name: user.full_name });
});
