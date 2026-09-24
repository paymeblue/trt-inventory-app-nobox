import { AppShell } from "@/components/app-shell";
import { getSession } from "@/lib/session";

/** Signed-out visitors may browse the inventory; each other page guards itself. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  return <AppShell session={session}>{children}</AppShell>;
}
