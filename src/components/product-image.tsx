import { cn } from "@/lib/utils";

/**
 * Shown wherever a material has no photo yet. Drawn inline rather than as an
 * image file so it follows the light and dark theme.
 */
export function ProductPlaceholder({ compact, className }: { compact?: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 120 90"
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label="No image yet"
      className={cn("shrink-0 rounded-lg border border-border", className)}
      style={{ background: "var(--surface-2)" }}
    >
      <circle cx="60" cy={compact ? 45 : 38} r={compact ? 30 : 24} style={{ fill: "var(--surface-3)" }} />
      <g
        transform={compact ? "translate(60 45) scale(1.25)" : "translate(60 38)"}
        style={{ fill: "none", stroke: "var(--fg-subtle)", strokeWidth: compact ? 2 : 1.6, strokeLinejoin: "round", strokeLinecap: "round" }}
      >
        <path d="M0 -12 L13 -5.5 L0 1 L-13 -5.5 Z" />
        <path d="M-13 -5.5 L-13 8.5 L0 15 L0 1" />
        <path d="M13 -5.5 L13 8.5 L0 15" />
        <path d="M-6.5 -8.75 L6.5 -2.25 L6.5 3" />
      </g>
      {compact ? null : (
        <text
          x="60"
          y="76"
          textAnchor="middle"
          style={{ fill: "var(--fg-subtle)", fontSize: 7.5, fontWeight: 600, letterSpacing: "0.12em" }}
        >
          NO IMAGE YET
        </text>
      )}
    </svg>
  );
}

export function ProductImage({
  imageId,
  name,
  className,
  compact,
}: {
  imageId?: string | null;
  name?: string;
  className?: string;
  /** Small thumbnails: the placeholder drops its label. */
  compact?: boolean;
}) {
  if (!imageId) return <ProductPlaceholder compact={compact} className={className} />;
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
