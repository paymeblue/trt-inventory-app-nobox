import { transaction } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { fail, handle, ok, readJson } from "@/lib/api";
import { logActivity, postMovement } from "@/lib/inventory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Line = { productId: string; quantity: number };
type Body = {
  fromLocationId?: string;
  toLocationId?: string;
  lines?: Line[];
  reference?: string;
  notes?: string;
  projectId?: string | null;
};

/** Moves one or more materials between two locations in a single transaction. */
export const POST = handle(async (req: Request) => {
  const session = await requirePermission("stock:transfer");
  const body = await readJson<Body>(req);

  const from = body.fromLocationId;
  const to = body.toLocationId;
  const lines = (body.lines ?? []).filter((l) => l.productId && Number(l.quantity) > 0);

  if (!from || !to) return fail(400, "Choose both a source and a destination location.");
  if (from === to) return fail(400, "Source and destination must be different.");
  if (!lines.length) return fail(400, "Add at least one material to transfer.");

  const ids = await transaction(async (client) => {
    const created: string[] = [];
    for (const line of lines) {
      created.push(
        await postMovement(client, {
          productId: line.productId,
          type: "TRANSFER",
          quantity: Number(line.quantity),
          fromLocationId: from,
          toLocationId: to,
          reference: body.reference ?? null,
          projectId: body.projectId || null,
          notes: body.notes ?? null,
          userId: session.sub,
        }),
      );
    }
    await logActivity(client, session.sub, "TRANSFER", "stock_movement", null, `${lines.length} line(s)`);
    return created;
  });

  return ok({ ids }, { status: 201 });
});
