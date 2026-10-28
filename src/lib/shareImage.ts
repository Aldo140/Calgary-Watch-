import type { DiscoveryEntity, EntityImage, Event } from '../types/discovery';
import { DISCOVERY_SECTIONS, type DiscoveryRepository } from './discovery';
import { calgaryDateTimeFormat } from './calgaryTz';
import { calendarDateForDisplay, lastEventDate } from './eventSchedule';
import { upcomingOccurrences } from './discoveryCalendar';
import { eventDateLabel } from './listingSeo';
import { organizerEvents } from './organizations';
import { BEST_PATH, bestCategory, publishersOf, rankPlaces } from './bestOf';
import { BEST_CATEGORIES } from '../content/bestOf';
import { SPOTLIGHTS } from '../content/spotlights';
import { SPOTLIGHT_PATH, spotlightBySlug, spotlightPath } from './spotlights';

/**
 * Link-preview cards: the picture that shows up when someone shares a
 * CalgaryWatch link in iMessage, WhatsApp, Facebook, Slack, LinkedIn or X.
 *
 * Every listing, hub and Best of Calgary list gets its own 1200×630 card,
 * drawn at build time by scripts/seo/shareCards.tsx from what this file says
 * goes on it. Only facts the listing already holds appear: its title, dates,
 * venue, neighbourhood and price. Shared by the prerender, SeoManager and the
 * card renderer so the tag and the file always agree.
 */

export const SHARE_CARD = { width: 1200, height: 630 } as const;
export const SHARE_ORIGIN = 'https://calgarywatch.ca';
/** Shown for routes without a card of their own. JPEG: WhatsApp and LinkedIn still trip on WebP previews. */
export const DEFAULT_SHARE_IMAGE = `${SHARE_ORIGIN}/images/hero/calgarywatch-social-v1.jpg`;
export const DEFAULT_SHARE_ALT = 'An illustrated Calgary skyline with the Bow River, the Peace Bridge and the Rockies behind, under the CalgaryWatch name.';

export type CardTheme = 'event' | 'market' | 'local' | 'neighbourhood' | 'guide' | 'best' | 'hub' | 'spotlight';

/** A calendar-page block for the right side when there's no photo. */
export interface DateBlock { eyebrow: string; month: string; day: string; weekday: string; note?: string }

export interface ShareCard {
  /** Path under the site root, e.g. /og/events/little-shop.jpg */
  path: string;
  theme: CardTheme;
  /** Small caps label above the title. */
  label: string;
  title: string;
  /** Up to three short fact lines under the title. */
  lines: string[];
  /** A pill beside the facts, e.g. Free or $35–$90. */
  pill?: string;
  photo?: { src: string; poster: boolean };
  dateBlock?: DateBlock;
  /** Big monogram or word when there's no photo and no date. */
  mark?: string;
  /** Ranked names for Best of Calgary covers. */
  ranked?: string[];
  /** Number the ranked names (a ranked list) rather than star them (an index of lists). */
  numbered?: boolean;
  colors?: { from: string; to: string; ink: string };
  footer: string;
  alt: string;
}

const tidy = (s: string | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();
const tz = { timeZone: 'America/Edmonton' } as const;
const monthFmt = calgaryDateTimeFormat('en-CA', { ...tz, month: 'short' });
const dayFmt = calgaryDateTimeFormat('en-CA', { ...tz, day: 'numeric' });
const weekdayFmt = calgaryDateTimeFormat('en-CA', { ...tz, weekday: 'long' });
const shortWeekday = calgaryDateTimeFormat('en-CA', { ...tz, weekday: 'short' });
const shortDay = calgaryDateTimeFormat('en-CA', { ...tz, month: 'short', day: 'numeric' });
const clock = calgaryDateTimeFormat('en-CA', { ...tz, hour: 'numeric', minute: '2-digit' });

/** 7:30 p.m. → 7:30 pm, 7:00 p.m. → 7 pm: shorter on a card. */
const time = (d: Date) => clock.format(d).replace(/\s?([ap])\.?m\.?/i, (_, x) => ` ${x.toLowerCase()}m`).replace(':00', '');

export function cardPath(pathname: string): string {
  const clean = pathname.replace(/\/+$/, '') || '/';
  if (clean === '/') return '/og/home.jpg';
  return `/og${clean}.jpg`;
}

function block(eyebrow: string, d: Date, note?: string): DateBlock {
  return { eyebrow, month: monthFmt.format(d).replace('.', '').toUpperCase(), day: dayFmt.format(d), weekday: weekdayFmt.format(d), ...(note ? { note } : {}) };
}

function photoOf(entity: DiscoveryEntity): ShareCard['photo'] {
  const imgs = (entity as { images?: EntityImage[] }).images;
  const img = entity.image ?? (Array.isArray(imgs) ? imgs[0] : undefined);
  if (!img?.src) return undefined;
  return { src: img.src, poster: img.presentation === 'poster' };
}

function eventCard(e: Event, path: string): ShareCard {
  const dateOnly = e.schedulePrecision === 'date';
  const first = dateOnly ? calendarDateForDisplay(e.start) : new Date(e.start);
  const last = dateOnly ? calendarDateForDisplay(lastEventDate(e.end)) : new Date(e.end);
  const multiDay = shortDay.format(first) !== shortDay.format(last) && last > first;
  const when = multiDay
    ? eventDateLabel(e)
    : `${shortWeekday.format(first).replace('.', '')}, ${shortDay.format(first)}${dateOnly ? '' : ` · ${time(first)}`}`;
  const venue = tidy(e.venue);
  const hood = tidy(e.neighbourhood);
  const where = [venue, hood && hood !== venue ? hood : ''].filter(Boolean).join(', ');
  const [low, high] = e.priceRange ?? [];
  const pill = e.cancelled ? 'Cancelled'
    : e.pricing === 'free' ? 'Free'
    : low !== undefined && high !== undefined ? (low === high ? `$${low}` : `$${low}–$${high}`)
    : undefined;
  const category = tidy(e.categories[0]);
  return {
    path,
    theme: 'event',
    label: category ? `Event · ${category}` : 'Event',
    title: tidy(e.title),
    lines: [when, where || 'Calgary'].filter(Boolean),
    ...(pill ? { pill } : {}),
    photo: photoOf(e),
    dateBlock: block(multiDay ? 'Starts' : 'Event', first, multiDay ? `Until ${shortDay.format(last)}` : undefined),
    footer: 'calgarywatch.ca/events',
    alt: `${tidy(e.title)}: ${when}${where ? ` at ${where}` : ''}, Calgary. Listing card from CalgaryWatch.`,
  };
}

/** What goes on the card for a listing. */
export function listingCard(entity: DiscoveryEntity, repository: DiscoveryRepository, now = new Date()): ShareCard {
  const pagePath = DISCOVERY_SECTIONS.find(s => s.kind === entity.kind)!.path + '/' + entity.slug;
  const path = cardPath(pagePath);
  const footer = `calgarywatch.ca${DISCOVERY_SECTIONS.find(s => s.kind === entity.kind)!.path}`;
  const title = tidy(entity.title);
  switch (entity.kind) {
    case 'event':
      return eventCard(entity, path);
    case 'market': {
      const next = upcomingOccurrences(repository.occurrences(), entity.id, now).find(o => !o.cancelled);
      const where = [tidy(entity.venue), tidy(entity.neighbourhood)].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(', ');
      const nextLine = next ? `Next: ${shortWeekday.format(new Date(next.start)).replace('.', '')}, ${shortDay.format(new Date(next.start))} · ${time(new Date(next.start))}–${time(new Date(next.end))}` : '';
      return {
        path, theme: 'market', label: 'Market', title,
        lines: [nextLine, where || 'Calgary'].filter(Boolean),
        photo: photoOf(entity),
        ...(next ? { dateBlock: block('Next market', new Date(next.start)) } : { mark: 'Market' }),
        footer,
        alt: `${title}${next ? `, next market ${shortDay.format(new Date(next.start))}` : ''}${where ? ` at ${where}` : ''}, Calgary. Market card from CalgaryWatch.`,
      };
    }
    case 'business': {
      const upcoming = organizerEvents(entity.id, repository.list(), now.getTime()).length;
      const hood = tidy(entity.neighbourhood);
      const category = tidy(entity.categories[0]);
      return {
        path, theme: 'local', label: category ? `Local · ${category}` : 'Local',
        title,
        lines: [hood ? `${hood}, Calgary` : 'Calgary', upcoming ? `${upcoming} upcoming event${upcoming === 1 ? '' : 's'}` : ''].filter(Boolean),
        photo: photoOf(entity),
        mark: initials(title),
        footer,
        alt: `${title}${hood ? ` in ${hood}` : ''}, Calgary. Local profile card from CalgaryWatch.`,
      };
    }
    case 'neighbourhood':
      return {
        path, theme: 'neighbourhood', label: `Neighbourhood · ${entity.quadrant}`,
        title,
        lines: ['Events, markets and local places'],
        photo: photoOf(entity),
        mark: entity.quadrant,
        footer,
        alt: `${title}, a ${entity.quadrant} Calgary neighbourhood. Neighbourhood guide card from CalgaryWatch.`,
      };
    case 'guide':
      return {
        path, theme: 'guide', label: 'Guide', title,
        lines: [entity.facts ? [entity.facts.time, entity.facts.cost].filter(Boolean).join(' · ') : ''].filter(Boolean),
        photo: photoOf(entity),
        mark: entity.cover?.label ?? 'Guide',
        ...(entity.cover ? { colors: { from: entity.cover.from, to: entity.cover.to, ink: entity.cover.ink } } : {}),
        footer,
        alt: `${title}: a Calgary guide from CalgaryWatch.`,
      };
  }
}

function initials(name: string): string {
  const words = name.replace(/^the\s+/i, '').split(/[\s&+/-]+/).filter(w => /^[\p{L}\p{N}]/u.test(w));
  return (words.slice(0, 2).map(w => w[0]).join('') || name.slice(0, 1)).toUpperCase();
}

const HUB_CARDS: Record<string, { label: string; title: string; line: string; photo?: string }> = {
  '/events': { label: 'Events', title: 'What’s on in Calgary', line: 'Theatre, concerts, festivals and family days', photo: '/images/hero/calgarywatch-live-watch-v1.webp' },
  '/markets': { label: 'Markets', title: 'Calgary’s markets, with real dates', line: 'Farmers’ and makers’ markets, next dates and hours', photo: '/images/hero/calgarywatch-city-guide-v1.webp' },
  '/local': { label: 'Local', title: 'The people behind Calgary’s events', line: 'Venues, organizers and local places, with what’s coming up' },
  '/neighbourhoods': { label: 'Neighbourhoods', title: 'Calgary, one neighbourhood at a time', line: 'What’s there and what’s on, from Inglewood to Kensington' },
  '/guides': { label: 'Guides', title: 'Days out in Calgary', line: 'Self-guided walks, markets and neighbourhoods' },
};

function hubCount(path: string, repository: DiscoveryRepository, now: Date): string {
  const kind = DISCOVERY_SECTIONS.find(s => s.path === path)?.kind;
  if (!kind) return '';
  const items = repository.list().filter(e => e.kind === kind && (e.kind !== 'event' || new Date(e.end).getTime() >= now.getTime()));
  if (!items.length) return '';
  const noun = { event: 'upcoming events', market: 'markets', business: 'local profiles', neighbourhood: 'neighbourhoods', guide: 'guides' }[kind];
  return `${items.length} ${noun}`;
}

function hubCard(hubPath: string, repository: DiscoveryRepository, now: Date): ShareCard | undefined {
  const hub = HUB_CARDS[hubPath];
  if (!hub) return undefined;
  const count = hubCount(hubPath, repository, now);
  return { path: cardPath(hubPath), theme: 'hub', label: hub.label, title: hub.title, lines: [hub.line, count].filter(Boolean), photo: { src: hub.photo ?? '/images/hero/calgarywatch-social-v1.webp', poster: false }, footer: `calgarywatch.ca${hubPath}`, alt: `${hub.title}. ${hub.line}. CalgaryWatch.` };
}

const bestIndexCard = (): ShareCard => ({
  path: cardPath(BEST_PATH), theme: 'best', label: 'Best of Calgary', title: 'Best of Calgary',
  lines: ['Ranked only by who independently names them', 'Nothing paid for'],
  ranked: BEST_CATEGORIES.map(c => c.label),
  mark: 'Best',
  colors: { from: '#06162f', to: '#1554d1', ink: '#ffdf4f' },
  footer: `calgarywatch.ca${BEST_PATH}`,
  alt: 'Best of Calgary: lists ranked only by independent guides and awards. CalgaryWatch.',
});

/** Every card the site publishes, for the renderer. */
export function allShareCards(repository: DiscoveryRepository, now = new Date()): ShareCard[] {
  return [
    ...repository.list().map(e => listingCard(e, repository, now)),
    ...Object.keys(HUB_CARDS).map(path => hubCard(path, repository, now)!),
    bestIndexCard(),
    ...BEST_CATEGORIES.map(c => bestCard(c.slug)!),
    ...SPOTLIGHTS.map(s => spotlightCard(s.slug)!),
  ];
}

function bestCard(slug: string): ShareCard | undefined {
  const c = bestCategory(slug);
  if (!c) return undefined;
  const top = rankPlaces(c.places).slice(0, 3);
  const sources = new Set(c.places.flatMap(p => publishersOf(p))).size;
  const path = `${BEST_PATH}/${c.slug}`;
  return {
    path: cardPath(path), theme: 'best', label: 'Best of Calgary',
    title: `The best ${c.noun} in Calgary`,
    lines: [sources > 1 ? `Ranked by ${sources} independent guides and awards` : 'Every pick cited to its source'],
    numbered: true,
    ranked: top.map(p => p.name),
    mark: c.coverWord,
    colors: { from: c.from, to: c.to, ink: '#06162f' },
    footer: `calgarywatch.ca${path}`,
    alt: `The best ${c.noun} in Calgary${top.length ? `: ${top.map(p => p.name).join(', ')}` : ''}. CalgaryWatch.`,
  };
}

/** A CalgaryWatch Spotlight: the feature's own headline over a marquee mark. No photo unless one is permitted. */
function spotlightCard(slug: string): ShareCard | undefined {
  const s = spotlightBySlug(slug);
  if (!s) return undefined;
  const path = spotlightPath(s);
  const [lead, sub] = s.title.split(': ');
  return {
    path: cardPath(path), theme: 'spotlight', label: 'CalgaryWatch Spotlight',
    title: lead,
    lines: [sub ?? s.name, s.card.line],
    pill: s.partnerLabel,
    mark: s.card.mark,
    colors: { from: '#2a1b3d', to: '#ff5a4e', ink: '#ffdf4f' },
    footer: `calgarywatch.ca${path}`,
    alt: `${s.title}. ${s.card.line}. A CalgaryWatch Spotlight.`,
  };
}

/** The card for a route, or undefined when the route uses the default picture. */
export function shareCardFor(pathname: string, repository: DiscoveryRepository, now = new Date()): ShareCard | undefined {
  const clean = pathname.replace(/\/+$/, '') || '/';
  if (HUB_CARDS[clean]) return hubCard(clean, repository, now);
  if (clean === BEST_PATH) return bestIndexCard();
  if (clean.startsWith(`${BEST_PATH}/`)) return bestCard(clean.slice(BEST_PATH.length + 1));
  if (clean.startsWith(`${SPOTLIGHT_PATH}/`)) return spotlightCard(clean.slice(SPOTLIGHT_PATH.length + 1));
  const [section, slug] = clean.split('/').filter(Boolean);
  const kind = DISCOVERY_SECTIONS.find(s => s.path === `/${section}`)?.kind;
  const entity = kind && slug ? repository.find(kind, slug) : undefined;
  return entity ? listingCard(entity, repository, now) : undefined;
}
