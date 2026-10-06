/* ── Squarespace events collections ───────────────────────────────────────
 * Many Calgary venues run on Squarespace, whose events pages publish their own
 * data at <page>?format=json (the "upcoming" list), no key needed. Configure a
 * source with provider 'squarespace' and feedUrl set to the events page.
 */
import type { InventorySubmissionInput } from '../../src/types/discovery';
import type { InventoryProvider, SourceConfig, SourceRecord } from './providers';
import { calgaryDateTimeFormat } from '../../src/lib/calgaryTz.js';

export interface SquarespaceEvent {
  id: string; title?: string; excerpt?: string; body?: string; fullUrl?: string; startDate?: number; endDate?: number;
  categories?: string[]; tags?: string[];
  location?: { addressTitle?: string; addressLine1?: string; addressLine2?: string };
}

const strip = (v: string) => v.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, '’').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
const iso = (ms: number) => {
  const d = new Date(ms);
  const parts = Object.fromEntries(calgaryDateTimeFormat('en-CA', { timeZone: 'America/Edmonton', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZoneName: 'longOffset' }).formatToParts(d).map(p => [p.type, p.value]));
  const off = String(parts.timeZoneName).replace('GMT', '') || '+00:00';
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:00${off}`;
};
const CATEGORY: Array<[RegExp, string]> = [
  [/art|exhibit|film|theatre|dance|talk|lecture|culture|indigenous/i, 'arts'],
  [/music|concert|live/i, 'nightlife'],
  [/family|kid|children/i, 'family'],
  [/food|drink/i, 'food'],
  [/outdoor|park|walk|tour/i, 'outdoors'],
  [/holiday|christmas|halloween/i, 'holiday'],
];

export function mapSquarespaceEvents(events: SquarespaceEvent[], source: SourceConfig, now = Date.now(), windowDays = 90): SourceRecord[] {
  const base = new URL(source.feedUrl!);
  const horizon = now + windowDays * 86_400_000;
  return events.flatMap(e => {
    const title = strip(e.title ?? '').slice(0, 200);
    if (!title || !e.startDate || !e.endDate || e.endDate < now || e.startDate > horizon) return [];
    const loc = e.location ?? {};
    const street = strip(loc.addressLine1 ?? ''), city = strip(loc.addressLine2 ?? '');
    if (!street || !/calgary/i.test(city)) return [];
    const text = strip(e.excerpt || e.body || '');
    const first = text.split(/(?<=[.!?])\s/)[0] ?? '';
    const cats = new Set<string>();
    for (const t of [...(e.categories ?? []), ...(e.tags ?? [])]) for (const [re, c] of CATEGORY) if (re.test(t)) { cats.add(c); break; }
    const url = new URL(e.fullUrl ?? '/', base.origin).href;
    const input = {
      kind: 'event', title,
      summary: (first.length > 20 && first.length < 240 ? first : `${title}, at ${source.name}.`).slice(0, 480),
      description: (text || `${title}. Check ${source.name} for current details.`).slice(0, 4900),
      address: `${street}, ${city.replace(/,?\s*T\d[A-Z]\s?\d[A-Z]\d$/i, '')}`.slice(0, 480),
      venue: (strip(loc.addressTitle ?? '') || source.name).slice(0, 280),
      organizer: source.name, sourceUrl: url,
      categories: [...cats].slice(0, 4), tags: [], start: iso(e.startDate), end: iso(e.endDate),
      pricing: /\bfree\b/i.test(text.slice(0, 200)) ? 'free' : 'unknown',
    } as InventorySubmissionInput;
    return [{ id: `${e.id}@${e.startDate}`.slice(0, 190), input }];
  }).slice(0, 200);
}

export class SquarespaceEventsProvider implements InventoryProvider {
  constructor(public source: SourceConfig) {}
  async fetch(): Promise<SourceRecord[]> {
    const url = this.source.feedUrl;
    if (!this.source.approved || !url || !url.startsWith('https://') || !this.source.hosts.includes(new URL(url).hostname)) throw Error('Unapproved events source');
    const res = await fetch(`${url}?format=json`, { signal: AbortSignal.timeout(20_000), headers: { 'User-Agent': 'CalgaryWatch/1.0 (event discovery; contact aldo@calgarywatch.ca)', Accept: 'application/json' } });
    if (!res.ok) throw Error(`Events page returned HTTP ${res.status}`);
    const body = await res.json() as { upcoming?: SquarespaceEvent[] };
    const records = mapSquarespaceEvents(body.upcoming ?? [], this.source);
    console.log(`[${this.source.name}] ${records.length} upcoming event(s).`);
    return records;
  }
}
