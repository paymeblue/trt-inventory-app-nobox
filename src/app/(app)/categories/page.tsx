import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CategoriesView } from "./view";
import { getSession } from "@/lib/session";
import { canManage, isManager, isSource, SOURCES } from "@/lib/rbac";

export const metadata: Metadata = { title: "Categories" };

export default async function CategoriesPage({ searchParams }: { searchParams: Promise<{ source?: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login?next=/categories");
  if (!isManager(session.role)) redirect("/inventory");
  const sides = SOURCES.filter((s) => canManage(session.role, s));
  const { source } = await searchParams;
  return <CategoriesView sides={sides} initial={isSource(source) && sides.includes(source) ? source : sides[0]} />;
}
