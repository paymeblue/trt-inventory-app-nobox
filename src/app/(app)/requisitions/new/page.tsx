import type { Metadata } from "next";
import { NewRequisitionView } from "./view";

export const metadata: Metadata = { title: "New requisition" };

export default function NewRequisitionPage() {
  return <NewRequisitionView />;
}
