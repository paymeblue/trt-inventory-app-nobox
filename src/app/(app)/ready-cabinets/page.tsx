import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ManageView } from "@/components/manage/manage-view";
import { getSession } from "@/lib/session";
import { canManage } from "@/lib/rbac";

export const metadata: Metadata = { title: "Ready Cabinets inventory" };

export default async function ReadyCabinetsPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/ready-cabinets");
  if (!canManage(session.role, "READY_CABINETS")) redirect("/inventory");
  return <ManageView source="READY_CABINETS" />;
}
