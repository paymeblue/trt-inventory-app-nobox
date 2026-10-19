"use client";

import * as React from "react";
import { Archive, Factory, MapPin, PenTool, ShoppingBag, Store, Warehouse } from "lucide-react";
import { Badge, type Tone } from "./ui/badge";
import { LOCATION_LABELS, RESERVED_FOR_LABELS, SOURCE_LABELS, type Location, type ReservedFor, type Source } from "@/lib/rbac";
import { cn } from "@/lib/utils";

export function StockStatus({ onHand, reorder }: { onHand: number; reorder: number }) {
  if (onHand <= 0) return <Badge tone="danger" dot>out of stock</Badge>;
  if (reorder > 0 && onHand <= reorder) return <Badge tone="warn" dot>low stock</Badge>;
  return <Badge tone="ok" dot>in stock</Badge>;
}

export const SOURCE_ICONS: Record<Source, React.ComponentType<{ className?: string }>> = {
  FACTORY: Factory, NOBOX: Store, READY_CABINETS: Archive, GERMANA: Warehouse,
};

export const SOURCE_TONES: Record<Source, Tone & ("accent" | "info" | "violet" | "teal")> = { FACTORY: "accent", NOBOX: "info", READY_CABINETS: "violet", GERMANA: "teal" };

/** Each side keeps one colour everywhere in the app: Factory amber, Nobox blue, Ready Cabinets violet, Germana teal. */
export function SourceBadge({ source, className }: { source: Source; className?: string }) {
  const Icon = SOURCE_ICONS[source];
  return (
    <Badge tone={SOURCE_TONES[source]} className={className}>
      <Icon className="h-3 w-3" />
      {SOURCE_LABELS[source]}
    </Badge>
  );
}

/** Whether the person responsible for a reservation is in Design or in Sales. Neutral, as the colours belong to the sides. */
export function ReservedForBadge({ value, className }: { value: ReservedFor | null | undefined; className?: string }) {
  if (!value) return null;
  const Icon = value === "SALES" ? ShoppingBag : PenTool;
  return (
    <Badge tone="neutral" className={className}>
      <Icon className="h-3 w-3" />
      {RESERVED_FOR_LABELS[value]}
    </Badge>
  );
}

/** The Nobox store (Lagos or Abuja) a material is held in; nothing for the other sides. */
export function LocationBadge({ location, className }: { location: Location | null | undefined; className?: string }) {
  if (!location) return null;
  return (
    <Badge tone="neutral" className={className}>
      <MapPin className="h-3 w-3" />
      {LOCATION_LABELS[location]}
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
      title={error ?? "Checks for changes every 3 seconds"}
    >
      <span className="relative flex h-2 w-2">
        {!stale ? <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ok opacity-60" /> : null}
        <span className={cn("relative inline-flex h-2 w-2 rounded-full", stale ? "bg-warn" : "bg-ok")} />
      </span>
      {error ? "Reconnecting…" : label}
    </span>
  );
}
