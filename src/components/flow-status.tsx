import { Badge } from "./ui/badge";

const RUN_TONES = {
  ACTIVE: "info",
  ON_HOLD: "warn",
  COMPLETED: "ok",
  CANCELLED: "neutral",
} as const;

export function RunStatus({ status }: { status: string }) {
  const tone = RUN_TONES[status as keyof typeof RUN_TONES] ?? "neutral";
  return <Badge tone={tone} dot>{status.replace("_", " ").toLowerCase()}</Badge>;
}

const STAGE_TONES = {
  PENDING: "neutral",
  IN_PROGRESS: "info",
  DONE: "ok",
  SKIPPED: "neutral",
  BLOCKED: "danger",
} as const;

export function StageStatus({ status }: { status: string }) {
  const tone = STAGE_TONES[status as keyof typeof STAGE_TONES] ?? "neutral";
  return <Badge tone={tone} dot>{status.replace("_", " ").toLowerCase()}</Badge>;
}

/** Thin progress bar used on flow and run cards. */
export function Progress({ done, total }: { done: number; total: number }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full rounded-full bg-accent transition-all"
          style={{ width: `${Math.max(pct === 0 ? 0 : 3, pct)}%` }}
        />
      </div>
      <span className="tabular shrink-0 text-[11.5px] text-fg-subtle">
        {done}/{total}
      </span>
    </div>
  );
}
