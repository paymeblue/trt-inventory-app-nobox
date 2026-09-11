import type { Metadata } from "next";
import { RunDetail } from "./view";

export const metadata: Metadata = { title: "Process run" };

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RunDetail id={id} />;
}
