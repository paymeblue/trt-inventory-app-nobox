"use client";

import * as React from "react";
import gsap from "gsap";
import { SplitText } from "gsap/SplitText";
import { useGSAP } from "@gsap/react";
import { Bookmark, Factory, Store } from "lucide-react";
import { APP_NAME, Logo, WEBSITE_URL } from "@/components/logo";
import { ThemeToggle } from "@/components/theme";

gsap.registerPlugin(useGSAP, SplitText);

const HIGHLIGHTS = [
  {
    title: "Everything in one view",
    body: "Every board, tape, fitting and fabric in the Factory, Nobox, Ready Cabinets and Germana, with photos and specs.",
  },
  {
    title: "Always current",
    body: "When a manager adds or issues stock, every screen updates within seconds. Low and out-of-stock items are flagged.",
  },
  {
    title: "Reserve before you design",
    body: "Designers and sales hold what they need; the inventory team is told at once and issues it to the job.",
  },
];

/** Illustrations for the story panel: how a material card reads in the app. */
const SAMPLES = [
  { icon: Factory, side: "Factory", name: "LISSA OAK 18MM", code: "FINSA 116", count: 124, unit: "sheets", tone: "var(--accent)" },
  { icon: Store, side: "Nobox", name: "ANODIZED SILVER KNOB", code: "20*25*11", count: 837, unit: "pcs", tone: "var(--info)" },
];

export function LoginView({ children }: { children: React.ReactNode }) {
  const root = React.useRef<HTMLDivElement>(null);
  const scene = React.useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const tl = gsap.timeline({ defaults: { ease: "expo.out" } });

        // Left: the form column settles in.
        tl.from("[data-intro=brand]", { y: -14, opacity: 0, duration: 0.8 });
        const title = SplitText.create("[data-intro=title]", { type: "chars", mask: "chars" });
        tl.from(title.chars, { yPercent: 110, duration: 0.9, stagger: 0.035 }, 0.15)
          .from("[data-intro=lede]", { y: 12, opacity: 0, filter: "blur(6px)", duration: 0.8 }, 0.35)
          .from("[data-intro=foot]", { opacity: 0, duration: 0.8 }, 0.8);

        // Right: the story panel, when it is on screen.
        if (scene.current && scene.current.offsetParent !== null) {
          const headline = SplitText.create("[data-intro=headline]", { type: "lines", mask: "lines" });
          tl.from("[data-intro=grid]", { opacity: 0, scale: 1.08, duration: 1.6, ease: "power2.out" }, 0)
            .from("[data-intro=eyebrow]", { y: 10, opacity: 0, duration: 0.7 }, 0.3)
            .from(headline.lines, { yPercent: 105, duration: 1, stagger: 0.09 }, 0.35)
            .from("[data-intro=sample]", {
              y: 70, rotationX: -25, rotationY: 12, opacity: 0, scale: 0.9,
              transformPerspective: 1000, duration: 1.2, stagger: 0.14,
            }, 0.55)
            .from("[data-intro=toast]", { x: 40, opacity: 0, scale: 0.9, duration: 0.9, ease: "back.out(1.6)" }, 1.15)
            .from("[data-intro=point]", { x: -16, opacity: 0, duration: 0.8, stagger: 0.1 }, 0.9);

          // The stock counters run up to their figures.
          gsap.utils.toArray<HTMLElement>("[data-count]").forEach((el, i) => {
            const target = Number(el.dataset.count);
            const n = { v: 0 };
            tl.to(n, {
              v: target, duration: 1.6, ease: "power3.out",
              onUpdate: () => { el.textContent = Math.round(n.v).toLocaleString(); },
            }, 0.75 + i * 0.14);
          });

          // Afterwards the cards drift gently, out of step with each other.
          gsap.utils.toArray<HTMLElement>("[data-float]").forEach((el, i) => {
            gsap.to(el, { y: i % 2 ? 9 : -9, duration: 3.2 + i * 0.6, ease: "sine.inOut", yoyo: true, repeat: -1, delay: 1.8 + i * 0.3 });
          });
          gsap.to("[data-intro=glow]", { xPercent: 12, yPercent: -10, duration: 9, ease: "sine.inOut", yoyo: true, repeat: -1 });
        }

        return () => {
          title.revert();
        };
      });

      // With a mouse, the panel's layers shift by depth as it moves.
      mm.add("(prefers-reduced-motion: no-preference) and (hover: hover) and (pointer: fine)", () => {
        const panel = scene.current;
        if (!panel) return;
        const layers = gsap.utils.toArray<HTMLElement>("[data-depth]", panel).map((el) => ({
          depth: Number(el.dataset.depth),
          x: gsap.quickTo(el, "x", { duration: 1.1, ease: "power3.out" }),
          y: gsap.quickTo(el, "y", { duration: 1.1, ease: "power3.out" }),
        }));
        const move = (e: PointerEvent) => {
          const r = panel.getBoundingClientRect();
          const px = (e.clientX - r.left) / r.width - 0.5;
          const py = (e.clientY - r.top) / r.height - 0.5;
          for (const l of layers) {
            l.x(px * l.depth * 40);
            l.y(py * l.depth * 40);
          }
        };
        const leave = () => layers.forEach((l) => { l.x(0); l.y(0); });
        panel.addEventListener("pointermove", move);
        panel.addEventListener("pointerleave", leave);
        return () => {
          panel.removeEventListener("pointermove", move);
          panel.removeEventListener("pointerleave", leave);
        };
      });

      return () => mm.revert();
    },
    { scope: root },
  );

  return (
    <div ref={root} className="min-h-dvh overflow-x-hidden lg:grid lg:grid-cols-[1fr_1.05fr]">
      {/* Form column */}
      <div className="flex min-h-dvh flex-col px-4 py-5 sm:px-10 sm:py-6 lg:min-h-0 lg:py-10">
        <div data-intro="brand" className="flex items-center justify-between">
          <Logo />
          <ThemeToggle />
        </div>

        <div className="flex flex-1 items-center justify-center py-8 sm:py-10">
          <div className="w-full max-w-[380px]">
            <h1 data-intro="title" className="text-[30px] leading-tight tracking-tight sm:text-[34px]">Sign in</h1>
            <p data-intro="lede" className="mt-2 text-sm leading-relaxed text-fg-muted">
              Stock across the Factory, Nobox, Ready Cabinets and Germana.
            </p>
            {children}
          </div>
        </div>

        <p data-intro="foot" className="text-center text-[12px] text-fg-subtle">
          <a href={WEBSITE_URL} target="_blank" rel="noreferrer" className="hover:text-fg-muted hover:underline">Ready Cabinets</a> · {APP_NAME}
        </p>
      </div>

      {/* Story column */}
      <div ref={scene} className="relative hidden overflow-hidden border-l border-border bg-bg-subtle lg:block">
        <div
          data-intro="glow"
          data-depth="0.4"
          className="pointer-events-none absolute -inset-[15%] opacity-60"
          style={{
            backgroundImage:
              "radial-gradient(circle at 25% 20%, var(--accent-soft) 0%, transparent 42%), radial-gradient(circle at 80% 80%, var(--info-soft) 0%, transparent 40%)",
          }}
        />
        <div
          data-intro="grid"
          className="pointer-events-none absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage:
              "linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
            maskImage: "radial-gradient(ellipse at center, black 20%, transparent 72%)",
          }}
        />

        <div className="relative flex h-full flex-col justify-center px-12 py-12 xl:px-20">
          <p data-intro="eyebrow" className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
            Factory · Nobox · Ready Cabinets · Germana
          </p>
          <h2 data-intro="headline" className="max-w-lg text-[32px] leading-[1.15] tracking-tight xl:text-[40px]">
            Know what is in stock before you design with it.
          </h2>

          {/* How materials look in the app */}
          <div className="relative mt-10 h-[230px] max-w-lg [perspective:1200px]" aria-hidden>
            {SAMPLES.map((s, i) => (
              <div
                key={s.code}
                data-depth={i ? "1.1" : "0.7"}
                className="absolute"
                style={{ left: i ? "50%" : 0, top: i ? 72 : 0, zIndex: i ? 2 : 1 }}
              >
                <div data-intro="sample">
                  <div
                    data-float
                    className="w-[250px] rounded-2xl border border-border bg-surface/90 p-4 shadow-[0_24px_60px_-28px_rgb(0_0_0/0.55)] backdrop-blur-md"
                  >
                    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: s.tone }}>
                      <s.icon className="h-3.5 w-3.5" /> {s.side}
                    </div>
                    <p className="mt-2 truncate text-[14px] font-semibold">{s.name}</p>
                    <p className="code text-[11px] text-fg-subtle">{s.code}</p>
                    <div className="mt-3 flex items-end justify-between gap-2 whitespace-nowrap border-t border-border pt-3">
                      <p className="tabular text-[22px] font-semibold leading-none">
                        <span data-count={s.count}>{s.count.toLocaleString()}</span>{" "}
                        <span className="text-[11px] font-normal text-fg-subtle">{s.unit} available</span>
                      </p>
                      <span className="flex items-center gap-1.5 rounded-md bg-ok-soft px-2 py-1 text-[10.5px] font-semibold uppercase text-ok">
                        <span className="h-1.5 w-1.5 rounded-full bg-ok" /> Available
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            <div data-depth="1.6" className="absolute right-0 top-[6px] z-[3]">
              <div data-intro="toast">
                <div data-float className="flex items-center gap-2.5 rounded-xl border border-border bg-surface px-3 py-2 shadow-[0_16px_40px_-20px_rgb(0_0_0/0.6)]">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-soft text-accent">
                    <Bookmark className="h-3.5 w-3.5" />
                  </span>
                  <span className="text-[12px] leading-tight">
                    <span className="block font-semibold">12 sheets reserved</span>
                    <span className="text-fg-subtle">Design · just now</span>
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-12 max-w-lg space-y-6">
            {HIGHLIGHTS.map((item, i) => (
              <div key={item.title} data-intro="point" className="flex gap-4">
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
