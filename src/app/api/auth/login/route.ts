import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { queryOne, query } from "@/lib/db";
import { signSession, sessionCookieOptions, SESSION_COOKIE } from "@/lib/auth";
import { fail, handle, readJson } from "@/lib/api";
import type { Role } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = { email?: string; password?: string };

export const POST = handle(async (req: Request) => {
  const { email, password } = await readJson<Body>(req);
  if (!email || !password) return fail(400, "Email and password are required.");

  const user = await queryOne<{
    id: string;
    email: string;
    full_name: string;
    role: Role;
    password_hash: string;
    is_active: boolean;
  }>(
    `SELECT id, email, full_name, role, password_hash, is_active
       FROM users WHERE lower(email) = lower($1)`,
    [email.trim()],
  );

  // Same message either way so the form cannot be used to enumerate accounts.
  if (!user) return fail(401, "Incorrect email or password.");
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return fail(401, "Incorrect email or password.");
  if (!user.is_active) return fail(403, "This account has been deactivated. Contact an administrator.");

  const token = await signSession({
    sub: user.id,
    email: user.email,
    name: user.full_name,
    role: user.role,
  });

  await query("UPDATE users SET last_login_at = now() WHERE id = $1", [user.id]);

  const res = NextResponse.json({
    user: { id: user.id, email: user.email, name: user.full_name, role: user.role },
  });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
  return res;
});
