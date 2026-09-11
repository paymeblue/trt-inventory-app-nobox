"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export type ChartStage = {
  id: string;
  seq: number;
  name: string;
  action_by: string | null;
  decision_maker: string | null;
  duration: string | null;
  status?: string;
};

/** Whoever performs the stage, reduced to a single swimlane label. */
function lane(stage: ChartStage): string {
  const raw = (stage.action_by ?? "Unassigned").split("\n")[0];
  return raw
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\s*(→|->|\/)\s*/g, " / ")
    .replace(/\s+/g, " ")
    .trim() || "Unassigned";
}

const LANE_COLOURS = [
  "var(--accent)", "var(--info)", "var(--ok)", "#c084fc",
  "#f472b6", "#22d3ee", "#fb923c", "#a3e635",
];

const STATUS_RING: Record<string, string> = {
  DONE: "var(--ok)",
  IN_PROGRESS: "var(--accent)",
  BLOCKED: "var(--danger)",
  SKIPPED: "var(--border-strong)",
};

/**
 * A swimlane flow chart: one row per responsible party, stages in sequence left
 * to right, arrows following the hand-offs. This is the shape the workbook
 * describes — the interesting information is who hands what to whom.
 */
export function FlowChart({ stages, className }: { stages: ChartStage[]; className?: string }) {
  const lanes = React.useMemo(() => {
    const order: string[] = [];
    for (const s of stages) {
      const l = lane(s);
      if (!order.includes(l)) order.push(l);
    }
    return order;
  }, [stages]);

  if (!stages.length) return null;

  const COL_W = 190;
  const COL_GAP = 34;
  const ROW_H = 92;
  const HEAD_W = 168;
  const TOP = 16;

  const width = HEAD_W + stages.length * COL_W + (stages.length - 1) * COL_GAP + 24;
  const height = TOP + lanes.length * ROW_H + 16;

  const xFor = (i: number) => HEAD_W + i * (COL_W + COL_GAP);
  const yFor = (s: ChartStage) => TOP + lanes.indexOf(lane(s)) * ROW_H;
  const BOX_H = 62;

  return (
    <div className={cn("scrollbar-thin w-full overflow-x-auto", className)}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Process flow chart by responsible party"
        className="block"
      >
        <defs>
          <marker id="fc-arrow" viewBox="0 0 10 10" refX="9" refY="5"
                  markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--border-strong)" />
          </marker>
        </defs>

        {/* Swimlane bands and labels */}
        {lanes.map((l, i) => (
          <g key={l}>
            <rect
              x={0} y={TOP + i * ROW_H - 10}
              width={width} height={ROW_H - 8}
              rx={10}
              fill={i % 2 ? "var(--surface-2)" : "transparent"}
              opacity={0.5}
            />
            <rect
              x={0} y={TOP + i * ROW_H - 10}
              width={4} height={ROW_H - 8}
              rx={2}
              fill={LANE_COLOURS[i % LANE_COLOURS.length]}
            />
            <text
              x={14} y={TOP + i * ROW_H + 16}
              fill="var(--fg)" fontSize="12" fontWeight="600"
            >
              {l.length > 22 ? `${l.slice(0, 21)}…` : l}
              <title>{l}</title>
            </text>
            <text x={14} y={TOP + i * ROW_H + 32} fill="var(--fg-subtle)" fontSize="10.5">
              {stages.filter((s) => lane(s) === l).length} stage
              {stages.filter((s) => lane(s) === l).length === 1 ? "" : "s"}
            </text>
          </g>
        ))}

        {/* Hand-off arrows, drawn before the boxes so they sit underneath */}
        {stages.slice(0, -1).map((s, i) => {
          const next = stages[i + 1];
          const x1 = xFor(i) + COL_W;
          const y1 = yFor(s) + BOX_H / 2;
          const x2 = xFor(i + 1);
          const y2 = yFor(next) + BOX_H / 2;
          const mid = x1 + COL_GAP / 2;
          const d =
            y1 === y2
              ? `M ${x1} ${y1} L ${x2} ${y2}`
              : `M ${x1} ${y1} L ${mid} ${y1} L ${mid} ${y2} L ${x2} ${y2}`;
          return (
            <path
              key={s.id}
              d={d}
              fill="none"
              stroke="var(--border-strong)"
              strokeWidth={1.5}
              markerEnd="url(#fc-arrow)"
            />
          );
        })}

        {/* Stage boxes */}
        {stages.map((s, i) => {
          const x = xFor(i);
          const y = yFor(s);
          const ring = s.status ? STATUS_RING[s.status] : undefined;
          const label = s.name.length > 46 ? `${s.name.slice(0, 45)}…` : s.name;
          const words = label.split(" ");
          const lines: string[] = [];
          let line = "";
          for (const w of words) {
            if ((line + " " + w).trim().length > 24) {
              lines.push(line.trim());
              line = w;
            } else {
              line = `${line} ${w}`;
            }
          }
          if (line.trim()) lines.push(line.trim());

          return (
            <g key={s.id}>
              <rect
                x={x} y={y} width={COL_W} height={BOX_H} rx={9}
                fill="var(--surface)"
                stroke={ring ?? "var(--border)"}
                strokeWidth={ring ? 2 : 1}
              />
              <circle cx={x + 15} cy={y + 15} r={9} fill="var(--surface-2)" />
              <text
                x={x + 15} y={y + 19}
                textAnchor="middle" fontSize="10" fontWeight="700"
                fill="var(--fg-muted)"
              >
                {s.seq}
              </text>
              {lines.slice(0, 3).map((l, li) => (
                <text
                  key={li}
                  x={x + 30} y={y + 17 + li * 13}
                  fontSize="11" fontWeight="500" fill="var(--fg)"
                >
                  {l}
                </text>
              ))}
              {s.duration ? (
                <text x={x + 30} y={y + BOX_H - 8} fontSize="10" fill="var(--fg-subtle)">
                  {s.duration.length > 20 ? `${s.duration.slice(0, 19)}…` : s.duration}
                </text>
              ) : null}
              <title>
                {`${s.seq}. ${s.name}\n${s.action_by ?? ""}${s.decision_maker ? `\nDecision: ${s.decision_maker}` : ""}`}
              </title>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
