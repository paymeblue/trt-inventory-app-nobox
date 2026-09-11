import * as React from "react";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-5 flex flex-wrap items-end justify-between gap-3 sm:mb-6", className)}>
      <div className="min-w-0">
        <h1 className="text-[21px] leading-tight tracking-tight sm:text-[25px]">{title}</h1>
        {description ? (
          <p className="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-fg-muted">{description}</p>
        ) : null}
      </div>
      {action ? <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div> : null}
    </div>
  );
}
