"use client";

import * as React from "react";
import type { Role } from "@/lib/rbac";

export type ClientSession = { sub: string; name: string; email: string; role: Role };

const SessionContext = React.createContext<ClientSession | null>(null);

export function SessionProvider({ value, children }: { value: ClientSession | null; children: React.ReactNode }) {
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/** The signed-in person, or null for a visitor browsing the inventory. */
export function useSession(): ClientSession | null {
  return React.useContext(SessionContext);
}

/** For pages that are only reachable when signed in. */
export function useRequiredSession(): ClientSession {
  const session = useSession();
  if (!session) throw new Error("This page requires a signed-in user");
  return session;
}

/** Sends the visitor to sign in, bringing them back to where they are now. */
export function signInHref(returnTo?: string): string {
  const here = returnTo ?? (typeof window === "undefined" ? "/" : window.location.pathname + window.location.search);
  return `/login?next=${encodeURIComponent(here)}`;
}
