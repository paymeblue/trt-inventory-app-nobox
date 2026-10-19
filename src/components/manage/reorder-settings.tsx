"use client";

import * as React from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { apiFetch } from "@/lib/client";
import { SOURCE_LABELS, type Source } from "@/lib/rbac";
import { relativeTime } from "@/lib/utils";

type Settings = {
  lead_time_days: number; cover_days: number; reorder_calculated_at: string | null;
  usage_window_days: number; min_window_days: number; service_z: number;
};

/** A side's default lead time and days of cover, and how the reorder figures come from them. */
export function ReorderSettings({ source, onClose, onSaved }: { source: Source; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const label = SOURCE_LABELS[source];
  const [settings, setSettings] = React.useState<Settings | null>(null);
  const [lead, setLead] = React.useState("");
  const [cover, setCover] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    apiFetch<Settings>(`/api/reorder-settings?source=${source}`)
      .then((s) => {
        setSettings(s);
        setLead(String(s.lead_time_days));
        setCover(String(s.cover_days));
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load the settings"));
  }, [source]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/api/reorder-settings", {
        method: "PATCH",
        body: JSON.stringify({ source, leadTimeDays: lead, coverDays: cover }),
      });
      toast(`${label} reorder figures worked out again.`);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`${label} reorder settings`}
      description="Reorder_Level and Reorder_Quantity are worked out for every material from what is issued, unless one was set by hand on the material."
      footer={
        <>
          <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
          <Button form="reorder-settings" type="submit" loading={busy} disabled={!settings}>Save and recalculate</Button>
        </>
      }
    >
      <form id="reorder-settings" onSubmit={submit} className="space-y-4">
        {error ? (
          <p className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2.5 text-[13px] text-danger">{error}</p>
        ) : null}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Lead time" hint="days, order to arrival">
            <Input type="number" min="0.5" step="any" inputMode="decimal" required value={lead} onChange={(e) => setLead(e.target.value)} className="tabular" />
          </Field>
          <Field label="Days of cover" hint="each order should last">
            <Input type="number" min="1" step="any" inputMode="decimal" required value={cover} onChange={(e) => setCover(e.target.value)} className="tabular" />
          </Field>
        </div>
        {settings ? (
          <div className="space-y-1.5 rounded-xl border border-border bg-surface-2/40 px-3.5 py-3 text-[12.5px] text-fg-muted">
            <p>
              <span className="font-medium text-fg">Daily usage</span> is what was issued over the last {settings.usage_window_days} days
              (at least {settings.min_window_days} for a new material), less anything returned to stock.
            </p>
            <p>
              <span className="font-medium text-fg">Reorder_Level</span> = daily usage × lead time + safety stock, where safety stock
              = {settings.service_z} × the day-to-day variation in usage × √lead time.
            </p>
            <p><span className="font-medium text-fg">Reorder_Quantity</span> = daily usage × days of cover.</p>
            <p>A material can have its own lead time. A material nothing has been issued from yet has a Reorder_Level of 0.</p>
            {settings.reorder_calculated_at ? (
              <p className="text-fg-subtle">Last worked out {relativeTime(settings.reorder_calculated_at)}; again at least hourly.</p>
            ) : null}
          </div>
        ) : null}
      </form>
    </Modal>
  );
}
