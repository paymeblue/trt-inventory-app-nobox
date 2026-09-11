"use client";

import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { plural, qty } from "@/lib/utils";

const AXIS = { fontSize: 11, fill: "var(--fg-subtle)" };

function shortDay(value: string) {
  const d = new Date(value);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function TooltipCard({ active, payload, label }: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 shadow-[var(--shadow)]">
      <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-fg-subtle">
        {label ? shortDay(label) : ""}
      </p>
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-2 text-[12.5px]">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span className="text-fg-muted">{p.name}</span>
          <span className="tabular ml-auto font-medium">{qty(p.value)}</span>
        </p>
      ))}
    </div>
  );
}

export function MovementTrend({ data }: { data: { day: string; inbound: number; outbound: number }[] }) {
  return (
    <div className="h-[240px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="gIn" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--ok)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--ok)" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gOut" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="day"
            tickFormatter={shortDay}
            tick={AXIS}
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
            minTickGap={24}
          />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} width={44} />
          <Tooltip content={<TooltipCard />} cursor={{ stroke: "var(--border-strong)" }} />
          <Area
            type="monotone" dataKey="inbound" name="Received"
            stroke="var(--ok)" strokeWidth={2} fill="url(#gIn)"
          />
          <Area
            type="monotone" dataKey="outbound" name="Issued"
            stroke="var(--accent)" strokeWidth={2} fill="url(#gOut)"
          />
        </AreaChart>
      </ResponsiveContainer>
      <div className="mt-2 flex items-center justify-center gap-5 text-[12px] text-fg-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-ok" /> Received
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-accent" /> Issued
        </span>
      </div>
    </div>
  );
}

const KIND_COLOURS: Record<string, string> = {
  WAREHOUSE: "var(--accent)",
  FACTORY: "var(--info)",
  SITE: "var(--ok)",
  TRANSIT: "var(--fg-subtle)",
};

export function LocationBars({
  data,
}: {
  data: { id: string; name: string; kind: string; value: number; units: number; skus: number; company_name?: string | null }[];
}) {
  const max = Math.max(...data.map((d) => d.units), 1);
  return (
    <div className="space-y-4">
      {data.map((loc) => (
        <div key={loc.id}>
          <div className="mb-1.5 flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-[13px] font-medium">{loc.name}</span>
            <span className="tabular shrink-0 text-[12.5px] text-fg-muted">{qty(loc.units)} units</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.max(2, (loc.units / max) * 100)}%`,
                background: KIND_COLOURS[loc.kind] ?? "var(--accent)",
              }}
            />
          </div>
          <p className="tabular mt-1 text-[11px] text-fg-subtle">
            {loc.company_name ? `${loc.company_name} · ` : ""}
            {plural(loc.skus, "material")}
          </p>
        </div>
      ))}
    </div>
  );
}
