"use client";

import * as React from "react";
import Link from "next/link";
import { FolderKanban, Plus, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/empty";
import { useToast } from "@/components/ui/toast";
import { ProjectStatus } from "@/components/status";
import { usePermission } from "@/components/session-context";
import { invalidateLookups } from "@/lib/lookups";
import { apiFetch } from "@/lib/client";
import { formatDate } from "@/lib/utils";

type Row = {
  id: string; code: string; name: string; client_name: string | null;
  site_address: string | null; status: string; supervisor_name: string | null;
  start_date: string | null; target_date: string | null;
  requisition_count: number; materials_value: number;
};

const STATUSES = ["PLANNING", "IN_PRODUCTION", "INSTALLATION", "COMPLETED", "ON_HOLD", "CANCELLED"];

export function ProjectsView() {
  const may = usePermission();
  const toast = useToast();
  const [items, setItems] = React.useState<Row[] | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [users, setUsers] = React.useState<{ id: string; full_name: string; role: string }[]>([]);
  const [form, setForm] = React.useState({
    code: "", name: "", clientName: "", siteAddress: "",
    status: "PLANNING", supervisorId: "", startDate: "", targetDate: "", notes: "",
  });
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    const data = await apiFetch<{ items: Row[] }>("/api/projects");
    setItems(data.items);
  }, []);

  React.useEffect(() => {
    void load();
    if (may("user:read")) {
      apiFetch<{ items: { id: string; full_name: string; role: string }[] }>("/api/users")
        .then((d) => setUsers(d.items))
        .catch(() => setUsers([]));
    }
  }, [load, may]);

  const set = (key: keyof typeof form) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/api/projects", { method: "POST", body: JSON.stringify(form) });
      toast(`${form.code} created.`);
      invalidateLookups();
      setCreating(false);
      setForm({
        code: "", name: "", clientName: "", siteAddress: "",
        status: "PLANNING", supervisorId: "", startDate: "", targetDate: "", notes: "",
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the project");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Projects"
        description="Jobs that materials are issued against, from planning through to installation."
        action={
          may("project:write") ? (
            <Button onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" /> New project
            </Button>
          ) : null
        }
      />

      {!items ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton h-40 rounded-xl" />
          ))}
        </div>
      ) : !items.length ? (
        <Card>
          <EmptyState
            icon={FolderKanban}
            title="No projects yet"
            description="Create a project so material issues can be tracked against a job and reconciled at close-out."
            action={
              may("project:write") ? (
                <Button onClick={() => setCreating(true)}>
                  <Plus className="h-4 w-4" /> New project
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((p) => (
            <Link
              key={p.id}
              href={`/projects/${p.id}`}
              className="group flex flex-col rounded-[var(--radius-card)] border border-border bg-surface p-4 transition-colors hover:border-border-strong hover:bg-surface-2/30"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="code text-[12px] font-semibold text-accent">{p.code}</span>
                <ProjectStatus status={p.status} />
              </div>
              <h3 className="mt-2 line-clamp-2 text-[15px] font-semibold leading-snug tracking-tight">
                {p.name}
              </h3>
              <p className="mt-1 truncate text-[12.5px] text-fg-muted">
                {p.client_name ?? "No client recorded"}
              </p>
              {p.site_address ? (
                <p className="mt-0.5 truncate text-[11.5px] text-fg-subtle">{p.site_address}</p>
              ) : null}

              <div className="mt-auto flex items-end justify-between gap-3 border-t border-border pt-3 text-[12px]">
                <div>
                  <p className="tabular text-[15px] font-semibold leading-none">{p.requisition_count}</p>
                  <p className="mt-1 text-fg-subtle">requisitions</p>
                </div>

                <ChevronRight className="mb-0.5 h-4 w-4 shrink-0 text-fg-subtle transition-transform group-hover:translate-x-0.5" />
              </div>
              {p.target_date ? (
                <p className="mt-2 text-[11.5px] text-fg-subtle">Target {formatDate(p.target_date)}</p>
              ) : null}
            </Link>
          ))}
        </div>
      )}

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        size="lg"
        title="New project"
        description="Give the job a code so material issues can be traced back to it."
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreating(false)}>Cancel</Button>
            <Button form="project-form" type="submit" loading={busy}>Create project</Button>
          </>
        }
      >
        <form id="project-form" onSubmit={create} className="space-y-3">
          {error ? (
            <p className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2.5 text-[13px] text-danger">
              {error}
            </p>
          ) : null}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[140px_1fr]">
            <Field label="Project code">
              <Input required value={form.code} onChange={set("code")} placeholder="TRT-042" className="code" />
            </Field>
            <Field label="Project name">
              <Input required value={form.name} onChange={set("name")} placeholder="Lekki Phase 1 duplex fit-out" />
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Client">
              <Input value={form.clientName} onChange={set("clientName")} placeholder="Client name" />
            </Field>
            <Field label="Status">
              <Select value={form.status} onChange={set("status")}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Site address">
            <Input value={form.siteAddress} onChange={set("siteAddress")} placeholder="Street, area, city" />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Supervisor">
              <Select value={form.supervisorId} onChange={set("supervisorId")}>
                <option value="">Unassigned</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.full_name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Start date">
              <Input type="date" value={form.startDate} onChange={set("startDate")} />
            </Field>
            <Field label="Target date">
              <Input type="date" value={form.targetDate} onChange={set("targetDate")} />
            </Field>
          </div>
          <Field label="Notes">
            <Textarea value={form.notes} onChange={set("notes")} placeholder="Scope summary, access notes…" />
          </Field>
        </form>
      </Modal>
    </>
  );
}
