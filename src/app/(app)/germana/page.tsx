import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ManageView } from "@/components/manage/manage-view";
import { getSession } from "@/lib/session";
import { canManage } from "@/lib/rbac";

export const metadata: Metadata = { title: "Germana inventory" };

export default async function GermanaPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/germana");
  if (!canManage(session.role, "GERMANA")) redirect("/inventory");
  return <ManageView source="GERMANA" />;
}
