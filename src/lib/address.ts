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

// ─── Address autocomplete ───────────────────────────────────────────────────

/**
 * Builds the registry query for what someone has typed so far.
 *
 * The form used Socrata's `$q=` full-text search for everything, which matches
 * the term anywhere in the row and ranks by relevance rather than by what the
 * person is obviously doing. Typing "2011" returned five suites of one
 * building on University Drive — 2011 was the *street* number there, and the
 * house numbers were 101 to 105 — while "2011 Ulster Rd NW", the address
 * actually being typed, was nowhere.
 *
 * Someone typing digits is typing a house number, and a house number is a
 * prefix. So a leading digit switches to `starts_with`, which is both exact
 * and narrows properly as they keep typing. A term with no leading digit is a
 * street name, where full-text is right.
 *
 * Both forms group by address: the assessment register holds one row per roll
 * year, so an ungrouped query happily returns the same address eight times.
 */
export function buildAddressQuery(input: string): { where?: string; q?: string } | null {
  const term = stripCityQualifier(input).replace(/\s+/g, ' ').trim().toUpperCase();
  if (term.length < 3) return null;
  // SoQL string literals are single-quoted; a quote in the term would end it.
  const safe = term.replace(/'/g, "''");
  if (/^\d/.test(term)) return { where: `starts_with(address, '${safe}')` };
  return { q: term };
}

/**
 * Orders prefix matches so the plain street address beats a suite inside a
 * larger building.
 *
 * "2011 ULSTER RD NW" and "2011 1053 10 ST SW" both begin with 2011, but only
 * the first is a house number — in the second it is a suite. Simpler addresses
 * have fewer parts, so token count separates them without having to guess
 * which numbers mean what. Calgary's numbered streets ("2011 10 ST NW") stay
 * ranked correctly because they are just as short.
 */
export function rankAddressMatches(addresses: string[]): string[] {
  return [...new Set(addresses)].sort((a, b) => {
    const parts = a.split(/\s+/).length - b.split(/\s+/).length;
    if (parts !== 0) return parts;
    if (a.length !== b.length) return a.length - b.length;
    return a.localeCompare(b);
  });
}

/**
 * Orders full-text matches, where the simplicity sort above must not be used.
 *
 * Prefix results are all equally relevant, so sorting them by simplicity is
 * safe. Full-text results are not: the search has already ranked them, and
 * re-sorting throws that away. Typing "17 av sw" once surfaced "1000 5 AV SW"
 * first, purely because it was short.
 *
 * So keep the search's own order and drop rows that do not contain every word
 * typed — full-text will happily match on one term out of three.
 */
export function rankFullTextMatches(addresses: string[], term: string): string[] {
  const words = stripCityQualifier(term).toUpperCase().split(/\s+/).filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const address of addresses) {
    if (seen.has(address)) continue;
    seen.add(address);
    if (words.every((w) => address.includes(w))) out.push(address);
  }
  return out;
}
