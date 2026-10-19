"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, Eye, EyeOff } from "lucide-react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

export function LoginForm() {
  const params = useSearchParams();
  // Only same-site paths, so the link cannot bounce someone to another site.
  const requested = params.get("next") ?? "";
  const next = requested.startsWith("/") && !requested.startsWith("//") ? requested : "/";

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [show, setShow] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const form = React.useRef<HTMLFormElement>(null);
  const button = React.useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.from("[data-field]", { y: 22, opacity: 0, duration: 0.8, ease: "expo.out", stagger: 0.08, delay: 0.4 });
      });
      // With a mouse, the button leans towards the pointer and snaps back when it leaves.
      mm.add("(prefers-reduced-motion: no-preference) and (hover: hover) and (pointer: fine)", () => {
        const el = button.current;
        if (!el) return;
        const x = gsap.quickTo(el, "x", { duration: 0.5, ease: "power3.out" });
        const y = gsap.quickTo(el, "y", { duration: 0.5, ease: "power3.out" });
        const move = (e: PointerEvent) => {
          const r = el.getBoundingClientRect();
          x((e.clientX - (r.left + r.width / 2)) * 0.12);
          y((e.clientY - (r.top + r.height / 2)) * 0.3);
        };
        const leave = () => {
          gsap.to(el, { x: 0, y: 0, duration: 0.9, ease: "elastic.out(1, 0.35)", overwrite: true });
        };
        el.addEventListener("pointermove", move);
        el.addEventListener("pointerleave", leave);
        return () => {
          el.removeEventListener("pointermove", move);
          el.removeEventListener("pointerleave", leave);
        };
      });
      return () => mm.revert();
    },
    { scope: form },
  );

  // A wrong password shakes the form, like a head saying no.
  React.useEffect(() => {
    if (!error || !form.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    gsap.fromTo(form.current, { x: 0 }, {
      keyframes: { x: [0, -12, 10, -7, 5, -2, 0] }, duration: 0.55, ease: "power2.out",
    });
  }, [error]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Sign in failed");
      // A full navigation, so the new session cookie is used for the page
      // itself. (Refreshing /login instead would bounce to the home page.)
      window.location.assign(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
      setBusy(false);
    }
  }

  return (
    <form ref={form} onSubmit={onSubmit} className="mt-8 space-y-4">
      {error ? (
        <div className="flex items-start gap-2.5 rounded-lg border border-danger/30 bg-danger-soft px-3.5 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
          <p className="text-[13px] leading-snug text-danger">{error}</p>
        </div>
      ) : null}

      <div data-field>
        <Field label="Work email">
          <Input
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            required
            placeholder="you@trtnobox.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
      </div>

      <div data-field>
        <Field label="Password">
          <div className="relative">
            <Input
              type={show ? "text" : "password"}
              autoComplete="current-password"
              required
              placeholder="••••••••"
              className="pr-10"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-fg-subtle transition-colors hover:text-fg"
              aria-label={show ? "Hide password" : "Show password"}
            >
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </Field>
      </div>

      <div data-field ref={button}>
        <Button type="submit" size="lg" loading={busy} className="w-full">
          {busy ? "Signing in…" : "Sign in"}
        </Button>
      </div>

      <p data-field className="pt-1 text-center text-[12.5px] leading-relaxed text-fg-subtle">
        Accounts are created by an administrator. Contact operations if you need access.
      </p>
    </form>
  );
}
