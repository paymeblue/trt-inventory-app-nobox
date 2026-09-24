"use client";

import * as React from "react";
import { ArrowRight, Minus, Plus } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import type { Item } from "@/components/items/use-items";
import { apiFetch } from "@/lib/client";
import { cn, qty } from "@/lib/utils";

export type AdjustMode = "add" | "deduct";

const QUICK = [1, 5, 10, 50];

export function AdjustModal({
  item,
  initialMode = "add",
  onClose,
  onSaved,
}: {
  item: Item;
  initialMode?: AdjustMode;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [mode, setMode] = React.useState<AdjustMode>(initialMode);
  const [amount, setAmount] = React.useState("1");
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const n = Number(amount);
  const valid = amount.trim() !== "" && Number.isFinite(n) && n > 0;
  const deducting = mode === "deduct";
  const after = valid ? item.quantity + (deducting ? -n : n) : item.quantity;
  // Reserved stock is spoken for; it leaves through Issue on the Reservations page.
  const deductible = Math.max(0, item.quantity - item.reserved);
  const tooMany = deducting && valid && n > deductible;

  const bump = (by: number) => setAmount(String(Math.max(0, (Number.isFinite(n) ? n : 0) + by)));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || tooMany) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/items/${item.id}/adjust`, {
        method: "POST",
        body: JSON.stringify({ delta: deducting ? -n : n, note }),
      });
      toast(
        deducting
          ? `Deducted ${qty(n)} ${item.unit} of ${item.name}. Designers have been notified.`
          : `Added ${qty(n)} ${item.unit} of ${item.name}.`,
      );
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
      title={item.name}
      description={`${item.sku} · ${qty(item.quantity)} ${item.unit} in stock`}
      footer={
        <>
          <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
          <Button
            form="adjust-form"
            type="submit"
            loading={busy}
            disabled={!valid || tooMany}
            variant={deducting ? "danger" : "primary"}
          >
            {deducting ? `Deduct ${valid ? qty(n) : ""} ${item.unit}` : `Add ${valid ? qty(n) : ""} ${item.unit}`}
          </Button>
        </>
      }
    >
      <form id="adjust-form" onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-1 rounded-xl border border-border bg-surface-2 p-1" role="tablist">
          {(["add", "deduct"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => {
                setMode(m);
                setError(null);
              }}
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-[14px] font-semibold transition-colors",
                mode === m
                  ? m === "deduct"
                    ? "bg-danger text-white shadow-sm"
                    : "bg-surface text-fg shadow-sm"
                  : "text-fg-muted hover:text-fg",
              )}
            >
              {m === "add" ? <Plus className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
              {m === "add" ? "Add stock" : "Deduct"}
            </button>
          ))}
        </div>

        {error ? (
          <p className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2.5 text-[13px] text-danger">{error}</p>
        ) : null}

        <Field label={`How many ${item.unit} to ${deducting ? "deduct" : "add"}?`}>
          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" size="icon" className="h-12 w-12 shrink-0" onClick={() => bump(-1)} aria-label="One less">
              <Minus className="h-4 w-4" />
            </Button>
            <Input
              autoFocus
              required
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onFocus={(e) => e.target.select()}
              className="tabular h-12 text-center text-xl font-semibold"
            />
            <Button type="button" variant="secondary" size="icon" className="h-12 w-12 shrink-0" onClick={() => bump(1)} aria-label="One more">
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </Field>

        <div className="flex flex-wrap gap-1.5">
          {QUICK.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => setAmount(String(q))}
              className={cn(
                "tabular rounded-lg border px-3 py-1.5 text-[13px] font-medium transition-colors",
                n === q ? "border-accent bg-accent-soft text-accent" : "border-border text-fg-muted hover:text-fg",
              )}
            >
              {q}
            </button>
          ))}
          {deducting && deductible > 0 ? (
            <button
              type="button"
              onClick={() => setAmount(String(deductible))}
              className="rounded-lg border border-border px-3 py-1.5 text-[13px] font-medium text-fg-muted transition-colors hover:text-fg"
            >
              All {item.reserved > 0 ? "unreserved " : ""}({qty(deductible)})
            </button>
          ) : null}
        </div>

        <div
          className={cn(
            "flex items-center justify-center gap-3 rounded-xl border px-4 py-3",
            tooMany ? "border-danger/40 bg-danger-soft" : "border-border bg-surface-2/50",
          )}
        >
          <span className="tabular text-[15px] text-fg-muted">{qty(item.quantity)}</span>
          <ArrowRight className="h-4 w-4 text-fg-subtle" />
          <span className={cn("tabular text-[20px] font-semibold", tooMany ? "text-danger" : deducting ? "text-fg" : "text-ok")}>
            {tooMany ? "—" : `${qty(after)} ${item.unit}`}
          </span>
        </div>
        {deducting && item.reserved > 0 ? (
          <p className={cn("-mt-2 text-[12.5px]", tooMany ? "font-medium text-danger" : "text-fg-muted")}>
            {qty(item.reserved)} {item.unit} are reserved, so at most {qty(deductible)} can be deducted here. Reserved stock is
            taken out when the reservation is issued.
          </p>
        ) : tooMany ? (
          <p className="-mt-2 text-[12.5px] font-medium text-danger">Only {qty(item.quantity)} {item.unit} in stock.</p>
        ) : null}

        <Field label="Note" hint="optional">
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={deducting ? "Used on the Ikoyi job, damaged…" : "New delivery, returned from site…"}
          />
        </Field>
      </form>
    </Modal>
  );
}
