import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "./login-form";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme";

export const metadata: Metadata = { title: "Sign in" };

const HIGHLIGHTS = [
  {
    title: "Everything in one view",
    body: "Every board, tape, fitting and fabric in the Factory and at Nobox, with photos and specs, labelled by where it sits.",
  },
  {
    title: "Always current",
    body: "When a manager adds or uses stock, the designers' screen updates within seconds. Low and out-of-stock items are flagged.",
  },
  {
    title: "Bulk updates from Excel",
    body: "Managers fill in one template and upload it. The file is checked row by row before anything changes.",
  },
];

export default function LoginPage() {
  return (
    <div className="min-h-dvh lg:grid grid-cols-1 lg:grid-cols-[1fr_1.05fr]">
      {/* Form column */}
      <div className="flex min-h-dvh flex-col px-5 py-6 sm:px-10 lg:min-h-0 lg:py-10">
        <div className="flex items-center justify-between">
          <Logo />
          <ThemeToggle />
        </div>

        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-[380px]">
            <h1 className="text-[26px] leading-tight tracking-tight sm:text-[30px]">Sign in</h1>
            <p className="mt-2 text-sm leading-relaxed text-fg-muted">
              Access the TRT Nobox inventory.
            </p>

            <Suspense fallback={<div className="mt-8 h-64 animate-pulse rounded-xl bg-surface-2" />}>
              <LoginForm />
            </Suspense>
          </div>
        </div>

        <p className="text-center text-[12px] text-fg-subtle">
          TRT Nobox · Inventory
        </p>
      </div>

      {/* Story column */}
      <div className="relative hidden overflow-hidden border-l border-border bg-bg-subtle lg:block">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.55]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 22% 18%, var(--accent-soft) 0%, transparent 45%), radial-gradient(circle at 82% 78%, var(--info-soft) 0%, transparent 42%)",
          }}
        />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage:
              "linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
            maskImage: "radial-gradient(ellipse at center, black 20%, transparent 72%)",
          }}
        />

        <div className="relative flex h-full flex-col justify-center px-12 xl:px-20">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
            Factory · Nobox
          </p>
          <h2 className="max-w-lg text-[32px] leading-[1.15] tracking-tight xl:text-[38px]">
            Know what is in stock before you design with it.
          </h2>

          <div className="mt-10 max-w-lg space-y-7">
            {HIGHLIGHTS.map((item, i) => (
              <div key={item.title} className="flex gap-4">
                <span className="tabular mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-[12px] font-semibold text-accent">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <h3 className="text-[14px] font-semibold">{item.title}</h3>
                  <p className="mt-1 text-[13.5px] leading-relaxed text-fg-muted">{item.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
