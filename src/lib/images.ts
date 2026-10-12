import type { PoolClient } from "pg";
import { HttpError } from "./session";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];

/** Checks an uploaded photo and stores it, returning its id. */
export async function saveImage(
  db: Pick<PoolClient, "query">,
  file: FormDataEntryValue | null,
  userId: string,
): Promise<string> {
  if (!(file instanceof File)) throw new HttpError(400, "No file was uploaded.");
  if (!ALLOWED.includes(file.type)) throw new HttpError(400, "Only JPEG, PNG, WebP, GIF or AVIF images are accepted.");
  if (file.size > MAX_BYTES) throw new HttpError(413, "Images must be 5MB or smaller.");

  const buffer = Buffer.from(await file.arrayBuffer());
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO images (filename, mime_type, byte_size, data, uploaded_by)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [file.name || "upload", file.type, buffer.byteLength, buffer, userId],
  );
  return rows[0].id;
}

/** Deletes a photo once no material shows it any more. */
export async function dropImageIfUnused(db: Pick<PoolClient, "query">, imageId: string | null) {
  if (!imageId) return;
  await db.query("DELETE FROM images WHERE id = $1 AND NOT EXISTS (SELECT 1 FROM items WHERE image_id = $1)", [imageId]);
}
