import { queryOne } from "@/lib/db";
import { getSession } from "@/lib/session";
import { fail, handle, ok } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  const session = await getSession();
  if (!session) return fail(401, "Not signed in");

  const user = await queryOne(
    `SELECT u.id, u.email, u.full_name, u.role, u.phone, u.is_active, u.last_login_at,
            l.name AS location_name
       FROM users u
       LEFT JOIN locations l ON l.id = u.location_id
      WHERE u.id = $1`,
    [session.sub],
  );
  if (!user) return fail(401, "Session no longer valid");
  return ok({ user });
});
