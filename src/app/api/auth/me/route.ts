import { queryOne } from "@/lib/db";
import { getSession } from "@/lib/session";
import { fail, handle, ok } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  const session = await getSession();
  if (!session) return fail(401, "Not signed in");

  const user = await queryOne(
    `SELECT id, email, full_name, role, phone, is_active, last_login_at
       FROM users WHERE id = $1`,
    [session.sub],
  );
  if (!user) return fail(401, "Session no longer valid");
  return ok({ user });
});
