import type { DiscoveryEntity } from '../types/discovery';

/**
 * Featured Partners (paid, or a free trial) own a niche: the searches in
 * `featuredNiches`. They show first for those searches, carry the Featured
 * partner stamp, and stop being featured on their own at `featuredUntil`, so
 * nobody has to remember to switch a trial off.
 */
export function featuredActive(e: DiscoveryEntity, now = Date.now()): boolean {
  if (e.kind !== 'business' || !e.partner) return false;
  const until = e.featuredUntil ? Date.parse(e.featuredUntil) : NaN;
  return !Number.isFinite(until) || now < until;
}

/** The listing as readers should see it today: an ended placement drops its partner flag. */
export function withFeaturedExpiry<T extends DiscoveryEntity>(e: T, now = Date.now()): T {
  return e.kind === 'business' && e.partner && !featuredActive(e, now) ? { ...e, partner: false } : e;
}

const words = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean)
  .map(w => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w));

/** True when the search names one of the partner's niches ("optometrists near me" → "optometrist"). */
export function ownsSearch(e: DiscoveryEntity, query: string, now = Date.now()): boolean {
  if (!featuredActive(e, now) || e.kind !== 'business' || !e.featuredNiches?.length) return false;
  const q = new Set(words(query));
  return e.featuredNiches.some(n => { const w = words(n); return w.length > 0 && w.every(x => q.has(x)); });
}
