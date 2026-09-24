"use client";

import { Modal } from "@/components/ui/modal";
import { ProductImage } from "@/components/product-image";
import { SourceBadge, StockStatus } from "@/components/status";
import { qty, relativeTime } from "@/lib/utils";
import type { Item } from "./use-items";

export function ItemDetail({ item, onClose }: { item: Item; onClose: () => void }) {
  const rows: [string, string | null][] = [
    ["SKU", item.sku],
    ["Category", item.category],
    ["Colour", item.colour],
    ["Specification", item.spec],
    ["Unit", item.unit],
    ["Reorder level", item.reorder_level ? qty(item.reorder_level) : null],
    ["Last changed", `${relativeTime(item.updated_at)}${item.updated_by_name ? ` by ${item.updated_by_name}` : ""}`],
  ];

  return (
    <Modal open onClose={onClose} title={item.name} size="lg">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-[240px_1fr]">
        <ProductImage
          imageId={item.image_id}
          name={item.name}
          className="aspect-[4/3] w-full rounded-xl"
          iconClassName="h-8 w-8"
        />
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <SourceBadge source={item.source} />
            <StockStatus onHand={item.quantity} reorder={item.reorder_level} />
          </div>
          <p className="tabular mt-3 text-[30px] font-semibold leading-none tracking-tight">
            {qty(item.quantity)} <span className="text-[14px] font-normal text-fg-subtle">{item.unit}</span>
          </p>
          <dl className="mt-4 space-y-1.5 border-t border-border pt-3 text-[13px]">
            {rows.map(([label, value]) => (
              <div key={label} className="flex items-baseline justify-between gap-3">
                <dt className="shrink-0 text-fg-muted">{label}</dt>
                <dd className={label === "SKU" ? "code truncate text-right" : "truncate text-right font-medium"}>
                  {value || "—"}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
      {item.description ? (
        <p className="mt-4 whitespace-pre-line rounded-lg border border-border bg-surface-2/50 px-3.5 py-3 text-[13px] leading-relaxed text-fg-muted">
          {item.description}
        </p>
      ) : null}
    </Modal>
  );
}
