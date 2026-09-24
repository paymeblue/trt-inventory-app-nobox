"use client";

import * as React from "react";
import { useLiveVersion } from "@/components/items/use-items";
import { useDeductionAlerts } from "@/components/items/use-deduction-alerts";
import { useReservationAlerts } from "@/components/reservations/use-reservation-alerts";
import type { Role } from "@/lib/rbac";

/**
 * Live pop-ups on every page: stock deductions for everyone, and reservation
 * news for whoever is signed in (a side's team hears about that side's new
 * reservations; designers about their own being issued or released).
 */
export function LiveAlerts({ role }: { role: Role | null }) {
  const [tick, setTick] = React.useState<number | null>(null);
  const bump = React.useCallback(() => setTick(Date.now()), []);
  useLiveVersion(bump);
  React.useEffect(bump, [bump]);

  useDeductionAlerts(tick);
  useReservationAlerts(tick, role === "FACTORY_MANAGER" ? "FACTORY" : role === "NOBOX_MANAGER" ? "NOBOX" : undefined);
  return null;
}
