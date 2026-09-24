import { requireSession } from "@/lib/session";
import { handle } from "@/lib/api";
import { buildTemplate } from "@/lib/template";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  await requireSession();
  return new Response(new Uint8Array(buildTemplate()), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="TRT Nobox inventory template.xlsx"',
      "Cache-Control": "no-store",
    },
  });
});
