import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ManageView } from "@/components/manage/manage-view";
import { getSession } from "@/lib/session";
import { canManage } from "@/lib/rbac";

export const metadata: Metadata = { title: "Nobox inventory" };

export default async function NoboxPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/nobox");
  if (!canManage(session.role, "NOBOX")) redirect("/inventory");
  return <ManageView source="NOBOX" />;
}
