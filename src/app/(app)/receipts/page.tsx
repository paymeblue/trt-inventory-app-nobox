import type { Metadata } from "next";
import { ReceiptsView } from "./view";

export const metadata: Metadata = { title: "Goods receipts" };

export default function ReceiptsPage() {
  return <ReceiptsView />;
}
