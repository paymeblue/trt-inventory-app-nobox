import { Package } from "lucide-react";
import { cn } from "@/lib/utils";

export function ProductImage({
  imageId,
  name,
  className,
  iconClassName,
}: {
  imageId?: string | null;
  name?: string;
  className?: string;
  iconClassName?: string;
}) {
  if (!imageId) {
    return (
      <div
        className={cn(
          "flex shrink-0 items-center justify-center rounded-lg border border-border bg-surface-2",
          className,
        )}
      >
        <Package className={cn("h-4 w-4 text-fg-subtle", iconClassName)} />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/api/images/${imageId}`}
      alt={name ?? "Product image"}
      loading="lazy"
      className={cn("shrink-0 rounded-lg border border-border bg-surface-2 object-cover", className)}
    />
  );
}
