"use client";

import * as React from "react";
import Link from "next/link";
import { FileSpreadsheet } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Item } from "@/components/items/use-items";
import { ReserveModal, type Reservation } from "@/components/reservations/reserve-modal";
import { ReserveUploadModal } from "@/components/reservations/reserve-upload-modal";
import { apiFetch } from "@/lib/client";
import { qty, relativeTime } from "@/lib/utils";

const STATUS: Record<Reservation["status"], React.ReactNode> = {
  RESERVED: <Badge tone="warn" dot>reserved</Badge>,
  PART_ISSUED: <Badge tone="info" dot>part issued</Badge>,
  ISSUED: <Badge tone="ok" dot>issued</Badge>,
  CANCELLED: <Badge tone="neutral" dot>released</Badge>,
};

/** The workbook's Reservation_Form, as a page, with the designer's latest reservations under it. */
export function ReserveView({ itemId }: { itemId: string | null }) {
  const [item, setItem] = React.useState<Item | null | undefined>(itemId ? undefined : null);
  const [round, setRound] = React.useState(0);
  const [excel, setExcel] = React.useState(false);
  const [mine, setMine] = React.useState<Reservation[] | null>(null);

  React.useEffect(() => {
    if (!itemId) return;
    apiFetch<Item>(`/api/items/${itemId}`).then(setItem).catch(() => setItem(null));
  }, [itemId]);

  React.useEffect(() => {
    apiFetch<{ items: Reservation[] }>("/api/reservations?mine=1&pageSize=8").then((d) => setMine(d.items)).catch(() => setMine([]));
  }, [round]);

  const reset = () => {
    setItem(null);
    setRound((r) => r + 1);
  };

  return (
    <>
      <PageHeader
        title="Reservation Form"
        description="Reserve stock for your project. It is set aside for you and taken out of stock only when the inventory team issues it to production."
        action={<Button variant="secondary" onClick={() => setExcel(true)}><FileSpreadsheet className="h-4 w-4" /> Reserve from Excel</Button>}
      />
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1fr_380px]">
        <Card className="p-4 sm:p-5">
          {item === undefined ? (
            <div className="skeleton h-80 rounded-xl" />
          ) : (
            <ReserveModal key={round} inline item={item} onClose={reset} onSaved={reset} />
          )}
        </Card>
        <Card className="self-start">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">Your latest reservations</h2>
            <Link href="/reservations" className="text-[12.5px] text-accent">Reservation Log</Link>
          </div>
          {!mine ? (
            <div className="space-y-2 p-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-10 rounded-lg" />)}</div>
          ) : !mine.length ? (
            <p className="px-4 py-6 text-center text-[13px] text-fg-muted">None yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {mine.map((r) => (
                <li key={r.id} className="flex items-start justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-[12.5px]"><span className="code font-semibold">{r.sku}</span> {r.item_name}</p>
                    <p className="truncate text-[11.5px] text-fg-subtle">{r.ref} · {r.project} · {relativeTime(r.created_at)}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    {STATUS[r.status]}
                    <p className="tabular mt-0.5 text-[11px] text-fg-subtle">{qty(r.quantity)} {r.unit}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      {excel ? <ReserveUploadModal onClose={() => setExcel(false)} onApplied={() => { setExcel(false); setRound((r) => r + 1); }} /> : null}
    </>
  );
}
