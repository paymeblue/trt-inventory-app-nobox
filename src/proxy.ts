import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";

/** Anyone may browse /inventory. These always need someone signed in. */
const PROTECTED = ["/reservations", "/logs", "/factory", "/nobox", "/users"];

/**
 * Verifies the session token before a page renders. A stale or tampered cookie
 * is cleared rather than trusted, so it can never bounce between /login and
 * the app. Role checks happen in each page and API route.
 *
 * Next 16 renamed the middleware convention to `proxy`.
 */
export async function proxy(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySession(token) : null;
  const { pathname, search } = req.nextUrl;

  let res: NextResponse;
  if (pathname === "/login" && session) {
    res = NextResponse.redirect(new URL("/", req.url));
  } else if (!session && PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    const url = new URL("/login", req.url);
    url.searchParams.set("next", pathname + search);
    res = NextResponse.redirect(url);
  } else {
    res = NextResponse.next();
  }

  if (token && !session) res.cookies.delete(SESSION_COOKIE);
  return res;
}

export const config = {
  matcher: [
    "/",
    "/login",
    "/inventory/:path*",
    "/reservations/:path*",
    "/logs/:path*",
    "/factory/:path*",
    "/nobox/:path*",
    "/users/:path*",
  ],
};
