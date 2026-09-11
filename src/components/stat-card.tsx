import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "ok" | "warn" | "danger" | "accent" | "info";

const ICON_TONES: Record<Tone, string> = {
  neutral: "bg-surface-2 text-fg-muted",
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  danger: "bg-danger-soft text-danger",
  accent: "bg-accent-soft text-accent",
  info: "bg-info-soft text-info",
};

export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  tone = "neutral",
  href,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: Tone;
  href?: string;
}) {
  const inner = (
    <div
      className={cn(
        "group flex h-full flex-col justify-between gap-4 rounded-[var(--radius-card)] border border-border",
        "bg-surface p-4 transition-colors sm:p-[18px]",
        href && "hover:border-border-strong hover:bg-surface-2/40",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[12.5px] font-medium leading-tight text-fg-muted">{label}</p>
        <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", ICON_TONES[tone])}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div>
        <p className="tabular text-[24px] font-semibold leading-none tracking-tight sm:text-[27px]">{value}</p>
        {sub ? <p className="mt-1.5 text-[12px] text-fg-subtle">{sub}</p> : null}
      </div>
    </div>
  );

  return href ? <Link href={href} className="block h-full">{inner}</Link> : inner;
}
