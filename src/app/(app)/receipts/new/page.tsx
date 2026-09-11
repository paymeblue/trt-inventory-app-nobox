import type { Metadata } from "next";
import { NewReceiptView } from "./view";

export const metadata: Metadata = { title: "Record delivery" };

export default function NewReceiptPage() {
  return <NewReceiptView />;
}
