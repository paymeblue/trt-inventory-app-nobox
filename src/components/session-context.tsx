"use client";

import * as React from "react";
import type { Role } from "@/lib/rbac";

export type ClientSession = { sub: string; name: string; email: string; role: Role };

const SessionContext = React.createContext<ClientSession | null>(null);

export function SessionProvider({ value, children }: { value: ClientSession; children: React.ReactNode }) {
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): ClientSession {
  const ctx = React.useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside SessionProvider");
  return ctx;
}
