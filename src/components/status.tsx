import { Badge } from "./ui/badge";

const REQUISITION_TONES = {
  DRAFT: "neutral",
  SUBMITTED: "info",
  APPROVED: "accent",
  REJECTED: "danger",
  ISSUED: "warn",
  RECEIVED: "ok",
  CLOSED: "ok",
  CANCELLED: "neutral",
} as const;

export function RequisitionStatus({ status }: { status: string }) {
  const tone = REQUISITION_TONES[status as keyof typeof REQUISITION_TONES] ?? "neutral";
  return <Badge tone={tone} dot>{status.toLowerCase()}</Badge>;
}

const PROJECT_TONES = {
  PLANNING: "info",
  IN_PRODUCTION: "accent",
  INSTALLATION: "warn",
  COMPLETED: "ok",
  ON_HOLD: "neutral",
  CANCELLED: "danger",
} as const;

export function ProjectStatus({ status }: { status: string }) {
  const tone = PROJECT_TONES[status as keyof typeof PROJECT_TONES] ?? "neutral";
  return <Badge tone={tone} dot>{status.replace(/_/g, " ").toLowerCase()}</Badge>;
}

export function StockStatus({ onHand, reorder }: { onHand: number; reorder: number }) {
  if (onHand <= 0) return <Badge tone="danger" dot>out of stock</Badge>;
  if (reorder > 0 && onHand <= reorder) return <Badge tone="warn" dot>low stock</Badge>;
  return <Badge tone="ok" dot>in stock</Badge>;
}

const MOVEMENT_TONES = {
  RECEIPT: "ok",
  OPENING: "info",
  RETURN: "ok",
  ISSUE: "warn",
  TRANSFER: "info",
  ADJUSTMENT: "accent",
  WASTE: "danger",
} as const;

export function MovementBadge({ type }: { type: string }) {
  const tone = MOVEMENT_TONES[type as keyof typeof MOVEMENT_TONES] ?? "neutral";
  return <Badge tone={tone}>{type.toLowerCase()}</Badge>;
}

export function ReceiptStatus({ status }: { status: string }) {
  const tone = status === "POSTED" ? "ok" : status === "CANCELLED" ? "danger" : "neutral";
  return <Badge tone={tone} dot>{status.toLowerCase()}</Badge>;
}
