export const ROLES = [
  "ADMIN",
  "OPERATIONS_MANAGER",
  "FACTORY_MANAGER",
  "STOREKEEPER",
  "INVENTORY_OFFICER",
  "PROCUREMENT_OFFICER",
  "PROJECT_SUPERVISOR",
  "QUALITY_CONTROL",
  "LOGISTICS_OFFICER",
  "VIEWER",
] as const;

export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Administrator",
  OPERATIONS_MANAGER: "Operations Manager",
  FACTORY_MANAGER: "Factory Manager",
  STOREKEEPER: "Storekeeper",
  INVENTORY_OFFICER: "Inventory Officer",
  PROCUREMENT_OFFICER: "Procurement Officer",
  PROJECT_SUPERVISOR: "Project Supervisor",
  QUALITY_CONTROL: "Quality Control",
  LOGISTICS_OFFICER: "Logistics Officer",
  VIEWER: "Viewer",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  ADMIN: "Full system access including user management.",
  OPERATIONS_MANAGER: "Oversees material registration, catalogue and reconciliation.",
  FACTORY_MANAGER: "Approves material plans and authorises issuance from store.",
  STOREKEEPER: "Receives, shelves and issues materials; keeps the ledger accurate.",
  INVENTORY_OFFICER: "Verifies deliveries and maintains stock records.",
  PROCUREMENT_OFFICER: "Raises requisitions, manages suppliers and goods receipts.",
  PROJECT_SUPERVISOR: "Requests materials for site, receives them and logs usage.",
  QUALITY_CONTROL: "Inspects incoming and outgoing materials.",
  LOGISTICS_OFFICER: "Tracks dispatch and delivery of project materials.",
  VIEWER: "Read-only access to the material catalogue and stock levels.",
};

export type Permission =
  | "product:read" | "product:write" | "product:import"
  | "stock:read" | "stock:adjust" | "stock:transfer"
  | "requisition:read" | "requisition:create" | "requisition:approve"
  | "requisition:issue" | "requisition:receive"
  | "receipt:read" | "receipt:write" | "receipt:post"
  | "supplier:read" | "supplier:write"
  | "project:read" | "project:write"
  | "location:read" | "location:write"
  | "user:read" | "user:write"
  | "report:read"
  | "flow:read" | "flow:run";

const ALL: Permission[] = [
  "product:read", "product:write", "product:import",
  "stock:read", "stock:adjust", "stock:transfer",
  "requisition:read", "requisition:create", "requisition:approve",
  "requisition:issue", "requisition:receive",
  "receipt:read", "receipt:write", "receipt:post",
  "supplier:read", "supplier:write",
  "project:read", "project:write",
  "location:read", "location:write",
  "user:read", "user:write",
  "report:read",
  "flow:read", "flow:run",
];

const BASE_READ: Permission[] = [
  "product:read", "stock:read", "requisition:read",
  "receipt:read", "project:read", "location:read", "report:read",
  "flow:read",
];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  ADMIN: ALL,
  OPERATIONS_MANAGER: ALL.filter((p) => p !== "user:write"),
  FACTORY_MANAGER: [
    ...BASE_READ,
    "flow:run",
    "product:write", "product:import",
    "stock:adjust", "stock:transfer",
    "requisition:create", "requisition:approve", "requisition:issue",
    "supplier:read", "project:write", "user:read",
  ],
  STOREKEEPER: [
    ...BASE_READ,
    "flow:run",
    "product:write", "product:import",
    "stock:adjust", "stock:transfer",
    "requisition:create", "requisition:issue",
    "receipt:write", "receipt:post",
    "supplier:read",
  ],
  INVENTORY_OFFICER: [
    ...BASE_READ,
    "flow:run",
    "product:write", "product:import",
    "stock:adjust", "stock:transfer",
    "receipt:write", "receipt:post",
    "supplier:read",
  ],
  PROCUREMENT_OFFICER: [
    ...BASE_READ,
    "flow:run",
    "product:write",
    "requisition:create",
    "receipt:write",
    "supplier:read", "supplier:write",
  ],
  PROJECT_SUPERVISOR: [
    ...BASE_READ,
    "flow:run",
    "requisition:create", "requisition:receive",
  ],
  QUALITY_CONTROL: BASE_READ,
  LOGISTICS_OFFICER: BASE_READ,
  VIEWER: ["product:read", "stock:read", "report:read", "location:read", "flow:read"],
};

export function can(role: string | undefined | null, permission: Permission): boolean {
  if (!role) return false;
  const perms = ROLE_PERMISSIONS[role as Role];
  return perms ? perms.includes(permission) : false;
}

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}
