/**
 * What Calgary searches for, recorded without identity.
 *
 * One document per distinct search per tab every half hour (a refresh or a
 * back-button return doesn't count twice): the normalized words, how many
 * listings matched, and when. No account, no location, no session id.
 * A query that looks like contact details (an @ or a long digit run) is never
 * stored. Admin's Search demand workspace turns these into "most searched"
 * and, more usefully, "searched for and found nothing": the list of events and
 * places to add next.
 */


export const SEARCH_DEMAND = 'search_demand';
const SEEN_KEY = 'cw_searched_at';
/** The same words from the same tab inside this window are one search. */
export const REPEAT_WINDOW_MS = 30 * 60_000;

/** Safe-to-store version of a query, or null when it shouldn't be kept. */
export function demandQuery(q: string): string | null {
  const t = q.normalize('NFKC').toLocaleLowerCase('en-CA').replace(/\s+/g, ' ').trim().slice(0, 80);
  if (t.length < 2 || /@|\d{6,}|https?:/.test(t)) return null;
  // A pasted paragraph (someone's notes or a prompt) isn't a search: real ones are a few words.
  if (t.split(' ').length > 8) return null;
  return t;
}

/** Whether `term` is a new search for this tab, given when each term was last recorded. */
export function isFreshSearch(seen: Record<string, number>, term: string, now: number): boolean {
  const last = seen[term];
  return !(typeof last === 'number' && now - last < REPEAT_WINDOW_MS);
}

export function recordSearch(q: string, results: number): void {
  const term = demandQuery(q);
  if (!term) return;
  const now = Date.now();
  try {
    const seen = JSON.parse(sessionStorage.getItem(SEEN_KEY) ?? '{}') as Record<string, number>;
    if (!isFreshSearch(seen, term, now)) return;
    seen[term] = now;
    const recent = Object.entries(seen).filter(([, at]) => now - at < REPEAT_WINDOW_MS).slice(-50);
    sessionStorage.setItem(SEEN_KEY, JSON.stringify(Object.fromEntries(recent)));
  } catch { /* private mode: still record once per page view */ }
  // Firebase loads lazily so this module (and its pure helpers) import anywhere, tests included.
  void Promise.all([import('firebase/firestore'), import('../firebase')]).then(([{ addDoc, collection }, { db }]) => {
    if (!db) return;
    return addDoc(collection(db, SEARCH_DEMAND), { q: term, results: Math.min(Math.max(0, Math.round(results)), 999), ts: now });
  }).catch(() => {});
}

export interface DemandRow { q: string; searches: number; lastResults: number; lastAt: number }

/** Group raw rows into terms, most searched first. */
export function summarizeDemand(rows: Array<{ q: string; results: number; ts: number }>): DemandRow[] {
  const by = new Map<string, DemandRow>();
  for (const r of [...rows].sort((a, b) => a.ts - b.ts)) {
    const row = by.get(r.q) ?? { q: r.q, searches: 0, lastResults: r.results, lastAt: r.ts };
    row.searches += 1; row.lastResults = r.results; row.lastAt = r.ts;
    by.set(r.q, row);
  }
  return [...by.values()].sort((a, b) => b.searches - a.searches || b.lastAt - a.lastAt);
}

export interface SearchDemandRecord { q: string; results: number; ts: number }
/** Firestore casts do not validate stored analytics, including legacy/admin-written rows. */
export function readDemandRecords(values: readonly unknown[]): { rows: SearchDemandRecord[]; ignored: number } {
  const rows: SearchDemandRecord[] = [];
  for (const value of values) {
    if (!value || typeof value !== 'object') continue;
    const r = value as Record<string, unknown>;
    if (typeof r.q !== 'string' || typeof r.results !== 'number' || !Number.isInteger(r.results) || r.results < 0 || r.results > 999 || typeof r.ts !== 'number' || !Number.isFinite(r.ts) || r.ts <= 0) continue;
    const q = demandQuery(r.q);
    if (!q) continue;
    rows.push({ q, results: r.results, ts: r.ts });
  }
  return { rows, ignored: values.length - rows.length };
}
