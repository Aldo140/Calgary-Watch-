import { interestsFor, type EventInterestId } from './eventPicks';
import type { DiscoveryEntity, MarketOccurrence } from '../types/discovery';
import { calgaryDate, entityPath, matchesPeriod } from './discovery';
import { calgaryDateTimeFormat } from './calgaryTz';
import { interestScore, isCampusOnly } from './eventRank';
/** Convert a wall clock time using the zone's actual offset (including DST). */
export function calgaryInstant(day: string, hour: number): number {
  const wall = Date.parse(`${day}T00:00:00Z`) + hour * 3600000;
  let instant = wall;
  for (let i = 0; i < 3; i++) {
    const parts = Object.fromEntries(calgaryDateTimeFormat('en-CA', { timeZone:'America/Edmonton', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit', hourCycle:'h23' }).formatToParts(instant).map(p=>[p.type,p.value]));
    const localAsUtc = Date.parse(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`);
    instant += wall-localAsUtc;
  }
  return instant;
}
/** Tonight: starts 17:00–midnight, or at least half its duration overlaps that
 * window for at least an hour. A noon–20:00 event therefore is not Tonight. */
export function matchesTonight(start: string, end: string, now = new Date()): boolean {
  const a=Date.parse(start), b=Date.parse(end), day=calgaryDate(now);
  const from=calgaryInstant(day,17), to=calgaryInstant(day,24);
  if (!Number.isFinite(a+b) || b<=a || b<=now.getTime()) return false;
  const overlap=Math.max(0,Math.min(b,to)-Math.max(a,from));
  return (a>=from && a<to) || (overlap>=3600000 && overlap/(b-a)>=0.5);
}
export function upcomingOccurrences(occurrences: readonly MarketOccurrence[], marketId: string, now=new Date()) {
  return occurrences.filter(o=>o.marketId===marketId && Date.parse(o.end)>now.getTime()).sort((a,b)=>Date.parse(a.start)-Date.parse(b.start));
}
export function filterInventory(entities: readonly DiscoveryEntity[], occurrences: readonly MarketOccurrence[], period?: string, filter?: string, now=new Date()) {
  return entities.filter(e=> {
    if(e.kind==='event') {
      if(e.cancelled || Date.parse(e.end)<=now.getTime()) return false;
      if(period && !(period==='tonight' ? matchesTonight(e.start,e.end,now) : matchesPeriod(e.start,e.end,period,now))) return false;
      if(filter==='free') return e.pricing==='free';
    } else if(e.kind==='market') {
      if(!upcomingOccurrences(occurrences,e.id,now).some(o=>!o.cancelled && (!period || matchesPeriod(o.start,o.end,period,now)))) return false;
    }
    if(!filter) return true;
    // Interest filters use the same matcher as /plans and the Thursday email,
    // so "Music" finds the symphony even when a feed only tagged it "arts".
    const interest=INTEREST_FILTERS[filter];
    if(interest && interestsFor(e).includes(interest)) return true;
    return [...e.categories,...e.tags].some(c=>c.toLowerCase().replace(/s$/,'')===filter.replace(/s$/,''));
  });
}

/** URL filter words to interest ids (eventPicks.ts). */
const INTEREST_FILTERS: Record<string, EventInterestId> = {
  free:'free', family:'family', music:'music', arts:'arts', art:'arts', food:'food', sports:'sports',
  outdoor:'outdoors', outdoors:'outdoors', markets:'markets', talks:'learning', learning:'learning', community:'community',
};

/** Listings whose title, summary, venue, neighbourhood or tags contain every word of `q`. */
export function matchesText(e: DiscoveryEntity, q: string): boolean {
  const words=q.toLocaleLowerCase('en-CA').split(/\s+/).filter(Boolean);
  const hay=[e.title,e.summary,e.neighbourhood,'venue' in e?e.venue:'',...e.categories,...e.tags].join(' ').toLocaleLowerCase('en-CA');
  return words.every(w=>hay.includes(w));
}

export interface DayItem { date: string; title: string; to: string; venue?: string }

/** Real events + market occurrences over the next `days` days, grouped by Calgary
 * calendar date — the day-by-day "what's on" list, not a fabricated activity feed. */
export function upcomingByDay(entities: readonly DiscoveryEntity[], occurrences: readonly MarketOccurrence[], days = 7, now = new Date()): [string, DayItem[]][] {
  const cutoff = calgaryDate(new Date(now.getTime() + days * 86400000));
  const items: DayItem[] = [];
  for (const e of entities) {
    if (e.kind === 'event' && !e.cancelled && Date.parse(e.end) > now.getTime()) {
      items.push({ date: calgaryDate(new Date(e.start)), title: e.title, to: entityPath(e), venue: e.venue || e.neighbourhood });
    }
    if (e.kind === 'market') {
      for (const o of occurrences.filter(o => o.marketId === e.id && !o.cancelled && Date.parse(o.end) > now.getTime())) {
        items.push({ date: calgaryDate(new Date(o.start)), title: e.title, to: entityPath(e), venue: e.venue || e.neighbourhood });
      }
    }
  }
  const grouped = new Map<string, DayItem[]>();
  for (const item of items.filter(i => i.date <= cutoff)) (grouped.get(item.date) ?? grouped.set(item.date, []).get(item.date)!).push(item);
  return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(0, 5);
}

export interface AgendaItem {
  key: string;
  kind: 'event' | 'market';
  title: string;
  to: string;
  place?: string;
  start: string;
  end: string;
  free: boolean;
  indoor: boolean;
  outdoor: boolean;
  /** How likely it is to be worth going to (eventRank.ts); the day list sorts by it. */
  score: number;
}
export interface AgendaDay { date: string; items: AgendaItem[] }

/** Calgary calendar date `offset` days after `day` (YYYY-MM-DD, DST-proof via noon UTC). */
export function addCalgaryDays(day: string, offset: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

/** Every one of the next `days` Calgary dates — empty days included, so a quiet
 * Tuesday reads as quiet rather than disappearing — with the events and market
 * occurrences that overlap it. A multi-day event appears on each day it runs.
 * Each day leads with what people are most likely to go to (a Flames game before a
 * campus talk), drops campus-only listings, and shows a title once per day. */
export function weekAgenda(entities: readonly DiscoveryEntity[], occurrences: readonly MarketOccurrence[], days = 7, now = new Date()): AgendaDay[] {
  const today = calgaryDate(now);
  const week: AgendaDay[] = Array.from({ length: days }, (_, i) => ({ date: addCalgaryDays(today, i), items: [] }));
  const place = (e: DiscoveryEntity) => ('venue' in e && e.venue) || e.neighbourhood || undefined;
  const add = (e: DiscoveryEntity, kind: AgendaItem['kind'], key: string, start: string, end: string) => {
    if (!(Date.parse(end) > now.getTime())) return;
    const from = calgaryDate(new Date(start)), to = calgaryDate(new Date(end));
    const tags = [...e.categories, ...e.tags].map(t => t.toLowerCase());
    const base = interestScore(e, start);
    for (const day of week) {
      if (day.date < from || day.date > to) continue;
      // Something that began on an earlier day is a carry-over, not today's news.
      const score = day.date === from ? base : base - 1;
      day.items.push({
        key, kind, title: e.title, to: entityPath(e), place: place(e), start, end,
        free: e.kind === 'event' && e.pricing === 'free',
        indoor: tags.includes('indoor'), outdoor: tags.includes('outdoor') || tags.includes('outdoors'),
        score,
      });
    }
  };
  for (const e of entities) {
    if (e.kind === 'event' && !e.cancelled && !isCampusOnly(e)) add(e, 'event', e.id, e.start, e.end);
    if (e.kind === 'market') {
      for (const o of occurrences) if (o.marketId === e.id && !o.cancelled) add(e, 'market', `${e.id}:${o.start}`, o.start, o.end);
    }
  }
  // Ticketmaster lists one game as "Calgary Hitmen v Red Deer Rebels - Sunday Funday" and
  // "Calgary Hitmen vs. Red Deer Rebels presented by …"; both are the same outing.
  const titleKey = (t: string) => t.toLowerCase().replace(/\s+(presented by|-|–|—)\s.*$/, '').replace(/\bv\b\.?/g, 'vs').replace(/[^a-z0-9]+/g, ' ').trim();
  for (const day of week) {
    day.items.sort((a, b) => b.score - a.score || Date.parse(a.start) - Date.parse(b.start) || a.title.localeCompare(b.title));
    const seen = new Set<string>();
    day.items = day.items.filter(i => { const k = titleKey(i.title); if (seen.has(k)) return false; seen.add(k); return true; });
  }
  return week;
}
