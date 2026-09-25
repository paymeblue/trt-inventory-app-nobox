import type { PoolClient } from "pg";
import { HttpError } from "./session";
import { recordMovement } from "./items";
import { lockItem, releaseReservation, resolveReservationRef, type Person } from "./reservations";

/**
 * Stock_Addition_Form. Status Check: "Missing required fields",
 * "Quantity must be greater than zero".
 */
export async function addStock(
  client: PoolClient,
  input: { itemId: string; quantity: number; supplierRef?: string | null; documentRef?: string | null; notes?: string | null },
  who: Person,
) {
  const quantity = Number(input.quantity);
  if (!input.itemId || !Number.isFinite(quantity)) throw new HttpError(400, "Missing required fields.");
  if (quantity <= 0) throw new HttpError(400, "Quantity must be greater than zero.");

  const item = await lockItem(client, input.itemId);
  const balance = item.quantity + quantity;
  await client.query("UPDATE items SET quantity = $1, updated_by = $2, updated_at = now() WHERE id = $3", [balance, who.id, item.id]);
  const { rows } = await client.query<{ ref: string }>(
    `INSERT INTO stock_additions (item_id, source, quantity, supplier_ref, document_ref, notes, recorded_by, recorded_by_name, recorded_by_email)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING ref`,
    [item.id, item.source, quantity, input.supplierRef?.trim() || null, input.documentRef?.trim() || null,
     input.notes?.trim() || null, who.id, who.name, who.email],
  );
  await recordMovement(client, {
    itemId: item.id, source: item.source, kind: "ADDITION", delta: quantity, balance,
    note: [rows[0].ref, input.supplierRef, input.notes].filter(Boolean).join(" · "), userId: who.id,
  });
  return { ref: rows[0].ref, quantity: balance, source: item.source };
}

export const ADJUSTMENT_TYPES = [
  "Return to Stock",
  "Additional Issue",
  "Reservation Release",
  "Damage / Write-off",
  "Count Gain",
  "Count Loss",
  "Move to Bad Stock",
  "Restore from Bad Stock",
] as const;

/** Types that take stock away for a reason someone must be able to read later. */
export const REASON_REQUIRED: readonly string[] = ["Move to Bad Stock", "Damage / Write-off", "Count Loss"];
export type AdjustmentType = (typeof ADJUSTMENT_TYPES)[number];

/**
 * The Stock Adjustment form's three signed impacts, exactly as the workbook's
 * formulas compute them (Stock_Impact, Reserved_Impact, Issued_Impact).
 */
export function adjustmentImpacts(type: AdjustmentType, q: number) {
  switch (type) {
    case "Return to Stock": return { stock: q, reserved: 0, issued: -q };
    case "Additional Issue": return { stock: -q, reserved: 0, issued: q };
    case "Reservation Release": return { stock: 0, reserved: -q, issued: 0 };
    case "Damage / Write-off": return { stock: -q, reserved: 0, issued: 0 };
    case "Count Gain": return { stock: q, reserved: 0, issued: 0 };
    case "Count Loss": return { stock: -q, reserved: 0, issued: 0 };
    case "Move to Bad Stock": return { stock: -q, reserved: 0, issued: 0 };
    case "Restore from Bad Stock": return { stock: q, reserved: 0, issued: 0 };
  }
}

/** How the Bad stock bucket moves: in on a move to bad, out on a restore. */
export function badChange(type: AdjustmentType, q: number) {
  return type === "Move to Bad Stock" ? q : type === "Restore from Bad Stock" ? -q : 0;
}

/**
 * How much physically moves on the shelf. The workbook adds Stock_Impact to
 * Adjustment_Net_Stock *and* Issued_Impact to Issued_Qty, so a Return to Stock
 * or an Additional Issue moved Available_Qty by twice the quantity there. Here
 * the goods move once.
 */
export function shelfChange(type: AdjustmentType, q: number) {
  return adjustmentImpacts(type, q).stock;
}

export function isAdjustmentType(value: unknown): value is AdjustmentType {
  return typeof value === "string" && (ADJUSTMENT_TYPES as readonly string[]).includes(value);
}

/**
 * Stock_Adjustment_Form. Status Check: "Missing required fields",
 * "Quantity must be greater than zero". A Reservation Release needs the
 * reservation as its Related ID; the other types take one optionally.
 */
export async function adjustStock(
  client: PoolClient,
  input: { itemId: string; type: string; quantity: number; relatedRef?: string | null; notes?: string | null },
  who: Person,
) {
  const quantity = Number(input.quantity);
  if (!input.itemId || !input.type || !Number.isFinite(quantity)) throw new HttpError(400, "Missing required fields.");
  if (!isAdjustmentType(input.type)) throw new HttpError(400, "Choose an Adjustment Type.");
  if (quantity <= 0) throw new HttpError(400, "Quantity must be greater than zero.");
  const type = input.type;
  const relatedRef = input.relatedRef?.trim() || null;
  if (REASON_REQUIRED.includes(type) && !input.notes?.trim()) {
    throw new HttpError(400, `Give a reason for the ${type}.`);
  }

  const item = await lockItem(client, input.itemId);
  const impacts = adjustmentImpacts(type, quantity);
  let reservationId: string | null = null;

  if (type === "Reservation Release") {
    if (!relatedRef) throw new HttpError(400, "A Reservation Release needs the reservation's ID as the Related ID.");
    const r = await resolveReservationRef(client, relatedRef);
    if (!r) throw new HttpError(404, `No reservation ${relatedRef}.`);
    if (r.item_id !== item.id) throw new HttpError(400, `${relatedRef} is for a different material.`);
    reservationId = r.id;
    await releaseReservation(client, r.id, who, { quantity, notes: input.notes, action: "RELEASED" });
  } else {
    const change = shelfChange(type, quantity);
    const next = item.quantity + change;
    if (next < 0) {
      throw new HttpError(400, `Only ${item.quantity} ${item.unit} of ${item.name} in stock — cannot take away ${quantity}.`);
    }
    if (change < 0 && next < item.reserved) {
      throw new HttpError(
        400,
        `${item.reserved} ${item.unit} of ${item.name} are reserved, so only ${Math.max(0, item.quantity - item.reserved)} of ${item.quantity} can be taken away. ` +
          "Issue or release the reservations first.",
      );
    }
    const bad = badChange(type, quantity);
    if (bad < 0) {
      const { rows: b } = await client.query<{ bad: number }>("SELECT bad_qty::float8 AS bad FROM items WHERE id = $1", [item.id]);
      if (-bad > b[0].bad) throw new HttpError(400, `Only ${b[0].bad} ${item.unit} of ${item.name} are in bad stock.`);
    }
    await client.query(
      "UPDATE items SET quantity = $1, bad_qty = bad_qty + $2, updated_by = $3, updated_at = now() WHERE id = $4",
      [next, bad, who.id, item.id],
    );
    await recordMovement(client, {
      itemId: item.id, source: item.source, kind: "ADJUST", delta: change, balance: next,
      note: [type, relatedRef, input.notes].filter(Boolean).join(" · "), userId: who.id,
    });
  }

  const { rows } = await client.query<{ ref: string }>(
    `INSERT INTO stock_adjustments (item_id, source, adjustment_type, quantity, stock_impact, reserved_impact, issued_impact,
                                    bad_impact, related_ref, reservation_id, notes, adjusted_by, adjusted_by_name)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING ref`,
    [item.id, item.source, type, quantity, impacts.stock, impacts.reserved, impacts.issued, badChange(type, quantity),
     relatedRef, reservationId, input.notes?.trim() || null, who.id, who.name],
  );
  return { ref: rows[0].ref, type, impacts, source: item.source };
}
