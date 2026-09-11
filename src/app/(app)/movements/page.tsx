import type { Metadata } from "next";
import { MovementsView } from "./view";

export const metadata: Metadata = { title: "Movements" };

export default function MovementsPage() {
  return <MovementsView />;
}
