import type { Metadata } from "next";
import { Suspense } from "react";
import { RequisitionsView } from "./view";
import { PageLoading } from "@/components/ui/spinner";

export const metadata: Metadata = { title: "Requisitions" };

export default function RequisitionsPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <RequisitionsView />
    </Suspense>
  );
}
