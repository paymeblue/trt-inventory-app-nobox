export const ROLES = ["ADMIN", "FACTORY_MANAGER", "NOBOX_MANAGER", "READY_CABINETS_MANAGER", "GERMANA_MANAGER", "DESIGNER", "SALES"] as const;

export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Administrator",
  FACTORY_MANAGER: "Factory Manager",
  NOBOX_MANAGER: "Nobox Manager",
  READY_CABINETS_MANAGER: "Ready Cabinets Manager",
  GERMANA_MANAGER: "Germana Manager",
  DESIGNER: "Designer",
  SALES: "Sales",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  ADMIN: "Manages every inventory and everyone's accounts.",
  FACTORY_MANAGER: "Updates Factory stock from Excel and issues designers' reservations.",
  NOBOX_MANAGER: "Updates Nobox stock from Excel and issues designers' reservations.",
  READY_CABINETS_MANAGER: "Updates Ready Cabinets stock from Excel and issues designers' reservations.",
  GERMANA_MANAGER: "Updates Germana stock from Excel and issues designers' reservations.",
  DESIGNER: "Sees every inventory and reserves stock for projects.",
  SALES: "Sees every inventory and reserves stock for customers' orders, like the designers do.",
};

export const SOURCES = ["FACTORY", "NOBOX", "READY_CABINETS", "GERMANA"] as const;

export type Source = (typeof SOURCES)[number];

export const SOURCE_LABELS: Record<Source, string> = {
  FACTORY: "Factory",
  NOBOX: "Nobox",
  READY_CABINETS: "Ready Cabinets",
  GERMANA: "Germana",
};

export const SOURCE_PATHS: Record<Source, string> = {
  FACTORY: "/factory",
  NOBOX: "/nobox",
  READY_CABINETS: "/ready-cabinets",
  GERMANA: "/germana",
};

/** Nobox holds stock in two cities; every Nobox material is tagged with one. */
export const LOCATIONS = ["LAGOS", "ABUJA"] as const;

export type Location = (typeof LOCATIONS)[number];

export const LOCATION_LABELS: Record<Location, string> = { LAGOS: "Lagos", ABUJA: "Abuja" };

export function isLocation(value: unknown): value is Location {
  return typeof value === "string" && (LOCATIONS as readonly string[]).includes(value);
}

/** Whether a side's materials carry a Lagos or Abuja location. */
export function hasLocations(source: Source): boolean {
  return source === "NOBOX";
}

/** Each side's inventory team. */
export const SOURCE_MANAGERS: Record<Source, Role> = {
  FACTORY: "FACTORY_MANAGER",
  NOBOX: "NOBOX_MANAGER",
  READY_CABINETS: "READY_CABINETS_MANAGER",
  GERMANA: "GERMANA_MANAGER",
};

/** "Factory, Nobox, Ready Cabinets or Germana". */
export const SOURCE_LIST = `${SOURCES.slice(0, -1).map((s) => SOURCE_LABELS[s]).join(", ")} or ${SOURCE_LABELS[SOURCES[SOURCES.length - 1]]}`;

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

export function isSource(value: unknown): value is Source {
  return typeof value === "string" && (SOURCES as readonly string[]).includes(value);
}

export function canManage(role: string | null | undefined, source: Source): boolean {
  return role === "ADMIN" || role === SOURCE_MANAGERS[source];
}

/** Anyone who runs at least one side's inventory. */
export function isManager(role: string | null | undefined): boolean {
  return SOURCES.some((s) => canManage(role, s));
}

/** Designers and the sales teams reserve; the inventory teams only work on what was reserved. */
export function canReserve(role: string | null | undefined): boolean {
  return role === "DESIGNER" || role === "SALES" || role === "ADMIN";
}

/** Who a reservation is for: the person responsible is in Design or in Sales. */
export const RESERVED_FOR = ["DESIGN", "SALES"] as const;

export type ReservedFor = (typeof RESERVED_FOR)[number];

export const RESERVED_FOR_LABELS: Record<ReservedFor, string> = { DESIGN: "Design", SALES: "Sales" };

/** Designers reserve for Design and sales for Sales; an administrator says which (Design by default). */
export function reservedForOf(role: string, requested?: unknown): ReservedFor {
  if (role === "SALES") return "SALES";
  if (role === "ADMIN" && requested === "SALES") return "SALES";
  return "DESIGN";
}

/** The side a manager works on; null for everyone else. */
export function sideOf(role: string | null | undefined): Source | null {
  return SOURCES.find((s) => SOURCE_MANAGERS[s] === role) ?? null;
}

export function canManageUsers(role: string | null | undefined): boolean {
  return role === "ADMIN";
}

/** Where someone lands after signing in. */
export function homeFor(role: Role): string {
  const side = sideOf(role);
  return side ? SOURCE_PATHS[side] : "/inventory";
}
