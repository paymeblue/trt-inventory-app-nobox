import type { Metadata } from "next";
import { SuppliersView } from "./view";

export const metadata: Metadata = { title: "Suppliers" };

export default function SuppliersPage() {
  return <SuppliersView />;
}
