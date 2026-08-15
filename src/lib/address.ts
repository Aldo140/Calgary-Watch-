/**
 * Calgary address string handling.
 *
 * Two representations are in play and they are not the same string:
 *
 *   registry   "2011 ULSTER RD NW"          — City of Calgary parcel datasets
 *   label      "2011 Ulster Rd NW, Calgary" — what we show and store
 *
 * Searching the registry with a label finds nothing, because the city name is
 * not part of the address column. The settings form did exactly that when
 * re-opening a saved address, got no results, and fell through to a raw
 * fallback that appended the qualifier a second time — offering
 * "2011 Ulster Rd NW, Calgary, Calgary, AB" as a suggestion for an address the
 * person had already saved.
 */

/** Strips a trailing city/province qualifier, leaving the street address. */
export function stripCityQualifier(value: string): string {
  return value
    .replace(/,\s*(calgary|ab|alberta)\b\.?/gi, '')
    .replace(/[\s,]+$/, '')
    .trim();
}

/**
 * Appends the city qualifier exactly once.
 *
 * Idempotent by construction — it strips before it appends — so repeated
 * edits of the same address cannot accumulate qualifiers.
 */
export function withCityQualifier(value: string): string {
  const base = stripCityQualifier(value);
  return base ? `${base}, Calgary, AB` : '';
}
