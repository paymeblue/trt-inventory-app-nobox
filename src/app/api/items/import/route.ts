import { transaction } from "@/lib/db";
import { requireManager } from "@/lib/session";
import { fail, handle, ok } from "@/lib/api";
import { isSource } from "@/lib/rbac";
import { importStock } from "@/lib/items";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Form fields: file, source (FACTORY | NOBOX), commit ("1" to apply).
 * Without commit it is a dry run that reports what would change. Either way,
 * if any row is invalid nothing is written and every problem is returned.
 */
export const POST = handle(async (req: Request) => {
  const form = await req.formData();
  const source = form.get("source");
  if (!isSource(source)) return fail(400, "Choose Factory or Nobox.");
  const session = await requireManager(source);

  const file = form.get("file");
  if (!(file instanceof File)) return fail(400, "No spreadsheet was uploaded.");
  if (file.size > MAX_BYTES) return fail(413, "Spreadsheets must be 10MB or smaller.");
  const commit = form.get("commit") === "1";

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await transaction((client) =>
    importStock(client, source, buffer, { userId: session.sub, filename: file.name, commit }),
  );
  return ok({ filename: file.name, ...result });
});
