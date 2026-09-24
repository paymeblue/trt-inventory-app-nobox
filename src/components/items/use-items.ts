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
  subcategory: string | null;
  colour: string | null;
  spec: string | null;
  dimensions: string | null;
  unit: string;
  opening_qty: number;
  /** Posted Stock Additions. */
  added: number;
  /** Posted issues, plus the Issued impact of adjustments. */
  issued: number;
  reorder_quantity: number;
  /** Set aside as damaged or faulty; not usable stock. */
  bad_qty: number;
  /** OK, LOW, REORDER NOW or OUT OF STOCK, as the workbook computes it. */
  reorder_status: "OK" | "LOW" | "REORDER NOW" | "OUT OF STOCK";
  /** Physically in stock. */
  quantity: number;
  /** Set aside by open reservations. */
  reserved: number;
  /** In stock minus reserved: what can still be reserved. */
  available: number;
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
  counts: { factory: number; nobox: number; low: number; reorder: number; out: number; reserved: number };
  page: number;
  pageSize: number;
};

export const LIVE_INTERVAL_MS = 3_000;

/** Reservations change what is available without changing stock, so both count as a change. */
const stockKey = (i: Item) => `${i.quantity}|${i.reserved}`;

/**
 * Calls `onChange` whenever anything in the inventory or its reservations
 * changes. Checks a cheap fingerprint every few seconds while the tab is
 * visible, and calls `onChange` straight away when the tab regains focus.
 * Returns when the server was last reached, for the "Live" badge.
 */
export function useLiveVersion(onChange: () => void): number | null {
  const [checkedAt, setCheckedAt] = React.useState<number | null>(null);
  const version = React.useRef<string | null>(null);
  const latest = React.useRef(onChange);
  React.useEffect(() => {
    latest.current = onChange;
  }, [onChange]);

  React.useEffect(() => {
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const { version: v } = await apiFetch<{ version: string }>("/api/items/version");
        if (version.current !== null && v !== version.current) latest.current();
        version.current = v;
        setCheckedAt(Date.now());
      } catch {
        // A missed check is retried on the next tick.
      }
    };
    void tick();
    const timer = setInterval(tick, LIVE_INTERVAL_MS);
    const onFocus = () => {
      if (document.visibilityState === "visible") latest.current();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, []);

  return checkedAt;
}

/**
 * Fetches a page of items and keeps it fresh. Every few seconds while the tab
 * is visible (and at once when it regains focus) it checks a cheap version
 * fingerprint, and re-fetches the list only when something changed. Items that
 * are new or whose quantity moved are reported in `changed` for a few seconds
 * so the screen can draw attention to them.
 */
export function useItems(params: Record<string, string | number | undefined | null>) {
  const qs = toQuery(params);
  const [data, setData] = React.useState<ItemsResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [syncedAt, setSyncedAt] = React.useState<number | null>(null);
  const [changed, setChanged] = React.useState<Set<string>>(new Set());

  const previous = React.useRef(new Map<string, string>());
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
            if (before === undefined || before !== stockKey(item)) moved.add(item.id);
          }
          if (moved.size) setChanged(moved);
        }
        previous.current = new Map(next.items.map((i) => [i.id, stockKey(i)]));

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

  const checkedAt = useLiveVersion(React.useCallback(() => void load(true), [load]));

  React.useEffect(() => {
    if (!changed.size) return;
    const t = setTimeout(() => setChanged(new Set()), 3000);
    return () => clearTimeout(t);
  }, [changed]);

  return {
    data,
    loading,
    error,
    /** When the list itself was last fetched. */
    syncedAt,
    /** When the server was last asked whether anything changed. */
    liveAt: checkedAt ?? syncedAt,
    changed,
    reload: load,
  };
}
