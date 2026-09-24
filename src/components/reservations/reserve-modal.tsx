"use client";

import * as React from "react";
import { Minus, Plus, Users } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { SourceBadge } from "@/components/status";
import type { Item } from "@/components/items/use-items";
import { useRequiredSession } from "@/components/session-context";
import { apiFetch } from "@/lib/client";
import { qty, relativeTime } from "@/lib/utils";

export type Reservation = {
  id: string; ref: string; item_id: string; source: Item["source"]; quantity: number; project: string;
  notes: string | null; status: "RESERVED" | "ISSUED" | "CANCELLED"; created_at: string; closed_at: string | null;
  reserved_by: string | null; item_name: string; sku: string; unit: string; image_id: string | null;
  reserved_by_name: string | null; closed_by_name: string | null;
};

/** Reservations still holding stock for one item. */
export function useOpenReservations(itemId: string, enabled = true) {
  const [items, setItems] = React.useState<Reservation[] | null>(null);
  React.useEffect(() => {
    if (!enabled) return;
    apiFetch<{ items: Reservation[] }>(`/api/reservations?item=${itemId}&status=RESERVED`)
      .then((d) => setItems(d.items))
      .catch(() => setItems([]));
  }, [itemId, enabled]);
  return items;
}

export function ReserveModal({ item, onClose, onSaved }: { item: Item; onClose: () => void; onSaved: () => void }) {
  const me = useRequiredSession();
  const toast = useToast();
  const others = useOpenReservations(item.id);
  const [amount, setAmount] = React.useState("1");
  const [project, setProject] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const n = Number(amount);
  const valid = amount.trim() !== "" && Number.isFinite(n) && n > 0;
  const tooMany = valid && n > item.available;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || tooMany) return;
    setBusy(true);
    setError(null);
    try {
      const made = await apiFetch<{ ref: string }>("/api/reservations", {
        method: "POST",
        body: JSON.stringify({ itemId: item.id, quantity: n, project, notes }),
      });
      toast(`${made.ref}: ${qty(n)} ${item.unit} of ${item.name} reserved for ${project}.`);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reserve");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Reserve ${item.name}`}
      description={`${item.sku} · ${qty(item.available)} ${item.unit} available`}
      footer={
        <>
          <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
          <Button form="reserve-form" type="submit" loading={busy} disabled={!valid || tooMany || !project.trim()}>
            Reserve {valid ? qty(n) : ""} {item.unit}
          </Button>
        </>
      }
    >
      <form id="reserve-form" onSubmit={submit} className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-[13px] text-fg-muted">
          <SourceBadge source={item.source} />
          <span className="tabular">{qty(item.quantity)} in stock</span>
          {item.reserved ? <span className="tabular">· {qty(item.reserved)} reserved</span> : null}
          <span className="tabular font-semibold text-fg">· {qty(item.available)} available</span>
        </div>

        {others && others.length ? (
          <div className="rounded-xl border border-warn/40 bg-warn-soft px-3.5 py-3">
            <p className="flex items-center gap-1.5 text-[13px] font-semibold text-warn">
              <Users className="h-4 w-4" /> Already reserved by {others.length === 1 ? "someone else" : `${others.length} reservations`}
            </p>
            <ul className="mt-2 space-y-1 text-[12.5px] text-fg">
              {others.map((r) => (
                <li key={r.id} className="flex flex-wrap justify-between gap-x-3">
                  <span>
                    <span className="tabular font-medium">{qty(r.quantity)} {r.unit}</span> for {r.project}
                  </span>
                  <span className="text-fg-muted">
                    {r.reserved_by === me.sub ? "you" : r.reserved_by_name ?? "someone"} · {relativeTime(r.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {error ? (
          <p className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2.5 text-[13px] text-danger">{error}</p>
        ) : null}

        {item.available <= 0 ? (
          <p className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2.5 text-[13px] text-danger">
            Nothing is available to reserve right now.
          </p>
        ) : (
          <Field label={`How many ${item.unit}?`} error={tooMany ? `Only ${qty(item.available)} available.` : null}>
            <div className="flex items-center gap-2">
              <Button type="button" variant="secondary" size="icon" className="h-11 w-11 shrink-0" onClick={() => setAmount(String(Math.max(1, (n || 0) - 1)))} aria-label="One less">
                <Minus className="h-4 w-4" />
              </Button>
              <Input
                required type="number" min="0" step="any" inputMode="decimal"
                value={amount} onChange={(e) => setAmount(e.target.value)} onFocus={(e) => e.target.select()}
                className="tabular h-11 text-center text-lg font-semibold"
              />
              <Button type="button" variant="secondary" size="icon" className="h-11 w-11 shrink-0" onClick={() => setAmount(String((n || 0) + 1))} aria-label="One more">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </Field>
        )}

        <Field label="Project">
          <Input required autoFocus value={project} onChange={(e) => setProject(e.target.value)} placeholder="Ikoyi Kitchen, Palm Springs closets…" />
        </Field>
        <Field label="Notes" hint="optional">
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Island and tall units" />
        </Field>
      </form>
    </Modal>
  );
}
