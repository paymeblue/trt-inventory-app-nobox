export const ROLES = ["ADMIN", "FACTORY_MANAGER", "NOBOX_MANAGER", "DESIGNER"] as const;

export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Administrator",
  FACTORY_MANAGER: "Factory Manager",
  NOBOX_MANAGER: "Nobox Manager",
  DESIGNER: "Designer",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  ADMIN: "Manages both inventories and everyone's accounts.",
  FACTORY_MANAGER: "Adds, edits, removes and uploads Factory items.",
  NOBOX_MANAGER: "Adds, edits, removes and uploads Nobox items.",
  DESIGNER: "Sees everything in both inventories. Cannot change anything.",
};

export const SOURCES = ["FACTORY", "NOBOX"] as const;

export type Source = (typeof SOURCES)[number];

export const SOURCE_LABELS: Record<Source, string> = { FACTORY: "Factory", NOBOX: "Nobox" };

export const SOURCE_PATHS: Record<Source, string> = { FACTORY: "/factory", NOBOX: "/nobox" };

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

export function isSource(value: unknown): value is Source {
  return typeof value === "string" && (SOURCES as readonly string[]).includes(value);
}

export function canManage(role: string | null | undefined, source: Source): boolean {
  if (role === "ADMIN") return true;
  if (source === "FACTORY") return role === "FACTORY_MANAGER";
  return role === "NOBOX_MANAGER";
}

export function canManageUsers(role: string | null | undefined): boolean {
  return role === "ADMIN";
}

/** Where someone lands after signing in. */
export function homeFor(role: Role): string {
  if (role === "FACTORY_MANAGER") return SOURCE_PATHS.FACTORY;
  if (role === "NOBOX_MANAGER") return SOURCE_PATHS.NOBOX;
  return "/inventory";
}
