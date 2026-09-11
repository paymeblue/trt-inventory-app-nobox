"use client";

import * as React from "react";
import { Check, Palette, ShieldCheck, User } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/theme";
import { useSession } from "@/components/session-context";
import { ROLE_DESCRIPTIONS, ROLE_LABELS, ROLE_PERMISSIONS } from "@/lib/rbac";
import { formatDateTime, initials } from "@/lib/utils";

const PERMISSION_LABELS: Record<string, string> = {
  "product:read": "View the material catalogue",
  "product:write": "Add and edit materials",
  "product:import": "Import materials from a spreadsheet",
  "stock:read": "View stock levels and the ledger",
  "stock:adjust": "Post receipts, issues and adjustments",
  "stock:transfer": "Transfer stock between locations",
  "requisition:read": "View requisitions",
  "requisition:create": "Raise requisitions",
  "requisition:approve": "Approve or reject requisitions",
  "requisition:issue": "Issue materials from store",
  "requisition:receive": "Confirm receipt on site",
  "receipt:read": "View goods receipts",
  "receipt:write": "Record deliveries",
  "receipt:post": "Post deliveries into stock",
  "supplier:read": "View suppliers",
  "supplier:write": "Add and edit suppliers",
  "project:read": "View projects",
  "project:write": "Create and edit projects",
  "location:read": "View locations",
  "location:write": "Add and edit locations",
  "user:read": "View the team",
  "user:write": "Manage accounts and roles",
  "report:read": "View reports",
};

export function SettingsView({
  phone,
  locationName,
  lastLoginAt,
  createdAt,
}: {
  phone: string | null;
  locationName: string | null;
  lastLoginAt: string | null;
  createdAt: string | null;
}) {
  const session = useSession();
  const permissions = ROLE_PERMISSIONS[session.role] ?? [];

  return (
    <>
      <PageHeader title="Settings" description="Your account, appearance and what your role can do." />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader title="Your account" />
          <CardBody className="space-y-4">
            <div className="flex items-center gap-3.5">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[16px] font-semibold text-accent">
                {initials(session.name)}
              </span>
              <div className="min-w-0">
                <p className="truncate text-[15px] font-semibold tracking-tight">{session.name}</p>
                <p className="truncate text-[13px] text-fg-muted">{session.email}</p>
              </div>
            </div>

            <dl className="space-y-2 border-t border-border pt-3 text-[13px]">
              {[
                ["Role", ROLE_LABELS[session.role]],
                ["Based at", locationName ?? "Not assigned"],
                ["Phone", phone ?? "—"],
                ["Last signed in", formatDateTime(lastLoginAt)],
                ["Account created", formatDateTime(createdAt)],
              ].map(([label, value]) => (
                <div key={label} className="flex items-baseline justify-between gap-3">
                  <dt className="shrink-0 text-fg-muted">{label}</dt>
                  <dd className="truncate text-right font-medium">{value}</dd>
                </div>
              ))}
            </dl>

            <p className="flex items-start gap-2 rounded-lg border border-border bg-surface-2/50 px-3 py-2.5 text-[12.5px] leading-relaxed text-fg-muted">
              <User className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              To change your name, password or role, ask an administrator to update your account from the
              Team page.
            </p>
          </CardBody>
        </Card>

        <div className="space-y-3">
          <Card>
            <CardHeader title="Appearance" description="Applies to this browser only" />
            <CardBody className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-soft">
                  <Palette className="h-4 w-4 text-accent" />
                </span>
                <div>
                  <p className="text-[13.5px] font-medium">Colour theme</p>
                  <p className="text-[12px] text-fg-muted">Light, dark, or follow your device</p>
                </div>
              </div>
              <ThemeToggle />
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="What you can do"
              description={ROLE_DESCRIPTIONS[session.role]}
              action={<Badge tone="accent">{ROLE_LABELS[session.role]}</Badge>}
            />
            <CardBody>
              <ul className="space-y-1.5">
                {permissions.map((p) => (
                  <li key={p} className="flex items-start gap-2 text-[13px]">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ok" />
                    <span className="text-fg-muted">{PERMISSION_LABELS[p] ?? p}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 flex items-start gap-2 border-t border-border pt-3 text-[12.5px] leading-relaxed text-fg-subtle">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Permissions are enforced on the server as well as in the interface — hidden actions cannot be
                reached by calling the API directly.
              </p>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
