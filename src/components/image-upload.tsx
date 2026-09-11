"use client";

import * as React from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { useToast } from "./ui/toast";
import { cn } from "@/lib/utils";

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_EDGE = 1600;

/**
 * Phone cameras produce HEIC and 12MP JPEGs that either will not render in a
 * browser or blow past the size limit. Re-drawing the picture through a canvas
 * normalises anything the browser can decode into a modest JPEG, so the user
 * never has to think about formats.
 */
async function toJpeg(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas context");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.86),
  );
  if (!blob) throw new Error("could not encode");

  const name = file.name.replace(/\.[^.]+$/, "") || "photo";
  return new File([blob], `${name}.jpg`, { type: "image/jpeg" });
}

export function ImageUpload({
  value,
  onChange,
  className,
}: {
  value: string | null;
  onChange: (imageId: string | null) => void;
  className?: string;
}) {
  const [busy, setBusy] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const toast = useToast();

  async function upload(original: File) {
    if (original.size > MAX_BYTES) {
      toast("That photo is over 8MB. Please pick a smaller one.", "error");
      return;
    }

    setBusy(true);
    try {
      let file = original;
      try {
        file = await toJpeg(original);
      } catch {
        // The browser could not decode it. HEIC on anything but Safari is the
        // usual reason, so say so rather than showing a format list.
        const looksHeic = /\.(heic|heif)$/i.test(original.name) || /heic|heif/i.test(original.type);
        throw new Error(
          looksHeic
            ? "This browser cannot read HEIC photos. On iPhone, set Camera → Formats → Most Compatible, or export the photo as JPEG."
            : "That file could not be read as an image. Try a JPEG or PNG.",
        );
      }

      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/images", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Upload failed");
      onChange(data.id);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Upload failed", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) void upload(file);
      }}
      className={cn(
        "relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden",
        "rounded-xl border border-dashed border-border bg-surface-2 transition-colors",
        dragging && "border-accent bg-accent-soft",
        className,
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*,.heic,.heif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
          e.target.value = "";
        }}
      />

      {value ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/images/${value}`} alt="Product" className="h-full w-full object-cover" />
          <button
            type="button"
            onClick={() => onChange(null)}
            className="absolute right-2 top-2 rounded-lg bg-black/70 p-1.5 text-white backdrop-blur transition-opacity hover:opacity-80"
            aria-label="Remove image"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="flex h-full w-full flex-col items-center justify-center gap-2 px-4 text-center transition-colors hover:bg-surface-3"
        >
          {busy ? (
            <Loader2 className="h-5 w-5 animate-spin text-fg-subtle" />
          ) : (
            <ImagePlus className="h-5 w-5 text-fg-subtle" />
          )}
          <span className="text-[13px] font-medium text-fg-muted">
            {busy ? "Uploading…" : "Add product photo"}
          </span>
          <span className="text-[11px] text-fg-subtle">Drag and drop, or tap to browse · JPEG, PNG, HEIC</span>
        </button>
      )}
    </div>
  );
}
