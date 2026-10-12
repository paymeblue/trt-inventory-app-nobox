import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ReserveView } from "./view";
import { getSession } from "@/lib/session";
import { canReserve, homeFor } from "@/lib/rbac";

export const metadata: Metadata = { title: "Reservation Form" };

export default async function ReservePage({ searchParams }: { searchParams: Promise<{ item?: string }> }) {
  const session = await getSession();
  const { item } = await searchParams;
  if (!session) redirect(`/login?next=${encodeURIComponent(`/reserve${item ? `?item=${item}` : ""}`)}`);
  if (!canReserve(session.role)) redirect(homeFor(session.role));
  return <ReserveView itemId={item ?? null} />;
}
