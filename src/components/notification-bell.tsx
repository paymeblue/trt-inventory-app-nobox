"use client";

import * as React from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { useLiveVersion } from "@/components/items/use-items";
import { apiFetch } from "@/lib/client";
import { SOURCE_LABELS, type Source } from "@/lib/rbac";
import { cn, qty, relativeTime } from "@/lib/utils";

type Note = {
  id: string; action: "RESERVED" | "ISSUED" | "RELEASED" | "CANCELLED"; created_at: string; note: string | null;
  quantity: number; ref: string; project: string; source: Source; sku: string; item_name: string; unit: string;
  by_name: string | null; unread: boolean;
};

function describe(n: Note) {
  const what = `${qty(n.quantity)} ${n.unit} of ${n.sku} | ${n.item_name}`;
  if (n.action === "RESERVED") return `${n.by_name ?? "A designer"} reserved ${what} for ${n.project}`;
  if (n.action === "ISSUED") return `${n.ref} issued to production: ${what} for ${n.project} left ${SOURCE_LABELS[n.source]}`;
  return `${n.ref} released by ${n.by_name ?? "the inventory team"}: ${what} for ${n.project}`;
}

/**
 * The inventory team hears about new reservations on their side; designers hear
 * when their reservations are issued to production or released. Kept until read.
 */
export function NotificationBell() {
  const [data, setData] = React.useState<{ items: Note[]; unread: number } | null>(null);
  const [open, setOpen] = React.useState(false);
  const box = React.useRef<HTMLDivElement>(null);

  const load = React.useCallback(() => {
    apiFetch<{ items: Note[]; unread: number }>("/api/notifications").then(setData).catch(() => undefined);
  }, []);
  React.useEffect(load, [load]);
  useLiveVersion(load);

  React.useEffect(() => {
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && data?.unread) {
      apiFetch("/api/notifications", { method: "POST" })
        .then(() => setData((d) => (d ? { ...d, unread: 0 } : d)))
        .catch(() => undefined);
    }
  }

  const unread = data?.unread ?? 0;
  return (
    <div ref={box} className="relative">
      <button
        onClick={toggle}
        aria-label={unread ? `${unread} unread notifications` : "Notifications"}
        className="relative rounded-lg p-2 text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
      >
        <Bell className="h-5 w-5" />
        {unread ? (
          <span className="tabular absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="absolute right-0 z-40 mt-2 w-[min(380px,calc(100vw-24px))] overflow-hidden rounded-xl border border-border bg-surface shadow-[var(--shadow)]">
          <p className="border-b border-border px-4 py-2.5 text-[13px] font-semibold">Notifications</p>
          {!data?.items.length ? (
            <p className="px-4 py-6 text-center text-[13px] text-fg-muted">Nothing yet.</p>
          ) : (
            <ul className="scrollbar-thin max-h-[420px] divide-y divide-border overflow-y-auto">
              {data.items.map((n) => (
                <li key={n.id}>
                  <Link
                    href="/reservations"
                    onClick={() => setOpen(false)}
                    className={cn("block px-4 py-2.5 transition-colors hover:bg-surface-2", n.unread && "bg-accent-soft/40")}
                  >
                    <p className="text-[12.5px] leading-snug">{describe(n)}</p>
                    <p className="mt-0.5 text-[11px] text-fg-subtle">
                      {relativeTime(n.created_at)}{n.note ? ` · ${n.note}` : ""}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
