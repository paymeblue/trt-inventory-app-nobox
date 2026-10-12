import { query } from "@/lib/db";
import { requireManager } from "@/lib/session";
import { fail, handle } from "@/lib/api";
import { isSource, SOURCE_LABELS, SOURCE_LIST } from "@/lib/rbac";
import { buildTemplate, type TemplateMaterial } from "@/lib/template";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ?source=FACTORY | NOBOX | READY_CABINETS | GERMANA picks the side's template.
 * With &filled=1 (that side's managers only) it lists the side's current
 * materials, once each even when Nobox holds one in both Lagos and Abuja.
 */
export const GET = handle(async (req: Request) => {
  const p = new URL(req.url).searchParams;
  const source = p.get("source") ?? "FACTORY";
  if (!isSource(source)) return fail(400, `Choose ${SOURCE_LIST}.`);

  let materials: TemplateMaterial[] = [];
  const filled = p.get("filled") === "1";
  if (filled) {
    await requireManager(source);
    materials = await query<TemplateMaterial>(
      `SELECT DISTINCT ON (lower(sku), lower(name), lower(coalesce(subcategory,'')), lower(coalesce(spec,'')), lower(coalesce(dimensions,'')))
              sku, name, category, subcategory, spec, dimensions, unit, reorder_level::float8 AS reorder_level,
              reorder_quantity::float8 AS reorder_quantity, description
         FROM items WHERE source = $1
        ORDER BY lower(sku), lower(name), lower(coalesce(subcategory,'')), lower(coalesce(spec,'')), lower(coalesce(dimensions,'')), created_at`,
      [source],
    );
  }

  const side = SOURCE_LABELS[source];
  const filename = filled
    ? `TRT ${side} materials ${new Date().toISOString().slice(0, 10)}.xlsx`
    : `TRT ${side} inventory template.xlsx`;
  return new Response(new Uint8Array(buildTemplate(source, materials)), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
});
