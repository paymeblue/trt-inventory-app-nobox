"use client";

import * as React from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { cn } from "@/lib/utils";

gsap.registerPlugin(useGSAP, ScrollTrigger);

const MOTION_OK = "(prefers-reduced-motion: no-preference)";
/** A mouse or trackpad: tilt and glare follow it. Touch gets the press only. */
const FINE_POINTER = "(hover: hover) and (pointer: fine)";

type Movers = {
  rx: gsap.QuickToFunc;
  ry: gsap.QuickToFunc;
  lift: gsap.QuickToFunc;
  mx: gsap.QuickToFunc | null;
  my: gsap.QuickToFunc | null;
  media: HTMLElement | null;
  glare: HTMLElement | null;
};

/**
 * Animates every `[data-card]` inside `scope`:
 * - cards rise into place in a wave as they scroll into view, again whenever `revealKey` changes;
 * - with a mouse, a card tilts towards the pointer, lifts, its `[data-media]` drifts the other way
 *   for depth, and its `[data-glare]` light follows the pointer;
 * - pressing a card (touch too) squeezes it, and it springs back on release.
 * Nothing moves for people who ask their device for reduced motion.
 */
export function useCardMotion(scope: React.RefObject<HTMLElement | null>, revealKey?: unknown) {
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        const cards = gsap.utils.toArray<HTMLElement>("[data-card]", scope.current);
        if (!cards.length) return;
        gsap.set(cards, { autoAlpha: 0, y: 34, rotationX: -10, scale: 0.94, transformPerspective: 900, transformOrigin: "50% 100%" });
        ScrollTrigger.batch(cards, {
          start: "top bottom-=24",
          once: true,
          onEnter: (batch) =>
            gsap.to(batch, {
              autoAlpha: 1, y: 0, rotationX: 0, scale: 1,
              duration: 0.9, ease: "expo.out",
              stagger: { each: 0.055, from: "start" },
              overwrite: "auto",
            }),
        });
      });
      return () => mm.revert();
    },
    { scope, dependencies: [revealKey], revertOnUpdate: true },
  );

  useGSAP(
    (_ctx, contextSafe) => {
      const root = scope.current;
      if (!root || !contextSafe) return;
      const mm = gsap.matchMedia();

      mm.add(MOTION_OK, () => {
        let pressed: HTMLElement | null = null;
        const down = contextSafe((e: PointerEvent) => {
          pressed = (e.target as Element).closest<HTMLElement>("[data-card]");
          if (pressed) gsap.to(pressed, { scale: 0.965, duration: 0.18, ease: "power3.out", overwrite: "auto" });
        });
        const up = contextSafe(() => {
          if (pressed) gsap.to(pressed, { scale: 1, duration: 0.85, ease: "elastic.out(1.1, 0.4)", overwrite: "auto" });
          pressed = null;
        });
        root.addEventListener("pointerdown", down);
        window.addEventListener("pointerup", up);
        window.addEventListener("pointercancel", up);
        return () => {
          root.removeEventListener("pointerdown", down);
          window.removeEventListener("pointerup", up);
          window.removeEventListener("pointercancel", up);
        };
      });

      mm.add(`${MOTION_OK} and ${FINE_POINTER}`, () => {
        const cache = new WeakMap<HTMLElement, Movers>();
        const movers = (card: HTMLElement): Movers => {
          let m = cache.get(card);
          if (!m) {
            const media = card.querySelector<HTMLElement>("[data-media]");
            const spring = { duration: 0.6, ease: "power3.out" };
            gsap.set(card, { transformPerspective: 900 });
            m = {
              rx: gsap.quickTo(card, "rotationX", spring),
              ry: gsap.quickTo(card, "rotationY", spring),
              lift: gsap.quickTo(card, "y", { duration: 0.5, ease: "power3.out" }),
              mx: media ? gsap.quickTo(media, "x", spring) : null,
              my: media ? gsap.quickTo(media, "y", spring) : null,
              media,
              glare: card.querySelector<HTMLElement>("[data-glare]"),
            };
            cache.set(card, m);
          }
          return m;
        };

        let current: HTMLElement | null = null;
        const enter = (card: HTMLElement) => {
          const m = movers(card);
          m.lift(-6);
          if (m.media) gsap.to(m.media, { scale: 1.09, duration: 0.9, ease: "expo.out", overwrite: "auto" });
          if (m.glare) gsap.to(m.glare, { opacity: 1, duration: 0.4, overwrite: "auto" });
          gsap.to(card, { boxShadow: "0 22px 44px -18px rgb(0 0 0 / 0.45), 0 0 0 1px var(--border-strong)", duration: 0.5, overwrite: "auto" });
        };
        const leave = (card: HTMLElement) => {
          const m = movers(card);
          m.rx(0);
          m.ry(0);
          m.lift(0);
          m.mx?.(0);
          m.my?.(0);
          if (m.media) gsap.to(m.media, { scale: 1, duration: 0.9, ease: "expo.out", overwrite: "auto" });
          if (m.glare) gsap.to(m.glare, { opacity: 0, duration: 0.5, overwrite: "auto" });
          gsap.to(card, { boxShadow: "0 0 0 0 rgb(0 0 0 / 0)", duration: 0.5, overwrite: "auto" });
        };

        const move = contextSafe((e: PointerEvent) => {
          if (e.pointerType !== "mouse") return;
          const card = (e.target as Element).closest<HTMLElement>("[data-card]");
          if (card !== current) {
            if (current) leave(current);
            current = card;
            if (card) enter(card);
          }
          if (!card) return;
          const r = card.getBoundingClientRect();
          const px = (e.clientX - r.left) / r.width;
          const py = (e.clientY - r.top) / r.height;
          const m = movers(card);
          m.ry((px - 0.5) * 12);
          m.rx((0.5 - py) * 10);
          m.mx?.((0.5 - px) * 14);
          m.my?.((0.5 - py) * 14);
          card.style.setProperty("--glare-x", `${px * 100}%`);
          card.style.setProperty("--glare-y", `${py * 100}%`);
        });
        const out = contextSafe(() => {
          if (current) leave(current);
          current = null;
        });

        root.addEventListener("pointermove", move);
        root.addEventListener("pointerleave", out);
        return () => {
          root.removeEventListener("pointermove", move);
          root.removeEventListener("pointerleave", out);
        };
      });

      return () => mm.revert();
    },
    { scope },
  );
}

/** The light that follows the pointer across a card. The card needs `relative` and `overflow-hidden`. */
export function CardGlare() {
  return (
    <span
      data-glare
      aria-hidden
      className="pointer-events-none absolute inset-0 z-10 opacity-0 mix-blend-soft-light"
      style={{
        background:
          "radial-gradient(420px circle at var(--glare-x, 50%) var(--glare-y, 50%), rgb(255 255 255 / 0.55), transparent 45%)",
      }}
    />
  );
}

/** A grid (or any wrapper) whose `[data-card]` children get {@link useCardMotion}. */
export function MotionGroup({
  revealKey,
  className,
  children,
}: {
  revealKey?: unknown;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  useCardMotion(ref, revealKey);
  return (
    <div ref={ref} className={cn("[perspective:1400px]", className)}>
      {children}
    </div>
  );
}
