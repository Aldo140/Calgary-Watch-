import type { DiscoveryEntity, MarketOccurrence } from '../types/discovery';
import { DATE_PICKS, type DatePick } from '../content/dateNight';
import { calgaryDateTimeFormat } from './calgaryTz';

export interface ResolvedPick extends DatePick {
  entity: DiscoveryEntity;
  /** The next date to go (ISO), or the run's current day for something already on. */
  next: string;
  /** Last day of a multi-day run, when it spans more than one day. */
  until?: string;
  onNow: boolean;
}

const DAY = 86_400_000;
const hourIn = (iso: string) => Number(calgaryDateTimeFormat('en-CA', { timeZone: 'America/Edmonton', hour: '2-digit', hourCycle: 'h23' }).format(new Date(iso)));

/** Our picks that are still ahead, soonest first. A pick whose listing expired simply drops off. */
export function resolvePicks(entities: readonly DiscoveryEntity[], occurrences: readonly MarketOccurrence[], now: number, picks: DatePick[] = DATE_PICKS): ResolvedPick[] {
  const out: ResolvedPick[] = [];
  for (const p of picks) {
    const entity = entities.find(e => e.sourceId === p.sourceId && e.sourceRecordId === p.recordId);
    if (!entity) continue;
    if (entity.kind === 'event') {
      const start = Date.parse(entity.start), end = Date.parse(entity.end);
      if (end < now || entity.cancelled) continue;
      const multiDay = end - start > DAY;
      out.push({ ...p, entity, next: start > now ? entity.start : new Date(now).toISOString(), until: multiDay ? entity.end : undefined, onNow: start <= now });
    } else if (entity.kind === 'market') {
      const upcoming = occurrences.filter(o => o.marketId === entity.id && !o.cancelled && Date.parse(o.end) > now).sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
      if (!upcoming.length) continue;
      out.push({ ...p, entity, next: upcoming[0].start, until: upcoming.length > 1 ? upcoming.at(-1)!.end : undefined, onNow: Date.parse(upcoming[0].start) <= now });
    }
  }
  return out.sort((a, b) => Date.parse(a.next) - Date.parse(b.next));
}

const EVENING_KINDS = new Set(['arts', 'nightlife', 'music', 'food']);

/**
 * Other evening plans in the next week, straight from the listings: starts at 5 pm or later,
 * arts or nightlife, one day long, and not a kids' event. Not picks, just what's on.
 */
export function eveningsThisWeek(entities: readonly DiscoveryEntity[], now: number, exclude: Set<string>, max = 6): Extract<DiscoveryEntity, { kind: 'event' }>[] {
  return entities
    .filter((e): e is Extract<DiscoveryEntity, { kind: 'event' }> => e.kind === 'event')
    .filter(e => !exclude.has(e.id) && !e.cancelled && Date.parse(e.start) > now && Date.parse(e.start) < now + 7 * DAY
      && Date.parse(e.end) - Date.parse(e.start) < DAY && hourIn(e.start) >= 17
      && e.categories.some(c => EVENING_KINDS.has(c)) && !e.categories.includes('family'))
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
    .filter((e, i, all) => all.findIndex(x => x.title === e.title) === i)
    .slice(0, max);
}
