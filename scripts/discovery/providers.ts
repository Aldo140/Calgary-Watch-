import type { InventorySubmissionInput, MarketSubmissionInput } from '../../src/types/discovery';
export interface SourceConfig { id: string; name: string; approved: boolean; hosts: string[]; kind: 'official' | 'editorial'; autoPublish?: boolean; feedUrl?: string; provider?: 'ticketmaster' | 'recurring-market' | 'ics'; markets?: RecurringMarketDefinition[]; ics?: IcsSourceOptions }
export interface SourceRecord { id: string; input: InventorySubmissionInput; cancelled?: boolean }
export interface InventoryProvider { source: SourceConfig; fetch(): Promise<SourceRecord[]> }
/** Explicit JSON contract; adapters translate provider-specific APIs into this shape. */
export class JsonFeedProvider implements InventoryProvider {
  constructor(public source: SourceConfig) {}
  async fetch(): Promise<SourceRecord[]> {
    if (!this.source.approved || !this.source.feedUrl || !this.source.hosts.includes(new URL(this.source.feedUrl).hostname) || !this.source.feedUrl.startsWith('https://')) throw Error('Unapproved feed endpoint');
    const response = await fetch(this.source.feedUrl, { signal: AbortSignal.timeout(15000), redirect: 'error', headers: { Accept:'application/json' } });
    if (!response.ok) throw Error(`Feed failed: ${response.status}`);
    const body = await response.text(); if (body.length > 2_000_000) throw Error('Feed exceeds limit');
    const records = JSON.parse(body); if (!Array.isArray(records) || records.length > 500) throw Error('Expected at most 500 source records');
    return records;
  }
}
export class EditorialFileProvider implements InventoryProvider {
  constructor(public source: SourceConfig, private records: SourceRecord[]) {}
  async fetch() { return this.records; }
}

interface TicketmasterEvent {
  id?: string; name?: string; description?: string; info?: string; url?: string;
  dates?: { start?: { localDate?: string; localTime?: string }; end?: { localDate?: string; localTime?: string } };
  priceRanges?: Array<{ min?: number; max?: number }>;
  classifications?: Array<{ segment?: { name?: string }; genre?: { name?: string } }>;
  promoter?: { name?: string };
  promoters?: Array<{ name?: string }>;
  images?: Array<{ url?: string; width?: number; height?: number; ratio?: string }>;
  _embedded?: { venues?: Array<{ name?: string; address?: { line1?: string }; city?: { name?: string }; state?: { stateCode?: string }; country?: { countryCode?: string }; location?: { latitude?: string; longitude?: string } }>; attractions?: Array<{ name?: string }> };
}

export function calgaryOffset(local: string): string {
  const wall = Date.parse(`${local}Z`);
  if (!Number.isFinite(wall)) throw Error(`Invalid Ticketmaster local date: ${local}`);
  let instant = wall;
  for (let i = 0; i < 3; i++) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(instant).map(part => [part.type, part.value]));
    const localAsUtc = Date.parse(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`);
    instant += wall - localAsUtc;
  }
  const minutes = Math.round((wall - instant) / 60000); const sign = minutes >= 0 ? '+' : '-'; const absolute = Math.abs(minutes);
  return `${sign}${String(Math.floor(absolute / 60)).padStart(2, '0')}:${String(absolute % 60).padStart(2, '0')}`;
}

function localDateTime(date?: string, time?: string): string | null {
  if (!date || !time) return null;
  return `${date}T${time}${calgaryOffset(`${date}T${time}`)}`;
}

function estimatedEnd(start: string): string {
  return new Date(Date.parse(start) + 3 * 60 * 60 * 1000).toISOString();
}

function ticketmasterDate(value: Date): string {
  return value.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function clean(value: string | undefined, fallback: string): string {
  return (value?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || fallback).slice(0, 5_000);
}

/** Ticketmaster is the ticketing/listing source, not necessarily who organizes the
 * event — fall back through promoter(s), then the headline attraction, before
 * admitting Ticketmaster doesn't say. Never claim Ticketmaster itself is the organizer. */
function ticketmasterOrganizer(event: TicketmasterEvent): string {
  const promoter = event.promoter?.name?.trim() || event.promoters?.find(p => p.name?.trim())?.name?.trim();
  if (promoter) return clean(promoter, promoter);
  const attraction = event._embedded?.attractions?.find(a => a.name?.trim())?.name?.trim();
  if (attraction) return clean(attraction, attraction);
  return 'Organizer not listed — see ticket source';
}

/** Ticketmaster's Discovery API supplies event-specific promotional images as part of
 * normal, intended use of the API — not scraped or hotlinked from elsewhere. Prefer a
 * wide 16:9 crop (what the card/hero layouts expect), else the largest image offered.
 * Credit is always attached so displayed photography carries visible provenance. */
function ticketmasterImage(event: TicketmasterEvent, title: string): { src: string; alt: string; credit: string } | undefined {
  const candidates = (event.images ?? []).filter((img): img is { url: string; width?: number; height?: number; ratio?: string } => !!img.url && /^https:\/\//.test(img.url));
  if (!candidates.length) return undefined;
  const best = candidates.find(img => img.ratio === '16_9' && (img.width ?? 0) >= 640) ?? [...candidates].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0];
  return { src: best.url, alt: `Promotional image for ${title}`, credit: 'Image via Ticketmaster' };
}

/** Discards the coordinate pair rather than store it when the venue payload has none,
 * or when it's the common "0,0" placeholder some feeds use for "not actually known." */
function ticketmasterCoordinates(venue?: { location?: { latitude?: string; longitude?: string } }): { lat: number; lng: number } | undefined {
  const lat = Number(venue?.location?.latitude); const lng = Number(venue?.location?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) return undefined;
  return { lat, lng };
}

function ticketmasterCategories(event: TicketmasterEvent): string[] {
  const names = (event.classifications ?? []).flatMap(classification => [classification.segment?.name, classification.genre?.name]).filter(value => Boolean(value?.trim())).map(value => value!.trim().toLowerCase());
  const categories = new Set<string>();
  if (names.some(name => /music|concert/.test(name))) categories.add('music');
  if (names.some(name => /arts|theatre|theater|film|comedy/.test(name))) categories.add('arts');
  if (names.some(name => /sport/.test(name))) categories.add('sports');
  if (names.some(name => /family/.test(name))) categories.add('family');
  if (names.length) categories.add(names[0]);
  return [...categories].slice(0, 5);
}

/** Ticketmaster's market 108 spans southern Alberta; the homepage promises Calgary. */
const CALGARY_AREA = /^(calgary|airdrie|cochrane|chestermere|okotoks|tsuut['’]?ina( nation)?)$/i;
/** Listings that are products sold alongside a show, not things to go to. */
const NOT_AN_EVENT = /\b(parking|upsell|upgrade|vip (package|experience|upgrade)|premium (package|seating upgrade)|hospitality package|add-?on|voucher|gift card|merch(andise)? bundle|fast lane|lounge access|tailgate pass|season tickets?)\b/i;

export function mapTicketmasterEvents(events: TicketmasterEvent[]): SourceRecord[] {
  return events.flatMap(event => {
    if (NOT_AN_EVENT.test(event.name ?? '') || !CALGARY_AREA.test(event._embedded?.venues?.[0]?.city?.name?.trim() ?? '')) return [];
    const start = localDateTime(event.dates?.start?.localDate, event.dates?.start?.localTime);
    const end = localDateTime(event.dates?.end?.localDate, event.dates?.end?.localTime) || (start ? estimatedEnd(start) : null);
    const venue = event._embedded?.venues?.[0];
    if (!event.id || !event.name?.trim() || !event.url?.trim() || !start || !end || venue?.country?.countryCode !== 'CA') return [];
    const address = [venue.address?.line1, venue.city?.name, venue.state?.stateCode].map(value => value?.trim()).filter(Boolean).join(', ');
    if (!address) return [];
    const prices = event.priceRanges?.filter(price => Number.isFinite(price.min) && Number.isFinite(price.max));
    const title = clean(event.name, 'Calgary event');
    const image = ticketmasterImage(event, title);
    const coordinates = ticketmasterCoordinates(venue);
    return [{ id: event.id, input: { kind: 'event', title, summary: clean(event.info || event.description, `${title} in Calgary.`), description: clean(event.description || event.info, `${title}. Check the organizer for current details.`), address, organizer: ticketmasterOrganizer(event), sourceUrl: event.url.trim(), categories: ticketmasterCategories(event), tags: [], start, end, ...(event.dates?.end?.localDate && event.dates?.end?.localTime ? {} : { endTimeEstimated: true }), pricing: prices?.length ? 'paid' : 'unknown', ...(prices?.[0] ? { priceRange: [prices[0].min!, prices[0].max!] as [number, number] } : {}), ...(venue.name?.trim() ? { venue: venue.name.trim() } : {}), ...(image ? { image } : {}), ...(coordinates ? { coordinates } : {}), tickets: event.url.trim() } as InventorySubmissionInput }];
  });
}

export class TicketmasterProvider implements InventoryProvider {
  // Discovery API caps a page at 200 results; Calgary's 90-day window normally fits
  // in one, but a busy season (Stampede, playoffs) can exceed it. Walk pages until
  // the API says there are no more, capped well above anything Calgary plausibly
  // produces in 90 days so a bug elsewhere can't spin this into an unbounded loop.
  private static readonly PAGE_SIZE = 200;
  private static readonly MAX_PAGES = 10;

  constructor(public source: SourceConfig) {}
  async fetch(): Promise<SourceRecord[]> {
    const apiKey = process.env.TICKETMASTER_API_KEY?.trim();
    if (!apiKey) throw Error('TICKETMASTER_API_KEY is not configured');
    const from = new Date(); const to = new Date(from.getTime() + 90 * 24 * 60 * 60 * 1000);
    const events: TicketmasterEvent[] = [];
    let totalPages = 1;
    for (let page = 0; page < totalPages && page < TicketmasterProvider.MAX_PAGES; page++) {
      const url = new URL('https://app.ticketmaster.com/discovery/v2/events.json');
      url.searchParams.set('apikey', apiKey); url.searchParams.set('countryCode', 'CA'); url.searchParams.set('marketId', '108'); url.searchParams.set('startDateTime', ticketmasterDate(from)); url.searchParams.set('endDateTime', ticketmasterDate(to)); url.searchParams.set('includeTBA', 'no'); url.searchParams.set('includeTBD', 'no'); url.searchParams.set('sort', 'date,asc'); url.searchParams.set('size', String(TicketmasterProvider.PAGE_SIZE)); url.searchParams.set('page', String(page));
      const response = await fetch(url, { signal: AbortSignal.timeout(20_000), headers: { Accept: 'application/json', 'User-Agent': 'CalgaryWatch/1.0 (event discovery; contact aldo@calgarywatch.ca)' } });
      if (!response.ok) {
        const detail = (await response.text()).replace(/\s+/g, ' ').slice(0, 300);
        throw Error(`Ticketmaster API returned HTTP ${response.status}${detail ? `: ${detail}` : ''}`);
      }
      const body = await response.json() as { _embedded?: { events?: TicketmasterEvent[] }; page?: { totalPages?: number } };
      events.push(...(body._embedded?.events ?? []));
      totalPages = Math.min(body.page?.totalPages ?? 1, TicketmasterProvider.MAX_PAGES);
    }
    const records = mapTicketmasterEvents(events);
    const missingDates = events.filter(event => !localDateTime(event.dates?.start?.localDate, event.dates?.start?.localTime) || !localDateTime(event.dates?.end?.localDate, event.dates?.end?.localTime)).length;
    const missingVenue = events.filter(event => !event._embedded?.venues?.[0]).length;
    const missingCanadianVenue = events.filter(event => event._embedded?.venues?.[0] && event._embedded.venues[0].country?.countryCode !== 'CA').length;
    console.log(`[Ticketmaster] ${events.length} event(s) received across ${totalPages} page(s), ${records.length} accepted; ${missingDates} missing confirmed dates, ${missingVenue} missing venues, ${missingCanadianVenue} outside Canada.`);
    return records;
  }
}

/**
 * A weekly recurring market (e.g. a community farmers' market) with no feed/API of its own.
 * Occurrence dates are computed relative to "now" each ingest run rather than hardcoded, so
 * the market always carries a fresh window of upcoming dates instead of going stale.
 */
export interface RecurringMarketDefinition {
  id: string; title: string; summary: string; description: string;
  address: string; venue?: string; neighbourhood?: string;
  organizer: string; sourceUrl: string;
  categories: string[]; tags: string[];
  amenities: string[]; parking?: string; transit?: string; petFriendly?: boolean; familyFriendly?: boolean;
  /** One or more weekly opening windows, evaluated in America/Edmonton. */
  schedules?: Array<{ dayOfWeek: number; startTime: string; endTime: string }>;
  /** Legacy single-day schedule. Prefer schedules for new records. */
  dayOfWeek?: number;
  startTime?: string; endTime?: string;
  /** Inclusive "YYYY-MM-DD" bounds for a seasonal market; omit for year-round. */
  seasonStart?: string; seasonEnd?: string;
  /** How many upcoming dates to publish as occurrences. Defaults to 8. */
  occurrenceCount?: number;
}

const WEEKDAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function recurringSchedules(market: RecurringMarketDefinition) {
  if (market.schedules?.length) return market.schedules;
  if (market.dayOfWeek === undefined || !market.startTime || !market.endTime) throw Error(`Recurring market ${market.id} has no schedule`);
  return [{ dayOfWeek: market.dayOfWeek, startTime: market.startTime, endTime: market.endTime }];
}

function nextOccurrenceSlots(market: RecurringMarketDefinition, now: Date) {
  const count = market.occurrenceCount ?? 8;
  const slots: Array<{ date: string; startTime: string; endTime: string }> = [];
  const schedules = recurringSchedules(market);
  const cursor = new Date(now.getTime());
  for (let i = 0; i < 400 && slots.length < count; i++) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' }).formatToParts(cursor).map(part => [part.type, part.value]));
    const dateStr = `${parts.year}-${parts.month}-${parts.day}`;
    if ((!market.seasonStart || dateStr >= market.seasonStart) && (!market.seasonEnd || dateStr <= market.seasonEnd)) {
      for (const schedule of schedules) {
        if (WEEKDAY_ABBR.indexOf(parts.weekday) === schedule.dayOfWeek && slots.length < count) slots.push({ date: dateStr, startTime: schedule.startTime, endTime: schedule.endTime });
      }
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return slots;
}

export class RecurringMarketProvider implements InventoryProvider {
  constructor(public source: SourceConfig, private now: Date = new Date()) {}
  async fetch(): Promise<SourceRecord[]> {
    const markets = this.source.markets ?? [];
    const now = this.now;
    const records = markets.map(market => {
      const occurrences = nextOccurrenceSlots(market, now).map(slot => ({
        sourceRecordId: `${market.id}:${slot.date}:${slot.startTime}`,
        start: `${slot.date}T${slot.startTime}${calgaryOffset(`${slot.date}T${slot.startTime}`)}`,
        end: `${slot.date}T${slot.endTime}${calgaryOffset(`${slot.date}T${slot.endTime}`)}`,
        cancelled: false,
      }));
      const input: MarketSubmissionInput = {
        kind: 'market', title: market.title, summary: market.summary, description: market.description,
        address: market.address, organizer: market.organizer, sourceUrl: market.sourceUrl,
        categories: market.categories, tags: market.tags,
        occurrences, amenities: market.amenities,
        ...(market.venue ? { venue: market.venue } : {}),
        ...(market.neighbourhood ? { neighbourhood: market.neighbourhood } : {}),
        ...(market.parking ? { parking: market.parking } : {}),
        ...(market.transit ? { transit: market.transit } : {}),
        ...(market.petFriendly !== undefined ? { petFriendly: market.petFriendly } : {}),
        ...(market.familyFriendly !== undefined ? { familyFriendly: market.familyFriendly } : {}),
      };
      return { id: market.id, input: input as InventorySubmissionInput };
    }).filter(record => (record.input as MarketSubmissionInput).occurrences.length > 0);
    const skipped = markets.length - records.length;
    console.log(`[Recurring markets] ${markets.length} configured, ${records.length} with upcoming dates${skipped ? `, ${skipped} out of season` : ''}.`);
    return records;
  }
}

/* ── iCalendar feeds from official venue and organizer calendars ─────────────────── */

export interface IcsSourceOptions {
  organizer: string;
  /** The organizer's public events page, used when an event has no URL on an approved host. */
  fallbackUrl: string;
  categories?: string[];
  defaultAddress?: string;
  neighbourhood?: string;
  pricing?: 'free' | 'paid' | 'unknown';
  /** Only list events starting within this many days (default 60). */
  windowDays?: number;
}

interface IcsEvent { uid?: string; summary?: string; description?: string; location?: string; url?: string; status?: string; start?: string; end?: string; allDay?: boolean }

const unescapeIcs = (v: string) => v.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');
const stripHtml = (v: string) => v.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, '’').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();

/** "20261003T190000Z", "20261003T190000" (Calgary or floating) or "20261003" → ISO with offset. */
export function icsDate(value: string, tzid?: string): { iso: string; allDay: boolean } | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, se, z] = m;
  if (!h) return { iso: `${y}-${mo}-${d}T00:00:00${calgaryOffset(`${y}-${mo}-${d}T00:00:00`)}`, allDay: true };
  if (z) return { iso: `${y}-${mo}-${d}T${h}:${mi}:${se}Z`, allDay: false };
  if (tzid && !/edmonton|calgary|mountain/i.test(tzid)) return null;
  const local = `${y}-${mo}-${d}T${h}:${mi}:${se}`;
  return { iso: `${local}${calgaryOffset(local)}`, allDay: false };
}

export function parseIcs(text: string): IcsEvent[] {
  const lines = text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '').split('\n');
  const events: IcsEvent[] = [];
  let cur: IcsEvent | null = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { cur = {}; continue; }
    if (line === 'END:VEVENT') { if (cur) events.push(cur); cur = null; continue; }
    if (!cur) continue;
    const colon = line.indexOf(':'); if (colon < 0) continue;
    const head = line.slice(0, colon); const value = line.slice(colon + 1);
    const [name, ...params] = head.split(';');
    const tzid = params.find(p => p.toUpperCase().startsWith('TZID='))?.slice(5);
    switch (name.toUpperCase()) {
      case 'UID': cur.uid = value.trim(); break;
      case 'SUMMARY': cur.summary = unescapeIcs(value); break;
      case 'DESCRIPTION': cur.description = unescapeIcs(value); break;
      case 'LOCATION': cur.location = unescapeIcs(value); break;
      case 'URL': cur.url = value.trim(); break;
      case 'STATUS': cur.status = value.trim().toUpperCase(); break;
      case 'DTSTART': { const d = icsDate(value, tzid); if (d) { cur.start = d.iso; cur.allDay = d.allDay; } break; }
      case 'DTEND': { const d = icsDate(value, tzid); if (d) cur.end = d.iso; break; }
    }
  }
  return events;
}

export function mapIcsEvents(events: IcsEvent[], source: SourceConfig, now = Date.now()): SourceRecord[] {
  const o = source.ics!;
  const horizon = now + (o.windowDays ?? 60) * 86400000;
  const onHost = (u?: string) => { try { return !!u && u.startsWith('https://') && source.hosts.includes(new URL(u).hostname) ? u : undefined; } catch { return undefined; } };
  const seen = new Set<string>();
  return events.flatMap(e => {
    const title = stripHtml(e.summary ?? '').slice(0, 200);
    if (!title || !e.start) return [];
    const startMs = Date.parse(e.start);
    const end = e.end && Date.parse(e.end) > startMs ? e.end : new Date(startMs + (e.allDay ? 86400000 : 2 * 3600000)).toISOString();
    if (Date.parse(end) < now || startMs > horizon) return [];
    const address = stripHtml(e.location ?? '').slice(0, 480) || o.defaultAddress;
    if (!address) return [];
    const body = stripHtml(e.description ?? '');
    const firstSentence = body.split(/(?<=[.!?])\s/)[0] ?? '';
    const id = `${(e.uid || title).slice(0, 120)}@${e.start}`;
    if (seen.has(id)) return [];
    seen.add(id);
    const input = {
      kind: 'event' as const, title,
      summary: (firstSentence.length > 20 && firstSentence.length < 240 ? firstSentence : `${title}, listed by ${o.organizer}.`).slice(0, 480),
      description: (body || `${title}. Check ${o.organizer} for current details.`).slice(0, 4900),
      address, organizer: o.organizer, sourceUrl: onHost(e.url) ?? o.fallbackUrl,
      categories: o.categories ?? [], tags: [], start: e.start, end,
      ...(e.end ? {} : { endTimeEstimated: true }),
      pricing: o.pricing ?? 'unknown',
      ...(o.neighbourhood ? { neighbourhood: o.neighbourhood } : {}),
    } as InventorySubmissionInput;
    return [{ id: id.replace(/[^\w@.:+-]/g, '_').slice(0, 190), input, cancelled: e.status === 'CANCELLED' }];
  }).slice(0, 300);
}

export class IcsFeedProvider implements InventoryProvider {
  constructor(public source: SourceConfig) {}
  async fetch(): Promise<SourceRecord[]> {
    const url = this.source.feedUrl;
    if (!this.source.approved || !url || !url.startsWith('https://') || !this.source.hosts.includes(new URL(url).hostname) || !this.source.ics) throw Error('Unapproved or incomplete iCalendar source');
    const response = await fetch(url, { signal: AbortSignal.timeout(20_000), headers: { Accept: 'text/calendar, */*', 'User-Agent': 'CalgaryWatch/1.0 (event discovery; contact aldo@calgarywatch.ca)' } });
    if (!response.ok) throw Error(`Calendar returned HTTP ${response.status}`);
    if (!this.source.hosts.includes(new URL(response.url).hostname)) throw Error('Calendar redirected to an unapproved host');
    const body = await response.text();
    if (body.length > 5_000_000) throw Error('Calendar exceeds size limit');
    if (!body.includes('BEGIN:VCALENDAR')) throw Error('Response is not an iCalendar feed');
    const records = mapIcsEvents(parseIcs(body), this.source);
    console.log(`[${this.source.name}] ${records.length} upcoming event(s) from the calendar.`);
    return records;
  }
}
