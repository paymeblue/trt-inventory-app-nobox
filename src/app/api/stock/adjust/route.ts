import { transaction } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { fail, handle, ok, readJson } from "@/lib/api";
import { logActivity, postMovement, type MovementType } from "@/lib/inventory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  productId?: string;
  locationId?: string;
  type?: MovementType;
  quantity?: number;
  reference?: string;
  notes?: string;
  projectId?: string | null;
  unitCost?: number | null;
};

const ALLOWED: MovementType[] = ["RECEIPT", "ISSUE", "RETURN", "ADJUSTMENT", "WASTE", "OPENING"];

/** Single-line stock movement: receive, issue, return, waste or correct. */
export const POST = handle(async (req: Request) => {
  const session = await requirePermission("stock:adjust");
  const body = await readJson<Body>(req);

  const { productId, locationId } = body;
  const type = body.type ?? "ADJUSTMENT";
  const quantity = Number(body.quantity);

  if (!productId) return fail(400, "Select a material.");
  if (!locationId) return fail(400, "Select a location.");
  if (!ALLOWED.includes(type)) return fail(400, "Unsupported movement type.");
  if (!Number.isFinite(quantity) || quantity === 0) return fail(400, "Enter a quantity.");

  const inbound = type === "RECEIPT" || type === "RETURN" || type === "OPENING";

  const id = await transaction(async (client) => {
    const movementId = await postMovement(client, {
      productId,
      type,
      quantity: type === "ADJUSTMENT" ? quantity : Math.abs(quantity),
      fromLocationId: inbound ? null : locationId,
      toLocationId: inbound || type === "ADJUSTMENT" ? locationId : null,
      unitCost: body.unitCost ?? null,
      reference: body.reference ?? null,
      projectId: body.projectId || null,
      notes: body.notes ?? null,
      userId: session.sub,
    });
    await logActivity(client, session.sub, type, "stock_movement", movementId, body.reference ?? undefined);
    return movementId;
  });

  return ok({ id }, { status: 201 });
});
