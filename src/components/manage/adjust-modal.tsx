"use client";

import * as React from "react";
import { Minus, Plus } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import type { Item } from "@/components/items/use-items";
import { apiFetch } from "@/lib/client";
import { cn, qty } from "@/lib/utils";

export function AdjustModal({ item, onClose, onSaved }: { item: Item; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [mode, setMode] = React.useState<"add" | "remove">("add");
  const [amount, setAmount] = React.useState("");
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const n = Number(amount);
  const valid = Number.isFinite(n) && n > 0;
  const after = valid ? item.quantity + (mode === "add" ? n : -n) : item.quantity;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/items/${item.id}/adjust`, {
        method: "POST",
        body: JSON.stringify({ delta: mode === "add" ? n : -n, note }),
      });
      toast(`${item.name}: ${qty(after)} ${item.unit} in stock.`);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={`Adjust ${item.name}`}
      description={`${qty(item.quantity)} ${item.unit} in stock now`}
      footer={
        <>
          <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
          <Button form="adjust-form" type="submit" loading={busy} disabled={!valid || after < 0}>
            {mode === "add" ? "Add stock" : "Remove stock"}
          </Button>
        </>
      }
    >
      <form id="adjust-form" onSubmit={submit} className="space-y-3">
        {error ? (
          <p className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2.5 text-[13px] text-danger">{error}</p>
        ) : null}
        <div className="grid grid-cols-2 gap-1 rounded-xl border border-border bg-surface-2 p-1">
          {(["add", "remove"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-lg py-2 text-[13px] font-medium transition-colors",
                mode === m ? "bg-surface text-fg shadow-sm" : "text-fg-muted hover:text-fg",
              )}
            >
              {m === "add" ? <Plus className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
              {m === "add" ? "Add" : "Remove"}
            </button>
          ))}
        </div>
        <Field label={`How many ${item.unit}?`}>
          <Input
            autoFocus required type="number" min="0" step="any" inputMode="decimal"
            value={amount} onChange={(e) => setAmount(e.target.value)} className="tabular text-lg"
          />
        </Field>
        <Field label="Note" hint="optional">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Used on the Ikoyi job, new delivery…" />
        </Field>
        <p className={cn("text-[13px]", after < 0 ? "text-danger" : "text-fg-muted")}>
          {after < 0
            ? `Only ${qty(item.quantity)} in stock.`
            : <>After this: <span className="tabular font-semibold text-fg">{qty(after)} {item.unit}</span></>}
        </p>
      </form>
    </Modal>
  );
}
