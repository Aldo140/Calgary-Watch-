import type { Business, DiscoveryEntity, Event, Market, MarketOccurrence, Neighbourhood } from '../types/discovery';
import { DISCOVERY_SECTIONS, entityPath } from './discovery';
import { calgaryDateTimeFormat } from './calgaryTz';
import { calendarDateForDisplay, lastEventDate } from './eventSchedule';
import { interestsFor, type EventInterestId } from './eventPicks';
import { upcomingOccurrences } from './discoveryCalendar';
import { hoodOf } from './localLinks';
import { linksFor } from './neighbourhoods';
import { organizerEvents, organizerMarkets, organizerProfile } from './organizations';
import { publishedInventory } from './discoveryPublication';

/**
 * Search titles, descriptions, breadcrumbs and related links for single listing pages.
 *
 * Shared by SeoManager (live tags), the prerender (static HTML) and the event page's
 * "More like this", so what a crawler reads is what a visitor sees. Every phrase is built
 * from fields the listing already holds: its dates, venue, neighbourhood, price and
 * organizer. Nothing here adds a fact the listing doesn't carry.
 */

/** Google shows roughly 60 characters of a title and 155 of a description. */
export const TITLE_MAX = 64;
export const DESCRIPTION_MAX = 158;
const BRAND = ' | CalgaryWatch';

const tidy = (s: string | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();
const hasCalgary = (s: string) => /calgary/i.test(s);

/** Cut at a word boundary and close with an ellipsis. */
export function clip(text: string, max: number): string {
  const t = tidy(text);
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const at = cut.lastIndexOf(' ');
  return `${(at > max * 0.6 ? cut.slice(0, at) : cut).replace(/[\s,;:.–—-]+$/, '')}…`;
}

/** The first candidate that fits, else the last one clipped. */
function fit(candidates: string[], max: number): string {
  return candidates.find(c => c.length <= max) ?? clip(candidates.at(-1)!, max);
}

/**
 * A listing's own words for a snippet. Some feed summaries stop at an initial
 * ("Join curator Jenelle M.") or are a few words long; the description is the fuller text then.
 */
export function listingBlurb(entity: Pick<DiscoveryEntity, 'summary' | 'description'>): string {
  const summary = tidy(entity.summary);
  const description = tidy(entity.description);
  const cutShort = summary.length < 40 || /(?:^|\s)[A-Z]\.$/.test(summary);
  return cutShort && description.length > summary.length ? description : summary || description;
}

const shortDay = calgaryDateTimeFormat('en-CA', { timeZone: 'America/Edmonton', month: 'short', day: 'numeric' });
const shortDayYear = calgaryDateTimeFormat('en-CA', { timeZone: 'America/Edmonton', month: 'short', day: 'numeric', year: 'numeric' });
const longDay = calgaryDateTimeFormat('en-CA', { timeZone: 'America/Edmonton', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
const clock = calgaryDateTimeFormat('en-CA', { timeZone: 'America/Edmonton', hour: 'numeric', minute: '2-digit' });
const yearOf = (d: Date) => calgaryDateTimeFormat('en-CA', { timeZone: 'America/Edmonton', year: 'numeric' }).format(d);

/** First and last calendar day of an event, respecting date-only schedules. */
function eventDays(e: Event): { first: Date; last: Date } {
  if (e.schedulePrecision === 'date') return { first: calendarDateForDisplay(e.start), last: calendarDateForDisplay(lastEventDate(e.end)) };
  return { first: new Date(e.start), last: new Date(e.end) };
}

/** "Nov 8, 2026" or "Nov 8 – Dec 24, 2026". */
export function eventDateLabel(e: Event): string {
  const { first, last } = eventDays(e);
  const a = shortDayYear.format(first), b = shortDayYear.format(last);
  if (a === b || last.getTime() < first.getTime()) return a;
  return yearOf(first) === yearOf(last) ? `${shortDay.format(first)} – ${b}` : `${a} – ${b}`;
}

/** "Saturday, November 8, 2026, 7:30 p.m." or a date range for multi-day listings. */
function eventWhenLong(e: Event): string {
  const { first, last } = eventDays(e);
  const a = longDay.format(first), b = longDay.format(last);
  if (e.schedulePrecision === 'date') return a === b ? a : `${a} to ${b}`;
  return a === b ? `${a}, ${clock.format(first)}` : `${a}, ${clock.format(first)} to ${b}`;
}

function eventPlace(e: Event): string {
  return tidy(e.venue) || tidy(e.neighbourhood);
}

function priceLine(e: Event): string {
  if (e.cancelled) return '';
  if (e.ticketSaleStatus === 'not-on-sale') return 'Tickets not yet on sale.';
  if (e.pricing === 'free') return 'Free.';
  const [low, high] = e.priceRange ?? [];
  if (low !== undefined && high !== undefined) return low === high ? `Tickets $${low}.` : `Tickets $${low}–$${high}.`;
  return '';
}

const withBrand = (core: string) => (core.length + BRAND.length <= TITLE_MAX + 6 ? core + BRAND : core);

/** The page title for a single listing. */
export function listingTitle(entity: DiscoveryEntity, all: readonly DiscoveryEntity[] = [], now = new Date()): string {
  const title = tidy(entity.title);
  const city = hasCalgary(title) ? '' : ', Calgary';
  switch (entity.kind) {
    case 'event': {
      const when = eventDateLabel(entity);
      const place = eventPlace(entity);
      const placeCity = place && !hasCalgary(place) && !hasCalgary(title) ? `${place}, Calgary` : place;
      const prefix = entity.cancelled ? 'Cancelled: ' : '';
      return withBrand(fit([
        `${prefix}${title}, ${when}${placeCity ? ` at ${placeCity}` : city}`,
        `${prefix}${title}, ${when}${place ? ` at ${place}` : city}`,
        `${prefix}${title}, ${when}${city}`,
        `${prefix}${title}, ${when}`,
        `${prefix}${title}, ${shortDay.format(eventDays(entity).first)}`,
        `${prefix}${title}${city}`,
      ], TITLE_MAX));
    }
    case 'market': {
      const suffix = hasCalgary(title) ? '' : ' (Calgary)';
      return withBrand(fit([`${title}: Dates, Hours & Location${suffix}`, `${title}: Dates & Hours${suffix}`, `${title}${suffix}`], TITLE_MAX));
    }
    case 'business': {
      const hood = tidy(entity.neighbourhood);
      // "Rosso Coffee Roasters — Inglewood" already names its neighbourhood.
      const named = hood && title.toLowerCase().includes(hood.toLowerCase());
      const where = hood && !named ? ` in ${hood}, Calgary` : named ? city : city ? ' in Calgary' : '';
      const upcoming = organizerEvents(entity.id, all, now.getTime()).length;
      return withBrand(fit([
        ...(upcoming ? [`${title}: Upcoming Events${where}`, `${title}: Upcoming Events${city}`] : []),
        `${title}${where}`,
        `${title}${city}`,
      ], TITLE_MAX));
    }
    case 'neighbourhood':
      return withBrand(fit([`${title}, Calgary: Events, Markets & Things to Do`, `${title}, Calgary: Things to Do`, `${title}, Calgary`], TITLE_MAX));
    case 'guide':
      return withBrand(fit([`${title}${hasCalgary(title) ? '' : ' | Calgary Guide'}`, title], TITLE_MAX));
  }
}

/** The meta description for a single listing: the facts first, then its own words. */
export function listingDescription(entity: DiscoveryEntity, occurrences: readonly MarketOccurrence[] = [], all: readonly DiscoveryEntity[] = [], now = new Date()): string {
  const blurb = listingBlurb(entity);
  switch (entity.kind) {
    case 'event': {
      const place = eventPlace(entity);
      const area = tidy(entity.neighbourhood);
      const where = place ? ` at ${place}${area && area !== place ? `, ${area}` : ''}` : '';
      const facts = `${entity.cancelled ? 'Cancelled. Was scheduled for ' : ''}${eventWhenLong(entity)}${where}, Calgary.`;
      return clip([facts, priceLine(entity), blurb].filter(Boolean).join(' '), DESCRIPTION_MAX);
    }
    case 'market': {
      const next = upcomingOccurrences(occurrences, entity.id, now).find(o => !o.cancelled);
      const place = tidy(entity.venue) || tidy(entity.neighbourhood);
      const when = next ? `Next market ${longDay.format(new Date(next.start))}, ${clock.format(new Date(next.start))} to ${clock.format(new Date(next.end))}${place ? ` at ${place}` : ''}.` : '';
      return clip([when, blurb].filter(Boolean).join(' '), DESCRIPTION_MAX);
    }
    case 'business': {
      const upcoming = organizerEvents(entity.id, all, now.getTime()).length;
      const events = upcoming ? `${upcoming} upcoming event${upcoming === 1 ? '' : 's'} listed.` : '';
      const address = tidy(entity.address);
      const at = address && address !== 'Calgary, AB' ? `${address}.` : '';
      return clip([blurb, events, at].filter(Boolean).join(' '), DESCRIPTION_MAX);
    }
    case 'neighbourhood':
      return clip(`${blurb} Events, markets and local places in and near ${tidy(entity.title)}, Calgary.`, DESCRIPTION_MAX);
    case 'guide':
      return clip(blurb, DESCRIPTION_MAX);
  }
}

export interface Crumb { name: string; path: string }

/** Home › hub › listing. */
export function listingBreadcrumbs(entity: Pick<DiscoveryEntity, 'kind' | 'slug' | 'title'>): Crumb[] {
  const section = DISCOVERY_SECTIONS.find(s => s.kind === entity.kind)!;
  return [{ name: 'Home', path: '/' }, { name: section.label, path: section.path }, { name: tidy(entity.title), path: entityPath(entity) }];
}

const upcomingEvent = (e: DiscoveryEntity, now: number): e is Event =>
  e.kind === 'event' && !e.cancelled && Number.isFinite(Date.parse(e.end)) && Date.parse(e.end) > now && publishedInventory(e, new Date(now));

/** The event page's "More like this": shared interests, then the same neighbourhood, soonest first. */
export function moreLikeThis(entity: Event, all: readonly DiscoveryEntity[], now = Date.now(), limit = 3): Event[] {
  const interests: EventInterestId[] = interestsFor(entity).filter(i => i !== 'free');
  return all
    .filter((e): e is Event => upcomingEvent(e, now) && e.id !== entity.id)
    .map(e => ({ e, score: interestsFor(e).filter(i => interests.includes(i)).length * 2 + (e.neighbourhood && e.neighbourhood === entity.neighbourhood ? 1 : 0) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score || Date.parse(a.e.start) - Date.parse(b.e.start))
    .slice(0, limit)
    .map(x => x.e);
}

/** What else is on at the same venue, one per series, soonest first. */
export function moreAtVenue(entity: Event, all: readonly DiscoveryEntity[], now = Date.now(), limit = 4): Event[] {
  const venue = tidy(entity.venue).toLowerCase();
  if (!venue) return [];
  const own = tidy(entity.title).toLowerCase();
  const seen = new Set<string>([own]);
  return all
    .filter((e): e is Event => upcomingEvent(e, now) && e.id !== entity.id && tidy(e.venue).toLowerCase() === venue)
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
    .filter(e => { const t = tidy(e.title).toLowerCase(); if (seen.has(t)) return false; seen.add(t); return true; })
    .slice(0, limit);
}

export interface RelatedLink { title: string; path: string; note?: string }
export interface RelatedGroup { heading: string; links: RelatedLink[] }

const shortWhen = calgaryDateTimeFormat('en-CA', { timeZone: 'America/Edmonton', weekday: 'short', month: 'short', day: 'numeric' });
const whenNote = (iso?: string) => (iso ? shortWhen.format(new Date(iso)) : undefined);
const link = (e: DiscoveryEntity, note?: string): RelatedLink => ({ title: tidy(e.title), path: entityPath(e), ...(note ? { note } : {}) });

/**
 * Pages a listing links on to, in the order its page shows them: who runs it, what else
 * is on there or nearby, and the neighbourhood and hub it belongs to.
 */
export function relatedGroups(entity: DiscoveryEntity, all: readonly DiscoveryEntity[], occurrences: readonly MarketOccurrence[], now = new Date()): RelatedGroup[] {
  const t = now.getTime();
  const hoods = all.filter((e): e is Neighbourhood => e.kind === 'neighbourhood' && publishedInventory(e, now));
  const groups: RelatedGroup[] = [];
  // A page is linked once, in the first group that names it.
  const used = new Set<string>([entityPath(entity)]);
  const push = (heading: string, links: RelatedLink[]) => {
    const fresh = links.filter(l => !used.has(l.path));
    fresh.forEach(l => used.add(l.path));
    if (fresh.length) groups.push({ heading, links: fresh });
  };
  const nextMarket = (m: Market) => upcomingOccurrences(occurrences, m.id, now).find(o => !o.cancelled)?.start;

  if (entity.kind === 'event') {
    const org = organizerProfile(entity, all);
    if (org) {
      push(`Who's behind it: ${tidy(org.title)}`, [link(org, 'Organizer profile'), ...organizerEvents(org.id, all, t).filter(e => e.id !== entity.id).slice(0, 3).map(e => link(e, whenNote(e.start)))]);
    }
    if (entity.venue) push(`Also at ${tidy(entity.venue)}`, moreAtVenue(entity, all, t).map(e => link(e, whenNote(e.start))));
    push('More like this', moreLikeThis(entity, all, t).map(e => link(e, [whenNote(e.start), e.venue || e.neighbourhood].filter(Boolean).join(' · '))));
    const hood = hoodOf(entity, hoods);
    push('Explore', [
      ...(hood ? [link(hood, 'Neighbourhood guide')] : []),
      { title: 'Events in Calgary this week', path: '/events' },
      { title: 'This weekend in Calgary', path: '/events/this-weekend' },
    ]);
  }

  if (entity.kind === 'market') {
    const org = entity.organizerEntityId ? all.find((e): e is Business => e.kind === 'business' && e.id === entity.organizerEntityId && publishedInventory(e, now)) : undefined;
    if (org) push(`Who runs it: ${tidy(org.title)}`, [link(org, 'Organizer profile'), ...organizerMarkets(org.id, all, t).filter(m => m.id !== entity.id).slice(0, 3).map(m => link(m))]);
    const others = all
      .filter((e): e is Market => e.kind === 'market' && e.id !== entity.id && publishedInventory(e, now))
      .map(m => ({ m, next: nextMarket(m) }))
      .filter(x => x.next)
      .sort((a, b) => Date.parse(a.next!) - Date.parse(b.next!))
      .slice(0, 6);
    push('Other Calgary markets coming up', others.map(x => link(x.m, whenNote(x.next))));
    const hood = hoodOf(entity, hoods);
    push('Explore', [
      ...(hood ? [link(hood, 'Neighbourhood guide')] : []),
      { title: 'Calgary markets this weekend', path: '/markets/this-weekend' },
      { title: 'All Calgary farmers’ and makers’ markets', path: '/markets' },
    ]);
  }

  if (entity.kind === 'business') {
    push(`Upcoming events from ${tidy(entity.title)}`, organizerEvents(entity.id, all, t).slice(0, 10).map(e => link(e, [whenNote(e.start), e.venue].filter(Boolean).join(' · '))));
    push(`Markets run by ${tidy(entity.title)}`, organizerMarkets(entity.id, all, t).map(m => link(m, whenNote(nextMarket(m)))));
    const hood = hoodOf(entity, hoods);
    push('Explore', [...(hood ? [link(hood, 'Neighbourhood guide')] : []), { title: 'Local places in Calgary', path: '/local' }]);
  }

  if (entity.kind === 'neighbourhood') {
    const l = linksFor(entity, all, occurrences, now);
    const close = <T,>(xs: { closeness: string; entity: T; when?: string }[]) => xs.filter(x => x.closeness !== 'quadrant');
    push(`Events in and near ${tidy(entity.title)}`, l.events.slice(0, 8).map(x => link(x.entity, whenNote(x.when))));
    push(`Markets in and near ${tidy(entity.title)}`, close(l.markets).slice(0, 6).map(x => link(x.entity, whenNote(x.when))));
    push(`Local places in and near ${tidy(entity.title)}`, close(l.places).slice(0, 8).map(x => link(x.entity)));
    push('Guides', l.guides.map(g => link(g)));
    push('Nearby neighbourhoods', l.neighbours.slice(0, 4).map(n => link(n.hood, n.hood.quadrant)));
  }

  if (entity.kind === 'guide') {
    const byId = new Map(all.map(e => [e.id, e]));
    const listed = [...entity.entries.map(x => x.entityId), ...(entity.stops ?? []).map(s => s.entityId)]
      .map(id => (id ? byId.get(id) : undefined))
      .filter((e): e is DiscoveryEntity => !!e && publishedInventory(e, now));
    push('Listings in this guide', [...new Map(listed.map(e => [e.id, link(e)])).values()]);
    push('More Calgary guides', entity.relatedGuideIds.map(id => byId.get(id)).filter((e): e is DiscoveryEntity => !!e && publishedInventory(e, now)).map(e => link(e)));
  }

  return groups;
}
