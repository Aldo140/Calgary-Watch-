// Choosing what to post and checking drafts. Pure functions over the published
// discovery index, so the rules are testable without Firestore or the network.

import type { BrandId, PostImageText, PostTemplate } from '../../../src/types/ops';
import type { BrandKit } from './brand';
import { addDays, calgaryDate, calgaryMinutes, calgaryToEpoch, calgaryWeekday, longDay, nextSlot, shortDay, timeRange } from './time';

export type Entity = Record<string, any> & { id: string; kind: string; title: string; slug: string };
export type Occurrence = { id: string; marketId: string; start: string; end?: string; cancelled?: boolean };
export interface DiscoveryIndex { entities: Entity[]; occurrences: Occurrence[] }

/** One dated thing that could be posted: an event, or one market date. */
export interface Happening {
  entity: Entity;
  start: number;
  end: number | null;
  sourceUrl: string;
  sourceName: string;
}

export interface Candidate {
  brand: BrandId;
  template: PostTemplate;
  fingerprint: string;
  items: Happening[];
  title: string;
  facts: string;
  link: string;
  relevantUntil: number;
  suggestedFor: number;
}

const DAY = 86_400_000;
const PATHS: Record<string, string> = { event: '/events', market: '/markets', business: '/local', guide: '/guides', neighbourhood: '/neighbourhoods' };

export const normalize = (v: unknown) => String(v ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function entityUrl(site: string, e: Entity, campaign: string): string {
  const base = `${site.replace(/\/$/, '')}${PATHS[e.kind] ?? ''}/${e.slug}`;
  return `${base}?utm_source=instagram&utm_medium=social&utm_campaign=${encodeURIComponent(campaign)}`;
}

/** Every event and market date in the index, excluding cancelled ones. */
export function happenings(index: DiscoveryIndex): Happening[] {
  const byId = new Map(index.entities.map(e => [e.id, e]));
  const out: Happening[] = [];
  for (const e of index.entities) {
    if (e.kind !== 'event' || e.cancelled || e.status !== 'published' || !e.start) continue;
    const src = e.sources?.[0];
    if (!src?.url) continue;
    out.push({ entity: e, start: Date.parse(e.start), end: e.end ? Date.parse(e.end) : null, sourceUrl: src.url, sourceName: src.name ?? '' });
  }
  for (const o of index.occurrences ?? []) {
    const m = byId.get(o.marketId);
    if (!m || o.cancelled || m.status !== 'published') continue;
    const src = m.sources?.[0];
    if (!src?.url) continue;
    out.push({ entity: m, start: Date.parse(o.start), end: o.end ? Date.parse(o.end) : null, sourceUrl: src.url, sourceName: src.name ?? '' });
  }
  return out.filter(h => Number.isFinite(h.start)).sort((a, b) => a.start - b.start);
}

/** Plain-text facts handed to the writer and shown to the reviewer. Nothing else may be claimed. */
export function factsFor(items: Happening[]): string {
  return items.map((h, i) => {
    const e = h.entity;
    const lines = [
      `${items.length > 1 ? `${i + 1}. ` : ''}${e.title} (${e.kind})`,
      `When: ${longDay(h.start)}, ${timeRange(h.start, h.end)}`,
      e.venue ? `Venue: ${e.venue}` : '',
      e.address ? `Address: ${e.address}` : '',
      e.neighbourhood ? `Neighbourhood: ${e.neighbourhood}` : '',
      e.pricing ? `Price: ${e.pricing}` : '',
      e.organizer ? `Organizer: ${e.organizer}` : '',
      e.summary ? `Summary: ${e.summary}` : '',
      e.description ? `Description: ${String(e.description).slice(0, 700)}` : '',
      `Source: ${h.sourceName} ${h.sourceUrl}`,
    ];
    return lines.filter(Boolean).join('\n');
  }).join('\n\n');
}

/** Spread picks across organizers and categories so a day isn't five UCalgary lectures. */
function diverse(list: Happening[], n: number, taken = new Set<string>()): Happening[] {
  const picked: Happening[] = [];
  const orgs = new Set<string>(), cats = new Set<string>();
  const score = (h: Happening) =>
    (h.entity.pricing === 'free' ? 2 : 0) + (h.entity.neighbourhood ? 1 : 0) + (h.entity.address ? 1 : 0) +
    (h.entity.kind === 'market' ? 1 : 0) - (orgs.has(normalize(h.entity.organizer ?? h.sourceName)) ? 3 : 0) -
    (cats.has(h.entity.categories?.[0]) ? 1 : 0);
  const pool = list.filter(h => !taken.has(h.entity.id));
  while (picked.length < n && pool.length) {
    pool.sort((a, b) => score(b) - score(a) || a.start - b.start);
    const h = pool.shift()!;
    if (picked.some(p => p.entity.id === h.entity.id)) continue;
    picked.push(h);
    orgs.add(normalize(h.entity.organizer ?? h.sourceName));
    if (h.entity.categories?.[0]) cats.add(h.entity.categories[0]);
  }
  return picked;
}

/**
 * Today's candidates for one brand, minus anything already queued (by fingerprint).
 *
 * CalgaryWatch: single event/market posts 1–8 days out, plus a Friday-to-Sunday
 * roundup drafted on Wednesdays and Thursdays. CalgaryDaily: a morning "today in
 * Calgary" roundup when at least two things are on.
 */
/**
 * `bookedSlots`: HH:mm slots today that already hold a post for this brand (drafted, approved or
 * published). The day never gets more than postsPerDay automatic posts, and no slot gets two.
 */
export function selectCandidates(index: DiscoveryIndex, kit: BrandKit, now: number, queued: Set<string>, recentlyPosted: Set<string> = new Set(), bookedSlots: Set<string> = new Set()): Candidate[] {
  const all = happenings(index);
  const today = calgaryDate(now);
  const out: Candidate[] = [];
  let slot = 0;
  const campaign = (s: string) => `${kit.id}_${s}`;

  if (kit.id === 'calgarydaily') {
    // The daily program: a morning "Today" roundup, a midday spotlight, and an
    // evening "Tonight" roundup (or a second spotlight when the evening is quiet).
    const slots = [...kit.postingSlots].sort();
    const at = (i: number) => {
      const t = calgaryToEpoch(today, slots[Math.min(i, slots.length - 1)]);
      return t > now ? t : now + 10 * 60_000;
    };
    const until = (items: Happening[]) => Math.max(...items.map(i => i.end ?? i.start));
    // Spotlights never repeat a listing the account featured in the last couple of days.
    const used = new Set<string>(recentlyPosted);
    const onToday = all.filter(h => calgaryDate(h.start) === today && (h.end ?? h.start) > now);
    const isEvening = (h: Happening) => calgaryMinutes(h.start) >= 17 * 60;
    // With enough evening plans for their own post, the morning roundup keeps to the daytime.
    const eveningPost = !queued.has(`${kit.id}|tonight|${today}`) && onToday.filter(isEvening).length >= 2;
    const morningPool = eveningPost ? onToday.filter(h => !isEvening(h)) : onToday;

    const fpToday = `${kit.id}|today|${today}`;
    if (!queued.has(fpToday) && !bookedSlots.has(slots[0]) && morningPool.length >= 2) {
      const items = diverse(morningPool, 4).sort((a, b) => a.start - b.start);
      items.forEach(i => used.add(i.entity.id));
      out.push({
        brand: kit.id, template: 'roundup', fingerprint: fpToday, items,
        title: `Today in Calgary — ${shortDay(now)}`, facts: factsFor(items),
        link: `${kit.site}/events?utm_source=instagram&utm_medium=social&utm_campaign=${campaign('today')}`,
        relevantUntil: until(items), suggestedFor: at(0),
      });
    }

    const fpTonight = `${kit.id}|tonight|${today}`;
    const evening = onToday.filter(h => isEvening(h) && !used.has(h.entity.id));
    let tonight: Candidate | null = null;
    if (!queued.has(fpTonight) && evening.length >= 2) {
      const items = diverse(evening, 4).sort((a, b) => a.start - b.start);
      items.forEach(i => used.add(i.entity.id));
      tonight = {
        brand: kit.id, template: 'roundup', fingerprint: fpTonight, items,
        title: `Tonight in Calgary — ${shortDay(now)}`, facts: factsFor(items),
        link: `${kit.site}/events?utm_source=instagram&utm_medium=social&utm_campaign=${campaign('tonight')}`,
        relevantUntil: until(items), suggestedFor: at(2),
      };
    }

    // Spotlights fill the remaining slots: one listing each, today or the next two days.
    const fpFor = (h: Happening) => h.entity.kind === 'market'
      ? `${kit.id}|market|${h.entity.id}|${calgaryDate(h.start).slice(0, 7)}`
      : `${kit.id}|event|${normalize(h.entity.title)}`;
    const free = (i: number) => !bookedSlots.has(slots[Math.min(i, slots.length - 1)]);
    if (tonight && !free(2)) tonight = null;
    const spotlightSlots = (tonight ? [1] : [1, 2]).filter(free);
    const pool = all.filter(h => (h.end ?? h.start) > now && h.start < calgaryToEpoch(addDays(today, 3), '00:00') && !queued.has(fpFor(h)));
    const budget = kit.postsPerDay - bookedSlots.size - out.length - (tonight ? 1 : 0);
    const picks = diverse(pool, Math.max(0, Math.min(spotlightSlots.length, budget)), used);
    picks.forEach((h, i) => {
      out.push({
        brand: kit.id, template: 'event', fingerprint: fpFor(h), items: [h], title: h.entity.title, facts: factsFor([h]),
        link: entityUrl(kit.site, h.entity, campaign('spotlight')), relevantUntil: h.end ?? h.start, suggestedFor: at(spotlightSlots[i]),
      });
    });
    if (tonight) out.push(tonight);
    return out;
  }

  const weekday = calgaryWeekday(now);
  if (weekday === 3 || weekday === 4) {
    const friday = addDays(today, 5 - weekday);
    const fp = `${kit.id}|weekend|${friday}`;
    const weekend = all.filter(h => [friday, addDays(friday, 1), addDays(friday, 2)].includes(calgaryDate(h.start)));
    if (!queued.has(fp) && weekend.length >= 3) {
      const items = diverse(weekend, 5).sort((a, b) => a.start - b.start);
      out.push({
        brand: kit.id, template: 'roundup', fingerprint: fp, items,
        title: 'This weekend in Calgary', facts: factsFor(items),
        link: `${kit.site}/events?utm_source=instagram&utm_medium=social&utm_campaign=${campaign('weekend')}`,
        relevantUntil: Math.max(...items.map(i => i.start)), suggestedFor: nextSlot(now, kit.postingSlots, slot++),
      });
    }
  }

  const fpFor = (h: Happening) => h.entity.kind === 'market'
    ? `${kit.id}|market|${h.entity.id}|${calgaryDate(h.start).slice(0, 7)}`   // a market at most once a month
    : `${kit.id}|event|${normalize(h.entity.title)}`;                         // an event (or exhibition run) once
  const window = all.filter(h => h.start >= now + DAY && h.start <= now + 8 * DAY && !queued.has(fpFor(h)));
  const singles = diverse(window, Math.max(0, kit.postsPerDay - out.length), new Set(out.flatMap(c => c.items.map(i => i.entity.id))));
  for (const h of singles) {
    out.push({
      brand: kit.id, template: 'event', fingerprint: fpFor(h), items: [h],
      title: h.entity.title, facts: factsFor([h]),
      link: entityUrl(kit.site, h.entity, campaign(h.entity.kind)),
      relevantUntil: h.start, suggestedFor: nextSlot(now, kit.postingSlots, slot++),
    });
  }
  return out;
}

export interface Draft { caption: string; altText: string; imageText: PostImageText }

/** "Today in Calgary: Friday, Sept 25" -> "Today in Calgary": the date is already in the roundup label. */
export const roundupHeadline = (h: string) => h.replace(/\s*(?:[—–:]|\s-\s).*$/, '').trim() || h;

/** "FRI, SEP 25" for a single day, "SEP 25 – 27" for a span. */
export function roundupEyebrow(c: Pick<Candidate, 'items'>): string {
  const days = [...new Set(c.items.map(h => shortDay(h.start)))];
  if (days.length === 1) return days[0].toUpperCase();
  const first = shortDay(Math.min(...c.items.map(h => h.start))).split(', ')[1];
  const last = shortDay(Math.max(...c.items.map(h => h.start))).split(', ')[1];
  const [m1, d1] = first.split(' '), [m2, d2] = last.split(' ');
  return (m1 === m2 ? `${m1} ${d1} – ${d2}` : `${first} – ${last}`).toUpperCase();
}

const tidy = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`);

/** A deterministic draft used when no model is configured or the model's draft fails checks. */
export function templateDraft(c: Candidate, kit: BrandKit): Draft {
  const tags = kit.hashtags.join(' ');
  if (c.template === 'roundup') {
    const lines = c.items.map(h => `• ${h.entity.title} — ${shortDay(h.start)}, ${timeRange(h.start, h.end)}${h.entity.venue ? ` at ${h.entity.venue}` : ''}`);
    return {
      caption: `${c.title}.\n\n${lines.join('\n')}\n\nDates are checked against each organizer's own page. Details at the link in bio.\n\n${tags}`,
      altText: `${c.title}: ${c.items.map(h => h.entity.title).join('; ')}.`,
      imageText: {
        eyebrow: roundupEyebrow(c),
        headline: c.title.replace(/ — .*/, ''),
        details: c.items.slice(0, 5).map(h => `${shortDay(h.start).split(',')[0]} ${timeRange(h.start, h.end)} · ${tidy(h.entity.title, 30)}`),
        footer: kit.site.replace(/^https?:\/\//, '') + '/events',
      },
    };
  }
  const h = c.items[0], e = h.entity;
  const where = [e.venue, e.neighbourhood].filter(Boolean).join(', ');
  const price = e.pricing === 'free' ? 'Free. ' : '';
  return {
    caption: `${e.title}\n${longDay(h.start)}, ${timeRange(h.start, h.end)}${where ? ` · ${where}` : ''}\n\n${price}${e.summary ?? ''}\n\nListed by ${e.organizer ?? h.sourceName}. Details and the official page at the link in bio.\n\n${tags}`,
    altText: `${e.title}, ${longDay(h.start)} at ${timeRange(h.start, h.end)}${where ? `, ${where}` : ''}.`,
    imageText: {
      eyebrow: `${e.kind === 'market' ? 'MARKET' : (e.categories?.[0] ?? 'event').toUpperCase()} · ${shortDay(h.start).toUpperCase()}`,
      headline: tidy(e.title, 60),
      details: [timeRange(h.start, h.end), e.venue ?? e.address ?? '', e.pricing === 'free' ? 'Free' : ''].filter(Boolean).map(s => tidy(s, 44)),
      footer: `${kit.site.replace(/^https?:\/\//, '')}${PATHS[e.kind] ?? ''}`,
    },
  };
}

/** Brand and platform checks. Returns problems; an empty list means the draft can be reviewed as-is. */
export function checkDraft(d: Draft, kit: BrandKit, opts: { sponsored?: boolean } = {}): string[] {
  const problems: string[] = [];
  if (!d.caption.trim()) problems.push('Caption is empty.');
  if (d.caption.length > 2200) problems.push('Caption is longer than Instagram allows (2,200 characters).');
  else if (d.caption.replace(/(\s#[\p{L}\p{N}_]+)+\s*$/u, '').length > 1000) problems.push('Caption is too long to read on a phone (over 1,000 characters before the hashtags).');
  const tags = d.caption.match(/#[\p{L}\p{N}_]+/gu) ?? [];
  if (tags.length > 5) problems.push(`Caption has ${tags.length} hashtags; the brand limit is 5.`);
  if (!d.altText.trim()) problems.push('Alt text is empty.');
  if (d.imageText.headline.length > 64) problems.push('Image headline is too long to stay legible (64 characters max).');
  if (d.imageText.details.length > 5) problems.push('Image has more than 5 detail lines.');
  const lower = `${d.caption} ${d.imageText.headline}`.toLowerCase();
  for (const p of kit.voice.bannedPhrases) if (lower.includes(p.toLowerCase())) problems.push(`Uses a banned phrase: "${p}".`);
  if (opts.sponsored && !/featured partner/i.test(d.caption.split('\n')[0] ?? '')) problems.push('Sponsored post must say "Featured partner" in the first line.');
  if (opts.sponsored && !/featured partner/i.test(d.imageText.eyebrow)) problems.push('Sponsored image must carry the "Featured partner" label.');
  return problems;
}
