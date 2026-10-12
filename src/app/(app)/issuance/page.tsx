import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { IssuanceView } from "./view";
import { getSession } from "@/lib/session";

export const metadata: Metadata = { title: "Issuance Log" };

export default async function IssuancePage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const session = await getSession();
  const { new: fresh } = await searchParams;
  if (!session) redirect(`/login?next=${encodeURIComponent(`/issuance${fresh ? "?new=1" : ""}`)}`);
  return <IssuanceView startIssuing={fresh === "1"} />;
}
