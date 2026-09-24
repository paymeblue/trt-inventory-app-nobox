import { transaction } from "@/lib/db";
import { requireManager } from "@/lib/session";
import { fail, handle, ok } from "@/lib/api";
import { isSource } from "@/lib/rbac";
import { applyImport } from "@/lib/items";
import { parseTemplate } from "@/lib/template";

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

  const parsed = parseTemplate(Buffer.from(await file.arrayBuffer()));
  if (parsed.fatal) return ok({ filename: file.name, applied: false, changes: [], errors: parsed.errors });

  // Well-formed rows are still checked against stock when other rows are
  // malformed, so the manager sees every problem in the file in one pass.
  const apply = commit && parsed.errors.length === 0;
  const result = await transaction((client) =>
    applyImport(client, source, parsed.rows, { userId: session.sub, filename: file.name, dryRun: !apply }),
  );
  const errors = [...parsed.errors, ...result.errors].sort((a, b) => (a.row ?? 0) - (b.row ?? 0));

  return ok({
    filename: file.name,
    applied: apply && errors.length === 0,
    changes: errors.length ? [] : result.changes,
    errors,
  });
});
