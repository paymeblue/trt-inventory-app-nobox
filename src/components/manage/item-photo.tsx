"use client";

import * as React from "react";
import { Camera, Loader2 } from "lucide-react";
import { ProductImage } from "@/components/product-image";
import { toJpeg } from "@/components/image-upload";
import { useToast } from "@/components/ui/toast";
import type { Item } from "@/components/items/use-items";
import { apiFetch } from "@/lib/client";
import { cn } from "@/lib/utils";

/**
 * The material's photo in Inventory_Master. Clicking it picks a new photo,
 * which replaces the old one straight away (PUT /api/items/:id/image), so
 * photos can be added row by row after an Excel upload.
 */
export function ItemPhoto({ item, onChanged }: { item: Item; onChanged: () => void }) {
  const toast = useToast();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);

  async function upload(original: File) {
    setBusy(true);
    try {
      let file: File;
      try {
        file = await toJpeg(original);
      } catch {
        throw new Error("That file could not be read as an image. Try a JPEG or PNG.");
      }
      const body = new FormData();
      body.set("file", file);
      await apiFetch(`/api/items/${item.id}/image`, { method: "PUT", body });
      toast(`Photo ${item.image_id ? "replaced" : "added"} for ${item.sku} | ${item.name}.`);
      onChanged();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Upload failed", "error");
    } finally {
      setBusy(false);
    }
  }

  const label = `${item.image_id ? "Change" : "Add"} photo for ${item.sku}`;
  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        aria-label={label}
        title={label}
        className="group relative h-10 w-10 shrink-0 overflow-hidden rounded-lg focus:outline-none focus:ring-4 focus:ring-[var(--ring)]"
      >
        <ProductImage imageId={item.image_id} name={item.name} className="h-10 w-10" />
        <span
          className={cn(
            "absolute inset-0 flex items-center justify-center rounded-lg bg-black/55 text-white transition-opacity",
            busy ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100",
          )}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,.heic,.heif"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void upload(f);
        }}
      />
    </>
  );
}
