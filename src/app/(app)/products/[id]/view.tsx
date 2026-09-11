"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Pencil, Plus, Archive, Package, TriangleAlert, MapPin,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty";
import { PageLoading } from "@/components/ui/spinner";
import { TableWrap, Th, Td, Tr } from "@/components/ui/table";
import { ProductImage } from "@/components/product-image";
import { ImageUpload } from "@/components/image-upload";
import { MovementBadge, StockStatus } from "@/components/status";
import { StockAdjustModal } from "@/components/stock-adjust-modal";
import { ProductForm } from "../product-form";
import { usePermission } from "@/components/session-context";
import { useToast } from "@/components/ui/toast";
import { apiFetch } from "@/lib/client";
import { formatDateTime, qty, relativeTime } from "@/lib/utils";
import type { ProductRow } from "../view";

type Detail = {
  product: ProductRow & {
    spec: string | null; shelf_ref: string | null; created_by_name: string | null;
    created_at: string; updated_at: string; category_name: string | null; supplier_name: string | null;
  };
  levels: {
    location_id: string; location_name: string; location_code: string; kind: string;
    on_hand: number; reserved: number; updated_at: string;
  }[];
  movements: {
    id: string; movement_type: string; quantity: number; reference: string | null;
    notes: string | null; created_at: string; from_location: string | null;
    to_location: string | null; created_by_name: string | null; project_name: string | null;
  }[];
};

export function ProductDetail({ id }: { id: string }) {
  const router = useRouter();
  const may = usePermission();
  const toast = useToast();

  const [data, setData] = React.useState<Detail | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState(false);
  const [adjusting, setAdjusting] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      setData(await apiFetch<Detail>(`/api/products/${id}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load this material");
    }
  }, [id]);

  React.useEffect(() => {
    void load();
  }, [load]);

  /** Saves a new photo straight away so the picture behaves like an inline edit. */
  async function saveImage(imageId: string | null) {
    try {
      await apiFetch(`/api/products/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ imageId }),
      });
      toast(imageId ? "Photo updated." : "Photo removed.");
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not save the photo", "error");
    }
  }

  async function archive() {
    if (!confirm("Archive this material? It will be hidden from the catalogue but its history is kept.")) return;
    try {
      await apiFetch(`/api/products/${id}`, { method: "DELETE" });
      toast("Material archived.");
      router.push("/products");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not archive", "error");
    }
  }

  if (error) return <EmptyState icon={TriangleAlert} title="Material not found" description={error} />;
  if (!data) return <PageLoading />;

  const p = data.product;

  return (
    <>
      <Link
        href="/products"
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-fg-muted transition-colors hover:text-fg"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> All materials
      </Link>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[320px_1fr] xl:grid-cols-[360px_1fr]">
        <div className="space-y-3">
          <Card className="overflow-hidden">
            {may("product:write") ? (
              // The photo is editable in place — no need to open the full form
              // just to swap a picture.
              <ImageUpload
                value={p.image_id}
                onChange={saveImage}
                className="rounded-none border-0 border-b border-border"
              />
            ) : (
              <div className="aspect-[4/3] w-full bg-surface-2">
                <ProductImage
                  imageId={p.image_id}
                  name={p.name}
                  className="h-full w-full rounded-none border-0"
                  iconClassName="h-8 w-8"
                />
              </div>
            )}
            <CardBody className="space-y-3">
              <div>
                <p className="code text-[11.5px] text-fg-subtle">{p.sku}</p>
                <h1 className="mt-0.5 text-[19px] leading-tight tracking-tight">{p.name}</h1>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <StockStatus onHand={p.on_hand} reorder={p.reorder_level} />
                {p.category_name ? <Badge>{p.category_name}</Badge> : null}
                {!p.is_active ? <Badge tone="danger">archived</Badge> : null}
              </div>

              {p.description ? (
                <p className="text-[13px] leading-relaxed text-fg-muted">{p.description}</p>
              ) : null}

              <dl className="space-y-2 border-t border-border pt-3 text-[13px]">
                {[
                  ["On hand", `${qty(p.on_hand)} ${p.unit}`],
                  ["Reorder level", `${qty(p.reorder_level)} ${p.unit}`],
                  ["Supplier", p.supplier_name ?? "—"],
                  ["Colour / finish", p.colour ?? "—"],
                  ["Specification", p.spec ?? "—"],
                  ["Shelf reference", p.shelf_ref ?? "—"],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-baseline justify-between gap-3">
                    <dt className="shrink-0 text-fg-muted">{label}</dt>
                    <dd className="tabular truncate text-right font-medium">{value}</dd>
                  </div>
                ))}
              </dl>

              <p className="border-t border-border pt-3 text-[11.5px] text-fg-subtle">
                Added {formatDateTime(p.created_at)}
                {p.created_by_name ? ` by ${p.created_by_name}` : ""}
              </p>

              {may("product:write") || may("stock:adjust") ? (
                <div className="flex flex-wrap gap-2 pt-1">
                  {may("stock:adjust") ? (
                    <Button size="sm" onClick={() => setAdjusting(true)}>
                      <Plus className="h-4 w-4" /> Movement
                    </Button>
                  ) : null}
                  {may("product:write") ? (
                    <>
                      <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
                        <Pencil className="h-4 w-4" /> Edit
                      </Button>
                      <Button size="sm" variant="ghost" onClick={archive}>
                        <Archive className="h-4 w-4" /> Archive
                      </Button>
                    </>
                  ) : null}
                </div>
              ) : null}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-3">
          <Card>
            <CardHeader title="Where it is held" description="Balance per location" />
            {data.levels.length ? (
              <TableWrap>
                <thead>
                  <tr>
                    <Th>Location</Th>
                    <Th align="right">On hand</Th>
                    <Th align="right" className="hidden md:table-cell">Updated</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.levels.map((l) => (
                    <Tr key={l.location_id}>
                      <Td>
                        <div className="flex items-center gap-2.5">
                          <MapPin className="h-4 w-4 shrink-0 text-fg-subtle" />
                          <span>
                            <span className="block text-[13.5px] font-medium">{l.location_name}</span>
                            <span className="block text-[11.5px] capitalize text-fg-subtle">
                              {l.kind.toLowerCase()}
                            </span>
                          </span>
                        </div>
                      </Td>
                      <Td align="right">
                        <span className="tabular text-[13.5px] font-semibold">{qty(l.on_hand)}</span>
                        <span className="ml-1 text-[11px] text-fg-subtle">{p.unit}</span>
                      </Td>
                      <Td align="right" className="hidden text-[12px] text-fg-subtle md:table-cell">
                        {relativeTime(l.updated_at)}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </TableWrap>
            ) : (
              <EmptyState
                icon={Package}
                title="No stock recorded"
                description="This material has never been received into any location."
                className="py-10"
              />
            )}
          </Card>

          <Card>
            <CardHeader title="Movement history" description="Most recent 40 entries" />
            {data.movements.length ? (
              <TableWrap>
                <thead>
                  <tr>
                    <Th>Type</Th>
                    <Th align="right">Qty</Th>
                    <Th className="hidden sm:table-cell">Route</Th>
                    <Th className="hidden lg:table-cell">Reference</Th>
                    <Th className="hidden md:table-cell">By</Th>
                    <Th align="right">When</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.movements.map((m) => (
                    <Tr key={m.id}>
                      <Td><MovementBadge type={m.movement_type} /></Td>
                      <Td align="right" className="tabular text-[13.5px] font-semibold">
                        {qty(m.quantity)}
                      </Td>
                      <Td className="hidden text-[12.5px] text-fg-muted sm:table-cell">
                        {m.from_location ? `${m.from_location} → ` : ""}
                        {m.to_location ?? "consumed"}
                      </Td>
                      <Td className="hidden text-[12.5px] text-fg-muted lg:table-cell">
                        {m.reference ?? m.project_name ?? "—"}
                      </Td>
                      <Td className="hidden text-[12.5px] text-fg-muted md:table-cell">
                        {m.created_by_name ?? "—"}
                      </Td>
                      <Td align="right" className="whitespace-nowrap text-[12px] text-fg-subtle">
                        {relativeTime(m.created_at)}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </TableWrap>
            ) : (
              <EmptyState
                icon={Package}
                title="No movements yet"
                description="Receipts, issues and transfers will show here."
                className="py-10"
              />
            )}
          </Card>
        </div>
      </div>

      {editing ? (
        <ProductForm
          product={p}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            void load();
          }}
        />
      ) : null}

      {adjusting ? (
        <StockAdjustModal
          product={p}
          onClose={() => setAdjusting(false)}
          onDone={() => {
            setAdjusting(false);
            void load();
          }}
        />
      ) : null}
    </>
  );
}
