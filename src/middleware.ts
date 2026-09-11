import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";

/**
 * Cheap cookie-presence gate so unauthenticated users never render the shell.
 * The signature itself is verified server-side in `getSession()`.
 */
export function middleware(req: NextRequest) {
  const hasCookie = Boolean(req.cookies.get(SESSION_COOKIE)?.value);
  const { pathname, search } = req.nextUrl;

  if (pathname === "/login") {
    if (hasCookie) return NextResponse.redirect(new URL("/dashboard", req.url));
    return NextResponse.next();
  }

  if (!hasCookie) {
    const url = new URL("/login", req.url);
    if (pathname !== "/") url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/flows/:path*",
    "/runs/:path*",
    "/products/:path*",
    "/stock/:path*",
    "/movements/:path*",
    "/alerts/:path*",
    "/import/:path*",
    "/requisitions/:path*",
    "/receipts/:path*",
    "/projects/:path*",
    "/suppliers/:path*",
    "/locations/:path*",
    "/users/:path*",
    "/reports/:path*",
    "/settings/:path*",
    "/login",
  ],
};
