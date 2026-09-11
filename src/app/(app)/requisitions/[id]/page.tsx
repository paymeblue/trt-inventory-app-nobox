import type { Metadata } from "next";
import { RequisitionDetail } from "./view";

export const metadata: Metadata = { title: "Requisition" };

export default async function RequisitionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RequisitionDetail id={id} />;
}
