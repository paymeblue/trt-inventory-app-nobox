import { queryOne } from "@/lib/db";
import { handle } from "@/lib/api";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const GET = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return new Response("Not found", { status: 404 });

  const row = await queryOne<{ data: Buffer; mime_type: string; byte_size: number }>(
    "SELECT data, mime_type, byte_size FROM images WHERE id = $1",
    [id],
  );
  if (!row) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(row.data), {
    headers: {
      "Content-Type": row.mime_type,
      "Content-Length": String(row.byte_size),
      // Image bytes are immutable once written, so this can cache hard.
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
});
