import type { Business, DiscoveryEntity } from '../types/discovery';
import { awaitingOwner } from './discovery';
import { featuredActive } from './featured';

/**
 * Admin → Local partners → Listings & niches. Every business we carry, live or
 * waiting in the white pages, filed by trade. Service listings all share the
 * one "services" category, so their trade is the first tag ("optometrist").
 */
export type ListingStatus = 'white-pages' | 'live' | 'verified' | 'featured';
export interface TradeRow {
  trade: string; total: number; whitePages: number; live: number; verified: number;
  featured: Array<{ id: string; title: string; until?: string; plan?: string; niches: string[] }>;
}
export interface FeaturedRow { id: string; title: string; trade: string; niches: string[]; until?: string; plan?: string; daysLeft: number | null; active: boolean }
export interface BusinessReport {
  totals: { businesses: number; whitePages: number; live: number; verified: number; featured: number; withEmail: number };
  trades: TradeRow[];
  featured: FeaturedRow[];
  listings: Array<{ id: string; slug: string; title: string; trade: string; status: ListingStatus; email?: string; website?: string; listedAt?: string }>;
}

export function tradeOf(e: Business): string {
  const t = e.categories.includes('services') && e.tags[0] ? e.tags[0] : e.categories[0] ?? 'other';
  return t.toLowerCase();
}

export function statusOf(e: Business, now = Date.now()): ListingStatus {
  if (featuredActive(e, now)) return 'featured';
  if (awaitingOwner(e)) return 'white-pages';
  return e.ownerVerifiedAt ? 'verified' : 'live';
}

const DAY = 86_400_000;

export function businessReport(entities: readonly DiscoveryEntity[], now = Date.now()): BusinessReport {
  const biz = entities.filter((e): e is Business => e.kind === 'business' && !('managementOnly' in e && (e as { managementOnly?: boolean }).managementOnly));
  const trades = new Map<string, TradeRow>();
  const listings: BusinessReport['listings'] = [];
  const featured: FeaturedRow[] = [];
  const totals = { businesses: biz.length, whitePages: 0, live: 0, verified: 0, featured: 0, withEmail: 0 };
  for (const e of biz) {
    const trade = tradeOf(e);
    const status = statusOf(e, now);
    const row = trades.get(trade) ?? { trade, total: 0, whitePages: 0, live: 0, verified: 0, featured: [] };
    row.total++;
    if (status === 'white-pages') { row.whitePages++; totals.whitePages++; } else { row.live++; totals.live++; }
    if (e.ownerVerifiedAt) { row.verified++; totals.verified++; }
    if (e.email) totals.withEmail++;
    if (e.partner) {
      const until = e.featuredUntil;
      const active = featuredActive(e, now);
      const left = until && Number.isFinite(Date.parse(until)) ? Math.ceil((Date.parse(until) - now) / DAY) : null;
      featured.push({ id: e.id, title: e.title, trade, niches: e.featuredNiches ?? [], until, plan: e.featuredPlan, daysLeft: left, active });
      if (active) { totals.featured++; row.featured.push({ id: e.id, title: e.title, until, plan: e.featuredPlan, niches: e.featuredNiches ?? [] }); }
    }
    trades.set(trade, row);
    listings.push({ id: e.id, slug: e.slug, title: e.title, trade, status, email: e.email, website: e.website, listedAt: e.verifiedAt ?? e.updatedAt });
  }
  return {
    totals,
    trades: [...trades.values()].sort((a, b) => b.total - a.total || a.trade.localeCompare(b.trade)),
    featured: featured.sort((a, b) => Number(b.active) - Number(a.active) || (a.daysLeft ?? 1e9) - (b.daysLeft ?? 1e9)),
    listings: listings.sort((a, b) => a.trade.localeCompare(b.trade) || a.title.localeCompare(b.title)),
  };
}
