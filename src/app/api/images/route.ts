import { queryOne } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { fail, handle, ok } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];

export const POST = handle(async (req: Request) => {
  const session = await requireSession();
  const form = await req.formData();
  const file = form.get("file");

  if (!(file instanceof File)) return fail(400, "No file was uploaded.");
  if (!ALLOWED.includes(file.type)) {
    return fail(400, "Only JPEG, PNG, WebP, GIF or AVIF images are accepted.");
  }
  if (file.size > MAX_BYTES) return fail(413, "Images must be 5MB or smaller.");

  const buffer = Buffer.from(await file.arrayBuffer());
  const row = await queryOne<{ id: string }>(
    `INSERT INTO images (filename, mime_type, byte_size, data, uploaded_by)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [file.name || "upload", file.type, buffer.byteLength, buffer, session.sub],
  );

  return ok({ id: row!.id, url: `/api/images/${row!.id}` }, { status: 201 });
});
