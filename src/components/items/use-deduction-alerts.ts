"use client";

import * as React from "react";
import { useToast } from "@/components/ui/toast";
import { apiFetch } from "@/lib/client";
import { SOURCE_LABELS, type Source } from "@/lib/rbac";
import { qty } from "@/lib/utils";

type Change = {
  id: string; source: Source; delta: number; balance_after: number;
  created_at: string; cursor: string; name: string; unit: string; note: string | null;
};

/**
 * Tells the viewer whenever stock is deducted on either side. Runs each time
 * the item list re-syncs, asking only for changes after the last one seen.
 * The starting point is the server's newest change, so clock differences
 * between the browser and the server cannot hide or repeat a notification.
 */
export function useDeductionAlerts(syncedAt: number | null) {
  const toast = useToast();
  const since = React.useRef<string | null>(null);
  const busy = React.useRef(false);

  React.useEffect(() => {
    if (!syncedAt || busy.current) return;
    busy.current = true;

    const run = async () => {
      if (since.current === null) {
        const { items } = await apiFetch<{ items: Change[] }>("/api/items/activity");
        since.current = items[0]?.cursor ?? new Date(0).toISOString();
        return;
      }

      const { items } = await apiFetch<{ items: Change[] }>(
        `/api/items/activity?since=${encodeURIComponent(since.current)}`,
      );
      if (!items.length) return;
      since.current = items[items.length - 1].cursor;

      const deductions = items.filter((c) => c.delta < 0);
      if (deductions.length > 3) {
        toast(`${deductions.length} items were just deducted. Sort by "Recently changed" to see them.`, "info");
        return;
      }
      for (const c of deductions) {
        const left = c.balance_after <= 0 ? "now out of stock" : `${qty(c.balance_after)} ${c.unit} left`;
        toast(`${SOURCE_LABELS[c.source]} deducted ${qty(-c.delta)} ${c.unit} of ${c.name} · ${left}`, "info");
      }
    };

    run()
      .catch(() => undefined)
      .finally(() => {
        busy.current = false;
      });
  }, [syncedAt, toast]);
}
