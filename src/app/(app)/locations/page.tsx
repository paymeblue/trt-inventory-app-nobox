import type { Metadata } from "next";
import { LocationsView } from "./view";

export const metadata: Metadata = { title: "Locations" };

export default function LocationsPage() {
  return <LocationsView />;
}
