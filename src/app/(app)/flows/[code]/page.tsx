import type { Metadata } from "next";
import { FlowDetail } from "./view";

export const metadata: Metadata = { title: "Process flow" };

export default async function FlowPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <FlowDetail code={code} />;
}
