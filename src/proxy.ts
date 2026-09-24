import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";

/**
 * Keeps signed-out users out of the app shell. The token is verified here, not
 * just checked for presence, so a stale or tampered cookie is cleared instead of
 * bouncing between /login and the app.
 *
 * Next 16 renamed the middleware convention to `proxy`.
 */
export async function proxy(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySession(token) : null;
  const { pathname, search } = req.nextUrl;

  if (pathname === "/login") {
    if (session) return NextResponse.redirect(new URL("/", req.url));
    const res = NextResponse.next();
    if (token) res.cookies.delete(SESSION_COOKIE);
    return res;
  }

  if (!session) {
    const url = new URL("/login", req.url);
    if (pathname !== "/") url.searchParams.set("next", pathname + search);
    const res = NextResponse.redirect(url);
    if (token) res.cookies.delete(SESSION_COOKIE);
    return res;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/inventory/:path*", "/factory/:path*", "/nobox/:path*", "/users/:path*", "/login"],
};
