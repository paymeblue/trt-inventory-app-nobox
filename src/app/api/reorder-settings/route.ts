import { transaction } from "@/lib/db";
import { HttpError, requireManager, requireSession } from "@/lib/session";
import { fail, handle, ok, readJson } from "@/lib/api";
import { isSource, SOURCE_LIST } from "@/lib/rbac";
import { MIN_WINDOW_DAYS, recalculateReorder, SERVICE_Z, sideSettings, USAGE_WINDOW_DAYS } from "@/lib/reorder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const constants = { usage_window_days: USAGE_WINDOW_DAYS, min_window_days: MIN_WINDOW_DAYS, service_z: SERVICE_Z };

/** One side's default lead time and days of cover, which the reorder figures are worked out from. */
export const GET = handle(async (req: Request) => {
  await requireSession();
  const source = new URL(req.url).searchParams.get("source");
  if (!isSource(source)) return fail(400, `Choose ${SOURCE_LIST}.`);
  return ok({ ...(await transaction((c) => sideSettings(c, source))), ...constants });
});

/** Changes them and works every automatic figure on that side out again. */
export const PATCH = handle(async (req: Request) => {
  const body = await readJson<{ source?: unknown; leadTimeDays?: unknown; coverDays?: unknown }>(req);
  if (!isSource(body.source)) return fail(400, `Choose ${SOURCE_LIST}.`);
  const source = body.source;
  const session = await requireManager(source);

  const days = (v: unknown, label: string) => {
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0 || n > 3650) throw new HttpError(400, `${label} must be between 1 and 3650 days.`);
    return n;
  };
  const lead = days(body.leadTimeDays, "Lead time");
  const cover = days(body.coverDays, "Days of cover");

  const settings = await transaction(async (client) => {
    await client.query(
      `UPDATE side_settings SET lead_time_days = $1, cover_days = $2, updated_by = $3, updated_at = now() WHERE source = $4`,
      [lead, cover, session.sub, source],
    );
    await recalculateReorder(client, { source });
    return sideSettings(client, source);
  });
  return ok({ ...settings, ...constants });
});
