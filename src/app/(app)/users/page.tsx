import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { UsersView } from "./view";
import { getSession } from "@/lib/session";
import { canManageUsers } from "@/lib/rbac";

export const metadata: Metadata = { title: "Team" };

export default async function UsersPage() {
  const session = await getSession();
  if (!session || !canManageUsers(session.role)) redirect("/inventory");
  return <UsersView />;
}
