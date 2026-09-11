"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowLeft, Check, TriangleAlert, ChevronDown, Play, Pause,
  SkipForward, Ban, RotateCcw, ArrowUpRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/empty";
import { PageLoading } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { RunStatus, StageStatus, Progress } from "@/components/flow-status";
import { FlowChart } from "@/components/flow-chart";
import { usePermission } from "@/components/session-context";
import { apiFetch } from "@/lib/client";
import { cn, formatDate, formatDateTime, plural, relativeTime } from "@/lib/utils";

type Stage = {
  id: string; seq: number; status: string; notes: string | null; due_on: string | null;
  started_at: string | null; completed_at: string | null;
  name: string; action_by: string | null; steps: string | null; documents: string | null;
  decision_maker: string | null; criteria: string | null; stakeholders: string | null;
  duration: string | null; assigned_to: string | null;
  assigned_to_name: string | null; completed_by_name: string | null;
};

type Detail = {
  run: {
    id: string; ref: string; title: string; status: string; notes: string | null;
    started_at: string; completed_at: string | null;
    flow_code: string; flow_name: string; flow_category: string;
    flow_summary: string | null; flow_app_route: string | null;
    project_code: string | null; project_name: string | null;
    company_name: string | null; started_by_name: string | null;
  };
  stages: Stage[];
};

function Lines({ value }: { value: string | null }) {
  if (!value) return null;
  const lines = value.split("\n").filter(Boolean);
  return (
    <ul className="space-y-1">
      {lines.map((l, i) => (
        <li key={i} className="flex gap-2">
          <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-fg-subtle" />
          <span>{l}</span>
        </li>
      ))}
    </ul>
  );
}

export function RunDetail({ id }: { id: string }) {
  const toast = useToast();
  const may = usePermission();

  const [data, setData] = React.useState<Detail | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [team, setTeam] = React.useState<{ id: string; full_name: string }[]>([]);

  const load = React.useCallback(async () => {
    try {
      setData(await apiFetch<Detail>(`/api/runs/${id}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load this run");
    }
  }, [id]);

  React.useEffect(() => {
    void load();
    apiFetch<{ items: { id: string; full_name: string }[] }>("/api/users")
      .then((d) => setTeam(d.items))
      .catch(() => setTeam([]));
  }, [load]);

  // Open the first outstanding stage so the next action is always in view.
  React.useEffect(() => {
    if (!data || open !== null) return;
    const next = data.stages.find((s) => !["DONE", "SKIPPED"].includes(s.status));
    if (next) setOpen(next.id);
  }, [data, open]);

  async function updateStage(stageId: string, patch: Record<string, unknown>) {
    setBusy(stageId);
    try {
      const res = await apiFetch<{ completed: boolean }>(`/api/runs/${id}/stage`, {
        method: "POST",
        body: JSON.stringify({ stageId, ...patch }),
      });
      if (res.completed) toast("Every stage is settled — this run is complete.");
      await load();
      if (patch.status === "DONE" || patch.status === "SKIPPED") setOpen(null);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not update the stage", "error");
    } finally {
      setBusy(null);
    }
  }

  async function runAction(action: string) {
    setBusy("run");
    try {
      await apiFetch(`/api/runs/${id}/transition`, {
        method: "POST",
        body: JSON.stringify({ action }),
      });
      toast(`Run ${action}${action.endsWith("e") ? "d" : "ed"}.`);
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Action failed", "error");
    } finally {
      setBusy(null);
    }
  }

  if (error) return <EmptyState icon={TriangleAlert} title="Run not found" description={error} />;
  if (!data) return <PageLoading />;

  const r = data.run;
  const done = data.stages.filter((s) => ["DONE", "SKIPPED"].includes(s.status)).length;
  const nextStage = data.stages.find((s) => !["DONE", "SKIPPED"].includes(s.status));
  const editable = r.status === "ACTIVE" || r.status === "ON_HOLD";

  return (
    <>
      <Link
        href="/runs"
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-fg-muted transition-colors hover:text-fg"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Active runs
      </Link>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="code text-[13px] font-semibold text-accent">{r.ref}</span>
            <RunStatus status={r.status} />
            <Link href={`/flows/${r.flow_code.toLowerCase()}`} className="text-[12px] text-fg-muted hover:text-accent">
              {r.flow_name}
            </Link>
          </div>
          <h1 className="mt-1.5 text-[21px] leading-tight tracking-tight sm:text-[25px]">{r.title}</h1>
          <p className="mt-1 text-[13px] text-fg-muted">
            Started by {r.started_by_name ?? "—"} · {relativeTime(r.started_at)}
            {r.project_code ? ` · ${r.project_code}` : ""}
          </p>
        </div>

        {may("flow:run") ? (
          <div className="flex flex-wrap gap-2">
            {r.flow_app_route ? (
              <Link href={r.flow_app_route}>
                <Button variant="secondary">
                  Open the screen <ArrowUpRight className="h-4 w-4" />
                </Button>
              </Link>
            ) : null}
            {r.status === "ACTIVE" ? (
              <Button variant="secondary" onClick={() => runAction("hold")} loading={busy === "run"}>
                <Pause className="h-4 w-4" /> Put on hold
              </Button>
            ) : null}
            {r.status === "ON_HOLD" ? (
              <Button onClick={() => runAction("resume")} loading={busy === "run"}>
                <Play className="h-4 w-4" /> Resume
              </Button>
            ) : null}
            {r.status === "COMPLETED" || r.status === "CANCELLED" ? (
              <Button variant="secondary" onClick={() => runAction("reopen")} loading={busy === "run"}>
                <RotateCcw className="h-4 w-4" /> Reopen
              </Button>
            ) : (
              <Button variant="ghost" onClick={() => runAction("cancel")} loading={busy === "run"}>
                <Ban className="h-4 w-4" /> Cancel
              </Button>
            )}
          </div>
        ) : null}
      </div>

      <Card className="mb-3">
        <CardHeader
          title="Where this run has got to"
          description="Green is done, amber in progress, red blocked."
        />
        <CardBody className="pb-3">
          <FlowChart stages={data.stages} />
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_280px]">
        <Card>
          <CardHeader
            title="Stages"
            description={
              nextStage
                ? `Next up: ${nextStage.name}`
                : "Every stage has been completed or skipped"
            }
            action={
              <div className="w-32">
                <Progress done={done} total={data.stages.length} />
              </div>
            }
          />

          <div className="divide-y divide-border">
            {data.stages.map((s) => {
              const settled = ["DONE", "SKIPPED"].includes(s.status);
              const expanded = open === s.id;
              return (
                <div key={s.id}>
                  <button
                    onClick={() => setOpen(expanded ? null : s.id)}
                    className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2/40 sm:px-5"
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold",
                        s.status === "DONE" && "border-ok bg-ok text-white",
                        s.status === "SKIPPED" && "border-border bg-surface-2 text-fg-subtle",
                        s.status === "BLOCKED" && "border-danger bg-danger-soft text-danger",
                        s.status === "IN_PROGRESS" && "border-accent bg-accent-soft text-accent",
                        s.status === "PENDING" && "border-border bg-surface-2 text-fg-subtle",
                      )}
                    >
                      {s.status === "DONE" ? <Check className="h-3.5 w-3.5" /> : s.seq}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className={cn("block text-[13.5px] font-medium", settled && "text-fg-muted")}>
                        {s.name}
                      </span>
                      <span className="mt-0.5 block truncate text-[11.5px] text-fg-subtle">
                        {s.action_by ? s.action_by.split("\n")[0] : "Unassigned"}
                        {s.duration ? ` · ${s.duration}` : ""}
                        {s.completed_by_name ? ` · done by ${s.completed_by_name}` : ""}
                      </span>
                    </span>

                    <span className="flex shrink-0 items-center gap-2">
                      <StageStatus status={s.status} />
                      <ChevronDown
                        className={cn("h-4 w-4 text-fg-subtle transition-transform", expanded && "rotate-180")}
                      />
                    </span>
                  </button>

                  {expanded ? (
                    <div className="animate-fade-up space-y-4 border-t border-border bg-surface-2/30 px-4 py-4 sm:px-5">
                      <div className="grid grid-cols-1 gap-4 text-[12.5px] leading-relaxed text-fg-muted sm:grid-cols-2">
                        {s.steps ? (
                          <div>
                            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
                              Steps required
                            </p>
                            <Lines value={s.steps} />
                          </div>
                        ) : null}
                        {s.documents ? (
                          <div>
                            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
                              Documents / tools
                            </p>
                            <Lines value={s.documents} />
                          </div>
                        ) : null}
                        {s.criteria ? (
                          <div>
                            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
                              Criteria
                            </p>
                            <Lines value={s.criteria} />
                          </div>
                        ) : null}
                        {s.decision_maker || s.stakeholders ? (
                          <div>
                            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
                              Decision maker &amp; stakeholders
                            </p>
                            <Lines value={s.decision_maker} />
                            <Lines value={s.stakeholders} />
                          </div>
                        ) : null}
                      </div>

                      {may("flow:run") && editable ? (
                        <div className="space-y-3 border-t border-border pt-3.5">
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <Field label="Assigned to">
                              <Select
                                value={s.assigned_to ?? ""}
                                onChange={(e) => updateStage(s.id, { assignedTo: e.target.value || null })}
                                className="h-9"
                              >
                                <option value="">Unassigned</option>
                                {team.map((u) => (
                                  <option key={u.id} value={u.id}>{u.full_name}</option>
                                ))}
                              </Select>
                            </Field>
                            <Field label="Due on">
                              <Input
                                type="date"
                                value={s.due_on ? s.due_on.slice(0, 10) : ""}
                                onChange={(e) => updateStage(s.id, { dueOn: e.target.value || null })}
                                className="h-9"
                              />
                            </Field>
                          </div>

                          <Field label="Notes">
                            <Textarea
                              defaultValue={s.notes ?? ""}
                              onBlur={(e) => {
                                if ((e.target.value || "") !== (s.notes ?? "")) {
                                  updateStage(s.id, { notes: e.target.value || null });
                                }
                              }}
                              placeholder="What happened at this stage, and anything the next person needs."
                              className="min-h-[70px]"
                            />
                          </Field>

                          <div className="flex flex-wrap gap-2">
                            {s.status !== "DONE" ? (
                              <Button size="sm" loading={busy === s.id} onClick={() => updateStage(s.id, { status: "DONE" })}>
                                <Check className="h-4 w-4" /> Mark done
                              </Button>
                            ) : null}
                            {s.status === "PENDING" ? (
                              <Button size="sm" variant="secondary" onClick={() => updateStage(s.id, { status: "IN_PROGRESS" })}>
                                <Play className="h-4 w-4" /> Start
                              </Button>
                            ) : null}
                            {s.status !== "SKIPPED" ? (
                              <Button size="sm" variant="secondary" onClick={() => updateStage(s.id, { status: "SKIPPED" })}>
                                <SkipForward className="h-4 w-4" /> Not needed
                              </Button>
                            ) : null}
                            {s.status !== "BLOCKED" ? (
                              <Button size="sm" variant="ghost" onClick={() => updateStage(s.id, { status: "BLOCKED" })}>
                                <TriangleAlert className="h-4 w-4" /> Blocked
                              </Button>
                            ) : null}
                            {settled ? (
                              <Button size="sm" variant="ghost" onClick={() => updateStage(s.id, { status: "PENDING" })}>
                                <RotateCcw className="h-4 w-4" /> Reopen stage
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      ) : null}

                      {s.notes && !(may("flow:run") && editable) ? (
                        <p className="border-t border-border pt-3 text-[12.5px] text-fg-muted">{s.notes}</p>
                      ) : null}

                      {s.completed_at ? (
                        <p className="text-[11.5px] text-fg-subtle">
                          Completed {formatDateTime(s.completed_at)}
                          {s.completed_by_name ? ` by ${s.completed_by_name}` : ""}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="h-fit">
          <CardHeader title="Run details" />
          <CardBody>
            <dl className="space-y-2 text-[13px]">
              {[
                ["Flow", r.flow_name],
                ["Category", r.flow_category],
                ["Project", r.project_code ?? "—"],
                ["Company", r.company_name ?? "Group"],
                ["Started", formatDate(r.started_at)],
                ["Completed", r.completed_at ? formatDate(r.completed_at) : "—"],
                ["Progress", `${done} of ${data.stages.length}`],
              ].map(([label, value]) => (
                <div key={label} className="flex items-baseline justify-between gap-3">
                  <dt className="shrink-0 text-fg-muted">{label}</dt>
                  <dd className="truncate text-right font-medium">{value}</dd>
                </div>
              ))}
            </dl>

            {r.notes ? (
              <p className="mt-3 border-t border-border pt-3 text-[12.5px] leading-relaxed text-fg-muted">
                {r.notes}
              </p>
            ) : null}

            <div className="mt-3 border-t border-border pt-3">
              <p className="text-[11.5px] text-fg-subtle">
                {plural(data.stages.length - done, "stage")} outstanding
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(["PENDING", "IN_PROGRESS", "DONE", "SKIPPED", "BLOCKED"] as const).map((st) => {
                  const n = data.stages.filter((s) => s.status === st).length;
                  if (!n) return null;
                  return (
                    <Badge key={st} tone={st === "BLOCKED" ? "danger" : st === "DONE" ? "ok" : "neutral"}>
                      {n} {st.replace("_", " ").toLowerCase()}
                    </Badge>
                  );
                })}
              </div>
            </div>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
