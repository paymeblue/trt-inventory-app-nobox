import type { Metadata } from "next";
import { AlertsView } from "./view";

export const metadata: Metadata = { title: "Stock alerts" };

export default function AlertsPage() {
  return <AlertsView />;
}
