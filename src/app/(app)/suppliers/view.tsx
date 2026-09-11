"use client";

import * as React from "react";
import { Truck, Plus, Mail, Phone, Pencil, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Textarea } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/empty";
import { useToast } from "@/components/ui/toast";
import { SearchInput } from "@/components/search-input";
import { usePermission } from "@/components/session-context";
import { invalidateLookups } from "@/lib/lookups";
import { apiFetch } from "@/lib/client";

type Row = {
  id: string; name: string; contact_person: string | null; email: string | null;
  phone: string | null; address: string | null; is_approved: boolean; notes: string | null;
  product_count: number; receipt_count: number;
};

const EMPTY = {
  name: "", contactPerson: "", email: "", phone: "", address: "", notes: "", isApproved: false,
};

export function SuppliersView() {
  const may = usePermission();
  const toast = useToast();
  const [items, setItems] = React.useState<Row[] | null>(null);
  const [search, setSearch] = React.useState("");
  const [editing, setEditing] = React.useState<Row | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [form, setForm] = React.useState(EMPTY);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    const data = await apiFetch<{ items: Row[] }>("/api/suppliers");
    setItems(data.items);
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setForm(EMPTY);
    setError(null);
    setCreating(true);
  }

  function openEdit(row: Row) {
    setForm({
      name: row.name,
      contactPerson: row.contact_person ?? "",
      email: row.email ?? "",
      phone: row.phone ?? "",
      address: row.address ?? "",
      notes: row.notes ?? "",
      isApproved: row.is_approved,
    });
    setError(null);
    setEditing(row);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (editing) {
        await apiFetch(`/api/suppliers/${editing.id}`, { method: "PATCH", body: JSON.stringify(form) });
        toast(`${form.name} updated.`);
      } else {
        await apiFetch("/api/suppliers", { method: "POST", body: JSON.stringify(form) });
        toast(`${form.name} added.`);
      }
      invalidateLookups();
      setCreating(false);
      setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  const filtered = (items ?? []).filter((s) =>
    !search.trim() ? true : s.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <>
      <PageHeader
        title="Suppliers"
        description="Approved vendors and the materials they supply."
        action={
          may("supplier:write") ? (
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" /> New supplier
            </Button>
          ) : null
        }
      />

      <div className="mb-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Search suppliers…" />
      </div>

      {!items ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton h-36 rounded-xl" />
          ))}
        </div>
      ) : !filtered.length ? (
        <Card>
          <EmptyState
            icon={Truck}
            title={search ? "No suppliers match" : "No suppliers yet"}
            description={
              search
                ? "Try a different search."
                : "Add the vendors you buy boards, accessories and consumables from."
            }
            action={
              may("supplier:write") && !search ? (
                <Button onClick={openCreate}><Plus className="h-4 w-4" /> New supplier</Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((s) => (
            <Card key={s.id} className="flex flex-col p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate text-[15px] font-semibold tracking-tight">{s.name}</h3>
                  {s.contact_person ? (
                    <p className="mt-0.5 truncate text-[12.5px] text-fg-muted">{s.contact_person}</p>
                  ) : null}
                </div>
                {s.is_approved ? (
                  <Badge tone="ok" dot>approved</Badge>
                ) : (
                  <Badge>pending</Badge>
                )}
              </div>

              <div className="mt-3 space-y-1.5 text-[12.5px]">
                {s.phone ? (
                  <a href={`tel:${s.phone}`} className="flex items-center gap-2 text-fg-muted transition-colors hover:text-accent">
                    <Phone className="h-3.5 w-3.5 shrink-0" />
                    <span className="tabular truncate">{s.phone}</span>
                  </a>
                ) : null}
                {s.email ? (
                  <a href={`mailto:${s.email}`} className="flex items-center gap-2 text-fg-muted transition-colors hover:text-accent">
                    <Mail className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{s.email}</span>
                  </a>
                ) : null}
                {s.address ? <p className="truncate text-fg-subtle">{s.address}</p> : null}
              </div>

              <div className="mt-auto flex items-center justify-between gap-3 border-t border-border pt-3 text-[12px]">
                <div className="flex gap-4">
                  <span className="text-fg-subtle">
                    <span className="tabular font-medium text-fg">{s.product_count}</span> materials
                  </span>
                  <span className="text-fg-subtle">
                    <span className="tabular font-medium text-fg">{s.receipt_count}</span> deliveries
                  </span>
                </div>
                {may("supplier:write") ? (
                  <button
                    onClick={() => openEdit(s)}
                    className="rounded-lg p-1.5 text-fg-subtle transition-colors hover:bg-surface-2 hover:text-fg"
                    aria-label={`Edit ${s.name}`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={creating || Boolean(editing)}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        title={editing ? "Edit supplier" : "New supplier"}
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
            <Button form="supplier-form" type="submit" loading={busy}>
              {editing ? "Save changes" : "Add supplier"}
            </Button>
          </>
        }
      >
        <form id="supplier-form" onSubmit={save} className="space-y-3">
          {error ? (
            <p className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2.5 text-[13px] text-danger">
              {error}
            </p>
          ) : null}
          <Field label="Supplier name">
            <Input
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Company name"
            />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Contact person">
              <Input
                value={form.contactPerson}
                onChange={(e) => setForm((f) => ({ ...f, contactPerson: e.target.value }))}
              />
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
          <Field label="Email">
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
          </Field>
          <Field label="Address">
            <Input
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
            />
          </Field>
          <Field label="Notes">
            <Textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Lead times, payment terms, warehouse capacity…"
            />
          </Field>
          <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border bg-surface-2/40 p-3">
            <input
              type="checkbox"
              checked={form.isApproved}
              onChange={(e) => setForm((f) => ({ ...f, isApproved: e.target.checked }))}
              className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
            />
            <span>
              <span className="flex items-center gap-1.5 text-[13px] font-medium">
                <CheckCircle2 className="h-3.5 w-3.5 text-ok" /> Pre-approved vendor
              </span>
              <span className="block text-[12px] text-fg-muted">
                Cleared by the procurement committee for due diligence, capacity and pricing.
              </span>
            </span>
          </label>
        </form>
      </Modal>
    </>
  );
}
