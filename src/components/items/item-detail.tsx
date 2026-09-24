"use client";

import { Bookmark } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { ProductImage } from "@/components/product-image";
import { SourceBadge } from "@/components/status";
import { ReorderBadge } from "@/components/forms/form-parts";
import { useSession } from "@/components/session-context";
import { useOpenReservations } from "@/components/reservations/reserve-modal";
import { qty, relativeTime } from "@/lib/utils";
import type { Item } from "./use-items";

export function ItemDetail({ item, onClose, onReserve }: { item: Item; onClose: () => void; onReserve: () => void }) {
  const session = useSession();
  const reservations = useOpenReservations(item.id, Boolean(session) && item.reserved > 0);
  const rows: [string, string | null][] = [
    ["Material Code", item.sku],
    ["Category", item.category],
    ["Subcategory", item.subcategory],
    ["Specification", item.spec],
    ["Dimensions", item.dimensions],
    ["Unit", item.unit],
    ["Reorder Level", item.reorder_level ? qty(item.reorder_level) : null],
    ["Last changed", `${relativeTime(item.updated_at)}${item.updated_by_name ? ` by ${item.updated_by_name}` : ""}`],
  ];

  return (
    <Modal
      open
      onClose={onClose}
      title={item.name}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Close</Button>
          <Button onClick={onReserve} disabled={item.available <= 0}>
            <Bookmark className="h-4 w-4" /> {item.available > 0 ? "Open in Reservation Form" : "Nothing available"}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-[240px_1fr]">
        <ProductImage imageId={item.image_id} name={item.name} className="aspect-[4/3] w-full rounded-xl" iconClassName="h-8 w-8" />
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <SourceBadge source={item.source} />
            <ReorderBadge status={item.reorder_status} />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {([
              ["Available", item.available, "text-fg"],
              ["Reserved", item.reserved, "text-warn"],
              ["In stock", item.quantity, "text-fg-muted"],
            ] as const).map(([label, value, tone]) => (
              <div key={label} className="rounded-lg border border-border bg-surface-2/50 px-2.5 py-2">
                <p className="text-[11px] text-fg-subtle">{label}</p>
                <p className={`tabular text-[18px] font-semibold leading-tight ${tone}`}>{qty(value)}</p>
              </div>
            ))}
          </div>
          <dl className="mt-4 space-y-1.5 border-t border-border pt-3 text-[13px]">
            {rows.map(([label, value]) => (
              <div key={label} className="flex items-baseline justify-between gap-3">
                <dt className="shrink-0 text-fg-muted">{label}</dt>
                <dd className={label === "Material Code" ? "code truncate text-right" : "truncate text-right font-medium"}>{value || "—"}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      {item.reserved > 0 ? (
        <div className="mt-4 rounded-xl border border-border">
          <p className="border-b border-border px-3.5 py-2.5 text-[13px] font-semibold">Reserved for</p>
          {!session ? (
            <p className="px-3.5 py-3 text-[12.5px] text-fg-muted">
              {qty(item.reserved)} {item.unit} are reserved. Sign in to see who has them.
            </p>
          ) : !reservations ? (
            <div className="skeleton m-3 h-8 rounded-lg" />
          ) : (
            <ul className="divide-y divide-border">
              {reservations.map((r) => (
                <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-x-3 px-3.5 py-2 text-[13px]">
                  <span><span className="tabular font-semibold">{qty(r.quantity)} {r.unit}</span> · {r.project}</span>
                  <span className="text-[12px] text-fg-muted">{r.reserved_by_name ?? "—"} · {relativeTime(r.created_at)} · <span className="code">{r.ref}</span></span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {item.description ? (
        <p className="mt-4 whitespace-pre-line rounded-lg border border-border bg-surface-2/50 px-3.5 py-3 text-[13px] leading-relaxed text-fg-muted">
          {item.description}
        </p>
      ) : null}
    </Modal>
  );
}
