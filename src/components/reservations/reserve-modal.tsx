"use client";

import * as React from "react";
import { Users } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { SourceBadge } from "@/components/status";
import type { Item } from "@/components/items/use-items";
import { useRequiredSession } from "@/components/session-context";
import { Lookup, MaterialPicker, n, StatusCheck } from "@/components/forms/form-parts";
import { apiFetch } from "@/lib/client";
import { qty, relativeTime } from "@/lib/utils";

/** A Reservation_Log row. */
export type Reservation = {
  id: string; ref: string; item_id: string; source: Item["source"];
  quantity: number; issued_qty: number; released_qty: number; balance: number;
  project: string; notes: string | null;
  status: "RESERVED" | "PART_ISSUED" | "ISSUED" | "CANCELLED"; legacy_status: string | null;
  available_at_request: number | null; created_at: string; closed_at: string | null;
  reserved_by: string | null; reserved_by_name: string | null; reserved_by_email: string | null;
  item_name: string; sku: string; unit: string; image_id: string | null; category: string | null;
  in_stock: number; closed_by_name: string | null;
};

/** Reservations still holding stock for one material. */
export function useOpenReservations(itemId: string | null, enabled = true) {
  const [items, setItems] = React.useState<Reservation[] | null>(null);
  React.useEffect(() => {
    if (!enabled || !itemId) {
      setItems(null);
      return;
    }
    apiFetch<{ items: Reservation[] }>(`/api/reservations?item=${itemId}&status=OPEN`)
      .then((d) => setItems(d.items))
      .catch(() => setItems([]));
  }, [itemId, enabled]);
  return items;
}

/**
 * Reservation_Form. Designer Name and Email come from the signed-in account;
 * the lookups and Status Check mirror the workbook's.
 */
export function ReserveModal({
  item: initial, onClose, onSaved, inline,
}: { item?: Item | null; onClose: () => void; onSaved: () => void; inline?: boolean }) {
  const me = useRequiredSession();
  const toast = useToast();
  const [item, setItem] = React.useState<Item | null>(initial ?? null);
  const others = useOpenReservations(item?.id ?? null);
  const [project, setProject] = React.useState("");
  const [amount, setAmount] = React.useState("1");
  const [notes, setNotes] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const quantity = Number(amount);
  const status = !project.trim() || !item || amount.trim() === ""
    ? "Missing required fields"
    : !Number.isFinite(quantity) || quantity <= 0
      ? "Quantity must be greater than zero"
      : item.available <= 0
        ? "OUT OF STOCK"
        : quantity > item.available
          ? "Insufficient available quantity"
          : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (status || !item) return;
    setBusy(true);
    setError(null);
    try {
      const made = await apiFetch<{ ref: string }>("/api/reservations", {
        method: "POST",
        body: JSON.stringify({ itemId: item.id, quantity, project, notes }),
      });
      toast(`${made.ref}: ${qty(quantity)} ${item.unit} of ${item.sku} | ${item.name} reserved for ${project}.`);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reserve");
    } finally {
      setBusy(false);
    }
  }

  const footer = (
    <>
      <Button variant="ghost" type="button" onClick={onClose}>{inline ? "Clear" : "Cancel"}</Button>
      <Button form="reserve-form" type="submit" loading={busy} disabled={status !== null}>Submit reservation</Button>
    </>
  );
  const content = (
      <form id="reserve-form" onSubmit={submit} className="space-y-3.5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Designer Name"><Input value={me.name} disabled /></Field>
          <Field label="Designer Email"><Input value={me.email} disabled /></Field>
        </div>
        <Field label="Project Name">
          <Input autoFocus={Boolean(initial)} value={project} onChange={(e) => setProject(e.target.value)} placeholder="DAGGASH, Palm Springs, EXHIBITION…" />
        </Field>
        <Field label="Material (Code | Name)">
          <MaterialPicker value={item} onChange={setItem} autoFocus={!initial} />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Quantity Requested" hint={item ? item.unit : undefined}>
            <Input
              type="number" min="0" step="any" inputMode="decimal"
              value={amount} onChange={(e) => setAmount(e.target.value)} onFocus={(e) => e.target.select()}
              className="tabular font-semibold"
            />
          </Field>
          <Field label="Purpose / Notes">
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="CLOSETS, TV UNIT, EXHIBITION…" />
          </Field>
        </div>

        {item ? (
          <Lookup
            rows={[
              ["Material Code", <span key="c" className="code">{item.sku}</span>],
              ["Material Name", item.name],
              ["Category", item.category],
              ["Specification", item.spec],
              ["Dimensions", item.dimensions],
              ["Unit", item.unit],
              ["From", <SourceBadge key="s" source={item.source} />],
              ["Available Qty", <span key="a" className="tabular font-semibold">{n(item.available)}</span>],
            ]}
          />
        ) : null}

        {others && others.length ? (
          <div className="rounded-xl border border-warn/40 bg-warn-soft px-3.5 py-3">
            <p className="flex items-center gap-1.5 text-[13px] font-semibold text-warn">
              <Users className="h-4 w-4" /> Already reserved: {qty(others.reduce((s, r) => s + r.balance, 0))} {item?.unit} by {others.length === 1 ? "one reservation" : `${others.length} reservations`}
            </p>
            <ul className="mt-2 space-y-1 text-[12.5px]">
              {others.slice(0, 6).map((r) => (
                <li key={r.id} className="flex flex-wrap justify-between gap-x-3">
                  <span><span className="tabular font-medium">{qty(r.balance)}</span> for {r.project}</span>
                  <span className="text-fg-muted">
                    {r.reserved_by === me.sub ? "you" : r.reserved_by_name ?? r.reserved_by_email ?? "—"} · {relativeTime(r.created_at)} · <span className="code">{r.ref}</span>
                  </span>
                </li>
              ))}
              {others.length > 6 ? <li className="text-fg-muted">and {others.length - 6} more</li> : null}
            </ul>
          </div>
        ) : null}

        {error ? <p className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2.5 text-[13px] text-danger">{error}</p> : null}
        <StatusCheck message={status} />
      </form>
  );

  if (inline) {
    return (
      <div className="space-y-4">
        {content}
        <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">{footer}</div>
      </div>
    );
  }
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="Reservation Form"
      description="Designers reserve stock here. The stock is set aside for your project and is taken out when the inventory team issues it."
      footer={footer}
    >
      {content}
    </Modal>
  );
}
