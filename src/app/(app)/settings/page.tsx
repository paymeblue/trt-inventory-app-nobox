import type { Metadata } from "next";
import { SettingsView } from "./view";
import { getSession } from "@/lib/session";
import { queryOne } from "@/lib/db";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const session = await getSession();
  const profile = session
    ? await queryOne<{ phone: string | null; location_name: string | null; last_login_at: string | null; created_at: string }>(
        `SELECT u.phone, u.last_login_at, u.created_at, l.name AS location_name
           FROM users u LEFT JOIN locations l ON l.id = u.location_id
          WHERE u.id = $1`,
        [session.sub],
      )
    : null;

  return (
    <SettingsView
      phone={profile?.phone ?? null}
      locationName={profile?.location_name ?? null}
      lastLoginAt={profile?.last_login_at ?? null}
      createdAt={profile?.created_at ?? null}
    />
  );
}
