import { handle } from "@/lib/api";
import { buildReservationTemplate } from "@/lib/reservation-template";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  return new Response(new Uint8Array(buildReservationTemplate()), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="TRT Nobox reservation template.xlsx"',
      "Cache-Control": "no-store",
    },
  });
});
