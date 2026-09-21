import { publishedInventory } from './discoveryPublication';
import type { DiscoveryEntity, EntityKind, MarketOccurrence } from '../types/discovery';

export const DISCOVERY_SECTIONS = [
  { path: '/markets', label: 'Markets', kind: 'market' },
  { path: '/events', label: 'Events', kind: 'event' },
  { path: '/local', label: 'Local', kind: 'business' },
  { path: '/guides', label: 'Guides', kind: 'guide' },
  { path: '/neighbourhoods', label: 'Neighbourhoods', kind: 'neighbourhood' },
] as const;
export const LOCAL_CATEGORIES = ['food', 'shopping', 'services', 'arts'];
export function entityPath(entity: Pick<DiscoveryEntity, 'kind' | 'slug'>): string {
  return `${DISCOVERY_SECTIONS.find(s => s.kind === entity.kind)!.path}/${entity.slug}`;
}
export function normalizeSearch(query: string): string {
  return query.normalize('NFKC').toLocaleLowerCase('en-CA').replace(/\s+/g, ' ').trim().slice(0, 120);
}
export function searchEntities(entities: DiscoveryEntity[], query: string): Partial<Record<EntityKind, DiscoveryEntity[]>> {
  const words = normalizeSearch(query).split(' ').filter(Boolean);
  if (!words.length) return {};
  return entities.filter(e => words.every(w => normalizeSearch([e.title, e.summary, e.neighbourhood, ...e.categories, ...e.tags].join(' ')).includes(w)))
    .reduce<Partial<Record<EntityKind, DiscoveryEntity[]>>>((groups, e) => { (groups[e.kind] ??= []).push(e); return groups; }, {});
}
export function calgaryDate(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
/** Calendar arithmetic deliberately uses Calgary dates, never the browser timezone. */
export function matchesPeriod(start: string, end: string, period: string, now = new Date()): boolean {
  const today = calgaryDate(now);
  let from = today; let to = today;
  if (period === 'this-weekend') {
    const day = new Date(`${today}T12:00:00Z`);
    const weekday = day.getUTCDay();
    day.setUTCDate(day.getUTCDate() + (weekday === 0 ? -2 : weekday === 6 ? -1 : (5 - weekday + 7) % 7));
    from = day.toISOString().slice(0, 10); day.setUTCDate(day.getUTCDate() + 2); to = day.toISOString().slice(0, 10);
  }
  return Number.isFinite(Date.parse(start)) && Number.isFinite(Date.parse(end)) && Date.parse(end) >= now.getTime()
    && calgaryDate(new Date(start)) <= to && calgaryDate(new Date(end)) >= from;
}
export function validateEntity(entity: DiscoveryEntity): boolean {
  return !!entity.id && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entity.slug) && !!entity.title && entity.sources.length > 0
    && entity.sources.every(s => /^https:\/\//.test(s.url))
    && !(entity.kind === 'business' && LOCAL_CATEGORIES.includes(entity.slug))
    && (entity.kind !== 'event' || (Date.parse(entity.end) > Date.parse(entity.start)));
}
export interface DiscoveryRepository {
  list(): readonly DiscoveryEntity[];
  occurrences(): readonly MarketOccurrence[];
  find(kind: EntityKind, slug: string): DiscoveryEntity | undefined;
}
export function createDiscoveryRepository(entities: DiscoveryEntity[], occurrences: MarketOccurrence[] = [], development = false): DiscoveryRepository {
  const visible = entities.filter(e => validateEntity(e) && e.status === 'published' && (development || publishedInventory(e)));
  return { list: () => visible, occurrences: () => occurrences.filter(o => visible.some(e => e.id === o.marketId)), find: (kind, slug) => visible.find(e => e.kind === kind && e.slug === slug) };
}
