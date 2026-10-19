"use client";

import * as React from "react";
import { Archive, Check, Pencil, Plus, Tags, Trash2, X } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input, Select } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/empty";
import { Modal } from "@/components/ui/modal";
import { TableWrap, Th, Td, Tr } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { SearchInput } from "@/components/search-input";
import { apiFetch } from "@/lib/client";
import { SOURCE_LABELS, type Source } from "@/lib/rbac";
import { cn, plural, qty } from "@/lib/utils";

type Category = { id: string; name: string; is_active: boolean; item_count: number; in_stock: number; units: number };

/**
 * Every category of a side, with its stock, and the switch that archives it.
 * Archived categories keep their items, but they are hidden from the
 * inventory, the dashboards and their counts until switched back on.
 */
export function CategoriesView({ sides, initial }: { sides: Source[]; initial: Source }) {
  const toast = useToast();
  const [source, setSource] = React.useState<Source>(initial);
  const [items, setItems] = React.useState<Category[] | null>(null);
  const [search, setSearch] = React.useState("");
  const [show, setShow] = React.useState<"" | "active" | "archived">("");
  const [name, setName] = React.useState("");
  const [editing, setEditing] = React.useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = React.useState<Category | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    const d = await apiFetch<{ items: Category[] }>(`/api/categories?source=${source}`);
    setItems(d.items);
  }, [source]);

  React.useEffect(() => {
    setItems(null);
    void load();
    window.history.replaceState(null, "", `/categories?source=${source}`);
  }, [load, source]);

  async function run(key: string, action: () => Promise<unknown>, message: string) {
    setBusy(key);
    try {
      await action();
      toast(message);
      await load();
      return true;
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not save", "error");
      return false;
    } finally {
      setBusy(null);
    }
  }

  const patch = (c: Category, body: object) =>
    apiFetch(`/api/categories/${c.id}`, { method: "PATCH", body: JSON.stringify(body) });

  const toggle = (c: Category) =>
    run(c.id, () => patch(c, { isActive: !c.is_active }),
      c.is_active ? `${c.name} archived; its ${plural(c.item_count, "item")} are hidden.` : `${c.name} is active again.`);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    const done = await run("add", () => apiFetch("/api/categories", { method: "POST", body: JSON.stringify({ source, name: trimmed }) }), `${trimmed} added.`);
    if (done) setName("");
  }

  async function rename(c: Category) {
    const trimmed = editing?.name.trim();
    if (!trimmed || trimmed === c.name) return setEditing(null);
    const done = await run(c.id, () => patch(c, { name: trimmed }),
      c.item_count ? `Renamed to ${trimmed}; ${plural(c.item_count, "item")} moved with it.` : `Renamed to ${trimmed}.`);
    if (done) setEditing(null);
  }

  const empty = (items ?? []).filter((c) => c.is_active && c.item_count > 0 && c.in_stock === 0);
  async function archiveEmpty() {
    await run("bulk", () => Promise.all(empty.map((c) => patch(c, { isActive: false }))),
      `${plural(empty.length, "category", "categories")} with no stock archived.`);
  }

  const shown = (items ?? []).filter(
    (c) =>
      (!show || (show === "active") === c.is_active) &&
      (!search.trim() || c.name.toLowerCase().includes(search.trim().toLowerCase())),
  );
  const archived = (items ?? []).filter((c) => !c.is_active);
  const hidden = archived.reduce((n, c) => n + c.item_count, 0);

  return (
    <>
      <PageHeader
        title="Categories"
        description="Archive a category to hide its items from the inventory, the dashboards and their counts. Nothing is deleted, and adding stock to one of its items makes it active again."
      />

      {sides.length > 1 ? (
        <div className="scrollbar-thin mb-3 flex max-w-full overflow-x-auto rounded-xl border border-border bg-surface-2 p-1" role="tablist">
          {sides.map((s) => (
            <button
              key={s}
              role="tab"
              aria-selected={source === s}
              onClick={() => setSource(s)}
              className={cn(
                "shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors sm:px-4",
                source === s ? "bg-surface text-fg shadow-sm" : "text-fg-muted hover:text-fg",
              )}
            >
              {SOURCE_LABELS[s]}
            </button>
          ))}
        </div>
      ) : null}

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-2 border-b border-border p-3 sm:p-4 lg:flex-row lg:items-center">
          <SearchInput value={search} onChange={setSearch} placeholder="Search categories…" className="lg:flex-1" />
          <Select value={show} onChange={(e) => setShow(e.target.value as typeof show)} aria-label="Show" className="lg:w-40">
            <option value="">All</option>
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </Select>
          <form onSubmit={add} className="flex gap-2 lg:w-80">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New category" maxLength={60} />
            <Button type="submit" variant="secondary" loading={busy === "add"} disabled={!name.trim()}>
              <Plus className="h-4 w-4" /> Add
            </Button>
          </form>
        </div>

        {items && (empty.length || archived.length) ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface-2/40 px-3 py-2.5 text-[13px] sm:px-4">
            <span className="text-fg-muted">
              {archived.length
                ? `${plural(archived.length, "category", "categories")} archived, hiding ${plural(hidden, "item")}.`
                : "No categories archived."}
              {empty.length ? ` ${plural(empty.length, "active category", "active categories")} with no stock at all.` : ""}
            </span>
            {empty.length ? (
              <Button size="sm" variant="secondary" onClick={archiveEmpty} loading={busy === "bulk"}>
                <Archive className="h-3.5 w-3.5" /> Archive the {empty.length} with no stock
              </Button>
            ) : null}
          </div>
        ) : null}

        {!items ? (
          <div className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-11 rounded-lg" />)}</div>
        ) : !shown.length ? (
          <EmptyState icon={Tags} title={items.length ? "No category matches" : `No ${SOURCE_LABELS[source]} categories yet`} />
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Category</Th>
                <Th align="right">Items</Th>
                <Th align="right" className="hidden sm:table-cell">With stock</Th>
                <Th align="right" className="hidden md:table-cell">Units</Th>
                <Th align="center">Active</Th>
                <Th align="right"><span className="sr-only">Actions</span></Th>
              </tr>
            </thead>
            <tbody>
              {shown.map((c) => (
                <Tr key={c.id} className={cn(!c.is_active && "opacity-70")}>
                  <Td>
                    {editing?.id === c.id ? (
                      <form onSubmit={(e) => { e.preventDefault(); void rename(c); }} className="flex items-center gap-1">
                        <Input
                          autoFocus value={editing.name} maxLength={60} className="h-8"
                          onChange={(e) => setEditing({ id: c.id, name: e.target.value })}
                          onKeyDown={(e) => e.key === "Escape" && setEditing(null)}
                        />
                        <IconButton label="Save name" type="submit"><Check className="h-3.5 w-3.5" /></IconButton>
                        <IconButton label="Cancel" onClick={() => setEditing(null)}><X className="h-3.5 w-3.5" /></IconButton>
                      </form>
                    ) : (
                      <span className="flex items-center gap-2">
                        <span className="text-[13.5px] font-medium">{c.name}</span>
                        {!c.is_active ? <Badge>archived</Badge> : null}
                        {c.is_active && c.item_count > 0 && c.in_stock === 0 ? <Badge tone="danger">no stock</Badge> : null}
                      </span>
                    )}
                    {editing?.id !== c.id && c.item_count ? (
                      <span className="tabular block text-[11.5px] text-fg-subtle sm:hidden">{c.in_stock} of {c.item_count} with stock</span>
                    ) : null}
                  </Td>
                  <Td align="right" className="tabular text-[13px]">{c.item_count}</Td>
                  <Td align="right" className={cn("tabular hidden text-[13px] sm:table-cell", c.item_count && !c.in_stock ? "text-danger" : "text-fg-muted")}>
                    {c.item_count ? `${c.in_stock} of ${c.item_count}` : "—"}
                  </Td>
                  <Td align="right" className="tabular hidden text-[13px] text-fg-muted md:table-cell">{c.units ? qty(c.units) : "—"}</Td>
                  <Td align="center">
                    <Switch checked={c.is_active} busy={busy === c.id} onChange={() => void toggle(c)} label={`${c.name} active`} />
                  </Td>
                  <Td align="right">
                    <div className="flex items-center justify-end gap-0.5">
                      <IconButton label={`Rename ${c.name}`} onClick={() => setEditing({ id: c.id, name: c.name })}><Pencil className="h-3.5 w-3.5" /></IconButton>
                      <IconButton label={`Delete ${c.name}`} onClick={() => setDeleting(c)} danger><Trash2 className="h-3.5 w-3.5" /></IconButton>
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>

      {deleting ? (
        <Modal
          open
          size="sm"
          onClose={() => setDeleting(null)}
          title={`Delete ${deleting.name}?`}
          footer={
            <>
              <Button variant="ghost" onClick={() => setDeleting(null)}>Keep it</Button>
              {deleting.item_count ? (
                deleting.is_active ? (
                  <Button variant="secondary" onClick={() => { void toggle(deleting); setDeleting(null); }}>
                    <Archive className="h-4 w-4" /> Archive instead
                  </Button>
                ) : null
              ) : (
                <Button
                  variant="danger"
                  loading={busy === deleting.id}
                  onClick={async () => {
                    const c = deleting;
                    if (await run(c.id, () => apiFetch(`/api/categories/${c.id}`, { method: "DELETE" }), `${c.name} deleted.`)) setDeleting(null);
                  }}
                >
                  Delete category
                </Button>
              )}
            </>
          }
        >
          <p className="text-[13.5px] text-fg-muted">
            {deleting.item_count
              ? `${plural(deleting.item_count, "item")} still ${deleting.item_count === 1 ? "uses" : "use"} it, so it cannot be deleted. Archive it to hide them, or rename it.`
              : "It holds no items. This cannot be undone."}
          </p>
        </Modal>
      ) : null}
    </>
  );
}

function Switch({ checked, busy, onChange, label }: { checked: boolean; busy: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={checked ? "Active: click to archive" : "Archived: click to make active"}
      disabled={busy}
      onClick={onChange}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors focus:outline-none focus-visible:ring-4 focus-visible:ring-[var(--ring)] disabled:opacity-60",
        checked ? "border-transparent bg-ok" : "border-border-strong bg-surface-3",
      )}
    >
      <span className={cn("inline-block h-4.5 w-4.5 rounded-full bg-white shadow transition-transform", checked ? "translate-x-[22px]" : "translate-x-[3px]")} />
    </button>
  );
}

function IconButton({ label, onClick, danger, type = "button", children }: {
  label: string; onClick?: () => void; danger?: boolean; type?: "button" | "submit"; children: React.ReactNode;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "rounded-lg p-1.5 text-fg-subtle transition-colors",
        danger ? "hover:bg-danger-soft hover:text-danger" : "hover:bg-surface-2 hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}
