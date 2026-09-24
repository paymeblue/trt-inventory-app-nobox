"use client";

import * as React from "react";
import { apiFetch, toQuery } from "@/lib/client";
import type { Source } from "@/lib/rbac";

export type Item = {
  id: string;
  source: Source;
  sku: string;
  name: string;
  category: string | null;
  colour: string | null;
  spec: string | null;
  unit: string;
  quantity: number;
  reorder_level: number;
  description: string | null;
  image_id: string | null;
  created_at: string;
  updated_at: string;
  updated_by_name: string | null;
};

export type ItemsResponse = {
  items: Item[];
  total: number;
  categories: string[];
  counts: { factory: number; nobox: number; low: number; out: number };
  page: number;
  pageSize: number;
};

export const LIVE_INTERVAL_MS = 10_000;

/**
 * Fetches a page of items and keeps it fresh: re-polls every ten seconds while
 * the tab is visible, and immediately when the tab regains focus. Items whose
 * quantity moved since the previous poll are reported in `changed` for a few
 * seconds so the screen can draw attention to them.
 */
export function useItems(params: Record<string, string | number | undefined | null>) {
  const qs = toQuery(params);
  const [data, setData] = React.useState<ItemsResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [syncedAt, setSyncedAt] = React.useState<number | null>(null);
  const [changed, setChanged] = React.useState<Set<string>>(new Set());

  const previous = React.useRef(new Map<string, number>());
  const generation = React.useRef(0);

  const load = React.useCallback(
    async (quiet = false) => {
      const id = ++generation.current;
      if (!quiet) setLoading(true);
      try {
        const next = await apiFetch<ItemsResponse>(`/api/items${qs}`);
        if (generation.current !== id) return;

        if (quiet) {
          const moved = new Set<string>();
          for (const item of next.items) {
            const before = previous.current.get(item.id);
            if (before !== undefined && before !== item.quantity) moved.add(item.id);
          }
          if (moved.size) setChanged(moved);
        }
        previous.current = new Map(next.items.map((i) => [i.id, i.quantity]));

        setData(next);
        setError(null);
        setSyncedAt(Date.now());
      } catch (err) {
        if (generation.current === id) setError(err instanceof Error ? err.message : "Could not load items");
      } finally {
        if (generation.current === id) setLoading(false);
      }
    },
    [qs],
  );

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") void load(true);
    };
    const timer = setInterval(tick, LIVE_INTERVAL_MS);
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [load]);

  React.useEffect(() => {
    if (!changed.size) return;
    const t = setTimeout(() => setChanged(new Set()), 3000);
    return () => clearTimeout(t);
  }, [changed]);

  return { data, loading, error, syncedAt, changed, reload: load };
}
