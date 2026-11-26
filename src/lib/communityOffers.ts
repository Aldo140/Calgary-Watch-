import type { Business, CommunityOffer, DiscoveryEntity } from '../types/discovery';

/**
 * Community partners: local businesses that give CalgaryWatch readers a promo.
 * Not ads and not ranking: an offer shows only to someone whose search is about
 * one of its topics ("iv therapy", "b12 shot"), and on the partner's own
 * profile. Each offer ends by itself at `until`.
 */
const words = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean)
  .map(w => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w));

export function offerActive(o: CommunityOffer, now = Date.now()): boolean {
  const until = Date.parse(o.until);
  return Number.isFinite(until) && now < until;
}

/** The partner's offers still running, for its profile. */
export function activeOffers(e: DiscoveryEntity, now = Date.now()): CommunityOffer[] {
  return e.kind === 'business' ? (e.communityOffers ?? []).filter(o => offerActive(o, now)) : [];
}

/** True when the search names one of the offer's topics: every word of the topic is in the query. */
export function offerMatches(o: CommunityOffer, query: string): boolean {
  const q = new Set(words(query));
  return o.topics.some(t => { const w = words(t); return w.length > 0 && w.every(x => q.has(x)); });
}

/** Offers that fit what this person searched for, at most `max`, one partner's offers kept together. */
export function offersForSearch(entities: readonly DiscoveryEntity[], query: string, now = Date.now(), max = 2): Array<{ partner: Business; offer: CommunityOffer }> {
  if (!query.trim()) return [];
  const out: Array<{ partner: Business; offer: CommunityOffer }> = [];
  for (const e of entities) {
    if (e.kind !== 'business' || e.status !== 'published' || !e.communityOffers?.length) continue;
    for (const offer of e.communityOffers) if (offerActive(offer, now) && offerMatches(offer, query)) out.push({ partner: e, offer });
  }
  return out.slice(0, max);
}
