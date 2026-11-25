/**
 * Did a search send someone to a business? Recorded without identity.
 *
 * Search demand (searchDemand.ts) says what people look for. This says what
 * they did next: which listing they opened from the results, and whether they
 * then called, opened the website, asked for directions or claimed it. That's
 * the proof a Featured niche is worth paying for, and the per-business view
 * admin shows owners ("12 people opened you from 'plumber', 4 called").
 *
 * One `product_events` document per action, name `search_click`, uid always
 * null: the search words, the listing (its id, or its path from the typeahead),
 * the action and where it happened. No account, no session id, no location.
 * The same action on the same listing within a few seconds counts once.
 *
 * Clicks are found by one document listener (SearchClickTracker) reading
 * `data-cw-q` / `data-cw-entity` attributes on the search page and profile
 * pages, so no button needs its own handler.
 */
import { demandQuery } from './searchDemand';

export const SEARCH_CLICK = 'search_click';
export type ClickAction = 'open' | 'call' | 'site' | 'directions' | 'email' | 'claim';
export type ClickFrom = 'search' | 'typeahead' | 'profile';
export const CLICK_ACTIONS: ClickAction[] = ['open', 'call', 'site', 'directions', 'email', 'claim'];
/** A profile visit counts toward the search that opened it for this long. */
export const CONTEXT_WINDOW_MS = 30 * 60_000;
const CONTEXT_KEY = 'cw_search_opened';
const DEDUPE_MS = 4_000;

/** What a click on `href` means, seen from `origin`, or null when it isn't one we count. */
export function clickAction(href: string, origin: string, onProfile: boolean): ClickAction | null {
  const h = href.trim();
  if (/^tel:/i.test(h)) return 'call';
  if (/^mailto:/i.test(h)) return 'email';
  let url: URL;
  try { url = new URL(h, origin); } catch { return null; }
  if (!/^https?:$/.test(url.protocol)) return null;
  if (url.origin === origin) {
    if (url.pathname.startsWith('/claim/')) return 'claim';
    // On a profile, links to other listings are browsing, not this business.
    if (onProfile) return null;
    return /^\/(local|events|markets|neighbourhoods|guides)\/[^/]+\/?$/.test(url.pathname) ? 'open' : null;
  }
  // Share buttons send the page elsewhere; they aren't a visit to the business.
  if (/(^|\.)(facebook|twitter|x|linkedin|pinterest|reddit)\.com$/.test(url.hostname) && /share|intent|submit|pin\/create/i.test(url.pathname + url.search)) return null;
  if (/(^|\.)google\.[a-z.]+$/.test(url.hostname) && url.pathname.startsWith('/maps')) return 'directions';
  if (/^maps\.(apple|google)\.com$/.test(url.hostname)) return 'directions';
  return 'site';
}

/** Short, safe listing reference: an entity id or a site path. */
export function clickRef(ref: string): string | null {
  const r = ref.trim().slice(0, 100);
  return /^[a-z0-9/_.-]{2,100}$/i.test(r) ? r : null;
}

function readContext(): Record<string, { q: string; at: number }> {
  try { return JSON.parse(sessionStorage.getItem(CONTEXT_KEY) ?? '{}'); } catch { return {}; }
}

/** The search that opened this listing (by id or path) in this tab, if recent. */
export function searchContext(keys: string[], now = Date.now()): string {
  const ctx = readContext();
  for (const k of keys) {
    const hit = ctx[k];
    if (hit && now - hit.at < CONTEXT_WINDOW_MS) return hit.q;
  }
  return '';
}

function rememberOpen(keys: string[], q: string, now: number) {
  try {
    const ctx = readContext();
    for (const k of keys) ctx[k] = { q, at: now };
    const recent = Object.entries(ctx).filter(([, v]) => now - v.at < CONTEXT_WINDOW_MS).slice(-40);
    sessionStorage.setItem(CONTEXT_KEY, JSON.stringify(Object.fromEntries(recent)));
  } catch { /* private mode: the profile visit just won't carry the search */ }
}

let last = { key: '', at: 0 };

/**
 * Record one action. `keys` are the listing's id and/or path; the first is
 * stored. An `open` also remembers the search so the profile's Call/Website
 * clicks are credited to it.
 */
export function recordSearchClick(input: { q: string; keys: string[]; act: ClickAction; from: ClickFrom }): void {
  const keys = input.keys.map(clickRef).filter((k): k is string => Boolean(k));
  if (!keys.length) return;
  const q = input.q ? demandQuery(input.q) ?? '' : '';
  const now = Date.now();
  const key = `${keys[0]}|${input.act}`;
  if (last.key === key && now - last.at < DEDUPE_MS) return;
  last = { key, at: now };
  if (input.act === 'open' && q) rememberOpen(keys, q, now);
  void Promise.all([import('firebase/firestore'), import('../firebase')]).then(([{ addDoc, collection }, { db }]) => {
    if (!db) return;
    return addDoc(collection(db, 'product_events'), { name: SEARCH_CLICK, uid: null, q, ref: keys[0], act: input.act, from: input.from, ts: now });
  }).catch(() => {});
}

export interface SearchClickRecord { q: string; ref: string; act: ClickAction; from: ClickFrom; ts: number }

/** Stored events are not validated by Firestore beyond the basics; keep only well-formed ones. */
export function readClickRecords(values: readonly unknown[]): SearchClickRecord[] {
  const out: SearchClickRecord[] = [];
  for (const v of values) {
    if (!v || typeof v !== 'object') continue;
    const r = v as Record<string, unknown>;
    if (r.name !== SEARCH_CLICK || typeof r.ref !== 'string' || typeof r.ts !== 'number' || !Number.isFinite(r.ts)) continue;
    if (!CLICK_ACTIONS.includes(r.act as ClickAction)) continue;
    const ref = clickRef(r.ref);
    if (!ref) continue;
    const q = typeof r.q === 'string' ? demandQuery(r.q) ?? '' : '';
    const from = r.from === 'typeahead' || r.from === 'profile' ? r.from : 'search';
    out.push({ q, ref, act: r.act as ClickAction, from, ts: r.ts });
  }
  return out;
}

export type ActionCounts = Record<ClickAction, number>;
const zero = (): ActionCounts => ({ open: 0, call: 0, site: 0, directions: 0, email: 0, claim: 0 });
/** Calls, website visits, directions and emails: the business actually got a lead. */
export const reachedBusiness = (c: ActionCounts) => c.call + c.site + c.directions + c.email;

export interface TermClicks { q: string; searches: number; counts: ActionCounts; listings: number }
export interface ListingClicks { key: string; counts: ActionCounts; fromSearch: number; terms: Array<{ q: string; n: number }> }

/**
 * Per search term: how often it was searched and what people did next.
 * Per listing: opens and leads, how many came from a search, and which words.
 * `resolve` maps an id or path to one listing key so typeahead (path) and
 * profile (id) clicks on the same business add up.
 */
export function summarizeClicks(clicks: readonly SearchClickRecord[], searches: ReadonlyArray<{ q: string }>, resolve: (ref: string) => string = r => r) {
  const searchCount = new Map<string, number>();
  for (const s of searches) searchCount.set(s.q, (searchCount.get(s.q) ?? 0) + 1);
  const terms = new Map<string, TermClicks & { refs: Set<string> }>();
  const listings = new Map<string, ListingClicks & { termMap: Map<string, number> }>();
  for (const c of clicks) {
    const key = resolve(c.ref);
    const l = listings.get(key) ?? { key, counts: zero(), fromSearch: 0, terms: [], termMap: new Map() };
    l.counts[c.act] += 1;
    if (c.q) { l.fromSearch += 1; l.termMap.set(c.q, (l.termMap.get(c.q) ?? 0) + 1); }
    listings.set(key, l);
    if (!c.q) continue;
    const t = terms.get(c.q) ?? { q: c.q, searches: searchCount.get(c.q) ?? 0, counts: zero(), listings: 0, refs: new Set<string>() };
    t.counts[c.act] += 1; t.refs.add(key);
    terms.set(c.q, t);
  }
  const score = (c: ActionCounts) => reachedBusiness(c) * 3 + c.open + c.claim;
  return {
    terms: [...terms.values()].map(({ refs, ...t }) => ({ ...t, listings: refs.size })).sort((a, b) => score(b.counts) - score(a.counts) || b.searches - a.searches),
    listings: [...listings.values()].map(({ termMap, ...l }) => ({ ...l, terms: [...termMap].map(([q, n]) => ({ q, n })).sort((a, b) => b.n - a.n) })).sort((a, b) => score(b.counts) - score(a.counts)),
  };
}
