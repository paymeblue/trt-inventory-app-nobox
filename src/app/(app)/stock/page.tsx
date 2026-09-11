import type { Metadata } from "next";
import { StockView } from "./view";

export const metadata: Metadata = { title: "Stock levels" };

export default function StockPage() {
  return <StockView />;
}
