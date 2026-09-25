"use client";

import * as React from "react";
import { Users, Plus, Pencil, KeyRound } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Select } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/empty";
import { TableWrap, Th, Td, Tr } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { SearchInput } from "@/components/search-input";
import { useRequiredSession } from "@/components/session-context";
import { ROLES, ROLE_DESCRIPTIONS, ROLE_LABELS, type Role } from "@/lib/rbac";
import { apiFetch } from "@/lib/client";
import { initials, relativeTime } from "@/lib/utils";

type Row = {
  id: string; email: string; full_name: string; role: Role; job_title: string | null; phone: string | null;
  is_active: boolean; last_login_at: string | null; created_at: string;
};

const EMPTY = {
  fullName: "", email: "", password: "", role: "DESIGNER" as Role, phone: "", jobTitle: "",
};

export function UsersView() {
  const me = useRequiredSession();
  const toast = useToast();

  const [items, setItems] = React.useState<Row[] | null>(null);
  const [search, setSearch] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [editing, setEditing] = React.useState<Row | null>(null);
  const [form, setForm] = React.useState(EMPTY);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    const data = await apiFetch<{ items: Row[] }>("/api/users");
    setItems(data.items);
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (editing) {
        const payload: Record<string, unknown> = {
          fullName: form.fullName,
          role: form.role,
          phone: form.phone || null,
          jobTitle: form.jobTitle,
        };
        if (form.password) payload.password = form.password;
        await apiFetch(`/api/users/${editing.id}`, { method: "PATCH", body: JSON.stringify(payload) });
        toast(`${form.fullName} updated.`);
      } else {
        await apiFetch("/api/users", { method: "POST", body: JSON.stringify(form) });
        toast(`${form.fullName} can now sign in.`);
      }
      setCreating(false);
      setEditing(null);
      setForm(EMPTY);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(row: Row) {
    try {
      await apiFetch(`/api/users/${row.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !row.is_active }),
      });
      toast(`${row.full_name} ${row.is_active ? "deactivated" : "reactivated"}.`);
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not update", "error");
    }
  }

  const filtered = (items ?? []).filter((u) =>
    !search.trim()
      ? true
      : `${u.full_name} ${u.email} ${ROLE_LABELS[u.role]}`.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <>
      <PageHeader
        title="Team"
        description="Who can sign in, and what each role is allowed to do."
        action={
          (
            <Button
              onClick={() => {
                setForm(EMPTY);
                setError(null);
                setCreating(true);
              }}
            >
              <Plus className="h-4 w-4" /> Add person
            </Button>
          )
        }
      />

      <Card className="overflow-hidden">
        <div className="border-b border-border p-3 sm:p-4">
          <SearchInput value={search} onChange={setSearch} placeholder="Search by name, email or role…" />
        </div>

        {!items ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="skeleton h-14 rounded-lg" />
            ))}
          </div>
        ) : !filtered.length ? (
          <EmptyState icon={Users} title="Nobody found" description="No accounts match that search." />
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Person</Th>
                <Th>Role</Th>
                <Th align="right" className="hidden md:table-cell">Last seen</Th>
                <Th align="center">Status</Th>
                <Th align="right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <Tr key={u.id}>
                  <Td>
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[12px] font-semibold text-accent">
                        {initials(u.full_name)}
                      </span>
                      <span className="min-w-0">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-[13.5px] font-medium">{u.full_name}</span>
                          {u.id === me.sub ? <Badge tone="accent">you</Badge> : null}
                        </span>
                        <span className="block truncate text-[11.5px] text-fg-subtle">{u.email}</span>
                      </span>
                    </div>
                  </Td>
                  <Td>
                    <span className="block text-[13px]">{u.job_title ?? ROLE_LABELS[u.role]}</span>
                    {u.job_title ? <span className="block text-[11.5px] text-fg-subtle">{ROLE_LABELS[u.role]}</span> : null}
                  </Td>
                  <Td align="right" className="hidden whitespace-nowrap text-[12px] text-fg-subtle md:table-cell">
                    {u.last_login_at ? relativeTime(u.last_login_at) : "never"}
                  </Td>
                  <Td align="center">
                    {u.is_active ? <Badge tone="ok" dot>active</Badge> : <Badge tone="danger" dot>disabled</Badge>}
                  </Td>
                  <Td align="right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => {
                          setForm({
                            fullName: u.full_name,
                            email: u.email,
                            password: "",
                            role: u.role,
                            phone: u.phone ?? "",
                            jobTitle: u.job_title ?? "",
                          });
                          setError(null);
                          setEditing(u);
                        }}
                        className="rounded-lg p-1.5 text-fg-subtle transition-colors hover:bg-surface-2 hover:text-fg"
                        aria-label={`Edit ${u.full_name}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      {u.id !== me.sub ? (
                        <button
                          onClick={() => toggleActive(u)}
                          className="rounded-lg px-2 py-1.5 text-[12px] font-medium text-fg-subtle transition-colors hover:bg-surface-2 hover:text-fg"
                        >
                          {u.is_active ? "Disable" : "Enable"}
                        </button>
                      ) : null}
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>

      <Card className="mt-3 p-4 sm:p-5">
        <h2 className="text-sm font-semibold tracking-tight">What each role can do</h2>
        <p className="mt-0.5 text-[13px] text-fg-muted">
          Managers can only change their own side. Designers can see everything but change nothing.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
          {ROLES.map((role) => (
            <div key={role} className="rounded-xl border border-border bg-surface-2/40 p-3">
              <p className="text-[13px] font-semibold">{ROLE_LABELS[role]}</p>
              <p className="mt-1 text-[12px] leading-relaxed text-fg-muted">{ROLE_DESCRIPTIONS[role]}</p>
            </div>
          ))}
        </div>
      </Card>

      <Modal
        open={creating || Boolean(editing)}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        title={editing ? `Edit ${editing.full_name}` : "Add a person"}
        description={ROLE_DESCRIPTIONS[form.role]}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setCreating(false);
                setEditing(null);
              }}
            >
              Cancel
            </Button>
            <Button form="user-form" type="submit" loading={busy}>
              {editing ? "Save changes" : "Create account"}
            </Button>
          </>
        }
      >
        <form id="user-form" onSubmit={save} className="space-y-3">
          {error ? (
            <p className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2.5 text-[13px] text-danger">
              {error}
            </p>
          ) : null}
          <Field label="Full name">
            <Input
              required
              value={form.fullName}
              onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
              placeholder="Adaeze Okonkwo"
            />
          </Field>
          <Field label="Job title" hint="what they are called, e.g. CEO, COO, Head of Design">
            <Input
              list="job-titles"
              value={form.jobTitle}
              onChange={(e) => setForm((f) => ({ ...f, jobTitle: e.target.value }))}
              placeholder="CEO"
            />
            <datalist id="job-titles">
              {["CEO", "COO", "CFO", "Head of Design", "Designer", "Factory Manager", "Nobox Manager", "Storekeeper", "Inventory Officer", "Procurement"].map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </Field>
          <Field label="Work email">
            <Input
              type="email"
              required
              disabled={Boolean(editing)}
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="name@trtnobox.com"
              autoCapitalize="none"
            />
          </Field>
          <Field
            label={editing ? "New password" : "Password"}
            hint={editing ? "leave blank to keep the current one" : "minimum 8 characters"}
          >
            <div className="relative">
              <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
              <Input
                type="text"
                required={!editing}
                minLength={editing ? undefined : 8}
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                placeholder={editing ? "Unchanged" : "Share this with them securely"}
                className="pl-9"
                autoComplete="new-password"
              />
            </div>
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Access" hint="what they can do in the app">
              <Select
                value={form.role}
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as Role }))}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                ))}
              </Select>
            </Field>
            <Field label="Phone">
              <Input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="+234…"
              />
            </Field>
          </div>
        </form>
      </Modal>
    </>
  );
}
