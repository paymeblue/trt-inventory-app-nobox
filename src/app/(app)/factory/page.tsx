import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ManageView } from "@/components/manage/manage-view";
import { getSession } from "@/lib/session";
import { canManage } from "@/lib/rbac";

export const metadata: Metadata = { title: "Factory inventory" };

export default async function FactoryPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/factory");
  if (!canManage(session.role, "FACTORY")) redirect("/inventory");
  return <ManageView source="FACTORY" />;
}
