import type { Metadata } from "next";
import { DashboardView } from "./view";
import { getSession } from "@/lib/session";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const session = await getSession();
  const firstName = session?.name?.split(" ")[0] ?? "there";
  return <DashboardView firstName={firstName} />;
}
