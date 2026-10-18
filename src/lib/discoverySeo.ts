import {lastEventDate} from './eventSchedule';
import { publishedInventory, sitemapInventory } from './discoveryPublication';
import type { Business, DiscoveryEntity, Event, Market, MarketOccurrence } from '../types/discovery';
import { entityPath, validateEntity } from './discovery';

/** Future inventory publisher shares these rules with dynamic SEO and sitemap generation. */
export function indexableEntities(entities: readonly DiscoveryEntity[]): DiscoveryEntity[] {
  return entities.filter(e => validateEntity(e) && publishedInventory(e) && sitemapInventory(e));
}
/** The real organizer: the linked organizer profile, else the listed organizer name,
 * else the venue that hosts it. Placeholder names never become an Organization. */
function organizerJsonLd(entity: Event | Market, origin: string, all: readonly DiscoveryEntity[]): object | undefined {
  const org = entity.organizerEntityId ? all.find((e): e is Business => e.kind === 'business' && e.id === entity.organizerEntityId && publishedInventory(e)) : undefined;
  if (org) return { '@type': 'Organization', name: org.title, url: origin + entityPath(org), ...(org.website ? { sameAs: org.website } : {}) };
  const official = entity.sources.find(s => s.kind === 'official')?.url;
  const name = entity.organizer?.trim();
  if (name && !/^organizer not listed/i.test(name)) return { '@type': 'Organization', name, ...(official ? { url: official } : {}) };
  const venue = entity.venue?.trim();
  if (venue) return { '@type': 'Organization', name: venue, ...(official ? { url: official } : {}) };
  return undefined;
}
/** Only prices we actually hold. Free means price 0; a known range becomes the offer's price;
 * otherwise the ticket (or listing) link with no price. Not-on-sale and cancelled events get none. */
function offersJsonLd(entity: Event, url: string): object | undefined {
  if (entity.cancelled || entity.ticketSaleStatus === 'not-on-sale') return undefined;
  const link = entity.tickets || url;
  const inStock = 'https://schema.org/InStock';
  if (entity.pricing === 'free') return { '@type': 'Offer', url: link, price: 0, priceCurrency: 'CAD', availability: inStock };
  const [low, high] = entity.priceRange ?? [];
  if (low !== undefined && high !== undefined) return low === high
    ? { '@type': 'Offer', url: link, price: low, priceCurrency: 'CAD', availability: inStock }
    : { '@type': 'AggregateOffer', url: link, lowPrice: low, highPrice: high, priceCurrency: 'CAD', availability: inStock };
  return { '@type': 'Offer', url: link, ...(entity.tickets ? { availability: inStock } : {}) };
}
/** Listings carry no lineup, so the organizer stands in as the performer. */
function hostJsonLd(entity: Event | Market, origin: string, all: readonly DiscoveryEntity[]): object {
  const organizer = organizerJsonLd(entity, origin, all);
  return organizer ? { organizer, performer: organizer } : {};
}
export function buildEntityJsonLd(entity: DiscoveryEntity, origin: string, occurrences: readonly MarketOccurrence[] = [], all: readonly DiscoveryEntity[] = []): object {
  const offers = entity.kind === 'event' ? offersJsonLd(entity, origin + entityPath(entity)) : undefined;
  const type = { event: 'Event', market: 'Place', business: entity.categories.includes('food') && !entity.categories.some(c => c === 'market' || c === 'markets') ? 'Restaurant' : 'LocalBusiness', guide: 'Article', neighbourhood: 'Place' }[entity.kind];
  return { '@context': 'https://schema.org', '@type': type, name: entity.title, description: entity.summary, url: origin + entityPath(entity),
    ...(entity.image ? { image: new URL(entity.image.src, origin).href } : {}),
    ...(entity.kind === 'event' ? { startDate: entity.schedulePrecision==='date'?entity.start.slice(0,10):entity.start, endDate: entity.schedulePrecision==='date'?lastEventDate(entity.end):entity.end, eventStatus: `https://schema.org/${entity.cancelled ? 'EventCancelled' : 'EventScheduled'}`, location: { '@type': 'Place', name: entity.venue || entity.address, address: entity.address }, ...hostJsonLd(entity, origin, all), ...(offers ? { offers } : {}) } : {}),
    ...(entity.kind === 'market' ? { address: entity.address, event: occurrences.filter(o => o.marketId === entity.id).map(o => ({ '@type': 'Event', name: entity.title, startDate: o.start, endDate: o.end, eventStatus: `https://schema.org/${o.cancelled ? 'EventCancelled' : 'EventScheduled'}`, location: { '@type': 'Place', name: entity.title, address: entity.address }, url: origin + entityPath(entity), ...hostJsonLd(entity, origin, all), offers: { '@type': 'Offer', url: origin + entityPath(entity) } })) } : {}),
    ...(entity.kind === 'guide' ? { headline: entity.title, dateModified: entity.updatedAt, mainEntity: { '@type': 'ItemList', itemListElement: entity.entries.map((entry, i) => ({ '@type': 'ListItem', position: i + 1, identifier: entry.entityId })) } } : {}),
  };
}
export function buildSitemap(routes: string[], entities: readonly DiscoveryEntity[], origin: string): string {
  const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const paths = [...new Set([...routes, ...indexableEntities(entities).map(entityPath)])];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map(p => `\n  <url><loc>${escape(origin + p)}</loc></url>`).join('')}\n</urlset>\n`;
}
