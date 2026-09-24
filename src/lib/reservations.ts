import type { PoolClient } from "pg";
import { HttpError } from "./session";
import type { Source } from "./rbac";
import { recordMovement } from "./items";

export const RESERVATION_COLUMNS = `
  r.id, r.ref, r.item_id, r.source, r.quantity::float8 AS quantity, r.project, r.notes, r.status,
  r.created_at, r.closed_at, r.reserved_by,
  i.name AS item_name, i.sku, i.unit, i.image_id,
  ru.full_name AS reserved_by_name, cu.full_name AS closed_by_name`;

export const RESERVATION_FROM = `
  FROM reservations r
  JOIN items i ON i.id = r.item_id
  LEFT JOIN users ru ON ru.id = r.reserved_by
  LEFT JOIN users cu ON cu.id = r.closed_by`;

type LockedItem = { id: string; source: Source; name: string; sku: string; unit: string; quantity: number; reserved: number };

/** Locks the item and returns its stock and what is already reserved. */
export async function lockItem(client: PoolClient, itemId: string): Promise<LockedItem> {
  const { rows } = await client.query<LockedItem>(
    `SELECT i.id, i.source, i.name, i.sku, i.unit, i.quantity::float8 AS quantity
       FROM items i WHERE i.id = $1 FOR UPDATE`,
    [itemId],
  );
  if (!rows[0]) throw new HttpError(404, "Item not found.");
  const { rows: r } = await client.query<{ reserved: number }>(
    `SELECT COALESCE(SUM(quantity), 0)::float8 AS reserved FROM reservations
      WHERE item_id = $1 AND status = 'RESERVED'`,
    [itemId],
  );
  return { ...rows[0], reserved: r[0].reserved };
}

async function logEvent(
  client: PoolClient,
  reservationId: string,
  action: "RESERVED" | "ISSUED" | "CANCELLED",
  userId: string,
  note?: string | null,
) {
  await client.query(
    "INSERT INTO reservation_events (reservation_id, action, note, created_by) VALUES ($1,$2,$3,$4)",
    [reservationId, action, note ?? null, userId],
  );
}

export type ReservationInput = { itemId: string; quantity: number; project: string; notes?: string | null };

export async function createReservation(client: PoolClient, input: ReservationInput, userId: string) {
  const quantity = Number(input.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) throw new HttpError(400, "Reserve at least 1.");
  const project = input.project?.trim();
  if (!project) throw new HttpError(400, "Say which project this is for.");

  const item = await lockItem(client, input.itemId);
  const available = item.quantity - item.reserved;
  if (quantity > available) {
    throw new HttpError(
      400,
      `Only ${Math.max(0, available)} ${item.unit} of ${item.name} available` +
        (item.reserved ? ` (${item.reserved} already reserved).` : "."),
    );
  }

  const { rows } = await client.query<{ id: string; ref: string }>(
    `INSERT INTO reservations (item_id, source, quantity, project, notes, reserved_by)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, ref`,
    [item.id, item.source, quantity, project, input.notes?.trim() || null, userId],
  );
  await logEvent(client, rows[0].id, "RESERVED", userId, input.notes);
  return rows[0];
}

type Open = { id: string; ref: string; item_id: string; source: Source; quantity: number; status: string; reserved_by: string | null };

async function lockOpen(client: PoolClient, id: string): Promise<Open> {
  const { rows } = await client.query<Open>(
    `SELECT id, ref, item_id, source, quantity::float8 AS quantity, status, reserved_by
       FROM reservations WHERE id = $1 FOR UPDATE`,
    [id],
  );
  const r = rows[0];
  if (!r) throw new HttpError(404, "Reservation not found.");
  if (r.status !== "RESERVED") throw new HttpError(409, `${r.ref} is already ${r.status.toLowerCase()}.`);
  return r;
}

export async function findReservation(client: PoolClient, id: string) {
  const { rows } = await client.query<{ source: Source; reserved_by: string | null }>(
    "SELECT source, reserved_by FROM reservations WHERE id = $1",
    [id],
  );
  return rows[0] ?? null;
}

/** The items have left: complete the reservation and take them out of stock. */
export async function issueReservation(client: PoolClient, id: string, userId: string, note?: string | null) {
  const r = await lockOpen(client, id);
  const item = await lockItem(client, r.item_id);
  if (r.quantity > item.quantity) {
    throw new HttpError(400, `Only ${item.quantity} ${item.unit} of ${item.name} in stock; ${r.ref} needs ${r.quantity}.`);
  }
  const balance = item.quantity - r.quantity;
  await client.query("UPDATE items SET quantity = $1, updated_by = $2, updated_at = now() WHERE id = $3", [
    balance, userId, item.id,
  ]);
  await client.query(
    "UPDATE reservations SET status = 'ISSUED', closed_by = $1, closed_at = now(), updated_at = now() WHERE id = $2",
    [userId, id],
  );
  await recordMovement(client, {
    itemId: item.id, source: item.source, kind: "ISSUE", delta: -r.quantity, balance,
    note: `Issued ${r.ref}${note ? ` · ${note}` : ""}`, userId,
  });
  await logEvent(client, id, "ISSUED", userId, note);
  return { ref: r.ref, balance };
}

/** Releases the stock without issuing it. */
export async function cancelReservation(client: PoolClient, id: string, userId: string, note?: string | null) {
  const r = await lockOpen(client, id);
  await client.query(
    "UPDATE reservations SET status = 'CANCELLED', closed_by = $1, closed_at = now(), updated_at = now() WHERE id = $2",
    [userId, id],
  );
  await logEvent(client, id, "CANCELLED", userId, note);
  return { ref: r.ref };
}
