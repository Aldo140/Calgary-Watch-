/**
 * What Calgary searches for, recorded without identity.
 *
 * One document per distinct search per browser session: the normalized words,
 * how many listings matched, and when. No account, no location, no session id.
 * A query that looks like contact details (an @ or a long digit run) is never
 * stored. Admin's Search demand workspace turns these into "most searched"
 * and, more usefully, "searched for and found nothing": the list of events and
 * places to add next.
 */

import { addDoc, collection } from 'firebase/firestore';
import { db } from '../firebase';

export const SEARCH_DEMAND = 'search_demand';
const SEEN_KEY = 'cw_searched';

/** Safe-to-store version of a query, or null when it shouldn't be kept. */
export function demandQuery(q: string): string | null {
  const t = q.normalize('NFKC').toLocaleLowerCase('en-CA').replace(/\s+/g, ' ').trim().slice(0, 80);
  if (t.length < 2 || /@|\d{6,}|https?:/.test(t)) return null;
  return t;
}

export function recordSearch(q: string, results: number): void {
  const term = demandQuery(q);
  if (!term || !db) return;
  try {
    const seen = new Set<string>(JSON.parse(sessionStorage.getItem(SEEN_KEY) ?? '[]'));
    if (seen.has(term)) return;
    seen.add(term);
    sessionStorage.setItem(SEEN_KEY, JSON.stringify([...seen].slice(-50)));
  } catch { /* private mode: still record once per page view */ }
  void addDoc(collection(db, SEARCH_DEMAND), { q: term, results: Math.min(Math.max(0, Math.round(results)), 999), ts: Date.now() }).catch(() => {});
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
