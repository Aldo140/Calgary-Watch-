import { SPOTLIGHTS, type Spotlight } from '../content/spotlights';
import type { DiscoveryEntity, Event } from '../types/discovery';
import { logProductEvent } from './productEvents';
import { calgaryDateTimeFormat } from './calgaryTz';

export const SPOTLIGHT_PATH = '/spotlight';
export const spotlightPath = (s: Pick<Spotlight, 'slug'>) => `${SPOTLIGHT_PATH}/${s.slug}`;
export const spotlightBySlug = (slug: string | undefined) => SPOTLIGHTS.find(s => s.slug === slug);

/** Whether the homepage / events cards should run now. The feature page itself never expires. */
export function promoActive(s: Spotlight, now = new Date()): boolean {
  const t = now.getTime();
  return t >= Date.parse(s.promo.from) && t < Date.parse(s.promo.until);
}

/** The spotlight that is promoting itself right now, if any. */
export function activeSpotlight(now = new Date()): Spotlight | undefined {
  return SPOTLIGHTS.find(s => promoActive(s, now));
}

/** The spotlight whose card belongs on this listing (e.g. every ScreamFest night). */
export function spotlightForEntity(entity: Pick<DiscoveryEntity, 'sourceId'>): Spotlight | undefined {
  return entity.sourceId ? SPOTLIGHTS.find(s => s.relatedSourceIds.includes(entity.sourceId!)) : undefined;
}

/**
 * The nights still to come, from the related listings we already carry (so the
 * feature and the ScreamFest listing can never disagree about the dates).
 */
export function upcomingNights(s: Spotlight, entities: readonly DiscoveryEntity[], now = new Date()): Event[] {
  return entities
    .filter((e): e is Event => e.kind === 'event' && !!e.sourceId && s.relatedSourceIds.includes(e.sourceId) && !e.cancelled && Date.parse(e.end) > now.getTime())
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
}

const nightFmt = calgaryDateTimeFormat('en-CA', { timeZone: 'America/Edmonton', weekday: 'short', month: 'short', day: 'numeric' });
/** "Thu, Oct 29" */
export const nightLabel = (e: Pick<Event, 'start'>) => nightFmt.format(new Date(e.start)).replace(/\./g, '');

/** "Last 3 nights" / "Last night: Sat, Oct 31" / "Tonight is the last night" */
export function nightsLine(nights: readonly Event[], now = new Date()): string {
  if (!nights.length) return 'This year’s run has ended';
  const today = calgaryDay(now);
  if (nights.length === 1) return calgaryDay(new Date(nights[0].start)) === today ? 'Tonight is the last night' : `Last night: ${nightLabel(nights[0])}`;
  return `${nights.length} nights left, to ${nightLabel(nights[nights.length - 1])}`;
}
const dayFmt = calgaryDateTimeFormat('en-CA', { timeZone: 'America/Edmonton', year: 'numeric', month: '2-digit', day: '2-digit' });
const calgaryDay = (d: Date) => dayFmt.format(d);

/* ── Measurement ─────────────────────────────────────────────────────────
 * Writes to the existing product_events collection (no outside trackers).
 * Every event carries the spotlight slug as `spot`, and a per-tab random
 * session id as `sid` (the same one page_views uses) so the report can count
 * people as well as clicks. No names, no URLs, no location.
 */

export type SpotlightPlacement = 'feature' | 'home' | 'events' | 'event-page';

function sessionId(): string | undefined {
  try { return sessionStorage.getItem('cw_session_id')?.slice(0, 32) || undefined; } catch { return undefined; }
}

/** A tap on an outbound link (festival site, tickets, a film's trailer…). */
export function trackSpotlightLink(s: Spotlight, link: string, at: SpotlightPlacement = 'feature'): void {
  logProductEvent('spotlight_link_click', { spot: s.slug, link: link.slice(0, 32), at, sid: sessionId() });
}

/** A tap on a promo card that leads to the feature. */
export function trackSpotlightCard(s: Spotlight, at: SpotlightPlacement): void {
  logProductEvent('spotlight_card_click', { spot: s.slug, at, sid: sessionId() });
}

/** The card was on screen. Once per tab per placement, so a scroll back up doesn't count twice. */
export function trackSpotlightSeen(s: Spotlight, at: SpotlightPlacement): void {
  const key = `cw-spot-seen:${s.slug}:${at}`;
  try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, '1'); } catch { /* storage blocked: still count it */ }
  logProductEvent('spotlight_card_seen', { spot: s.slug, at, sid: sessionId() });
}

/** How far into the feature a reader got: 'middle' or 'end'. Once per tab. */
export function trackSpotlightRead(s: Spotlight, depth: 'middle' | 'end'): void {
  const key = `cw-spot-read:${s.slug}:${depth}`;
  try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, '1'); } catch { /* ignore */ }
  logProductEvent('spotlight_read', { spot: s.slug, depth, sid: sessionId() });
}

/* ── Structured data ─────────────────────────────────────────────────── */

/**
 * Article JSON-LD for a spotlight, `about` the festival as an Event. Only held
 * facts: the venue, the run of nights we list, the organizer's name and the
 * ticket link. No price (ScreamFest packages vary) and no performers.
 */
export function spotlightJsonLd(s: Spotlight, origin: string, image: string, entities: readonly DiscoveryEntity[]): object {
  const url = `${origin}${spotlightPath(s)}`;
  const nights = entities
    .filter((e): e is Event => e.kind === 'event' && !!e.sourceId && s.relatedSourceIds.includes(e.sourceId) && !e.cancelled)
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  const tickets = s.links.find(l => l.id === 'tickets');
  const festival = s.links.find(l => l.id === 'festival');
  const event = nights.length ? {
    '@type': 'Event',
    name: `${s.name} Film Festival at ScreamFest`,
    description: 'Short horror films screening in the bar at ScreamFest on its operating nights, included with ScreamFest admission.',
    startDate: nights[0].start,
    endDate: nights[nights.length - 1].end,
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: { '@type': 'Place', name: 'GMC Stadium, Stampede Park', address: { '@type': 'PostalAddress', streetAddress: '2200 Stampede Trail SE', addressLocality: 'Calgary', addressRegion: 'AB', addressCountry: 'CA' } },
    organizer: { '@type': 'Person', name: s.organizer.name },
    ...(festival ? { url: festival.url } : {}),
    ...(tickets ? { offers: { '@type': 'Offer', url: tickets.url } } : {}),
    image,
  } : undefined;
  return {
    '@type': 'Article',
    headline: s.title,
    description: s.dek,
    url,
    mainEntityOfPage: url,
    datePublished: s.published,
    dateModified: s.updated,
    image,
    inLanguage: 'en-CA',
    author: { '@type': 'Organization', name: 'CalgaryWatch', url: `${origin}/` },
    publisher: { '@type': 'Organization', name: 'CalgaryWatch', url: `${origin}/`, logo: { '@type': 'ImageObject', url: `${origin}/icon-512.png` } },
    ...(event ? { about: event } : {}),
    citation: s.sources.map(src => src.url),
  };
}
