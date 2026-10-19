import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

export const APP_NAME = "Inventory Management";
export const WEBSITE_URL = "https://readycabinets.ng/";

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
        <p className="truncate text-[15px] font-semibold tracking-tight text-fg">Inventory</p>
        <p className="mt-1 truncate text-[11px] font-medium uppercase tracking-widest text-fg-subtle">
          Management
        </p>
      </div>
    </div>
  );
}

/** The Ready Cabinets wordmark, linking to the website. */
export function ReadyCabinetsLink() {
  return (
    <a
      href={WEBSITE_URL}
      target="_blank"
      rel="noreferrer"
      className="group flex flex-col items-start gap-2 rounded-lg px-2.5 py-2.5 transition-colors hover:bg-surface-2"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- a fixed-size SVG wordmark needs no optimisation */}
      <img src="/ready-cabinets-logo.svg" alt="Ready Cabinets" width={99} height={53} className="h-9 w-auto" />
      <span className="flex items-center gap-1.5 text-[12.5px] text-fg-subtle group-hover:text-fg">
        <ExternalLink className="h-3.5 w-3.5" /> Visit readycabinets.ng
      </span>
    </a>
  );
}
