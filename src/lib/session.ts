import { cookies } from "next/headers";
import { cache } from "react";
import { SESSION_COOKIE, verifySession, type SessionPayload } from "./auth";
import { can, type Permission } from "./rbac";

/** Reads and verifies the JWT session cookie. Memoised per request. */
export const getSession = cache(async (): Promise<SessionPayload | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySession(token);
});

export async function requireSession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) throw new HttpError(401, "Not signed in");
  return session;
}

export async function requirePermission(permission: Permission): Promise<SessionPayload> {
  const session = await requireSession();
  if (!can(session.role, permission)) {
    throw new HttpError(403, "Your role does not allow this action");
  }
  return session;
}

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
