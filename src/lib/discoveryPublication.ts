import type { DiscoveryEntity } from '../types/discovery';
export function freshInventory(entity: DiscoveryEntity, now=new Date()): boolean {
  if(entity.kind!=='event' && entity.kind!=='market') return true;
  const age=now.getTime()-Date.parse(entity.verifiedAt || '');
  return Number.isFinite(age) && age>=-300000 && age<=14*86400000;
}
export function publishedInventory(entity: DiscoveryEntity, now=new Date()): boolean {
  return entity.status==='published' && (entity.verification==='source-checked' || entity.verification==='source-feed') && !entity.developmentOnly && freshInventory(entity,now) && entity.sources.length>0 && entity.sources.every(s=>s.kind==='official'||s.kind==='editorial');
}

// Enable only together with reviewed Hosting header changes and a verified export.
// Turned on 2026-10-01 with the /events, /markets, /guides and /neighbourhoods header rules removed.
export const discoveryIndexingEnabled = true;
/** Kinds whose single pages Google may index. Local businesses stay out, like the /local hub. */
export const INDEXED_DISCOVERY_KINDS: ReadonlySet<DiscoveryEntity['kind']> = new Set(['event', 'market', 'guide', 'neighbourhood']);
/** Indexed and worth listing in the sitemap: an indexed kind, and not an event that has already ended. */
export function sitemapInventory(entity: DiscoveryEntity, now = new Date()): boolean {
  return INDEXED_DISCOVERY_KINDS.has(entity.kind) && !(entity.kind === 'event' && Date.parse(entity.end) < now.getTime());
}
