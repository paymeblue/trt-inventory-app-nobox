import { after, before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { Pool } from "pg";
import { emailPendingEvents } from "../src/lib/email";
import { createReservation, issueReservation, releaseReservation, type Person } from "../src/lib/reservations";
import { inTransaction, makeUser, resetSchema, testPool } from "./db";

let pool: Pool;
let sent: { to: string; subject: string; text: string }[];
const realFetch = globalThis.fetch;

before(() => {
  pool = testPool();
  // The app's own pool reads DATABASE_URL; point it at the test database.
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.SENDGRID_API_KEY = "SG.test";
  process.env.EMAIL_FROM = "inventory@test.local";
  process.env.APP_URL = "https://inventory.test";
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    sent.push({ to: body.personalizations[0].to[0].email, subject: body.subject, text: body.content[0].value });
    return new Response(null, { status: 202 });
  }) as typeof fetch;
});

beforeEach(async () => {
  await resetSchema(pool);
  sent = [];
});

after(async () => {
  globalThis.fetch = realFetch;
  await pool.end();
  await global.__trtPool?.end();
});

async function setup() {
  const person = async (email: string, role: string): Promise<Person> =>
    ({ id: await makeUser(pool, email, role), name: email, email });
  const admin = await person("admin@test.local", "ADMIN");
  const factory = await person("factory@test.local", "FACTORY_MANAGER");
  await person("nobox@test.local", "NOBOX_MANAGER");
  const sales = await person("sales@test.local", "SALES");
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO items (source, sku, name, unit, opening_qty, quantity)
     VALUES ('FACTORY', 'FINSA 116', 'LISSA OAK 18MM', 'Sheet', 50, 50) RETURNING id`,
  );
  return { admin, factory, sales, itemId: rows[0].id };
}

describe("Reservation emails", () => {
  test("a new reservation goes to that side's inventory team and the administrators, once", async () => {
    const { sales, itemId } = await setup();
    await inTransaction(pool, (c) => createReservation(c, { itemId, quantity: 3, project: "Showroom", reservedFor: "SALES" }, sales));

    await emailPendingEvents();
    assert.deepEqual(sent.map((m) => m.to).sort(), ["admin@test.local", "factory@test.local"]);
    assert.match(sent[0].subject, /^New reservation REQ-\d+: LISSA OAK 18MM$/);
    assert.match(sent[0].text, /reserved 3 Sheet of LISSA OAK 18MM \(FINSA 116\) from Factory for Showroom/);
    assert.match(sent[0].text, /https:\/\/inventory\.test\/reservations/);

    await emailPendingEvents();
    assert.equal(sent.length, 2, "an event is only emailed once");
  });

  test("issuing and releasing tell the person who reserved, not the one acting", async () => {
    const { factory, sales, itemId } = await setup();
    const a = await inTransaction(pool, (c) => createReservation(c, { itemId, quantity: 3, project: "A", reservedFor: "SALES" }, sales));
    const b = await inTransaction(pool, (c) => createReservation(c, { itemId, quantity: 2, project: "B", reservedFor: "SALES" }, sales));
    await emailPendingEvents();
    sent = [];

    await inTransaction(pool, (c) => issueReservation(c, a.id, factory));
    await inTransaction(pool, (c) => releaseReservation(c, b.id, factory));
    await emailPendingEvents();
    assert.equal(sent.length, 1, "both updates arrive in one email");
    assert.equal(sent[0].to, "sales@test.local");
    assert.equal(sent[0].subject, "2 reservation updates");
    assert.match(sent[0].text, /issued 3 Sheet/);
    assert.match(sent[0].text, /released 2 Sheet/);
  });

  test("history from before email existed is never sent", async () => {
    const { sales, itemId } = await setup();
    await inTransaction(pool, (c) => createReservation(c, { itemId, quantity: 1, project: "Old", reservedFor: "SALES" }, sales));
    await pool.query("UPDATE reservation_events SET created_at = now() - interval '2 days'");
    await emailPendingEvents();
    assert.equal(sent.length, 0);
  });
});
