"use client";

import * as React from "react";
import { MapPin, Plus, Warehouse, Factory, Truck, Pencil } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Select } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/empty";
import { useToast } from "@/components/ui/toast";
import { usePermission } from "@/components/session-context";
import { invalidateLookups } from "@/lib/lookups";
import { apiFetch } from "@/lib/client";
import { plural, qty } from "@/lib/utils";

type Row = {
  id: string; code: string; name: string; kind: string; address: string | null;
  is_active: boolean; sku_count: number; total_units: number; total_value: number;
};

const KINDS = [
  { value: "WAREHOUSE", label: "Warehouse", icon: Warehouse, blurb: "Central store holding boards, accessories and consumables." },
  { value: "FACTORY", label: "Factory", icon: Factory, blurb: "Production floor stock issued to cutting, upholstery and hardwood." },
  { value: "SITE", label: "Project site", icon: MapPin, blurb: "Material delivered to a client site awaiting installation." },
  { value: "TRANSIT", label: "In transit", icon: Truck, blurb: "Loaded on a truck between two of the above." },
];

const EMPTY = { code: "", name: "", kind: "WAREHOUSE", address: "" };

export function LocationsView() {
  const may = usePermission();
  const toast = useToast();
  const [items, setItems] = React.useState<Row[] | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [editing, setEditing] = React.useState<Row | null>(null);
  const [form, setForm] = React.useState(EMPTY);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    const data = await apiFetch<{ items: Row[] }>("/api/locations");
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
        await apiFetch(`/api/locations/${editing.id}`, { method: "PATCH", body: JSON.stringify(form) });
        toast(`${form.name} updated.`);
      } else {
        await apiFetch("/api/locations", { method: "POST", body: JSON.stringify(form) });
        toast(`${form.name} added.`);
      }
      invalidateLookups();
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

  const totalUnits = (items ?? []).reduce((s, l) => s + l.total_units, 0);

  return (
    <>
      <PageHeader
        title="Locations"
        description="Every place stock can sit — the warehouse, factory floors and active sites."
        action={
          may("location:write") ? (
            <Button
              onClick={() => {
                setForm(EMPTY);
                setError(null);
                setCreating(true);
              }}
            >
              <Plus className="h-4 w-4" /> New location
            </Button>
          ) : null
        }
      />

      {!items ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton h-36 rounded-xl" />
          ))}
        </div>
      ) : !items.length ? (
        <Card>
          <EmptyState
            icon={MapPin}
            title="No locations yet"
            description="Add at least one warehouse so materials have somewhere to live."
            action={
              may("location:write") ? (
                <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> New location</Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <>
          <div className="mb-3 rounded-[var(--radius-card)] border border-border bg-surface px-4 py-3.5 sm:px-5">
            <p className="text-[12.5px] text-fg-muted">Total units held across all locations</p>
            <p className="tabular mt-1 text-[26px] font-semibold leading-none tracking-tight">
              {qty(totalUnits)}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((l) => {
              const kind = KINDS.find((k) => k.value === l.kind) ?? KINDS[0];
              const Icon = kind.icon;
              return (
                <Card key={l.id} className="flex flex-col p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft">
                        <Icon className="h-4 w-4 text-accent" />
                      </span>
                      <div className="min-w-0">
                        <h3 className="truncate text-[15px] font-semibold tracking-tight">{l.name}</h3>
                        <p className="code mt-0.5 truncate text-[11.5px] text-fg-subtle">
                          {l.code} · {kind.label}
                        </p>
                      </div>
                    </div>
                    {!l.is_active ? <Badge tone="danger">inactive</Badge> : null}
                  </div>

                  {l.address ? (
                    <p className="mt-3 truncate text-[12.5px] text-fg-muted">{l.address}</p>
                  ) : null}

                  <div className="mt-auto flex items-end justify-between gap-3 border-t border-border pt-3">
                    <div>
                      <p className="tabular text-[17px] font-semibold leading-none">
                        {qty(l.total_units)} <span className="text-[11px] font-normal text-fg-subtle">units</span>
                      </p>
                      <p className="mt-1 text-[11.5px] text-fg-subtle">{plural(l.sku_count, "material")}</p>
                    </div>
                    {may("location:write") ? (
                      <button
                        onClick={() => {
                          setForm({
                            code: l.code,
                            name: l.name,
                            kind: l.kind,
                            address: l.address ?? "",
                          });
                          setError(null);
                          setEditing(l);
                        }}
                        className="rounded-lg p-1.5 text-fg-subtle transition-colors hover:bg-surface-2 hover:text-fg"
                        aria-label={`Edit ${l.name}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}

      <Modal
        open={creating || Boolean(editing)}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        title={editing ? "Edit location" : "New location"}
        description={KINDS.find((k) => k.value === form.kind)?.blurb}
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
            <Button form="location-form" type="submit" loading={busy}>
              {editing ? "Save changes" : "Add location"}
            </Button>
          </>
        }
      >
        <form id="location-form" onSubmit={save} className="space-y-3">
          {error ? (
            <p className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2.5 text-[13px] text-danger">
              {error}
            </p>
          ) : null}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[120px_1fr]">
            <Field label="Code">
              <Input
                required
                disabled={Boolean(editing)}
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                placeholder="WH1"
                className="code"
              />
            </Field>
            <Field label="Name">
              <Input
                required
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Main Warehouse"
              />
            </Field>
          </div>
          <Field label="Type">
            <Select value={form.kind} onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value }))}>
              {KINDS.map((k) => (
                <option key={k.value} value={k.value}>{k.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Address">
            <Input
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              placeholder="Street, area, city"
            />
          </Field>
        </form>
      </Modal>
    </>
  );
}
