import { queryOne } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { fail, handle, ok, readJson } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  await requirePermission("supplier:write");
  const { id } = await ctx.params;
  const b = await readJson<Record<string, string | boolean | undefined>>(req);

  const row = await queryOne(
    `UPDATE suppliers SET
       name = COALESCE($1, name),
       contact_person = COALESCE($2, contact_person),
       email = COALESCE($3, email),
       phone = COALESCE($4, phone),
       address = COALESCE($5, address),
       is_approved = COALESCE($6, is_approved),
       notes = COALESCE($7, notes)
     WHERE id = $8 RETURNING id`,
    [b.name ?? null, b.contactPerson ?? null, b.email ?? null, b.phone ?? null,
     b.address ?? null, b.isApproved ?? null, b.notes ?? null, id],
  );
  if (!row) return fail(404, "Supplier not found.");
  return ok(row);
});

export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  await requirePermission("supplier:write");
  const { id } = await ctx.params;
  const inUse = await queryOne<{ n: string }>(
    "SELECT COUNT(*)::text AS n FROM products WHERE supplier_id = $1",
    [id],
  );
  if (Number(inUse!.n) > 0) {
    return fail(409, "This supplier is linked to materials. Unlink them first.");
  }
  await queryOne("DELETE FROM suppliers WHERE id = $1", [id]);
  return ok({ deleted: true });
});
