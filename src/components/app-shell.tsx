"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Menu, X, ChevronDown, LayoutGrid, Factory, Store, Users, ClipboardList, LogIn, ScrollText } from "lucide-react";
import { Logo } from "./logo";
import { ThemeToggle } from "./theme";
import { canManage, canManageUsers, homeFor, ROLE_LABELS, type Role } from "@/lib/rbac";
import { SessionProvider, signInHref } from "./session-context";
import { cn, initials } from "@/lib/utils";

type Session = { sub: string; name: string; email: string; role: Role };

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  allowed: (role: Role | null) => boolean;
};

const NAV: NavItem[] = [
  { href: "/inventory", label: "Inventory", icon: LayoutGrid, allowed: () => true },
  { href: "/reservations", label: "Reservations", icon: ClipboardList, allowed: (r) => r !== null },
  { href: "/logs", label: "Logs", icon: ScrollText, allowed: (r) => r !== null },
  { href: "/factory", label: "Factory", icon: Factory, allowed: (r) => canManage(r, "FACTORY") },
  { href: "/nobox", label: "Nobox", icon: Store, allowed: (r) => canManage(r, "NOBOX") },
  { href: "/users", label: "Team", icon: Users, allowed: canManageUsers },
];

function useAllowedNav(role: Role | null) {
  return React.useMemo(() => NAV.filter((item) => item.allowed(role)), [role]);
}

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({ item, pathname, onNavigate }: { item: NavItem; pathname: string; onNavigate?: () => void }) {
  const active = isActive(pathname, item.href);
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] font-medium transition-colors",
        active ? "bg-surface-2 text-fg" : "text-fg-muted hover:bg-surface-2/70 hover:text-fg",
      )}
    >
      {active ? (
        <span className="absolute left-0 top-1/2 h-4 w-[2.5px] -translate-y-1/2 rounded-r-full bg-accent" />
      ) : null}
      <item.icon className={cn("h-[17px] w-[17px] shrink-0", active ? "text-accent" : "text-fg-subtle")} />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

function SidebarContent({ role, pathname, onNavigate }: { role: Role | null; pathname: string; onNavigate?: () => void }) {
  const items = useAllowedNav(role);
  return (
    <nav className="scrollbar-thin flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
      {items.map((item) => (
        <NavLink key={item.href} item={item} pathname={pathname} onNavigate={onNavigate} />
      ))}
    </nav>
  );
}

function SignInBlock() {
  const pathname = usePathname();
  return (
    <div className="border-t border-border p-3">
      <Link
        href={signInHref(pathname)}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2.5 text-[13.5px] font-medium text-accent-fg transition-colors hover:bg-accent-hover"
      >
        <LogIn className="h-4 w-4" /> Sign in
      </Link>
      <p className="mt-2 px-1 text-center text-[11.5px] text-fg-subtle">Sign in to reserve items</p>
    </div>
  );
}

function UserBlock({ session }: { session: Session | null }) {
  if (!session) return <SignInBlock />;
  return <SignedInBlock session={session} />;
}

function SignedInBlock({ session }: { session: Session }) {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <div ref={ref} className="relative border-t border-border p-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-surface-2"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[12px] font-semibold text-accent">
          {initials(session.name)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium text-fg">{session.name}</span>
          <span className="block truncate text-[11.5px] text-fg-subtle">{ROLE_LABELS[session.role]}</span>
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-fg-subtle transition-transform", open && "rotate-180")} />
      </button>

      {open ? (
        <div className="absolute bottom-full left-3 right-3 mb-1 animate-fade-up overflow-hidden rounded-xl border border-border bg-surface shadow-[var(--shadow)]">
          <div className="border-b border-border px-3 py-2.5">
            <p className="truncate text-[12px] text-fg-muted">{session.email}</p>
          </div>
          <button
            onClick={signOut}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-[13px] font-medium text-danger transition-colors hover:bg-danger-soft"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function AppShell({ session, children }: { session: Session | null; children: React.ReactNode }) {
  const pathname = usePathname();
  const [drawer, setDrawer] = React.useState(false);
  const role = session?.role ?? null;
  const bottomItems = useAllowedNav(role);
  const home = session ? homeFor(session.role) : "/inventory";

  React.useEffect(() => {
    setDrawer(false);
  }, [pathname]);

  React.useEffect(() => {
    document.body.style.overflow = drawer ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [drawer]);

  return (
    <SessionProvider value={session}>
    <div className="min-h-dvh bg-bg">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r border-border bg-bg-subtle lg:flex">
        <div className="px-4 py-4">
          <Link href={home}>
            <Logo />
          </Link>
        </div>
        <SidebarContent role={role} pathname={pathname} />
        <UserBlock session={session} />
      </aside>

      {/* Mobile / tablet drawer */}
      {drawer ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 animate-fade-in bg-black/70 backdrop-blur-sm" onClick={() => setDrawer(false)} />
          <div className="relative flex h-full w-[276px] max-w-[85vw] animate-slide-in flex-col border-r border-border bg-bg-subtle">
            <div className="flex items-center justify-between px-4 py-4">
              <Logo />
              <button
                onClick={() => setDrawer(false)}
                className="rounded-lg p-1.5 text-fg-subtle transition-colors hover:bg-surface-2 hover:text-fg"
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <SidebarContent role={role} pathname={pathname} onNavigate={() => setDrawer(false)} />
            <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-3">
              <span className="text-[12.5px] text-fg-muted">Theme</span>
              <ThemeToggle />
            </div>
            <UserBlock session={session} />
          </div>
        </div>
      ) : null}

      {/* Main column */}
      <div className="lg:pl-[248px]">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-bg/85 px-3 backdrop-blur-xl sm:px-5">
          <button
            onClick={() => setDrawer(true)}
            className="-ml-1 rounded-lg p-2 text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg lg:hidden"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          <Link href={home} className="lg:hidden">
            <Logo className="[&_p:last-child]:hidden" />
          </Link>

          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle className="hidden sm:inline-flex" />
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1400px] px-3 pb-24 pt-4 sm:px-5 sm:pb-10 sm:pt-6 lg:pb-12">
          {children}
        </main>
      </div>

      {/* Mobile bottom bar, only when there is somewhere else to go */}
      {bottomItems.length > 1 ? (
      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-border bg-bg/95 backdrop-blur-xl sm:hidden">
        <div className="flex items-stretch">
          {bottomItems.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-1 flex-col items-center gap-1 py-2.5 text-[10.5px] font-medium transition-colors",
                  active ? "text-accent" : "text-fg-subtle",
                )}
              >
                <item.icon className="h-[19px] w-[19px]" />
                <span className="truncate px-0.5">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
      ) : null}
    </div>
    </SessionProvider>
  );
}
