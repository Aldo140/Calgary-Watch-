import { publishedInventory } from './discoveryPublication';
import type { DiscoveryEntity, MarketOccurrence } from '../types/discovery';
import { entityPath, validateEntity } from './discovery';

/** Future inventory publisher shares these rules with dynamic SEO and sitemap generation. */
export function indexableEntities(entities: readonly DiscoveryEntity[]): DiscoveryEntity[] {
  return entities.filter(e => validateEntity(e) && publishedInventory(e));
}
export function buildEntityJsonLd(entity: DiscoveryEntity, origin: string, occurrences: readonly MarketOccurrence[] = []): object {
  const type = { event: 'Event', market: 'Place', business: entity.categories.includes('food') ? 'Restaurant' : 'LocalBusiness', guide: 'Article', neighbourhood: 'Place' }[entity.kind];
  return { '@context': 'https://schema.org', '@type': type, name: entity.title, description: entity.summary, url: origin + entityPath(entity),
    ...(entity.image ? { image: new URL(entity.image.src, origin).href } : {}),
    ...(entity.kind === 'event' ? { startDate: entity.start, endDate: entity.end, eventStatus: `https://schema.org/${entity.cancelled ? 'EventCancelled' : 'EventScheduled'}`, location: { '@type': 'Place', name: entity.venue || entity.address, address: entity.address } } : {}),
    ...(entity.kind === 'market' ? { address: entity.address, event: occurrences.filter(o => o.marketId === entity.id).map(o => ({ '@type': 'Event', name: entity.title, startDate: o.start, endDate: o.end, eventStatus: `https://schema.org/${o.cancelled ? 'EventCancelled' : 'EventScheduled'}`, location: { '@type': 'Place', name: entity.title, address: entity.address }, url: origin + entityPath(entity) })) } : {}),
    ...(entity.kind === 'guide' ? { headline: entity.title, dateModified: entity.updatedAt, mainEntity: { '@type': 'ItemList', itemListElement: entity.entries.map((entry, i) => ({ '@type': 'ListItem', position: i + 1, identifier: entry.entityId })) } } : {}),
  };
}
export function buildSitemap(routes: string[], entities: readonly DiscoveryEntity[], origin: string): string {
  const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const paths = [...new Set([...routes, ...indexableEntities(entities).map(entityPath)])];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map(p => `\n  <url><loc>${escape(origin + p)}</loc></url>`).join('')}\n</urlset>\n`;
}
