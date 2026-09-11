import type { Metadata } from "next";
import { Suspense } from "react";
import { RunsView } from "./view";
import { PageLoading } from "@/components/ui/spinner";

export const metadata: Metadata = { title: "Active runs" };

export default function RunsPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <RunsView />
    </Suspense>
  );
}
