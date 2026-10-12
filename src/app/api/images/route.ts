import { transaction } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { handle, ok } from "@/lib/api";
import { saveImage } from "@/lib/images";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = handle(async (req: Request) => {
  const session = await requireSession();
  const form = await req.formData();
  const id = await transaction((client) => saveImage(client, form.get("file"), session.sub));
  return ok({ id, url: `/api/images/${id}` }, { status: 201 });
});
