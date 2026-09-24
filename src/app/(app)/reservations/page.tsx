import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ReservationsView } from "./view";
import { getSession } from "@/lib/session";

export const metadata: Metadata = { title: "Reservations" };

export default async function ReservationsPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/reservations");
  return <ReservationsView />;
}
