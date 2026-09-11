import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent">
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" aria-hidden>
          <path
            d="M4 8.5 12 4l8 4.5v7L12 20l-8-4.5v-7Z"
            stroke="var(--accent-fg)"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <path d="M4 8.5 12 13l8-4.5M12 13v7" stroke="var(--accent-fg)" strokeWidth="1.8" strokeLinejoin="round" />
        </svg>
      </div>
      <div className="min-w-0 leading-none">
        <p className="truncate text-[15px] font-semibold tracking-tight text-fg">TRT Nobox</p>
        <p className="mt-1 truncate text-[11px] font-medium uppercase tracking-widest text-fg-subtle">
          Inventory
        </p>
      </div>
    </div>
  );
}
