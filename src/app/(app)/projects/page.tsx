import type { Metadata } from "next";
import { ProjectsView } from "./view";

export const metadata: Metadata = { title: "Projects" };

export default function ProjectsPage() {
  return <ProjectsView />;
}
