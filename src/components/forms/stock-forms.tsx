"use client";

import * as React from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { SearchInput } from "@/components/search-input";
import type { Item } from "@/components/items/use-items";
import type { Reservation } from "@/components/reservations/reserve-modal";
import { useRequiredSession } from "@/components/session-context";
import { Lookup, MaterialPicker, n, StatusCheck } from "./form-parts";
import { apiFetch } from "@/lib/client";
import type { Source } from "@/lib/rbac";
import { cn, qty } from "@/lib/utils";

/** The form's "… By" and "… Email" cells, filled from the signed-in account. */
function Who({ name, email }: { name: string; email: string }) {
  const me = useRequiredSession();
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Field label={name}><Input value={me.name} disabled /></Field>
      <Field label={email}><Input value={me.email} disabled /></Field>
    </div>
  );
}

function ErrorLine({ error }: { error: string | null }) {
  return error ? <p className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2.5 text-[13px] text-danger">{error}</p> : null;
}

/** Stock_Addition_Form: the inventory team records new incoming stock. */
export function StockAdditionForm({
  source, item: initial, onClose, onSaved,
}: { source: Source; item?: Item | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [item, setItem] = React.useState<Item | null>(initial ?? null);
  const [amount, setAmount] = React.useState("");
  const [supplierRef, setSupplierRef] = React.useState("");
  const [documentRef, setDocumentRef] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const quantity = Number(amount);
  const status = !item || amount.trim() === "" ? "Missing required fields" : !(quantity > 0) ? "Quantity must be greater than zero" : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (status || !item) return;
    setBusy(true);
    setError(null);
    try {
      const done = await apiFetch<{ ref: string; quantity: number }>("/api/stock/addition", {
        method: "POST",
        body: JSON.stringify({ itemId: item.id, quantity, supplierRef, documentRef, notes }),
      });
      toast(`${done.ref}: ${qty(quantity)} ${item.unit} of ${item.sku} added. ${qty(done.quantity)} in stock.`);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open onClose={onClose} size="lg" title="Stock Addition Form"
      description="Record new incoming stock. Every posted line is written to the Stock Addition Log."
      footer={
        <>
          <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
          <Button form="addition-form" type="submit" loading={busy} disabled={status !== null}>Post addition</Button>
        </>
      }
    >
      <form id="addition-form" onSubmit={submit} className="space-y-3.5">
        <Who name="Recorded By" email="Recorder Email" />
        <Field label="Material (Code | Name)"><MaterialPicker value={item} onChange={setItem} source={source} autoFocus={!initial} /></Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Quantity Added" hint={item?.unit}>
            <Input autoFocus={Boolean(initial)} type="number" min="0" step="any" inputMode="decimal" value={amount}
              onChange={(e) => setAmount(e.target.value)} className="tabular font-semibold" />
          </Field>
          <Field label="Supplier / Reference"><Input value={supplierRef} onChange={(e) => setSupplierRef(e.target.value)} /></Field>
          <Field label="Document Ref"><Input value={documentRef} onChange={(e) => setDocumentRef(e.target.value)} placeholder="Waybill, invoice…" /></Field>
        </div>
        <Field label="Notes"><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        {item ? (
          <Lookup rows={[
            ["Material Code", <span key="c" className="code">{item.sku}</span>],
            ["Material Name", item.name],
            ["Category", item.category],
            ["Unit", item.unit],
            ["In stock now", n(item.quantity)],
            ["After this", quantity > 0 ? <span key="a" className="text-ok">{n(item.quantity + quantity)}</span> : "—"],
          ]} />
        ) : null}
        <ErrorLine error={error} />
        <StatusCheck message={status} />
      </form>
    </Modal>
  );
}

/**
 * Stock_Issue_Form: issue against a reservation, in full or in part. Only
 * possible up to the reservation's balance and the stock physically there.
 */
export function StockIssueForm({
  source, reservationId, onClose, onSaved,
}: { source: Source; reservationId?: string | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [open, setOpen] = React.useState<Reservation[] | null>(null);
  const [search, setSearch] = React.useState("");
  const [selected, setSelected] = React.useState<string>(reservationId ?? "");
  const [amount, setAmount] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [available, setAvailable] = React.useState<{ in_stock: number; available: number } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    apiFetch<{ items: Reservation[] }>(`/api/reservations?status=OPEN&source=${source}&pageSize=200`)
      .then((d) => setOpen(d.items))
      .catch(() => setOpen([]));
  }, [source]);

  const r = open?.find((x) => x.id === selected) ?? null;

  React.useEffect(() => {
    if (!r) return setAvailable(null);
    setAmount(String(r.balance));
    apiFetch<Item>(`/api/items/${r.item_id}`)
      .then((i) => setAvailable({ in_stock: i.quantity, available: i.available }))
      .catch(() => setAvailable(null));
  }, [r?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const quantity = Number(amount);
  const status = !r || amount.trim() === ""
    ? "Missing required fields"
    : !(quantity > 0)
      ? "Quantity must be greater than zero"
      : quantity > r.balance
        ? "Issue exceeds remaining reservation balance"
        : available && quantity > available.in_stock
          ? `Not enough in stock (${qty(available.in_stock)} on hand)`
          : null;

  const filtered = (open ?? []).filter((x) =>
    !search.trim() ? true : `${x.ref} ${x.project} ${x.sku} ${x.item_name} ${x.reserved_by_name ?? ""}`.toLowerCase().includes(search.toLowerCase()),
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (status || !r) return;
    setBusy(true);
    setError(null);
    try {
      const done = await apiFetch<{ issueRef: string; balance: number; stockLeft: number }>("/api/stock/issue", {
        method: "POST",
        body: JSON.stringify({ reservationId: r.id, quantity, notes }),
      });
      toast(`${done.issueRef}: ${qty(quantity)} ${r.unit} of ${r.sku} issued against ${r.ref}. ${done.balance > 0 ? `${qty(done.balance)} still reserved. ` : ""}${qty(done.stockLeft)} left in stock.`);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not issue");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open onClose={onClose} size="lg" title="Stock Issue Form"
      description="Issue against a reservation when the material leaves the store for production. Only then is it deducted."
      footer={
        <>
          <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
          <Button form="issue-form" type="submit" loading={busy} disabled={status !== null}>Issue and deduct</Button>
        </>
      }
    >
      <form id="issue-form" onSubmit={submit} className="space-y-3.5">
        <Who name="Issued By" email="Issuer Email" />
        <Field label="Reservation ID">
          {!reservationId ? (
            <SearchInput value={search} onChange={setSearch} placeholder="Search REQ number, project, material, designer…" className="mb-2" />
          ) : null}
          <Select value={selected} onChange={(e) => setSelected(e.target.value)} disabled={!open}>
            <option value="">{open ? `Choose one of ${filtered.length} open reservations` : "Loading…"}</option>
            {filtered.map((x) => (
              <option key={x.id} value={x.id}>
                {x.ref} · {x.project} · {x.sku} | {x.item_name} · {qty(x.balance)} left
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Quantity To Issue" hint={r ? `${r.unit}, up to ${qty(r.balance)}` : undefined}>
            <Input type="number" min="0" step="any" inputMode="decimal" value={amount}
              onChange={(e) => setAmount(e.target.value)} onFocus={(e) => e.target.select()} className="tabular font-semibold" />
          </Field>
          <Field label="Notes"><Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="CLOSETS, collected by Kenneth…" /></Field>
        </div>
        {r ? (
          <Lookup rows={[
            ["Project Name", r.project],
            ["Material Code", <span key="c" className="code">{r.sku}</span>],
            ["Material Name", r.item_name],
            ["Reserved Qty", n(r.quantity)],
            ["Already Issued", n(r.issued_qty)],
            ["Balance To Issue", <span key="b" className="font-semibold">{n(r.balance)}</span>],
            ["In stock", available ? n(available.in_stock) : "…"],
            ["Available Inventory", available ? n(available.available) : "…"],
          ]} />
        ) : null}
        <ErrorLine error={error} />
        <StatusCheck message={status} />
      </form>
    </Modal>
  );
}

export const ADJUSTMENT_TYPES = [
  "Return to Stock",
  "Additional Issue",
  "Reservation Release",
  "Damage / Write-off",
  "Count Gain",
  "Count Loss",
] as const;

/** The workbook's Stock_Impact / Reserved_Impact / Issued_Impact formulas. */
function impacts(type: string, q: number) {
  switch (type) {
    case "Return to Stock": return [q, 0, -q];
    case "Additional Issue": return [-q, 0, q];
    case "Reservation Release": return [0, -q, 0];
    case "Damage / Write-off": return [-q, 0, 0];
    case "Count Gain": return [q, 0, 0];
    case "Count Loss": return [-q, 0, 0];
    default: return [0, 0, 0];
  }
}

const signed = (v: number) => (v > 0 ? `+${qty(v)}` : qty(v));

/**
 * Stock_Adjustment_Form: returns, extra issue, reservation release, count
 * gains/losses and write-offs.
 */
export function StockAdjustmentForm({
  source, item: initial, type: initialType, onClose, onSaved,
}: { source: Source; item?: Item | null; type?: string; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [item, setItem] = React.useState<Item | null>(initial ?? null);
  const [type, setType] = React.useState(initialType ?? "");
  const [related, setRelated] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [openRes, setOpenRes] = React.useState<Reservation[]>([]);

  React.useEffect(() => {
    if (!item) return setOpenRes([]);
    apiFetch<{ items: Reservation[] }>(`/api/reservations?item=${item.id}&status=OPEN`)
      .then((d) => setOpenRes(d.items))
      .catch(() => setOpenRes([]));
  }, [item]);

  const quantity = Number(amount);
  const [stock, reserved, issued] = impacts(type, quantity > 0 ? quantity : 0);
  const releasing = type === "Reservation Release";
  const release = releasing ? openRes.find((r) => r.ref === related) : null;
  const status = !item || !type || amount.trim() === "" || (releasing && !related)
    ? "Missing required fields"
    : !(quantity > 0)
      ? "Quantity must be greater than zero"
      : releasing && release && quantity > release.balance
        ? `${release.ref} only has ${qty(release.balance)} left reserved`
        : stock < 0 && item.quantity + stock < item.reserved
          ? `Only ${qty(Math.max(0, item.quantity - item.reserved))} unreserved in stock`
          : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (status || !item) return;
    setBusy(true);
    setError(null);
    try {
      const done = await apiFetch<{ ref: string }>("/api/stock/adjustment", {
        method: "POST",
        body: JSON.stringify({ itemId: item.id, type, quantity, relatedRef: related, notes }),
      });
      toast(`${done.ref}: ${type} of ${qty(quantity)} ${item.unit} on ${item.sku} posted.`);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open onClose={onClose} size="lg" title="Stock Adjustment Form"
      description="Returns, extra issue, reservation release, count gains and losses, and write-offs."
      footer={
        <>
          <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
          <Button form="adjustment-form" type="submit" loading={busy} disabled={status !== null}
            variant={stock < 0 ? "danger" : "primary"}>Post adjustment</Button>
        </>
      }
    >
      <form id="adjustment-form" onSubmit={submit} className="space-y-3.5">
        <Who name="Adjusted By" email="Adjuster Email" />
        <Field label="Material (Code | Name)"><MaterialPicker value={item} onChange={setItem} source={source} autoFocus={!initial} /></Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Adjustment Type">
            <Select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">Choose…</option>
              {ADJUSTMENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
          </Field>
          <Field label="Quantity Impact" hint={item?.unit}>
            <Input type="number" min="0" step="any" inputMode="decimal" value={amount}
              onChange={(e) => setAmount(e.target.value)} className="tabular font-semibold" />
          </Field>
        </div>
        <Field label="Related ID (Reservation or Issue)" hint={releasing ? "required for a release" : "optional"}>
          {releasing ? (
            <Select value={related} onChange={(e) => setRelated(e.target.value)}>
              <option value="">{openRes.length ? "Choose the reservation to release" : "This material has no open reservation"}</option>
              {openRes.map((r) => (
                <option key={r.id} value={r.ref}>{r.ref} · {r.project} · {qty(r.balance)} reserved</option>
              ))}
            </Select>
          ) : (
            <Input value={related} onChange={(e) => setRelated(e.target.value)} placeholder="REQ-… or ISS-…" className="code" />
          )}
        </Field>
        <Field label="Reason / Notes"><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        {item ? (
          <Lookup rows={[
            ["Material Code", <span key="c" className="code">{item.sku}</span>],
            ["Material Name", item.name],
            ["Stock Impact Signed", <span key="s" className={cn(stock < 0 && "text-danger", stock > 0 && "text-ok")}>{signed(stock)}</span>],
            ["Reserved Impact Signed", signed(reserved)],
            ["Issued Impact Signed", signed(issued)],
            ["In stock → after", `${n(item.quantity)} → ${n(item.quantity + stock)}`],
          ]} />
        ) : null}
        <ErrorLine error={error} />
        <StatusCheck message={status} />
      </form>
    </Modal>
  );
}
