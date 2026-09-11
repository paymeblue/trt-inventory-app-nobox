/**
 * Company scoping. Stock is owned by whoever owns the location it sits in, so
 * every "which company?" filter resolves to "which locations?".
 *
 * Call sites append the returned SQL to an existing WHERE clause and push the
 * company id onto their parameter array.
 */
export function companyLocationFilter(
  companyId: string | null | undefined,
  params: unknown[],
  locationColumn = "location_id",
): string | null {
  if (!companyId) return null;
  params.push(companyId);
  return `${locationColumn} IN (SELECT id FROM locations WHERE company_id = $${params.length})`;
}

/** Reads and normalises the `company` query parameter. */
export function companyParam(url: URL): string | null {
  const value = url.searchParams.get("company")?.trim();
  return value && value !== "all" ? value : null;
}
