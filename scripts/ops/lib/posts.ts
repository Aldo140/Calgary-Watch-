// Choosing what to post and checking drafts. Pure functions over the published
// discovery index, so the rules are testable without Firestore or the network.

import type { BrandId, PostImageText, PostTemplate } from '../../../src/types/ops';
import type { BrandKit } from './brand';
import { addDays, calgaryDate, calgaryMinutes, calgaryToEpoch, calgaryWeekday, clock, longDay, nextSlot, shortDay, timeRange } from './time';

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
  /** 'reel' = the items become a vertical video (weekendReelSlides), not one image. */
  format?: 'reel';
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

const ENTITIES: Record<string, string> = { amp: '&', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };
const decode = (s: string) => s
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
  .replace(/�/g, ' ');

/**
 * The name a person would say: "Outback Presents Maria Bamford" → "Maria Bamford",
 * "Where Dark Things Dwell (Saturdays)- Outdoor Escape Room" → "Where Dark Things Dwell",
 * "Exhibition - Held. Together." → "Held. Together."
 */
export function cleanTitle(title: string): string {
  let t = decode(title).replace(/\s*\((?:mon|tues|wednes|thurs|fri|satur|sun)days?\)/gi, '').replace(/\s+/g, ' ').trim();
  t = t.replace(/^(?:[\w&.'’-]+\s){1,4}presents?:?\s+/i, '');
  t = t.replace(/^(?:exhibition|event|workshop|talk|lecture|concert|performance|tour)\s*[-–—:]\s*/i, '');
  t = t.replace(/^[A-Z]{3,}\s*[-–—:]\s*/, ''); // "TOUR – Introduction to Textiles"
  const [head, ...tail] = t.split(/\s*[-–—]\s*(?=[A-Z])/);
  // Drop a trailing descriptor ("- Outdoor Escape Room") only when the name stands on its own.
  // A matchup keeps both teams ("Women's Soccer — Regina Cougars vs. Mount Royal Cougars").
  if (tail.length && head.length >= 8 && !/\bvs\.?(\s|$)/i.test(t)) t = head;
  // "Taking it to the Streets: Stories of Resilience, Connection, and…" → "Taking it to the Streets".
  const [main] = t.split(/:\s+/);
  if (t.length > 40 && main.length >= 8 && main.length < t.length) t = main;
  return t.trim();
}

/** Shorten at a word boundary, so a line never ends mid-word. */
export const tidyWords = (s: string, n: number) => {
  if (s.length <= n) return s;
  const cut = s.slice(0, n - 1);
  const at = cut.lastIndexOf(' ');
  return `${(at > n / 2 ? cut.slice(0, at) : cut).replace(/[\s—–:,.-]+$/, '')}…`;
};

/**
 * When to show up, as a person would say it. Feeds often fill in a one-hour end
 * when they don't know it, so roundups give the start ("7:30 pm"); a spotlight
 * shows a range only when the end looks real.
 */
export function whenLabel(h: Pick<Happening, 'start' | 'end'>, withRange: boolean): string {
  const noon = (s: string) => s.replace(/^12 pm$/, 'noon');
  if (!withRange || !h.end || h.end - h.start === 3_600_000) return noon(clock(h.start));
  if (calgaryMinutes(h.end) >= 23 * 60 + 30) return `from ${clock(h.start)}`;
  return timeRange(h.start, h.end);
}

/** One plain sentence from the organizer's description, or nothing when there isn't a clean one. */
export function blurbFor(e: Entity): string | null {
  for (const raw of [e.description, e.summary]) {
    if (!raw) continue;
    const text = decode(String(raw)).replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}]/gu, '').replace(/\s+/g, ' ').trim();
    const first = text.match(/^(.{30,240}?[.!?])(\s|$)/)?.[1] ?? (text.length >= 60 ? tidyWords(text, 150) : null);
    if (!first) continue;
    if (/listed by|\b20\d\d\b|\b[ap]\.m\.|admission|\$\d|click|register|tickets? (are|on)/i.test(first)) continue;
    // "Join us for a free public exhibition featuring…" → "A free public exhibition featuring…"
    const plain = first.replace(/^join us (for|at|in) /i, '').replace(/^./, c => c.toUpperCase());
    if (plain.length < 30) continue;
    return plain.length <= 240 ? plain : tidyWords(plain, 200);
  }
  return null;
}

/** Same show twice in a day (5 pm and 8 pm) is one line with both times. */
export function mergeShowings(items: Happening[]): Array<{ name: string; first: Happening; times: Happening[] }> {
  const out: Array<{ name: string; first: Happening; times: Happening[] }> = [];
  for (const h of items) {
    const name = cleanTitle(h.entity.title);
    const same = out.find(o => normalize(o.name) === normalize(name) && calgaryDate(o.first.start) === calgaryDate(h.start));
    if (same) same.times.push(h); else out.push({ name, first: h, times: [h] });
  }
  return out;
}

const joinTimes = (times: Happening[]) => {
  // Markets are about opening hours; shows are about when to arrive.
  const labels = times.map(t => whenLabel(t, t.entity.kind === 'market'));
  if (labels.length === 1) return labels[0];
  // "5 pm and 8 pm" → "5 and 8 pm" when they share am/pm.
  const same = labels.every(l => l.slice(-2) === labels[0].slice(-2) && !l.startsWith('from'));
  return same ? `${labels.map(l => l.slice(0, -3)).join(' and ')} ${labels[0].slice(-2)}` : labels.join(' and ');
};

/** Spread picks across organizers and categories so a day isn't five UCalgary lectures. */
function diverse(list: Happening[], n: number, taken = new Set<string>(), siblings = false): Happening[] {
  const picked: Happening[] = [], extra: Happening[] = [];
  const sameShow = (a: Happening, b: Happening) => calgaryDate(a.start) === calgaryDate(b.start) && normalize(cleanTitle(a.entity.title)) === normalize(cleanTitle(b.entity.title));
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
    // A second showing of the same thing never takes a slot of its own; roundups list it on the same line.
    if (picked.some(p => sameShow(p, h))) { if (siblings) extra.push(h); continue; }
    picked.push(h);
    orgs.add(normalize(h.entity.organizer ?? h.sourceName));
    if (h.entity.categories?.[0]) cats.add(h.entity.categories[0]);
  }
  return [...picked, ...extra];
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
      const items = diverse(morningPool, 4, undefined, true).sort((a, b) => a.start - b.start);
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
      const items = diverse(evening, 4, undefined, true).sort((a, b) => a.start - b.start);
      items.forEach(i => used.add(i.entity.id));
      tonight = {
        brand: kit.id, template: 'roundup', fingerprint: fpTonight, items,
        title: `Tonight in Calgary — ${shortDay(now)}`, facts: factsFor(items),
        link: `${kit.site}/events?utm_source=instagram&utm_medium=social&utm_campaign=${campaign('tonight')}`,
        relevantUntil: until(items), suggestedFor: at(2),
      };
    }

    const free = (i: number) => !bookedSlots.has(slots[Math.min(i, slots.length - 1)]);
    if (tonight && !free(2)) tonight = null;

    // Fridays: the midday slot is a "this weekend" Reel. Reels reach far more people
    // on this account than image posts (median 243 vs 150 views, 2026-09-25).
    let reel: Candidate | null = null;
    const fpReel = `${kit.id}|weekend-reel|${today}`;
    if (calgaryWeekday(now) === 5 && free(1) && !queued.has(fpReel)) {
      const weekendDays = [today, addDays(today, 1), addDays(today, 2)];
      const weekend = all.filter(h => weekendDays.includes(calgaryDate(h.start)) && (h.end ?? h.start) > now && (calgaryDate(h.start) !== today || isEvening(h)) && !used.has(h.entity.id));
      if (weekend.length >= 3) {
        // One of each thing: two games of the same series read as a repeat ("Women's Soccer — …" twice).
        const series = (h: Happening) => normalize(h.entity.title.replace(/\([^)]*\)/g, ' ').split(/\s*[—–-]\s|\svs\.?\s/i)[0]);
        const bySeries = new Map<string, Happening>();
        for (const h of diverse(weekend, 8)) if (!bySeries.has(series(h))) bySeries.set(series(h), h);
        const items = [...bySeries.values()].slice(0, 5).sort((a, b) => a.start - b.start);
        if (items.length >= 3) {
          items.forEach(i => used.add(i.entity.id));
          reel = {
            brand: kit.id, template: 'roundup', format: 'reel', fingerprint: fpReel, items,
            title: `This weekend in Calgary — ${shortDay(now)}`, facts: factsFor(items),
            link: `${kit.site}/events?utm_source=instagram&utm_medium=social&utm_campaign=${campaign('weekend_reel')}`,
            relevantUntil: Math.max(...items.map(i => i.end ?? i.start)), suggestedFor: at(1),
          };
          out.push(reel);
        }
      }
    }

    // Spotlights fill the remaining slots: one listing each, today or the next two days.
    const fpFor = (h: Happening) => h.entity.kind === 'market'
      ? `${kit.id}|market|${h.entity.id}|${calgaryDate(h.start).slice(0, 7)}`
      : `${kit.id}|event|${normalize(h.entity.title)}`;
    const spotlightSlots = (tonight ? [1] : [1, 2]).filter(i => free(i) && !(reel && i === 1));
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

const WEEKDAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton', weekday: 'long' });
const dayName = (ms: number) => WEEKDAY.format(new Date(ms));
/** "Today", "Tomorrow" or "Sunday", relative to when the post goes out. */
function relativeDay(ms: number, postedAt: number): string {
  if (calgaryDate(ms) === calgaryDate(postedAt)) return 'Today';
  if (calgaryDate(ms) === addDays(calgaryDate(postedAt), 1)) return 'Tomorrow';
  return dayName(ms);
}

// Plain opening lines, the way a person would start a text. Picked by date so a week doesn't repeat.
const TODAY_HOOKS = ["Here's what's on today.", 'A few good reasons to get out today.', "Today's shortlist, if you need one.", 'Some ideas for today.', 'On today, in case you need a plan.'];
const TONIGHT_HOOKS = ["Tonight's shortlist.", "If you're looking for something to do tonight.", 'A few things on tonight.', 'Plans for tonight, if you need them.', "What's on tonight."];
const pick = (list: string[], ms: number) => list[Number(calgaryDate(ms).replace(/-/g, '')) % list.length];

/** "PF 1239 (Professional Faculties Building)" → "Professional Faculties Building"; "White Buffalo Lodge (EDT 314)" → "White Buffalo Lodge". */
export function cleanPlace(v: string): string {
  const m = v.match(/^(.*?)\s*\(([^)]*)\)\s*$/);
  if (!m) return v.trim();
  const score = (x: string) => (x.match(/[a-z]/gi)?.length ?? 0) - 4 * (x.match(/\d/g)?.length ?? 0);
  return (score(m[2]) > score(m[1]) ? m[2] : m[1]).trim();
}
const place = (e: Entity) => cleanPlace(e.venue ?? e.neighbourhood ?? '');
const isFree = (e: Entity) => e.pricing === 'free';

/** A weekend Reel: a cover, one slide per plan (facts from the listing only), and a follow card. */
export function weekendReelSlides(c: Pick<Candidate, 'items'>): Array<PostImageText & { template: PostTemplate }> {
  const shows = mergeShowings(c.items);
  return [
    { template: 'roundup', eyebrow: roundupEyebrow(c), headline: 'This weekend', blurb: `${shows.length} plans worth saving.`, details: [], footer: 'Dates checked with each organizer' },
    ...shows.map(s => ({
      template: 'event' as const,
      eyebrow: `${dayName(s.first.start)}${isFree(s.first.entity) ? ' · Free' : ''}`,
      headline: tidyWords(s.name, 56),
      blurb: null,
      details: [joinTimes(s.times), place(s.first.entity)].filter(Boolean).map(x => tidyWords(x, 44)),
      footer: tidyWords(`Listed by ${s.first.entity.organizer ?? s.first.sourceName}`, 48),
    })),
    { template: 'slide', eyebrow: 'FOLLOW', headline: 'Your Calgary plan, every morning.', details: ['Today, tonight and this weekend, checked with the organizers.', '@calgarydaily'], footer: 'Full list on calgarywatch.ca||' },
  ];
}

/**
 * The draft used when no model is configured, or the model's draft fails the checks. It should
 * read like a person who lives here wrote it: sentence case, specific, no hype.
 */
export function templateDraft(c: Candidate, kit: BrandKit): Draft {
  const tags = kit.hashtags.join(' ');
  const postedAt = c.suggestedFor;
  if (c.template === 'roundup') {
    const tonight = c.fingerprint.includes('|tonight|');
    const weekend = c.fingerprint.includes('weekend');
    const shows = mergeShowings(c.items);
    const hook = weekend ? 'Some plans for the weekend.' : pick(tonight ? TONIGHT_HOOKS : TODAY_HOOKS, postedAt);
    const headline = weekend ? 'This weekend' : tonight ? 'Tonight in Calgary' : `${dayName(postedAt)} in Calgary`;
    const lines = shows.map(s => {
      const e = s.first.entity;
      return `${s.name}${place(e) && place(e) !== s.name ? `, ${place(e)}` : ''} · ${weekend ? `${dayName(s.first.start).slice(0, 3)} ` : ''}${joinTimes(s.times)}${isFree(e) ? ' · free' : ''}`;
    });
    return {
      caption: `${hook}\n\n${lines.join('\n')}\n\nFull list on CalgaryWatch, link in bio.\n\n${tags}`,
      altText: `${headline}: ${shows.map(s => s.name).join('; ')}.`,
      imageText: {
        eyebrow: roundupEyebrow(c),
        headline,
        blurb: hook,
        details: shows.slice(0, 5).map(s => {
          const e = s.first.entity;
          const meta = [`${weekend ? `${dayName(s.first.start).slice(0, 3)} ` : ''}${joinTimes(s.times)}`, place(e) !== s.name ? place(e) : '', isFree(e) ? 'free' : ''].filter(Boolean).join(' · ');
          return `${tidyWords(s.name, 38)}|${tidyWords(meta, 52)}`;
        }),
        footer: 'Full list on calgarywatch.ca',
      },
    };
  }
  const h = c.items[0], e = h.entity;
  const name = cleanTitle(e.title);
  const blurb = blurbFor(e);
  const when = whenLabel(h, true);
  const day = relativeDay(h.start, postedAt);
  const where = [e.venue && cleanPlace(e.venue), e.neighbourhood].filter(Boolean).join(', ');
  const dayPhrase = day === 'Today' ? 'Today' : day === 'Tomorrow' ? 'Tomorrow' : `${dayName(h.start)}, ${shortDay(h.start).split(', ')[1]}`;
  return {
    caption: `${name}\n${dayPhrase}, ${when}${where ? ` at ${where}` : ''}.${blurb ? `\n\n${blurb}` : ''}${isFree(e) && !/\bfree\b/i.test(blurb ?? '') ? `${blurb ? ' ' : '\n\n'}Free.` : ''}\n\nListed by ${e.organizer ?? h.sourceName}. Details on CalgaryWatch, link in bio.\n\n${tags}`,
    altText: `${name}, ${longDay(h.start)} at ${timeRange(h.start, h.end)}${where ? `, ${where}` : ''}.`,
    imageText: {
      eyebrow: `${day}${isFree(e) ? ' · Free' : e.kind === 'market' ? ' · Market' : ''}`,
      headline: tidyWords(name, 60),
      blurb: blurb ? tidyWords(blurb, 150) : null,
      // The venue alone when venue + neighbourhood won't fit on one line.
      details: [`${shortDay(h.start)} · ${when}`, where.length <= 44 ? where : (e.venue ? tidyWords(cleanPlace(e.venue), 44) : tidyWords(e.address ?? '', 44))].filter(Boolean),
      footer: tidy(`Listed by ${e.organizer ?? h.sourceName}`, 52),
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
  const lower = `${d.caption} ${d.imageText.headline} ${d.imageText.blurb ?? ''}`.toLowerCase();
  for (const p of kit.voice.bannedPhrases) {
    // Whole words only, so "epic" doesn't catch "Epicentre".
    const esc = p.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(/^\w/.test(p) ? `(^|[^\\w])${esc}($|[^\\w])` : esc, 'u').test(lower)) problems.push(`Uses a banned phrase: "${p}".`);
  }
  if (opts.sponsored && !/featured partner/i.test(d.caption.split('\n')[0] ?? '')) problems.push('Sponsored post must say "Featured partner" in the first line.');
  if (opts.sponsored && !/featured partner/i.test(d.imageText.eyebrow)) problems.push('Sponsored image must carry the "Featured partner" label.');
  return problems;
}
