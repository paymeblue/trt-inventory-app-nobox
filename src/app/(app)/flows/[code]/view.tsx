"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Play, TriangleAlert, ArrowUpRight, FileSpreadsheet,
  GitBranch, Table2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/empty";
import { PageLoading } from "@/components/ui/spinner";
import { TableWrap, Th, Td, Tr } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { RunStatus, Progress } from "@/components/flow-status";
import { FlowChart } from "@/components/flow-chart";
import { usePermission } from "@/components/session-context";
import { useLookups } from "@/lib/lookups";
import { apiFetch } from "@/lib/client";
import { cn, plural, relativeTime } from "@/lib/utils";

type Stage = {
  id: string; seq: number; name: string;
  action_by: string | null; steps: string | null; documents: string | null;
  decision_maker: string | null; criteria: string | null;
  stakeholders: string | null; duration: string | null;
};

type Detail = {
  flow: {
    id: string; code: string; name: string; category: string;
    summary: string | null; app_route: string | null; source_sheet: string;
  };
  stages: Stage[];
  runs: {
    id: string; ref: string; title: string; status: string; started_at: string;
    project_code: string | null; started_by_name: string | null;
    total_stages: number; done_stages: number;
  }[];
};

/** Multi-line cells in the workbook read as bullet lists. */
function Lines({ value }: { value: string | null }) {
  if (!value) return <span className="text-fg-subtle">—</span>;
  const lines = value.split("\n").filter(Boolean);
  if (lines.length === 1) return <>{lines[0]}</>;
  return (
    <ul className="space-y-0.5">
      {lines.map((l, i) => (
        <li key={i} className="flex gap-1.5">
          <span className="text-fg-subtle">·</span>
          <span>{l}</span>
        </li>
      ))}
    </ul>
  );
}

export function FlowDetail({ code }: { code: string }) {
  const router = useRouter();
  const toast = useToast();
  const may = usePermission();
  const { projects } = useLookups();

  const [data, setData] = React.useState<Detail | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [starting, setStarting] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [projectId, setProjectId] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [view, setView] = React.useState<"chart" | "table">("chart");

  React.useEffect(() => {
    let active = true;
    apiFetch<Detail>(`/api/flows/${code}`)
      .then((d) => active && setData(d))
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [code]);

  async function start(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await apiFetch<{ id: string; ref: string }>("/api/runs", {
        method: "POST",
        body: JSON.stringify({
          flowCode: data!.flow.code,
          title: title.trim(),
          projectId: projectId || null,
          notes: notes.trim() || null,
        }),
      });
      toast(`${res.ref} started.`);
      router.push(`/runs/${res.id}`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not start the run", "error");
      setBusy(false);
    }
  }

  if (error) return <EmptyState icon={TriangleAlert} title="Flow not found" description={error} />;
  if (!data) return <PageLoading />;

  const f = data.flow;

  return (
    <>
      <Link
        href="/flows"
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-fg-muted transition-colors hover:text-fg"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Process flows
      </Link>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="code text-[13px] font-semibold text-accent">{f.code}</span>
            <Badge>{f.category}</Badge>
            {f.app_route ? <Badge tone="ok">built into the app</Badge> : <Badge>tracked as a checklist</Badge>}
          </div>
          <h1 className="mt-1.5 text-[21px] leading-tight tracking-tight sm:text-[25px]">{f.name}</h1>
          {f.summary ? (
            <p className="mt-1.5 max-w-2xl text-[13.5px] leading-relaxed text-fg-muted">{f.summary}</p>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          {f.app_route ? (
            <Link href={f.app_route}>
              <Button variant="secondary">
                Open the screen <ArrowUpRight className="h-4 w-4" />
              </Button>
            </Link>
          ) : null}
          {may("flow:run") ? (
            <Button
              onClick={() => {
                setTitle("");
                setProjectId("");
                setNotes("");
                setStarting(true);
              }}
            >
              <Play className="h-4 w-4" /> Start a run
            </Button>
          ) : null}
        </div>
      </div>

      {data.runs.length ? (
        <Card className="mb-3">
          <CardHeader title="Runs of this flow" description={`${plural(data.runs.length, "run")} recorded`} />
          <div className="divide-y divide-border">
            {data.runs.map((r) => (
              <Link
                key={r.id}
                href={`/runs/${r.id}`}
                className="flex flex-wrap items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2/50 sm:px-5"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="code text-[12px] font-semibold text-accent">{r.ref}</span>
                    <RunStatus status={r.status} />
                  </div>
                  <p className="mt-0.5 truncate text-[13.5px]">{r.title}</p>
                  <p className="truncate text-[11.5px] text-fg-subtle">
                    {r.started_by_name ?? "—"}
                    {r.project_code ? ` · ${r.project_code}` : ""} · {relativeTime(r.started_at)}
                  </p>
                </div>
                <div className="w-full sm:w-40">
                  <Progress done={r.done_stages} total={r.total_stages} />
                </div>
              </Link>
            ))}
          </div>
        </Card>
      ) : null}

      <Card>
        <CardHeader
          title="Stages"
          description={`${plural(data.stages.length, "stage")}, straight from the workbook`}
          action={
            <div className="flex items-center gap-2">
              <span className="hidden items-center gap-1.5 text-[12px] text-fg-subtle sm:flex">
                <FileSpreadsheet className="h-3.5 w-3.5" />
                {f.source_sheet}
              </span>
              <div className="flex items-center gap-0.5 rounded-lg border border-border bg-surface-2 p-0.5">
                {([["chart", GitBranch], ["table", Table2]] as const).map(([mode, Icon]) => (
                  <button
                    key={mode}
                    onClick={() => setView(mode)}
                    aria-label={`${mode} view`}
                    className={cn(
                      "rounded-[6px] p-1.5 transition-colors",
                      view === mode ? "bg-surface text-fg shadow-sm" : "text-fg-subtle hover:text-fg",
                    )}
                  >
                    <Icon className="h-[15px] w-[15px]" />
                  </button>
                ))}
              </div>
            </div>
          }
        />

        {view === "chart" ? (
          <>
            <CardBody className="pb-2">
              <p className="mb-3 text-[12.5px] text-fg-muted">
                One lane per responsible party, stages left to right. Arrows are the hand-offs —
                where work crosses a lane, that is where it usually stalls.
              </p>
              <FlowChart stages={data.stages} />
            </CardBody>
          </>
        ) : (
        <TableWrap>
          <thead>
            <tr>
              <Th className="w-10">#</Th>
              <Th>Stage</Th>
              <Th className="hidden md:table-cell">Action by</Th>
              <Th className="hidden xl:table-cell">Steps</Th>
              <Th className="hidden lg:table-cell">Documents / tools</Th>
              <Th className="hidden xl:table-cell">Decision maker</Th>
              <Th align="right" className="hidden sm:table-cell">Duration</Th>
            </tr>
          </thead>
          <tbody>
            {data.stages.map((s) => (
              <Tr key={s.id} className="align-top">
                <Td className="tabular text-[12px] text-fg-subtle">{s.seq}</Td>
                <Td>
                  <p className="text-[13.5px] font-medium">{s.name}</p>
                  {s.criteria ? (
                    <p className="mt-1 text-[11.5px] leading-relaxed text-fg-subtle">
                      <Lines value={s.criteria} />
                    </p>
                  ) : null}
                </Td>
                <Td className="hidden text-[12.5px] text-fg-muted md:table-cell">
                  <Lines value={s.action_by} />
                </Td>
                <Td className="hidden max-w-[280px] text-[12.5px] text-fg-muted xl:table-cell">
                  <Lines value={s.steps} />
                </Td>
                <Td className="hidden max-w-[220px] text-[12.5px] text-fg-muted lg:table-cell">
                  <Lines value={s.documents} />
                </Td>
                <Td className="hidden text-[12.5px] text-fg-muted xl:table-cell">
                  <Lines value={s.decision_maker} />
                </Td>
                <Td align="right" className="hidden whitespace-nowrap text-[12.5px] text-fg-muted sm:table-cell">
                  {s.duration ?? "—"}
                </Td>
              </Tr>
            ))}
          </tbody>
        </TableWrap>
        )}
      </Card>

      <Modal
        open={starting}
        onClose={() => setStarting(false)}
        title={`Start ${f.name}`}
        description="This creates a live checklist of the stages above that your team works through."
        footer={
          <>
            <Button variant="ghost" onClick={() => setStarting(false)}>Cancel</Button>
            <Button form="start-run" type="submit" loading={busy}>Start run</Button>
          </>
        }
      >
        <form id="start-run" onSubmit={start} className="space-y-3">
          <Field label="What is this run for?">
            <Input
              required
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={`${f.name} — Lekki Phase 1`}
            />
          </Field>
          <Field label="Project" hint="optional">
            <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">Not project-related</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Notes">
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything the team should know before starting."
            />
          </Field>
        </form>
      </Modal>
    </>
  );
}
