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
/** A structured address when the listing's own address names Calgary; otherwise its text as given. */
function addressJsonLd(address: string | undefined): object | string | undefined {
  const text = address?.replace(/\s+/g, ' ').trim();
  if (!text) return undefined;
  const match = text.match(/^(.*?),?\s*Calgary,?\s*(?:AB|Alberta)\b,?\s*([A-Z]\d[A-Z] ?\d[A-Z]\d)?/i);
  if (!match) return text;
  const street = match[1].replace(/,\s*$/, '').trim();
  return { '@type': 'PostalAddress', ...(street ? { streetAddress: street } : {}), addressLocality: 'Calgary', addressRegion: 'AB', ...(match[2] ? { postalCode: match[2].toUpperCase() } : {}), addressCountry: 'CA' };
}
const CALGARY = { '@type': 'City', name: 'Calgary', containedInPlace: { '@type': 'AdministrativeArea', name: 'Alberta' } };
const geoJsonLd = (c?: { lat: number; lng: number }) => (c && Number.isFinite(c.lat) && Number.isFinite(c.lng) ? { geo: { '@type': 'GeoCoordinates', latitude: c.lat, longitude: c.lng } } : {});
/** The place an event or market happens: venue name, structured address when we hold one, and coordinates. */
function placeJsonLd(name: string, address: string, coordinates?: { lat: number; lng: number }): object {
  const structured = addressJsonLd(address);
  return { '@type': 'Place', name, ...(structured ? { address: structured } : {}), ...geoJsonLd(coordinates) };
}
/** Facts a business profile holds itself: address, phone, coordinates and its own links. */
function businessJsonLd(b: Business): object {
  const address = addressJsonLd(b.address);
  const sameAs = [b.website, ...Object.values(b.socials ?? {})].filter((u): u is string => typeof u === 'string' && /^https:\/\//.test(u));
  return { ...(address ? { address } : {}), ...(b.phone ? { telephone: b.phone } : {}), ...geoJsonLd(b.coordinates), ...(sameAs.length ? { sameAs: [...new Set(sameAs)] } : {}), areaServed: CALGARY };
}
export function buildEntityJsonLd(entity: DiscoveryEntity, origin: string, occurrences: readonly MarketOccurrence[] = [], all: readonly DiscoveryEntity[] = []): object {
  const offers = entity.kind === 'event' ? offersJsonLd(entity, origin + entityPath(entity)) : undefined;
  const type = { event: 'Event', market: 'Place', business: entity.categories.includes('food') && !entity.categories.some(c => c === 'market' || c === 'markets') ? 'Restaurant' : 'LocalBusiness', guide: 'Article', neighbourhood: 'Place' }[entity.kind];
  return { '@context': 'https://schema.org', '@type': type, name: entity.title, description: entity.summary, url: origin + entityPath(entity),
    ...(entity.image ? { image: new URL(entity.image.src, origin).href } : {}),
    ...(entity.kind === 'event' ? { startDate: entity.schedulePrecision==='date'?entity.start.slice(0,10):entity.start, endDate: entity.schedulePrecision==='date'?lastEventDate(entity.end):entity.end, eventStatus: `https://schema.org/${entity.cancelled ? 'EventCancelled' : 'EventScheduled'}`, eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode', location: placeJsonLd(entity.venue || entity.address, entity.address, entity.coordinates), ...hostJsonLd(entity, origin, all), ...(offers ? { offers } : {}), ...(entity.pricing === 'free' ? { isAccessibleForFree: true } : {}) } : {}),
    ...(entity.kind === 'market' ? { address: addressJsonLd(entity.address) ?? entity.address, ...geoJsonLd(entity.coordinates), containedInPlace: CALGARY, event: occurrences.filter(o => o.marketId === entity.id).map(o => ({ '@type': 'Event', name: entity.title, startDate: o.start, endDate: o.end, eventStatus: `https://schema.org/${o.cancelled ? 'EventCancelled' : 'EventScheduled'}`, eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode', location: placeJsonLd(entity.venue || entity.title, entity.address, entity.coordinates), url: origin + entityPath(entity), ...hostJsonLd(entity, origin, all), offers: { '@type': 'Offer', url: origin + entityPath(entity) } })) } : {}),
    ...(entity.kind === 'business' ? businessJsonLd(entity) : {}),
    ...(entity.kind === 'neighbourhood' ? { containedInPlace: CALGARY } : {}),
    ...(entity.kind === 'guide' ? { headline: entity.title, dateModified: entity.updatedAt, publisher: { '@type': 'Organization', name: 'CalgaryWatch', url: `${origin}/` }, mainEntity: { '@type': 'ItemList', itemListElement: entity.entries.map((entry, i) => ({ '@type': 'ListItem', position: i + 1, identifier: entry.entityId })) } } : {}),
  };
}
/** YYYY-MM-DD of the listing's last source check (or edit), when it is a real date. */
export function lastChecked(e: DiscoveryEntity): string | undefined {
  const t = Date.parse(e.verifiedAt || e.updatedAt || '');
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : undefined;
}
export function buildSitemap(routes: string[], entities: readonly DiscoveryEntity[], origin: string): string {
  const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  // lastmod is the day we last checked the listing against its source, so crawlers can skip unchanged pages.
  const modified = new Map(indexableEntities(entities).map(e => [entityPath(e), lastChecked(e)] as const));
  const paths = [...new Set([...routes, ...modified.keys()])];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map(p => `\n  <url><loc>${escape(origin + p)}</loc>${modified.get(p) ? `<lastmod>${modified.get(p)}</lastmod>` : ''}</url>`).join('')}\n</urlset>\n`;
}
