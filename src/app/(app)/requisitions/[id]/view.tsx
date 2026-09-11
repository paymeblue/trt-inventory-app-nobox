"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowLeft, Check, X, PackageCheck, Send, Undo2, TriangleAlert, CheckCheck, Ban,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Field, Input, Textarea } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/empty";
import { PageLoading } from "@/components/ui/spinner";
import { TableWrap, Th, Td, Tr } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { ProductImage } from "@/components/product-image";
import { MovementBadge, RequisitionStatus } from "@/components/status";
import { usePermission } from "@/components/session-context";
import { apiFetch } from "@/lib/client";
import { cn, formatDate, formatDateTime, qty } from "@/lib/utils";

type Item = {
  id: string; qty_requested: number; qty_approved: number | null;
  qty_issued: number; qty_returned: number; notes: string | null;
  product_id: string; sku: string; product_name: string; unit: string;
  image_id: string | null; unit_cost: number; available_at_source: number;
};

type Detail = {
  requisition: {
    id: string; ref: string; title: string; status: string; priority: string;
    needed_by: string | null; notes: string | null; created_at: string;
    approved_at: string | null; issued_at: string | null; received_at: string | null;
    rejected_reason: string | null;
    project_name: string | null; project_code: string | null;
    from_location: string; to_location: string | null;
    requested_by_name: string | null; approved_by_name: string | null;
    issued_by_name: string | null; received_by_name: string | null;
  };
  items: Item[];
  movements: {
    id: string; movement_type: string; quantity: number; created_at: string;
    sku: string; product_name: string; created_by_name: string | null;
  }[];
};

const TIMELINE = [
  { key: "created_at", label: "Raised", by: "requested_by_name" },
  { key: "approved_at", label: "Approved", by: "approved_by_name" },
  { key: "issued_at", label: "Issued from store", by: "issued_by_name" },
  { key: "received_at", label: "Received on site", by: "received_by_name" },
] as const;

export function RequisitionDetail({ id }: { id: string }) {
  const may = usePermission();
  const toast = useToast();

  const [data, setData] = React.useState<Detail | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [rejecting, setRejecting] = React.useState(false);
  const [rejectReason, setRejectReason] = React.useState("");
  const [returning, setReturning] = React.useState(false);
  const [returnQty, setReturnQty] = React.useState<Record<string, string>>({});
  const [approving, setApproving] = React.useState(false);
  const [approveQty, setApproveQty] = React.useState<Record<string, string>>({});

  const load = React.useCallback(async () => {
    try {
      setData(await apiFetch<Detail>(`/api/requisitions/${id}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load this requisition");
    }
  }, [id]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function act(action: string, body: Record<string, unknown> = {}) {
    setBusy(true);
    try {
      await apiFetch(`/api/requisitions/${id}/transition`, {
        method: "POST",
        body: JSON.stringify({ action, ...body }),
      });
      toast(`Requisition ${action}d.`);
      setRejecting(false);
      setApproving(false);
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Action failed", "error");
    } finally {
      setBusy(false);
    }
  }

  async function submitReturn() {
    const lines = Object.entries(returnQty)
      .filter(([, v]) => Number(v) > 0)
      .map(([itemId, v]) => ({ itemId, quantity: Number(v) }));
    if (!lines.length) return;

    setBusy(true);
    try {
      await apiFetch(`/api/requisitions/${id}/return`, {
        method: "POST",
        body: JSON.stringify({ lines }),
      });
      toast("Return recorded and stock is back in the store.");
      setReturning(false);
      setReturnQty({});
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not record the return", "error");
    } finally {
      setBusy(false);
    }
  }

  if (error) return <EmptyState icon={TriangleAlert} title="Requisition not found" description={error} />;
  if (!data) return <PageLoading />;

  const r = data.requisition;
  const unitsRequested = data.items.reduce((s, i) => s + i.qty_requested, 0);
  const unitsIssued = data.items.reduce((s, i) => s + i.qty_issued, 0);
  const outstanding = data.items.some((i) => i.qty_issued - i.qty_returned > 0);

  const actions: React.ReactNode[] = [];
  if (r.status === "DRAFT" && may("requisition:create")) {
    actions.push(
      <Button key="submit" onClick={() => act("submit")} loading={busy}>
        <Send className="h-4 w-4" /> Submit for approval
      </Button>,
    );
  }
  if (r.status === "SUBMITTED" && may("requisition:approve")) {
    actions.push(
      <Button
        key="approve"
        onClick={() => {
          setApproveQty(Object.fromEntries(data.items.map((i) => [i.id, String(i.qty_requested)])));
          setApproving(true);
        }}
        loading={busy}
      >
        <Check className="h-4 w-4" /> Approve
      </Button>,
      <Button key="reject" variant="secondary" onClick={() => setRejecting(true)}>
        <X className="h-4 w-4" /> Reject
      </Button>,
    );
  }
  if (r.status === "APPROVED" && may("requisition:issue")) {
    actions.push(
      <Button key="issue" onClick={() => act("issue")} loading={busy}>
        <PackageCheck className="h-4 w-4" /> Issue materials
      </Button>,
    );
  }
  if (r.status === "ISSUED" && may("requisition:receive")) {
    actions.push(
      <Button key="receive" onClick={() => act("receive")} loading={busy}>
        <CheckCheck className="h-4 w-4" /> Confirm site receipt
      </Button>,
    );
  }
  if ((r.status === "ISSUED" || r.status === "RECEIVED") && outstanding) {
    actions.push(
      <Button key="return" variant="secondary" onClick={() => setReturning(true)}>
        <Undo2 className="h-4 w-4" /> Record return
      </Button>,
    );
  }
  if ((r.status === "RECEIVED" || r.status === "ISSUED") && may("requisition:approve")) {
    actions.push(
      <Button key="close" variant="secondary" onClick={() => act("close")} loading={busy}>
        <Ban className="h-4 w-4" /> Close
      </Button>,
    );
  }

  return (
    <>
      <Link
        href="/requisitions"
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-fg-muted transition-colors hover:text-fg"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Requisitions
      </Link>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="code text-[13px] font-semibold text-accent">{r.ref}</span>
            <RequisitionStatus status={r.status} />
            {r.priority !== "NORMAL" ? (
              <Badge tone={r.priority === "URGENT" ? "danger" : r.priority === "HIGH" ? "warn" : "neutral"}>
                {r.priority}
              </Badge>
            ) : null}
          </div>
          <h1 className="mt-1.5 text-[21px] leading-tight tracking-tight sm:text-[24px]">{r.title}</h1>
          <p className="mt-1 text-[13px] text-fg-muted">
            {r.from_location}
            {r.to_location ? ` → ${r.to_location}` : " → consumed on issue"}
            {r.project_code ? ` · ${r.project_code}` : ""}
          </p>
        </div>
        {actions.length ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>

      {r.status === "REJECTED" && r.rejected_reason ? (
        <div className="mb-3 flex items-start gap-2.5 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3">
          <X className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
          <p className="text-[13px] text-danger">
            <span className="font-medium">Rejected:</span> {r.rejected_reason}
          </p>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_300px]">
        <div className="space-y-3">
          <Card>
            <CardHeader
              title="Requested materials"
              description={`${data.items.length} line${data.items.length === 1 ? "" : "s"}`}
            />
            <TableWrap>
              <thead>
                <tr>
                  <Th>Material</Th>
                  <Th align="right">Requested</Th>
                  <Th align="right" className="hidden sm:table-cell">Approved</Th>
                  <Th align="right">Issued</Th>
                  <Th align="right" className="hidden md:table-cell">Returned</Th>
                  <Th align="right" className="hidden lg:table-cell">Used</Th>

                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => {
                  const used = item.qty_issued - item.qty_returned;
                  const shortAtSource = item.qty_requested > item.available_at_source && r.status !== "ISSUED";
                  return (
                    <Tr key={item.id}>
                      <Td>
                        <Link href={`/products/${item.product_id}`} className="flex items-center gap-3">
                          <ProductImage imageId={item.image_id} name={item.product_name} className="h-9 w-9" />
                          <span className="min-w-0">
                            <span className="block truncate text-[13.5px] font-medium">{item.product_name}</span>
                            <span className="code block truncate text-[11.5px] text-fg-subtle">
                              {item.sku}
                              {shortAtSource ? (
                                <span className="ml-1.5 text-warn">
                                  · only {qty(item.available_at_source)} in store
                                </span>
                              ) : null}
                            </span>
                          </span>
                        </Link>
                      </Td>
                      <Td align="right" className="tabular text-[13.5px] font-medium">
                        {qty(item.qty_requested)}
                        <span className="ml-1 text-[11px] font-normal text-fg-subtle">{item.unit}</span>
                      </Td>
                      <Td align="right" className="tabular hidden text-[13px] sm:table-cell">
                        {item.qty_approved === null ? (
                          <span className="text-fg-subtle">—</span>
                        ) : (
                          qty(item.qty_approved)
                        )}
                      </Td>
                      <Td align="right" className="tabular text-[13px]">
                        {item.qty_issued > 0 ? (
                          <span className="font-medium text-ok">{qty(item.qty_issued)}</span>
                        ) : (
                          <span className="text-fg-subtle">—</span>
                        )}
                      </Td>
                      <Td align="right" className="tabular hidden text-[13px] md:table-cell">
                        {item.qty_returned > 0 ? qty(item.qty_returned) : <span className="text-fg-subtle">—</span>}
                      </Td>
                      <Td align="right" className="tabular hidden text-[13px] font-medium lg:table-cell">
                        {used > 0 ? qty(used) : <span className="font-normal text-fg-subtle">—</span>}
                      </Td>

                    </Tr>
                  );
                })}
              </tbody>
            </TableWrap>
            <div className="flex flex-wrap items-center justify-end gap-x-8 gap-y-1 border-t border-border px-4 py-3 text-[13px] sm:px-5">
              <span className="text-fg-muted">
                Units requested <span className="tabular ml-1.5 font-medium text-fg">{qty(unitsRequested)}</span>
              </span>
              {unitsIssued > 0 ? (
                <span className="text-fg-muted">
                  Units issued <span className="tabular ml-1.5 font-semibold text-fg">{qty(unitsIssued)}</span>
                </span>
              ) : null}
            </div>
          </Card>

          {data.movements.length ? (
            <Card>
              <CardHeader title="Stock movements against this requisition" />
              <TableWrap>
                <thead>
                  <tr>
                    <Th>Material</Th>
                    <Th>Type</Th>
                    <Th align="right">Qty</Th>
                    <Th className="hidden sm:table-cell">By</Th>
                    <Th align="right">When</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.movements.map((m) => (
                    <Tr key={m.id}>
                      <Td className="text-[13px]">{m.product_name}</Td>
                      <Td><MovementBadge type={m.movement_type} /></Td>
                      <Td align="right" className="tabular text-[13px] font-medium">{qty(m.quantity)}</Td>
                      <Td className="hidden text-[12.5px] text-fg-muted sm:table-cell">
                        {m.created_by_name ?? "—"}
                      </Td>
                      <Td align="right" className="whitespace-nowrap text-[12px] text-fg-subtle">
                        {formatDateTime(m.created_at)}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </TableWrap>
            </Card>
          ) : null}
        </div>

        <div className="space-y-3">
          <Card>
            <CardHeader title="Progress" />
            <CardBody>
              <ol className="space-y-4">
                {TIMELINE.map((stage) => {
                  const at = r[stage.key] as string | null;
                  const who = r[stage.by] as string | null;
                  const done = Boolean(at);
                  return (
                    <li key={stage.key} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <span
                          className={cn(
                            "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                            done ? "border-ok bg-ok text-white" : "border-border bg-surface-2",
                          )}
                        >
                          {done ? <Check className="h-3 w-3" /> : null}
                        </span>
                        <span className={cn("mt-1 w-px flex-1", done ? "bg-ok/40" : "bg-border")} />
                      </div>
                      <div className="min-w-0 flex-1 pb-1">
                        <p className={cn("text-[13px] font-medium", !done && "text-fg-subtle")}>{stage.label}</p>
                        {done ? (
                          <p className="mt-0.5 text-[11.5px] text-fg-subtle">
                            {formatDateTime(at)}
                            {who ? ` · ${who}` : ""}
                          </p>
                        ) : (
                          <p className="mt-0.5 text-[11.5px] text-fg-subtle">Pending</p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Details" />
            <CardBody>
              <dl className="space-y-2 text-[13px]">
                {[
                  ["Needed by", formatDate(r.needed_by)],
                  ["Project", r.project_name ?? "—"],
                  ["Issue from", r.from_location],
                  ["Deliver to", r.to_location ?? "Consumed"],
                  ["Raised by", r.requested_by_name ?? "—"],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-baseline justify-between gap-3">
                    <dt className="shrink-0 text-fg-muted">{label}</dt>
                    <dd className="truncate text-right font-medium">{value}</dd>
                  </div>
                ))}
              </dl>
              {r.notes ? (
                <p className="mt-3 border-t border-border pt-3 text-[12.5px] leading-relaxed text-fg-muted">
                  {r.notes}
                </p>
              ) : null}
            </CardBody>
          </Card>
        </div>
      </div>

      {/* Approve with per-line quantities */}
      <Modal
        open={approving}
        onClose={() => setApproving(false)}
        size="lg"
        title="Approve requisition"
        description="Adjust any quantity before approving. Set a line to 0 to decline it."
        footer={
          <>
            <Button variant="ghost" onClick={() => setApproving(false)}>Cancel</Button>
            <Button
              loading={busy}
              onClick={() =>
                act("approve", {
                  quantities: Object.fromEntries(
                    Object.entries(approveQty).map(([k, v]) => [k, Number(v) || 0]),
                  ),
                })
              }
            >
              Approve
            </Button>
          </>
        }
      >
        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
          {data.items.map((item) => (
            <div key={item.id} className="flex items-center gap-3 p-3">
              <ProductImage imageId={item.image_id} name={item.product_name} className="h-9 w-9" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium">{item.product_name}</p>
                <p className="tabular truncate text-[11.5px] text-fg-subtle">
                  Requested {qty(item.qty_requested)} {item.unit} · {qty(item.available_at_source)} in store
                </p>
              </div>
              <Input
                type="number" step="0.001" min="0" inputMode="decimal"
                value={approveQty[item.id] ?? ""}
                onChange={(e) => setApproveQty((q) => ({ ...q, [item.id]: e.target.value }))}
                className="tabular h-9 w-24 shrink-0 text-right"
              />
            </div>
          ))}
        </div>
      </Modal>

      {/* Reject */}
      <Modal
        open={rejecting}
        onClose={() => setRejecting(false)}
        title="Reject requisition"
        description="The requester will see your reason."
        footer={
          <>
            <Button variant="ghost" onClick={() => setRejecting(false)}>Cancel</Button>
            <Button variant="danger" loading={busy} onClick={() => act("reject", { reason: rejectReason })}>
              Reject
            </Button>
          </>
        }
      >
        <Field label="Reason">
          <Textarea
            autoFocus
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Quantities exceed the approved BOQ for this project."
          />
        </Field>
      </Modal>

      {/* Return */}
      <Modal
        open={returning}
        onClose={() => setReturning(false)}
        size="lg"
        title="Record a return"
        description="Unused material goes back to the store it came from."
        footer={
          <>
            <Button variant="ghost" onClick={() => setReturning(false)}>Cancel</Button>
            <Button loading={busy} onClick={submitReturn}>Record return</Button>
          </>
        }
      >
        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
          {data.items
            .filter((i) => i.qty_issued - i.qty_returned > 0)
            .map((item) => {
              const outstandingQty = item.qty_issued - item.qty_returned;
              return (
                <div key={item.id} className="flex items-center gap-3 p-3">
                  <ProductImage imageId={item.image_id} name={item.product_name} className="h-9 w-9" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium">{item.product_name}</p>
                    <p className="tabular truncate text-[11.5px] text-fg-subtle">
                      {qty(outstandingQty)} {item.unit} still out
                    </p>
                  </div>
                  <Input
                    type="number" step="0.001" min="0" max={outstandingQty} inputMode="decimal"
                    value={returnQty[item.id] ?? ""}
                    onChange={(e) => setReturnQty((q) => ({ ...q, [item.id]: e.target.value }))}
                    placeholder="0"
                    className="tabular h-9 w-24 shrink-0 text-right"
                  />
                </div>
              );
            })}
        </div>
      </Modal>
    </>
  );
}
