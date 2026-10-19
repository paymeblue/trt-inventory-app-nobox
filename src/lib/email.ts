import type { PoolClient } from "pg";
import { transaction } from "./db";
import { RESERVED_FOR_LABELS, SOURCE_LABELS, SOURCE_MANAGERS, type ReservedFor, type Source } from "./rbac";
import { qty } from "./utils";

const APP_NAME = "Inventory Management";
/** Events older than this are never emailed, so a key added late does not send a backlog. */
const MAX_AGE = "1 day";

type Mail = { to: string; subject: string; text: string; html: string };

export function emailConfigured(): boolean {
  return Boolean(process.env.SENDGRID_API_KEY && process.env.EMAIL_FROM);
}

function appUrl(): string {
  // Netlify sets URL to the site's main address.
  return (process.env.APP_URL ?? process.env.URL ?? "").replace(/\/$/, "");
}

async function send(mail: Mail) {
  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: mail.to }] }],
      from: { email: process.env.EMAIL_FROM, name: process.env.EMAIL_FROM_NAME ?? APP_NAME },
      subject: mail.subject,
      content: [
        { type: "text/plain", value: mail.text },
        { type: "text/html", value: mail.html },
      ],
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`SendGrid ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

type Event = {
  id: string;
  action: "RESERVED" | "ISSUED" | "CANCELLED" | "RELEASED";
  quantity: number;
  note: string | null;
  created_by: string | null;
  by_name: string | null;
  ref: string;
  project: string;
  source: Source;
  reserved_for: ReservedFor;
  reserved_by: string | null;
  reserver_company: Source | null;
  sku: string;
  item_name: string;
  unit: string;
};

type Recipient = { id: string; email: string; full_name: string; role: string };

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function describe(e: Event): { subject: string; line: string } {
  const what = `${qty(e.quantity)} ${e.unit} of ${e.item_name} (${e.sku})`;
  const by = e.by_name ?? "Someone";
  const marker = RESERVED_FOR_LABELS[e.reserved_for] + (e.reserver_company ? ` · ${SOURCE_LABELS[e.reserver_company]}` : "");
  switch (e.action) {
    case "RESERVED":
      return {
        subject: `New reservation ${e.ref}: ${e.item_name}`,
        line: `${by} (${marker}) reserved ${what} from ${SOURCE_LABELS[e.source]} for ${e.project}.`,
      };
    case "ISSUED":
      return {
        subject: `${e.ref} issued: ${e.item_name}`,
        line: `${by} issued ${what} from ${SOURCE_LABELS[e.source]} for ${e.project}.`,
      };
    case "RELEASED":
      return {
        subject: `${e.ref} released: ${e.item_name}`,
        line: `${by} released ${what} reserved for ${e.project}. It is back in available stock.`,
      };
    case "CANCELLED":
      return {
        subject: `${e.ref} cancelled: ${e.item_name}`,
        line: `${by} cancelled the reservation of ${what} for ${e.project}.`,
      };
  }
}

function compose(to: Recipient, events: Event[]): Mail {
  const lines = events.map((e) => ({ ...describe(e), note: e.note }));
  const subject = lines.length === 1 ? lines[0].subject : `${lines.length} reservation updates`;
  const link = appUrl() ? `${appUrl()}/reservations` : null;
  const first = to.full_name.split(/\s+/)[0];

  const text = [
    `Hi ${first},`,
    "",
    ...lines.map((l) => `- ${l.line}${l.note ? ` Note: ${l.note}` : ""}`),
    "",
    link ? `Open the Reservation Log: ${link}` : "",
    "",
    `${APP_NAME} · Ready Cabinets`,
  ].join("\n");

  const html = `<!doctype html><html><body style="margin:0;background:#f4f4f5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#18181b">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
<div style="background:#ffffff;border:1px solid #e4e4e7;border-radius:12px;padding:24px">
<p style="margin:0 0 4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#71717a">${APP_NAME}</p>
<h1 style="margin:0 0 16px;font-size:18px;line-height:1.35">${escape(subject)}</h1>
<p style="margin:0 0 12px;font-size:14px">Hi ${escape(first)},</p>
${lines.map((l) => `<p style="margin:0 0 10px;font-size:14px;line-height:1.55">${escape(l.line)}${l.note ? `<br><span style="color:#71717a">Note: ${escape(l.note)}</span>` : ""}</p>`).join("\n")}
${link ? `<p style="margin:20px 0 0"><a href="${escape(link)}" style="display:inline-block;background:#f5a524;color:#18181b;text-decoration:none;font-weight:600;font-size:14px;padding:10px 16px;border-radius:8px">Open the Reservation Log</a></p>` : ""}
</div>
<p style="margin:16px 0 0;font-size:12px;color:#a1a1aa;text-align:center">You get this because of your role in ${APP_NAME}.</p>
</div></body></html>`;

  return { to: to.email, subject, text, html };
}

/**
 * Emails what the notification bell shows: each new reservation to the
 * inventory team for its side and the administrators, and each issue, release
 * or cancellation to the person who reserved. Called after a reservation
 * change commits; a failed send is logged, never shown to the person acting.
 */
export async function emailPendingEvents(): Promise<void> {
  if (!emailConfigured()) return;
  try {
    const mails = await transaction((client) => claim(client));
    const results = await Promise.allSettled(mails.map(send));
    for (const r of results) if (r.status === "rejected") console.error("[email]", r.reason);
  } catch (err) {
    console.error("[email]", err);
  }
}

async function claim(client: PoolClient): Promise<Mail[]> {
  const { rows: claimed } = await client.query<{ id: string }>(
    `UPDATE reservation_events SET emailed_at = now()
      WHERE id IN (SELECT id FROM reservation_events
                    WHERE emailed_at IS NULL AND created_at > now() - $1::interval
                    FOR UPDATE SKIP LOCKED)
      RETURNING id`,
    [MAX_AGE],
  );
  if (!claimed.length) return [];

  const { rows: events } = await client.query<Event>(
    `SELECT e.id, e.action, COALESCE(e.quantity, r.quantity)::float8 AS quantity, e.note, e.created_by,
            COALESCE(u.full_name, r.designer_name) AS by_name, r.ref, r.project, r.source, r.reserved_for,
            r.reserved_by, ru.company AS reserver_company, i.sku, i.name AS item_name, i.unit
       FROM reservation_events e
       JOIN reservations r ON r.id = e.reservation_id
       JOIN items i ON i.id = r.item_id
       LEFT JOIN users u ON u.id = e.created_by
       LEFT JOIN users ru ON ru.id = r.reserved_by
      WHERE e.id = ANY($1::uuid[])
      ORDER BY e.created_at`,
    [claimed.map((r) => r.id)],
  );
  const { rows: people } = await client.query<Recipient>("SELECT id, email, full_name, role FROM users WHERE is_active");

  const inbox = new Map<string, { to: Recipient; events: Event[] }>();
  for (const e of events) {
    const to = e.action === "RESERVED"
      ? people.filter((p) => p.role === "ADMIN" || p.role === SOURCE_MANAGERS[e.source])
      : people.filter((p) => p.id === e.reserved_by);
    for (const p of to) {
      if (p.id === e.created_by) continue;
      if (!inbox.has(p.id)) inbox.set(p.id, { to: p, events: [] });
      inbox.get(p.id)!.events.push(e);
    }
  }
  return [...inbox.values()].map(({ to, events }) => compose(to, events));
}
