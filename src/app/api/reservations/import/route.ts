import { transaction } from "@/lib/db";
import { personOf, requireReserver } from "@/lib/session";
import { fail, handle, ok } from "@/lib/api";
import { reservedForOf } from "@/lib/rbac";
import { importReservations } from "@/lib/reservation-template";
import { emailPendingEvents } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Form fields: file, commit ("1" to reserve). Without commit it only checks. */
export const POST = handle(async (req: Request) => {
  const session = await requireReserver();
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return fail(400, "No spreadsheet was uploaded.");
  if (file.size > 10 * 1024 * 1024) return fail(413, "Spreadsheets must be 10MB or smaller.");

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await transaction((client) =>
    importReservations(client, buffer, {
      who: personOf(session), commit: form.get("commit") === "1", reservedFor: reservedForOf(session.role, form.get("reservedFor")),
    }),
  );
  await emailPendingEvents();
  return ok({ filename: file.name, ...result });
});
