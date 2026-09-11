import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Tables scroll horizontally inside their own container so the page body never
 * does — important on phones where a 9-column stock table cannot fit.
 */
export function TableWrap({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("scrollbar-thin w-full overflow-x-auto", className)}>
      {/* Below sm the table shrinks to fit and cells wrap, so the few columns
          that survive the responsive `hidden` classes stay on screen. */}
      <table className="w-full border-collapse text-sm sm:min-w-[520px]">{children}</table>
    </div>
  );
}

export function Th({
  className,
  align = "left",
  children,
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement> & { align?: "left" | "right" | "center" }) {
  return (
    <th
      className={cn(
        "sticky top-0 z-10 border-b border-border bg-surface px-4 py-2.5",
        "text-[11px] font-semibold uppercase tracking-wider text-fg-subtle",
        align === "right" && "text-right",
        align === "center" && "text-center",
        align === "left" && "text-left",
        className,
      )}
      {...props}
    >
      {children}
    </th>
  );
}

export function Td({
  className,
  align = "left",
  children,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement> & { align?: "left" | "right" | "center" }) {
  return (
    <td
      className={cn(
        "border-b border-border px-4 py-3 align-middle text-fg",
        align === "right" && "text-right",
        align === "center" && "text-center",
        className,
      )}
      {...props}
    >
      {children}
    </td>
  );
}

export function Tr({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("transition-colors hover:bg-surface-2/60", className)} {...props} />;
}
