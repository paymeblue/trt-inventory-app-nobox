import type { Metadata } from "next";
import { ReceiptDetail } from "./view";

export const metadata: Metadata = { title: "Goods receipt" };

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ReceiptDetail id={id} />;
}
