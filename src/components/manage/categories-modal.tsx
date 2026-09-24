"use client";

import * as React from "react";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { apiFetch } from "@/lib/client";
import { SOURCE_LABELS, type Source } from "@/lib/rbac";
import { plural } from "@/lib/utils";

type Category = { id: string; name: string; item_count: number };

export function CategoriesModal({ source, onClose, onChanged }: { source: Source; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const [items, setItems] = React.useState<Category[] | null>(null);
  const [name, setName] = React.useState("");
  const [editing, setEditing] = React.useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    const d = await apiFetch<{ items: Category[] }>(`/api/categories?source=${source}`);
    setItems(d.items);
  }, [source]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function run(action: () => Promise<unknown>, message: string) {
    setBusy(true);
    setError(null);
    try {
      await action();
      toast(message);
      await load();
      onChanged();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    const done = await run(
      () => apiFetch("/api/categories", { method: "POST", body: JSON.stringify({ source, name: trimmed }) }),
      `${trimmed} added.`,
    );
    if (done) setName("");
  }

  async function rename(c: Category) {
    if (!editing) return;
    const trimmed = editing.name.trim();
    if (!trimmed || trimmed === c.name) return setEditing(null);
    const done = await run(
      () => apiFetch(`/api/categories/${c.id}`, { method: "PATCH", body: JSON.stringify({ name: trimmed }) }),
      c.item_count ? `Renamed to ${trimmed}; ${plural(c.item_count, "item")} moved with it.` : `Renamed to ${trimmed}.`,
    );
    if (done) setEditing(null);
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`${SOURCE_LABELS[source]} categories`}
      description="Renaming a category renames it on every item in it. A category can be deleted once it is empty."
      footer={<Button variant="ghost" onClick={onClose}>Done</Button>}
    >
      <form onSubmit={add} className="flex gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New category, e.g. Edge Tapes (PVC)" maxLength={60} />
        <Button type="submit" disabled={!name.trim()} loading={busy && !editing}>
          <Plus className="h-4 w-4" /> Add
        </Button>
      </form>

      {error ? <p className="mt-3 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2.5 text-[13px] text-danger">{error}</p> : null}

      {!items ? (
        <div className="mt-3 space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton h-10 rounded-lg" />)}</div>
      ) : !items.length ? (
        <p className="mt-4 text-center text-[13px] text-fg-muted">No categories yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-border rounded-xl border border-border">
          {items.map((c) => (
            <li key={c.id} className="flex items-center gap-2 px-3 py-2">
              {editing?.id === c.id ? (
                <form
                  className="flex flex-1 items-center gap-1.5"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void rename(c);
                  }}
                >
                  <Input autoFocus value={editing.name} onChange={(e) => setEditing({ id: c.id, name: e.target.value })} maxLength={60} className="h-9" />
                  <Button type="submit" size="icon" loading={busy} aria-label="Save name"><Check className="h-4 w-4" /></Button>
                  <Button type="button" size="icon" variant="ghost" onClick={() => setEditing(null)} aria-label="Cancel rename"><X className="h-4 w-4" /></Button>
                </form>
              ) : (
                <>
                  <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">{c.name}</span>
                  <span className="tabular shrink-0 text-[12px] text-fg-subtle">{plural(c.item_count, "item")}</span>
                  <button
                    onClick={() => setEditing({ id: c.id, name: c.name })}
                    className="rounded-lg p-1.5 text-fg-subtle transition-colors hover:bg-surface-2 hover:text-fg"
                    aria-label={`Rename ${c.name}`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => void run(() => apiFetch(`/api/categories/${c.id}`, { method: "DELETE" }), `${c.name} deleted.`)}
                    disabled={c.item_count > 0 || busy}
                    title={c.item_count > 0 ? "Move or rename its items first" : undefined}
                    className="rounded-lg p-1.5 text-fg-subtle transition-colors hover:bg-danger-soft hover:text-danger disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-fg-subtle"
                    aria-label={`Delete ${c.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
