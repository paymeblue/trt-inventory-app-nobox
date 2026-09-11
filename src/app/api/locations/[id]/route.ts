import { queryOne } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { fail, handle, ok, readJson } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PATCH = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await requirePermission("location:write");
  const { id } = await ctx.params;
  const body = await readJson<{ name?: string; kind?: string; address?: string; isActive?: boolean }>(req);

  const row = await queryOne(
    `UPDATE locations SET
       name = COALESCE($1, name),
       kind = COALESCE($2, kind),
       address = COALESCE($3, address),
       is_active = COALESCE($4, is_active)
     WHERE id = $5 RETURNING id`,
    [body.name ?? null, body.kind ?? null, body.address ?? null, body.isActive ?? null, id],
  );
  if (!row) return fail(404, "Location not found.");
  return ok(row);
});
