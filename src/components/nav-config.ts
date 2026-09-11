import {
  LayoutDashboard, Package, Warehouse, ArrowLeftRight, TriangleAlert,
  Upload, ClipboardList, PackageCheck, FolderKanban, Truck, MapPin,
  Users, BarChart3, Settings, Workflow, ListChecks,
} from "lucide-react";
import type { Permission } from "@/lib/rbac";

export type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  permission: Permission;
  short?: string;
};

export type NavGroup = { title: string; items: NavItem[] };

export const NAV: NavGroup[] = [
  {
    title: "Overview",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, permission: "product:read", short: "Home" },
      { href: "/alerts", label: "Stock alerts", icon: TriangleAlert, permission: "stock:read", short: "Alerts" },
    ],
  },
  {
    title: "Inventory",
    items: [
      { href: "/products", label: "Products", icon: Package, permission: "product:read", short: "Items" },
      { href: "/stock", label: "Stock levels", icon: Warehouse, permission: "stock:read", short: "Stock" },
      { href: "/movements", label: "Movements", icon: ArrowLeftRight, permission: "stock:read", short: "Ledger" },
      { href: "/import", label: "Import from Excel", icon: Upload, permission: "product:import" },
    ],
  },
  {
    title: "Operations",
    items: [
      { href: "/requisitions", label: "Requisitions", icon: ClipboardList, permission: "requisition:read", short: "MIV" },
      { href: "/receipts", label: "Goods receipts", icon: PackageCheck, permission: "receipt:read" },
      { href: "/projects", label: "Projects", icon: FolderKanban, permission: "project:read" },
    ],
  },
  {
    title: "App Flow",
    items: [
      { href: "/flows", label: "Process flows", icon: Workflow, permission: "flow:read", short: "Flows" },
      { href: "/runs", label: "Active runs", icon: ListChecks, permission: "flow:read", short: "Runs" },
    ],
  },
  {
    title: "Directory",
    items: [
      { href: "/suppliers", label: "Suppliers", icon: Truck, permission: "supplier:read" },
      { href: "/locations", label: "Locations", icon: MapPin, permission: "location:read" },
      { href: "/users", label: "Team", icon: Users, permission: "user:read" },
    ],
  },
  {
    title: "Insight",
    items: [
      { href: "/reports", label: "Reports", icon: BarChart3, permission: "report:read" },
      { href: "/settings", label: "Settings", icon: Settings, permission: "product:read" },
    ],
  },
];

/** The five destinations that get a slot in the mobile bottom bar. */
export const MOBILE_PRIMARY = ["/dashboard", "/products", "/stock", "/requisitions", "/alerts"];
