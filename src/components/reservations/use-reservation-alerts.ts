"use client";

import * as React from "react";
import { useToast } from "@/components/ui/toast";
import { useSession } from "@/components/session-context";
import { apiFetch } from "@/lib/client";
import { SOURCE_LABELS, type Source } from "@/lib/rbac";
import { qty } from "@/lib/utils";

type Event = {
  id: string; action: "RESERVED" | "ISSUED" | "CANCELLED" | "RELEASED"; cursor: string; ref: string; source: Source;
  quantity: number; project: string; reserved_by: string | null; item_name: string; unit: string;
  by_name: string | null; created_by: string | null;
};

/**
 * Live reservation notices for the signed-in person:
 * - someone else reserved stock (so two designers know they are after the same thing),
 * - one of their own reservations was issued or released,
 * - with `source`, any new reservation on that side (for the manager who must issue it).
 */
export function useReservationAlerts(syncedAt: number | null, source?: Source) {
  const me = useSession();
  const toast = useToast();
  const since = React.useRef<string | null>(null);
  const busy = React.useRef(false);

  React.useEffect(() => {
    if (!me || !syncedAt || busy.current) return;
    busy.current = true;

    const run = async () => {
      if (since.current === null) {
        const { items } = await apiFetch<{ items: Event[] }>("/api/reservations/events");
        since.current = items[0]?.cursor ?? new Date(0).toISOString();
        return;
      }
      const { items } = await apiFetch<{ items: Event[] }>(`/api/reservations/events?since=${encodeURIComponent(since.current)}`);
      if (!items.length) return;
      since.current = items[items.length - 1].cursor;

      for (const e of items) {
        if (e.created_by === me.sub) continue;
        const what = `${qty(e.quantity)} ${e.unit} of ${e.item_name}`;
        if (e.action === "RESERVED" && (!source || e.source === source)) {
          toast(`${e.by_name ?? "Someone"} reserved ${what} (${SOURCE_LABELS[e.source]}) for ${e.project}.`, "info");
        } else if (e.reserved_by === me.sub && e.action === "ISSUED") {
          toast(`${e.ref} issued: ${what} for ${e.project} has left ${SOURCE_LABELS[e.source]}.`, "info");
        } else if (e.reserved_by === me.sub && (e.action === "RELEASED" || e.action === "CANCELLED")) {
          toast(`${e.ref} was released by ${e.by_name ?? "the inventory team"}: ${what} for ${e.project} is no longer reserved.`, "info");
        }
      }
    };

    run()
      .catch(() => undefined)
      .finally(() => {
        busy.current = false;
      });
  }, [syncedAt, me, source, toast]);
}
