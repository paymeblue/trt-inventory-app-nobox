import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LogsView } from "./view";
import { getSession } from "@/lib/session";

export const metadata: Metadata = { title: "Logs" };

export default async function LogsPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/logs");
  return <LogsView />;
}
