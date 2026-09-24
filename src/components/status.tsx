"use client";

import * as React from "react";
import { Factory, Store } from "lucide-react";
import { Badge } from "./ui/badge";
import { SOURCE_LABELS, type Source } from "@/lib/rbac";
import { cn } from "@/lib/utils";

export function StockStatus({ onHand, reorder }: { onHand: number; reorder: number }) {
  if (onHand <= 0) return <Badge tone="danger" dot>out of stock</Badge>;
  if (reorder > 0 && onHand <= reorder) return <Badge tone="warn" dot>low stock</Badge>;
  return <Badge tone="ok" dot>in stock</Badge>;
}

const SOURCE_ICONS = { FACTORY: Factory, NOBOX: Store } as const;

/** Factory items read amber, Nobox items read blue, everywhere in the app. */
export function SourceBadge({ source, className }: { source: Source; className?: string }) {
  const Icon = SOURCE_ICONS[source];
  return (
    <Badge tone={source === "FACTORY" ? "accent" : "info"} className={className}>
      <Icon className="h-3 w-3" />
      {SOURCE_LABELS[source]}
    </Badge>
  );
}

/** "Live · 4s ago", ticking, so a designer can trust what they are looking at. */
export function LiveIndicator({ syncedAt, error }: { syncedAt: number | null; error?: string | null }) {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const seconds = syncedAt ? Math.max(0, Math.round((now - syncedAt) / 1000)) : null;
  const stale = error || (seconds !== null && seconds > 45);
  const label =
    seconds === null ? "Connecting…" : seconds < 5 ? "Live · just now" : seconds < 60 ? `Live · ${seconds}s ago` : `Last update ${Math.round(seconds / 60)}m ago`;

  return (
    <span
      className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-[12px] font-medium text-fg-muted"
      title={error ?? "Refreshes every 10 seconds"}
    >
      <span className="relative flex h-2 w-2">
        {!stale ? <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ok opacity-60" /> : null}
        <span className={cn("relative inline-flex h-2 w-2 rounded-full", stale ? "bg-warn" : "bg-ok")} />
      </span>
      {error ? "Reconnecting…" : label}
    </span>
  );
}
