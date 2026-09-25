import type { PoolClient } from "pg";
import { HttpError } from "./session";
import type { Source } from "./rbac";
import { recordMovement, RESERVED_SQL } from "./items";

/**
 * Reservation_Log columns. A reservation's balance is what is still set aside:
 * reserved − issued − released.
 */
export const RESERVATION_COLUMNS = `
  r.id, r.ref, r.item_id, r.source, r.quantity::float8 AS quantity,
  r.issued_qty::float8 AS issued_qty, r.released_qty::float8 AS released_qty,
  GREATEST(r.quantity - r.issued_qty - r.released_qty, 0)::float8 AS balance,
  r.project, r.notes, r.status, r.legacy_status, r.available_at_request::float8 AS available_at_request,
  r.created_at, r.closed_at, r.reserved_by,
  COALESCE(ru.full_name, r.designer_name) AS reserved_by_name,
  COALESCE(ru.email, r.designer_email) AS reserved_by_email,
  i.name AS item_name, i.sku, i.unit, i.image_id, i.category,
  i.quantity::float8 AS in_stock,
  cu.full_name AS closed_by_name`;

export const RESERVATION_FROM = `
  FROM reservations r
  JOIN items i ON i.id = r.item_id
  LEFT JOIN users ru ON ru.id = r.reserved_by
  LEFT JOIN users cu ON cu.id = r.closed_by`;

export type Person = { id: string; name: string; email: string };

type LockedItem = { id: string; source: Source; name: string; sku: string; unit: string; quantity: number; reserved: number };

/** Locks the item and returns its stock and what open reservations hold. */
export async function lockItem(client: PoolClient, itemId: string): Promise<LockedItem> {
  const { rows } = await client.query<LockedItem>(
    `SELECT i.id, i.source, i.name, i.sku, i.unit, i.quantity::float8 AS quantity
       FROM items i WHERE i.id = $1 FOR UPDATE`,
    [itemId],
  );
  if (!rows[0]) throw new HttpError(404, "Material not found.");
  const { rows: r } = await client.query<{ reserved: number }>(
    `SELECT (${RESERVED_SQL})::float8 AS reserved FROM items i WHERE i.id = $1`,
    [itemId],
  );
  return { ...rows[0], reserved: r[0].reserved };
}

async function logEvent(
  client: PoolClient,
  reservationId: string,
  action: "RESERVED" | "ISSUED" | "CANCELLED" | "RELEASED",
  userId: string,
  quantity: number,
  note?: string | null,
) {
  await client.query(
    "INSERT INTO reservation_events (reservation_id, action, quantity, note, created_by) VALUES ($1,$2,$3,$4,$5)",
    [reservationId, action, quantity, note ?? null, userId],
  );
}

export type ReservationInput = { itemId: string; quantity: number; project: string; notes?: string | null };

/**
 * Reservation_Form. Status Check, as the workbook words it: "Missing required
 * fields", "OUT OF STOCK", "Insufficient available quantity".
 */
export async function createReservation(client: PoolClient, input: ReservationInput, who: Person) {
  const quantity = Number(input.quantity);
  const project = input.project?.trim();
  if (!input.itemId || !project || !Number.isFinite(quantity)) throw new HttpError(400, "Missing required fields.");
  if (quantity <= 0) throw new HttpError(400, "Quantity Requested must be greater than zero.");

  const item = await lockItem(client, input.itemId);
  const available = item.quantity - item.reserved;
  // Say what is held and why, so the designer is not left guessing.
  const held = item.reserved > 0 ? `${item.reserved} ${item.unit} already reserved, so ` : "";
  if (available <= 0) {
    throw new HttpError(400, `OUT OF STOCK: ${held}none of the ${item.quantity} ${item.unit} of ${item.sku} | ${item.name} are available.`);
  }
  if (quantity > available) {
    throw new HttpError(400, `Insufficient available quantity: ${held}only ${available} of ${item.quantity} ${item.unit} of ${item.sku} | ${item.name} are available.`);
  }

  const { rows } = await client.query<{ id: string; ref: string }>(
    `INSERT INTO reservations (item_id, source, quantity, project, notes, reserved_by, designer_name, designer_email, available_at_request)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id, ref`,
    [item.id, item.source, quantity, project, input.notes?.trim() || null, who.id, who.name, who.email, available],
  );
  await logEvent(client, rows[0].id, "RESERVED", who.id, quantity, input.notes);
  return rows[0];
}

type Open = {
  id: string; ref: string; item_id: string; source: Source; quantity: number; issued_qty: number;
  released_qty: number; balance: number; status: string; reserved_by: string | null; project: string;
};

async function lockOpen(client: PoolClient, id: string): Promise<Open> {
  const { rows } = await client.query<Open>(
    `SELECT id, ref, item_id, source, quantity::float8 AS quantity, issued_qty::float8 AS issued_qty,
            released_qty::float8 AS released_qty,
            GREATEST(quantity - issued_qty - released_qty, 0)::float8 AS balance,
            status, reserved_by, project
       FROM reservations WHERE id = $1 FOR UPDATE`,
    [id],
  );
  const r = rows[0];
  if (!r) throw new HttpError(404, "Reservation not found.");
  if (r.status !== "RESERVED" && r.status !== "PART_ISSUED") {
    throw new HttpError(409, `${r.ref} is already ${r.status === "ISSUED" ? "fully issued" : "closed"}.`);
  }
  return r;
}

/** RESERVED → PART_ISSUED → ISSUED, or CANCELLED if it was released without any issue. */
async function settle(client: PoolClient, r: Open, issued: number, released: number, userId: string) {
  const balance = Math.max(0, r.quantity - issued - released);
  const status = balance > 0 ? (issued > 0 ? "PART_ISSUED" : "RESERVED") : issued > 0 ? "ISSUED" : "CANCELLED";
  await client.query(
    `UPDATE reservations SET issued_qty = $1, released_qty = $2, status = $3, updated_at = now(),
            closed_by = CASE WHEN $4 THEN $5::uuid ELSE closed_by END,
            closed_at = CASE WHEN $4 THEN now() ELSE closed_at END
      WHERE id = $6`,
    [issued, released, status, balance === 0, userId, r.id],
  );
  return { status, balance };
}

export async function findReservation(client: PoolClient, id: string) {
  const { rows } = await client.query<{ source: Source; reserved_by: string | null }>(
    "SELECT source, reserved_by FROM reservations WHERE id = $1",
    [id],
  );
  return rows[0] ?? null;
}

/**
 * Stock_Issue_Form: the items have left the store for production. Status Check:
 * "Quantity must be greater than zero", "Issue exceeds remaining reservation
 * balance" — and, beyond the workbook, the stock must physically be there.
 */
export async function issueReservation(
  client: PoolClient,
  id: string,
  who: Person,
  input: { quantity?: number; notes?: string | null } = {},
) {
  const r = await lockOpen(client, id);
  const quantity = input.quantity === undefined ? r.balance : Number(input.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) throw new HttpError(400, "Quantity must be greater than zero.");
  if (quantity > r.balance) {
    throw new HttpError(400, `Issue exceeds remaining reservation balance: ${r.ref} has ${r.balance} left to issue.`);
  }

  const item = await lockItem(client, r.item_id);
  if (quantity > item.quantity) {
    throw new HttpError(400, `Not enough in stock: only ${item.quantity} ${item.unit} of ${item.name} on hand; this issue needs ${quantity}.`);
  }

  const balanceAfter = item.quantity - quantity;
  await client.query("UPDATE items SET quantity = $1, updated_by = $2, updated_at = now() WHERE id = $3", [
    balanceAfter, who.id, item.id,
  ]);
  const { rows } = await client.query<{ ref: string }>(
    `INSERT INTO stock_issues (reservation_id, reservation_ref, item_id, source, quantity, project, notes, issued_by, issued_by_name, issued_by_email)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING ref`,
    [r.id, r.ref, item.id, item.source, quantity, r.project, input.notes?.trim() || null, who.id, who.name, who.email],
  );
  const settled = await settle(client, r, r.issued_qty + quantity, r.released_qty, who.id);
  await recordMovement(client, {
    itemId: item.id, source: item.source, kind: "ISSUE", delta: -quantity, balance: balanceAfter,
    note: `${rows[0].ref} against ${r.ref}${input.notes ? ` · ${input.notes}` : ""}`, userId: who.id,
  });
  await logEvent(client, r.id, "ISSUED", who.id, quantity, input.notes);
  return { ref: r.ref, issueRef: rows[0].ref, quantity, stockLeft: balanceAfter, balance: settled.balance, status: settled.status };
}

/** Frees some or all of a reservation's balance without deducting stock. */
export async function releaseReservation(
  client: PoolClient,
  id: string,
  who: Person,
  input: { quantity?: number; notes?: string | null; action?: "CANCELLED" | "RELEASED" } = {},
) {
  const r = await lockOpen(client, id);
  const quantity = input.quantity === undefined ? r.balance : Number(input.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) throw new HttpError(400, "Quantity must be greater than zero.");
  if (quantity > r.balance) throw new HttpError(400, `${r.ref} only has ${r.balance} left reserved.`);
  const settled = await settle(client, r, r.issued_qty, r.released_qty + quantity, who.id);
  await logEvent(client, r.id, input.action ?? "RELEASED", who.id, quantity, input.notes);
  return { ref: r.ref, released: quantity, balance: settled.balance, status: settled.status };
}

/** A reservation, by the reference printed on it (REQ-…). */
export async function resolveReservationRef(client: PoolClient, ref: string) {
  const { rows } = await client.query<{ id: string; item_id: string; source: Source }>(
    "SELECT id, item_id, source FROM reservations WHERE upper(ref) = upper($1)",
    [ref.trim()],
  );
  return rows[0] ?? null;
}
