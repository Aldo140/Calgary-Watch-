/* ── Tourism Calgary (visitcalgary.com) ─────────────────────────────────────
 * The city's tourism board lists hundreds of events: festivals, concerts, theatre,
 * sports and seasonal markets. Its public events calendar is served from an Algolia
 * index with a browser (search-only) key published in the page itself; we read the
 * key from the page on every run, so there is nothing to configure or rotate. Each
 * event's own page carries schema.org Event data with a street address, which we use
 * to keep only Calgary-area events. Requests are few and polite: a handful of index
 * pages plus one page per upcoming event in the window, three at a time.
 */
import type { InventorySubmissionInput } from '../../src/types/discovery';
import { calgaryOffset, type InventoryProvider, type SourceConfig, type SourceRecord } from './providers';
import { calgaryDateTimeFormat } from '../../src/lib/calgaryTz.js';

export interface VisitCalgaryHit {
  slug: string; permalink: string; searchable_taxonomies?: string;
  data: {
    title?: string; description?: string; is_free?: boolean | string; is_adult?: boolean | string;
    start_date?: string; start_time?: string | null; end_date?: string; end_time?: string | null;
    price?: string | null; organizer_name?: string | null; location?: string | null; event_dates?: string[] | null;
  };
}
export interface VisitCalgaryPlace { street?: string; locality?: string; venue?: string }

const ORIGIN = 'https://www.visitcalgary.com';
const CALGARY_AREA = /^(calgary|airdrie|cochrane|chestermere|okotoks|tsuut['’]?ina( nation)?)$/i;
const NOT_AN_EVENT = /\b(parking|upsell|upgrade|vip (package|experience|upgrade)|hospitality package|add-?on|voucher|gift card|season tickets?)\b/i;
const strip = (v: string) => v.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, '’').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
const truthy = (v: unknown) => v === true || v === 'true';
const clean = (v: unknown) => (typeof v === 'string' && v !== 'null' ? strip(v) : '');

/** "19:00", "7:00 PM", "7 pm" -> "19:00"; anything else -> null. */
export function vcTime(v: unknown): string | null {
  const s = clean(v).toLowerCase();
  const m = s.match(/^(\d{1,2})(?::(\d{2}))?(?::\d{2})?\s*(am|pm|a\.m\.|p\.m\.)?$/);
  if (!m) return null;
  let h = Number(m[1]); const min = Number(m[2] ?? 0);
  if (m[3]?.startsWith('p') && h < 12) h += 12;
  if (m[3]?.startsWith('a') && h === 12) h = 0;
  return h < 24 && min < 60 ? `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}` : null;
}

const CATEGORY: Array<[RegExp, string]> = [
  [/art|culture|theatre|theater|film|exhibit|museum|dance|comedy|literary|book/i, 'arts'],
  [/music|concert|nightlife|live/i, 'nightlife'],
  [/family|kid/i, 'family'],
  [/food|drink|dining|beer|wine/i, 'food'],
  [/sport|hockey|football|rodeo|race/i, 'sports'],
  [/outdoor|park|nature/i, 'outdoors'],
  [/holiday|christmas|halloween|seasonal/i, 'holiday'],
  [/market|shop/i, 'shopping'],
];

const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const calgaryDay = (ms: number) => calgaryDateTimeFormat('en-CA', { timeZone: 'America/Edmonton', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
const local = (day: string, hhmm: string) => { const l = `${day}T${hhmm}:00`; return `${l}${calgaryOffset(l)}`; };

/**
 * Maps index hits (plus each page's address) to records. A run of consecutive days is
 * one listing (a festival); dates with gaps are separate listings (a Sunday brunch
 * series), at most eight each. Events outside the Calgary area or without an address
 * are left out; anything flagged 18+ loses a 'family' tag.
 */
export function mapVisitCalgaryEvents(hits: VisitCalgaryHit[], places: Map<string, VisitCalgaryPlace>, now = Date.now(), windowDays = 60): SourceRecord[] {
  const today = calgaryDay(now), horizon = addDays(today, windowDays);
  const out: SourceRecord[] = [];
  for (const hit of hits) {
    const d = hit.data ?? {};
    const title = clean(d.title).slice(0, 200);
    const place = places.get(hit.slug);
    if (!title || !place?.locality || !CALGARY_AREA.test(place.locality.trim()) || NOT_AN_EVENT.test(title)) continue;
    const listed = Array.isArray(d.event_dates) && d.event_dates.length ? d.event_dates : [clean(d.start_date), clean(d.end_date)].filter(Boolean);
    let dates = [...new Set(listed.filter(x => /^\d{4}-\d{2}-\d{2}$/.test(x)))].sort();
    // A start/end pair without the days in between is a run.
    if (!(Array.isArray(d.event_dates) && d.event_dates.length) && dates.length === 2) { const run: string[] = []; for (let x = dates[0]; x <= dates[1] && run.length < 400; x = addDays(x, 1)) run.push(x); dates = run; }
    dates = dates.filter(x => x >= today && x <= horizon);
    if (!dates.length) continue;
    const contiguous = dates.every((x, i) => i === 0 || x === addDays(dates[i - 1], 1));
    const runs: Array<[string, string]> = contiguous ? [[dates[0], dates.at(-1)!]] : dates.slice(0, 8).map(x => [x, x]);
    const startTime = vcTime(d.start_time), endTime = vcTime(d.end_time);
    const body = clean(d.description);
    const first = body.split(/(?<=[.!?])\s/)[0] ?? '';
    const cats = new Set<string>();
    for (const t of (hit.searchable_taxonomies ?? '').split('|').map(s => s.trim()).filter(Boolean)) {
      for (const [re, c] of CATEGORY) if (re.test(t)) { cats.add(c); break; }
    }
    if (truthy(d.is_adult)) cats.delete('family');
    const price = clean(d.price);
    const nums = (price.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
    const pricing = truthy(d.is_free) ? 'free' : nums.length ? 'paid' : 'unknown';
    const organizer = (clean(d.organizer_name) || place.venue || clean(d.location) || 'Tourism Calgary').slice(0, 480);
    const venue = (place.venue || clean(d.location)).slice(0, 280);
    const address = [place.street, place.locality, 'AB'].filter(Boolean).join(', ').slice(0, 480);
    for (const [from, to] of runs) {
      const start = local(from, startTime ?? '00:00');
      let end: string, estimated = false;
      if (from !== to) { end = local(to, endTime ?? '23:59'); estimated = !endTime; }
      else if (startTime && endTime && endTime > startTime) end = local(from, endTime);
      else if (startTime) { end = new Date(Date.parse(start) + 2 * 3600000).toISOString(); estimated = true; }
      else { end = local(addDays(from, 1), '00:00'); estimated = true; }
      out.push({
        id: `${hit.slug}@${from}`.slice(0, 190),
        input: {
          kind: 'event', title,
          summary: (first.length > 20 && first.length < 240 ? first : `${title}, listed by Tourism Calgary.`).slice(0, 480),
          description: (body || `${title}. Check the organizer for current details.`).slice(0, 4900),
          address, organizer, sourceUrl: `${ORIGIN}${hit.permalink?.startsWith('/') ? hit.permalink : `/events/${hit.slug}`}`,
          categories: [...cats].slice(0, 4), tags: [], start, end,
          ...(estimated ? { endTimeEstimated: true } : {}),
          pricing,
          ...(pricing === 'paid' && nums.length ? { priceRange: [Math.min(...nums), Math.max(...nums)] as [number, number] } : {}),
          ...(venue ? { venue } : {}),
        } as InventorySubmissionInput,
      });
    }
  }
  return out.slice(0, 400);
}

/** The Place from an event page's schema.org JSON-LD. */
export function visitCalgaryPlace(html: string): VisitCalgaryPlace | null {
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const find = (x: any): any => Array.isArray(x) ? x.map(find).find(Boolean) : x && typeof x === 'object' ? (x['@type'] === 'Event' ? x : x['@graph'] ? find(x['@graph']) : null) : null;
      const ev = find(JSON.parse(m[1]));
      const loc = Array.isArray(ev?.location) ? ev.location[0] : ev?.location;
      if (!loc) continue;
      const a = loc.address ?? {};
      return { street: clean(a.streetAddress) || undefined, locality: clean(a.addressLocality) || undefined, venue: clean(loc.name) || undefined };
    } catch { /* try the next block */ }
  }
  return null;
}

export class VisitCalgaryProvider implements InventoryProvider {
  constructor(public source: SourceConfig) {}
  async fetch(): Promise<SourceRecord[]> {
    if (!this.source.approved || !this.source.hosts.includes('www.visitcalgary.com')) throw Error('Unapproved events source');
    const headers = { 'User-Agent': 'CalgaryWatch/1.0 (event discovery; contact aldo@calgarywatch.ca)' };
    const page = await (await fetch(`${ORIGIN}/events`, { headers, signal: AbortSignal.timeout(20_000) })).text();
    const app = page.match(/"algolia_app_id":"([A-Z0-9]+)"/)?.[1], key = page.match(/"algolia_public_key":"([a-f0-9]+)"/)?.[1];
    if (!app || !key) throw Error('Events calendar config not found on visitcalgary.com/events');
    const hits: VisitCalgaryHit[] = [];
    for (let p = 0; p < 8; p++) {
      const r = await fetch(`https://${app}-dsn.algolia.net/1/indexes/events/query`, {
        method: 'POST', signal: AbortSignal.timeout(20_000),
        headers: { 'X-Algolia-Application-Id': app, 'X-Algolia-API-Key': key, 'Content-Type': 'application/json', Referer: `${ORIGIN}/events` },
        body: JSON.stringify({ query: '', hitsPerPage: 100, page: p }),
      });
      if (!r.ok) throw Error(`Events index returned HTTP ${r.status}`);
      const body = await r.json() as { hits?: VisitCalgaryHit[]; nbPages?: number };
      hits.push(...(body.hits ?? []));
      if (p + 1 >= (body.nbPages ?? 0)) break;
    }
    // Only events that could fall in the window need their page read.
    const today = calgaryDay(Date.now()), horizon = addDays(today, 60);
    const inWindow = (h: VisitCalgaryHit) => {
      const d = h.data ?? {};
      if (Array.isArray(d.event_dates) && d.event_dates.length) return d.event_dates.some(x => x >= today && x <= horizon);
      return (d.start_date ?? '') <= horizon && (d.end_date || d.start_date || '') >= today;
    };
    const wanted = hits.filter(inWindow).slice(0, 220);
    const places = new Map<string, VisitCalgaryPlace>();
    for (let i = 0; i < wanted.length; i += 3) {
      await Promise.all(wanted.slice(i, i + 3).map(async h => {
        try {
          const res = await fetch(`${ORIGIN}/events/${h.slug}`, { headers, signal: AbortSignal.timeout(15_000) });
          const place = res.ok ? visitCalgaryPlace(await res.text()) : null;
          if (place) places.set(h.slug, place);
        } catch { /* skipped this run */ }
      }));
    }
    const records = mapVisitCalgaryEvents(wanted, places);
    console.log(`[${this.source.name}] ${hits.length} listed, ${wanted.length} in the next 60 days, ${records.length} Calgary-area record(s).`);
    return records;
  }
}
