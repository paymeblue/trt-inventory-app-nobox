import type { PoolClient } from "pg";
import { HttpError } from "./session";

export type MovementType =
  | "RECEIPT" | "ISSUE" | "RETURN" | "TRANSFER" | "ADJUSTMENT" | "WASTE" | "OPENING";

export type MovementInput = {
  productId: string;
  type: MovementType;
  /** Always positive, except ADJUSTMENT which may be negative. */
  quantity: number;
  fromLocationId?: string | null;
  toLocationId?: string | null;
  unitCost?: number | null;
  reference?: string | null;
  requisitionId?: string | null;
  receiptId?: string | null;
  projectId?: string | null;
  notes?: string | null;
  userId: string;
};

/** Applies a signed delta to one product/location balance, refusing to go negative. */
async function applyDelta(
  client: PoolClient,
  productId: string,
  locationId: string,
  delta: number,
) {
  const { rows } = await client.query<{ on_hand: string }>(
    `INSERT INTO stock_levels (product_id, location_id, on_hand)
          VALUES ($1, $2, $3)
     ON CONFLICT (product_id, location_id)
     DO UPDATE SET on_hand = stock_levels.on_hand + EXCLUDED.on_hand,
                   updated_at = now()
       RETURNING on_hand`,
    [productId, locationId, delta],
  );

  const balance = Number(rows[0].on_hand);
  if (balance < 0) {
    const { rows: p } = await client.query<{ name: string; sku: string }>(
      "SELECT name, sku FROM products WHERE id = $1",
      [productId],
    );
    const label = p[0] ? `${p[0].name} (${p[0].sku})` : "this item";
    throw new HttpError(
      400,
      `Not enough stock of ${label} at that location — the movement would leave ${balance.toFixed(2)}.`,
    );
  }
}

/**
 * Writes one row to the immutable movement ledger and moves the matching
 * balances. Must be called inside a transaction.
 */
export async function postMovement(client: PoolClient, input: MovementInput): Promise<string> {
  const qty = Number(input.quantity);
  if (!Number.isFinite(qty) || qty === 0) {
    throw new HttpError(400, "Quantity must be a non-zero number.");
  }
  if (input.type !== "ADJUSTMENT" && qty < 0) {
    throw new HttpError(400, "Quantity must be positive.");
  }

  const from = input.fromLocationId ?? null;
  const to = input.toLocationId ?? null;

  switch (input.type) {
    case "RECEIPT":
    case "OPENING":
    case "RETURN":
      if (!to) throw new HttpError(400, "A destination location is required.");
      await applyDelta(client, input.productId, to, qty);
      break;

    case "ISSUE":
    case "WASTE":
      if (!from) throw new HttpError(400, "A source location is required.");
      await applyDelta(client, input.productId, from, -qty);
      break;

    case "TRANSFER":
      if (!from || !to) throw new HttpError(400, "Both a source and a destination location are required.");
      if (from === to) throw new HttpError(400, "Source and destination must be different locations.");
      await applyDelta(client, input.productId, from, -qty);
      await applyDelta(client, input.productId, to, qty);
      break;

    case "ADJUSTMENT": {
      const target = to ?? from;
      if (!target) throw new HttpError(400, "A location is required.");
      await applyDelta(client, input.productId, target, qty);
      break;
    }
  }

  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO stock_movements
       (product_id, movement_type, quantity, from_location_id, to_location_id,
        unit_cost, reference, requisition_id, receipt_id, project_id, notes, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING id`,
    [
      input.productId, input.type, qty, from, to,
      input.unitCost ?? null, input.reference ?? null,
      input.requisitionId ?? null, input.receiptId ?? null,
      input.projectId ?? null, input.notes ?? null, input.userId,
    ],
  );
  return rows[0].id;
}

/** Generates a human-readable document reference like MIV-2026-0042. */
export async function nextRef(client: PoolClient, table: "requisitions" | "goods_receipts", prefix: string) {
  const year = new Date().getFullYear();
  const { rows } = await client.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM ${table}
      WHERE ref LIKE $1`,
    [`${prefix}-${year}-%`],
  );
  const seq = Number(rows[0].n) + 1;
  return `${prefix}-${year}-${String(seq).padStart(4, "0")}`;
}

export async function logActivity(
  client: PoolClient,
  userId: string,
  action: string,
  entity: string,
  entityId: string | null,
  detail?: string,
) {
  await client.query(
    "INSERT INTO activity_log (user_id, action, entity, entity_id, detail) VALUES ($1,$2,$3,$4,$5)",
    [userId, action, entity, entityId, detail ?? null],
  );
}
