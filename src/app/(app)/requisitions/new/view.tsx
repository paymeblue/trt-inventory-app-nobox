"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Trash2, AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { ProductPicker, type PickedProduct } from "@/components/product-picker";
import { ProductImage } from "@/components/product-image";
import { useLookups } from "@/lib/lookups";
import { apiFetch } from "@/lib/client";
import { qty } from "@/lib/utils";

type Line = { product: PickedProduct; quantity: string; notes: string };

export function NewRequisitionView() {
  const router = useRouter();
  const toast = useToast();
  const { locations, projects } = useLookups();

  const [title, setTitle] = React.useState("");
  const [fromLocationId, setFrom] = React.useState("");
  const [toLocationId, setTo] = React.useState("");
  const [projectId, setProjectId] = React.useState("");
  const [priority, setPriority] = React.useState("NORMAL");
  const [neededBy, setNeededBy] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [lines, setLines] = React.useState<Line[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!fromLocationId && locations.length) {
      const store = locations.find((l) => l.kind === "WAREHOUSE") ?? locations[0];
      setFrom(store.id);
    }
  }, [locations, fromLocationId]);



  function addLine(product: PickedProduct) {
    setLines((prev) =>
      prev.some((l) => l.product.id === product.id)
        ? prev
        : [...prev, { product, quantity: "", notes: "" }],
    );
  }

  async function submit(submitNow: boolean) {
    setBusy(true);
    setError(null);
    try {
      const data = await apiFetch<{ id: string; ref: string }>("/api/requisitions", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          fromLocationId,
          toLocationId: toLocationId || null,
          projectId: projectId || null,
          priority,
          neededBy: neededBy || null,
          notes: notes.trim() || null,
          submit: submitNow,
          lines: lines.map((l) => ({
            productId: l.product.id,
            qty: Number(l.quantity),
            notes: l.notes.trim() || null,
          })),
        }),
      });
      toast(`${data.ref} ${submitNow ? "submitted for approval" : "saved as a draft"}.`);
      router.push(`/requisitions/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the requisition");
      setBusy(false);
    }
  }

  const valid = title.trim() && fromLocationId && lines.length > 0 && lines.every((l) => Number(l.quantity) > 0);

  return (
    <>
      <Link
        href="/requisitions"
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-fg-muted transition-colors hover:text-fg"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Requisitions
      </Link>

      <PageHeader
        title="New requisition"
        description="Request material from a store for a project, a production section or a site."
      />

      {error ? (
        <div className="mb-3 flex items-start gap-2.5 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
          <p className="text-[13px] text-danger">{error}</p>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_320px]">
        <div className="space-y-3">
          <Card>
            <CardHeader title="Details" />
            <CardBody className="space-y-3">
              <Field label="What is this for?">
                <Input
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Kitchen carcass materials — Lekki Phase 1"
                />
              </Field>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Issue from" hint="store">
                  <Select value={fromLocationId} onChange={(e) => setFrom(e.target.value)} required>
                    {locations.map((l) => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Deliver to" hint="leave blank if consumed">
                  <Select value={toLocationId} onChange={(e) => setTo(e.target.value)}>
                    <option value="">Consumed on issue</option>
                    {locations.filter((l) => l.id !== fromLocationId).map((l) => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </Select>
                </Field>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Field label="Project">
                  <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                    <option value="">Not project-related</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Priority">
                  <Select value={priority} onChange={(e) => setPriority(e.target.value)}>
                    <option value="LOW">Low</option>
                    <option value="NORMAL">Normal</option>
                    <option value="HIGH">High</option>
                    <option value="URGENT">Urgent</option>
                  </Select>
                </Field>
                <Field label="Needed by">
                  <Input type="date" value={neededBy} onChange={(e) => setNeededBy(e.target.value)} />
                </Field>
              </div>

              <Field label="Notes">
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Anything the approver or storekeeper should know."
                />
              </Field>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Materials"
              description={`${lines.length} line${lines.length === 1 ? "" : "s"}`}
            />
            <CardBody className="space-y-3">
              <ProductPicker
                onPick={addLine}
                locationId={fromLocationId}
                exclude={lines.map((l) => l.product.id)}
              />

              {lines.length ? (
                <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
                  {lines.map((line, i) => {
                    const requested = Number(line.quantity) || 0;
                    const short = requested > line.product.on_hand;
                    return (
                      <div key={line.product.id} className="p-3">
                        <div className="flex items-center gap-3">
                          <ProductImage
                            imageId={line.product.image_id}
                            name={line.product.name}
                            className="h-10 w-10"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13.5px] font-medium">{line.product.name}</p>
                            <p className="tabular truncate text-[11.5px] text-fg-subtle">
                              {line.product.sku} · {qty(line.product.on_hand)} {line.product.unit} in store
                            </p>
                          </div>
                          <Input
                            type="number" step="0.001" min="0.001" required inputMode="decimal"
                            value={line.quantity}
                            onChange={(e) =>
                              setLines((prev) =>
                                prev.map((l, idx) => (idx === i ? { ...l, quantity: e.target.value } : l)),
                              )
                            }
                            placeholder="Qty"
                            className="tabular h-9 w-24 shrink-0 text-right"
                          />
                          <button
                            type="button"
                            onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== i))}
                            className="shrink-0 rounded-lg p-1.5 text-fg-subtle transition-colors hover:bg-danger-soft hover:text-danger"
                            aria-label="Remove line"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                        {short ? (
                          <p className="mt-2 flex items-center gap-1.5 text-[12px] text-warn">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            Only {qty(line.product.on_hand)} {line.product.unit} available — this line will
                            need a restock before it can be issued in full.
                          </p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-[13px] text-fg-subtle">
                  Search above to add the materials you need.
                </p>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="lg:sticky lg:top-[72px] lg:h-fit">
          <Card>
            <CardHeader title="Summary" />
            <CardBody className="space-y-3">
              <div className="space-y-2 text-[13px]">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-fg-muted">Lines</span>
                  <span className="tabular font-medium">{lines.length}</span>
                </div>
                <div className="flex items-baseline justify-between gap-3 border-t border-border pt-2">
                  <span className="text-fg-muted">Total units</span>
                  <span className="tabular text-[15px] font-semibold">
                    {qty(lines.reduce((s, l) => s + (Number(l.quantity) || 0), 0))}
                  </span>
                </div>

              </div>

              <div className="space-y-2 pt-1">
                <Button className="w-full" onClick={() => submit(true)} loading={busy} disabled={!valid}>
                  Submit for approval
                </Button>
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={() => submit(false)}
                  disabled={busy || !valid}
                >
                  Save as draft
                </Button>
              </div>

              <p className="text-[12px] leading-relaxed text-fg-subtle">
                Submitting sends this to the factory manager for approval. Stock only leaves the store once
                the storekeeper issues it.
              </p>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
