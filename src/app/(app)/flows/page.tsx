import type { Metadata } from "next";
import { FlowsView } from "./view";

export const metadata: Metadata = { title: "Process flows" };

export default function FlowsPage() {
  return <FlowsView />;
}
