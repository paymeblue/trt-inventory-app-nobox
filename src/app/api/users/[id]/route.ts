import bcrypt from "bcryptjs";
import { queryOne } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { fail, handle, ok, readJson } from "@/lib/api";
import { isRole } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const session = await requirePermission("user:write");
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

  const passwordHash = b.password ? await bcrypt.hash(String(b.password), 10) : null;

  const row = await queryOne(
    `UPDATE users SET
       full_name = COALESCE($1, full_name),
       role = COALESCE($2, role),
       phone = COALESCE($3, phone),
       location_id = COALESCE($4, location_id),
       is_active = COALESCE($5, is_active),
       password_hash = COALESCE($6, password_hash),
       updated_at = now()
     WHERE id = $7 RETURNING id`,
    [b.fullName ?? null, b.role ?? null, b.phone ?? null, b.locationId || null,
     b.isActive ?? null, passwordHash, id],
  );
  if (!row) return fail(404, "User not found.");
  return ok(row);
});
