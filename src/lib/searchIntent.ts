import { CALGARY_COMMUNITIES, type CalgaryCommunity } from '../data/calgaryCommunities';
import { calgaryDateTimeFormat } from './calgaryTz';
import { toSlug } from './communityRank';
import { pointInPolygon, type CommunityBoundary } from './communityLookup';
import type { Incident, IncidentCategory } from '../types';

/**
 * What a resident means by a search, so the page can answer it.
 *
 * The site search only knew events, markets, places and guides. Real searches
 * (admin Search demand, Oct 2026) were mostly something else: a neighbourhood
 * ("panorama hills", "seton"), a street ("applestone place", typo'd as
 * "coppersome close"), or "what's going on" with a time attached ("yesterday
 * police", "why so much police active tonight", "helicopter circling coral
 * springs"). Every one of those came back empty.
 *
 * This module reads the words and returns the parts it recognises. It is pure:
 * the page decides what to fetch from what it finds.
 */

export interface CommunityMatch {
  community: CalgaryCommunity;
  /** Same slug /check-your-community?c= and /map?area= take. */
  slug: string;
  via: 'name' | 'alias' | 'typo';
}

export type TimeKey = 'now' | 'tonight' | 'last-night' | 'today' | 'yesterday' | 'week';
export interface TimeWindow { key: TimeKey; label: string; from: number; to: number }

export type Topic = 'police' | 'helicopter' | 'lockdown' | 'crime' | 'fire' | 'traffic' | 'outage' | 'weather' | 'news';

export interface StreetGuess {
  /** The street name as typed, title-cased: "Coppersome Close". */
  typed: string;
  /** Name words in registry form: "COPPERSOME". */
  name: string;
  /** Registry suffix ("CL") when one was typed. */
  suffix?: string;
  houseNumber?: string;
  /** Calgary names streets after their community; "Copper…" streets are in Copperfield. A guess until the registry confirms. */
  likely?: CommunityMatch;
  /** A lone word with nothing else to go on ("madigan"): only shown when the register finds it. */
  bare?: boolean;
}

/** A named place that isn't a community: "westside" is the Westside Recreation Centre. */
export interface Landmark {
  name: string;
  address: string;
  /** Communities it sits in or between, by their bundled names. */
  near: string[];
  url: string;
  keys: string[];
}

/** "best pho", "top 10 pizza places": someone asking for a recommendation. */
export interface BestAsk {
  /** What they want, as typed: "pho", "window cleaners". */
  thing: string;
}

export interface SearchIntent {
  communities: CommunityMatch[];
  quadrant?: 'NW' | 'NE' | 'SW' | 'SE';
  time: TimeWindow | null;
  topics: Topic[];
  street: StreetGuess | null;
  /** "why…", "what's…": someone asking, not browsing. */
  question: boolean;
  landmark?: Landmark;
  best?: BestAsk;
}

// ─── Words ──────────────────────────────────────────────────────────────────

const TOPIC_WORDS: Record<Topic, string[]> = {
  police: ['police', 'cops', 'cop', 'cps', 'rcmp', 'officers', 'officer', 'swat', 'tactical', 'arrest', 'arrested', 'sirens', 'siren', 'manhunt', 'standoff'],
  helicopter: ['helicopter', 'helicopters', 'hawcs', 'chopper', 'circling'],
  lockdown: ['lockdown', 'lockdowns', 'locked down', 'hold and secure', 'shelter in place'],
  crime: ['crime', 'crimes', 'theft', 'thefts', 'stolen', 'break in', 'break ins', 'breakin', 'robbery', 'shooting', 'shootings', 'shots', 'stabbing', 'assault', 'vandalism', 'graffiti', 'suspicious', 'prowling', 'prowler', 'fraud', 'homicide', 'murder'],
  fire: ['fire', 'fires', 'smoke', 'firefighters', 'fire trucks', 'ambulance', 'ambulances', 'ems', 'explosion', 'emergency'],
  traffic: ['traffic', 'crash', 'crashes', 'collision', 'accident', 'accidents', 'road closed', 'road closure', 'closure', 'closures', 'detour'],
  outage: ['outage', 'outages', 'power out', 'power outage', 'blackout', 'enmax', 'no power', 'water main'],
  weather: ['weather', 'storm', 'hail', 'tornado', 'snowstorm', 'flood', 'flooding', 'wind warning'],
  news: ['news', 'happening', 'going on', 'what happened', 'incident', 'incidents', 'reports', 'report', 'alerts', 'alert', 'updates'],
};

const TIME_WORDS: Array<[TimeKey, string[]]> = [
  ['last-night', ['last night', 'overnight']],
  ['tonight', ['tonight', 'this evening', 'tonite']],
  ['now', ['right now', 'now', 'active', 'currently', 'live']],
  ['today', ['today', 'this morning', 'this afternoon']],
  ['yesterday', ['yesterday', 'yday']],
  ['week', ['this week', 'past week', 'last week', 'lately', 'recently']],
];

/** Words that carry no place: never matched to a community or read as a street. */
const FILLER = new Set(['why', 'what', 'whats', 'is', 'are', 'was', 'there', 'so', 'much', 'many', 'a', 'an', 'the', 'in', 'on', 'at', 'near', 'by', 'of', 'for', 'to', 'and', 'or', 'calgary', 'yyc', 'my', 'area', 'neighbourhood', 'neighborhood', 'community', 'all', 'lot', 'lots', 'going', 'happened', 'did', 'does', 'any', 'some', 'around', 'it', 'i', 'me', 'us', 'ab', 'alberta', 'over', 'up', 'just', 'still', 'again']);

const QUADRANTS = new Set(['nw', 'ne', 'sw', 'se']);

/**
 * Places people search by name that aren't communities. Only facts checked
 * against the place's own site: address and the communities around it.
 */
export const LANDMARKS: Landmark[] = [
  { name: 'Westside Recreation Centre', address: '2000 69 St SW', near: ['Springbank Hill', 'Aspen Woods'], url: 'https://www.westsiderec.com',
    keys: ['westside', 'west side', 'westside rec', 'west side rec', 'westside recreation', 'westside recreation centre', 'westside rec centre'] },
];

const BEST_WORDS = new Set(['best', 'top', 'greatest', 'favourite', 'favorite']);
/** Words around the thing that don't change what's being asked for. */
const BEST_FILLER = new Set(['the', 'a', 'whats', 'what', 'who', 'where', 'is', 'are', 'has', 'most', 'rated', 'places', 'place', 'spots', 'spot', 'shops', 'shop', 'options', 'companies', 'company', 'services', 'service', 'calgary', 'yyc', 'ab', 'alberta', 'for', 'to', 'get', 'go']);

/** Calgary registry suffixes (Property Assessments `address` column). */
export const STREET_SUFFIX: Record<string, string> = {
  street: 'ST', st: 'ST', avenue: 'AV', ave: 'AV', av: 'AV', road: 'RD', rd: 'RD', drive: 'DR', dr: 'DR', boulevard: 'BV', blvd: 'BV',
  trail: 'TR', tr: 'TR', way: 'WY', wy: 'WY', close: 'CL', cl: 'CL', place: 'PL', pl: 'PL', crescent: 'CR', cres: 'CR', cr: 'CR',
  court: 'CO', ct: 'CO', co: 'CO', bay: 'BA', gate: 'GA', gardens: 'GD', green: 'GR', grove: 'GV', heights: 'HT', heath: 'HE',
  hill: 'HL', hills: 'HL', landing: 'LD', lane: 'LN', link: 'LI', manor: 'MR', mews: 'ME', mount: 'MT', park: 'PA', parade: 'PR',
  point: 'PT', rise: 'RI', row: 'RO', square: 'SQ', terrace: 'TC', view: 'VW', villas: 'VI', walk: 'WK', circle: 'CI', common: 'CM',
  commons: 'CM', cove: 'CV', plaza: 'PZ', passage: 'PS', highway: 'HI', path: 'PH', glen: 'GL', ridge: 'RG',
};

export function normalizeWords(q: string): string[] {
  return q.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('en-CA')
    .replace(/(\d+)(?:st|nd|rd|th)\b/g, '$1').replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
}

const compact = (s: string) => normalizeWords(s).join('');

/** Optimal string alignment distance, capped: anything over `max` returns max + 1. */
export function editDistance(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      rowMin = Math.min(rowMin, d[i][j]);
    }
    if (rowMin > max) return max + 1;
  }
  return d[a.length][b.length];
}

interface IndexEntry { key: string; community: CalgaryCommunity; alias: boolean }
const INDEX: IndexEntry[] = CALGARY_COMMUNITIES.flatMap(c => [
  { key: compact(c.name), community: c, alias: false },
  ...(c.aliases ?? []).map(a => ({ key: compact(a), community: c, alias: true })),
]);

function matchPhrase(phrase: string): CommunityMatch | null {
  const exact = INDEX.find(e => e.key === phrase);
  if (exact) return { community: exact.community, slug: toSlug(exact.community.name), via: exact.alias ? 'alias' : 'name' };
  if (phrase.length < 6) return null;
  // "copperstone" is a street in Copperfield, not a typo of Cornerstone.
  const prefix = communityByStreetPrefix(phrase);
  const max = phrase.length >= 9 ? 2 : 1;
  let best: { e: IndexEntry; d: number } | null = null;
  for (const e of INDEX) {
    if (e.key[0] !== phrase[0] || (prefix && prefix.community !== e.community)) continue;
    const d = editDistance(phrase, e.key, max);
    if (d <= max && (!best || d < best.d)) best = { e, d };
  }
  // "altafor" is two edits from Altadore. Allow that on a 7–8 letter word only
  // when the first four letters of an official name agree and no other community is as close.
  if (!best && phrase.length >= 7 && !prefix) {
    const near = INDEX.filter(e => !e.alias && e.key.startsWith(phrase.slice(0, 4)) && editDistance(phrase, e.key, 2) <= 2);
    if (near.length && near.every(e => e.community === near[0].community)) best = { e: near[0], d: 2 };
  }
  return best ? { community: best.e.community, slug: toSlug(best.e.community.name), via: 'typo' } : null;
}

/** "Copper…" → Copperfield: Calgary suburbs name their streets after the community. */
export function communityByStreetPrefix(name: string): CommunityMatch | undefined {
  const word = compact(name);
  if (word.length < 5) return undefined;
  let best: { c: CalgaryCommunity; n: number } | undefined;
  let tie = false;
  for (const c of CALGARY_COMMUNITIES) {
    const first = normalizeWords(c.name)[0] ?? '';
    let n = 0;
    while (n < word.length && n < first.length && word[n] === first[n]) n++;
    if (n < 5) continue;
    if (!best || n > best.n) { best = { c, n }; tie = false; } else if (n === best.n && c !== best.c) tie = true;
  }
  return best && !tie ? { community: best.c, slug: toSlug(best.c.name), via: 'typo' } : undefined;
}

// ─── Time ───────────────────────────────────────────────────────────────────

const calgaryClock = calgaryDateTimeFormat('en-CA', { timeZone: 'America/Edmonton', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
const HOUR = 3_600_000;

/** Epoch ms of the most recent midnight in Calgary. */
export function calgaryMidnight(now: number): number {
  const [h, m, s] = calgaryClock.format(new Date(now)).split(':').map(Number);
  return now - ((h * 60 + m) * 60 + s) * 1000 - (now % 1000);
}

export function timeWindow(key: TimeKey, now: number): TimeWindow {
  const midnight = calgaryMidnight(now);
  const hour = (now - midnight) / HOUR;
  switch (key) {
    case 'now': return { key, label: 'In the last 3 hours', from: now - 3 * HOUR, to: now };
    case 'tonight': {
      const from = hour >= 17 ? midnight + 17 * HOUR : hour < 6 ? midnight - 7 * HOUR : now - 6 * HOUR;
      return { key, label: 'Tonight', from, to: now };
    }
    case 'last-night': return { key, label: 'Last night', from: midnight - 6 * HOUR, to: midnight + 6 * HOUR };
    case 'today': return { key, label: 'Today', from: midnight, to: now };
    case 'yesterday': return { key, label: 'Yesterday', from: midnight - 24 * HOUR, to: midnight };
    case 'week': return { key, label: 'In the last 7 days', from: now - 168 * HOUR, to: now };
  }
}

// ─── Parse ──────────────────────────────────────────────────────────────────

function hasPhrase(words: string[], phrase: string): number {
  const p = phrase.split(' ');
  for (let i = 0; i + p.length <= words.length; i++) if (p.every((w, k) => words[i + k] === w)) return i;
  return -1;
}

const title = (s: string) => s.replace(/\b\w/g, c => c.toUpperCase());

export function parseSearchIntent(q: string, now = Date.now()): SearchIntent {
  const words = normalizeWords(q);
  const used = new Array(words.length).fill(false);
  const claim = (phrase: string) => {
    const at = hasPhrase(words, phrase);
    if (at < 0) return false;
    for (let k = 0; k < phrase.split(' ').length; k++) used[at + k] = true;
    return true;
  };

  let time: TimeWindow | null = null;
  for (const [key, phrases] of TIME_WORDS) {
    if (phrases.some(claim) && !time) time = timeWindow(key, now);
  }
  // "best pho places in calgary": the thing is everything after "best" up to "in"/"near".
  let best: BestAsk | undefined;
  const bestAt = words.findIndex(w => BEST_WORDS.has(w));
  if (bestAt >= 0 && words.slice(0, bestAt).every(w => BEST_FILLER.has(w))) {
    const stop = words.findIndex((w, i) => i > bestAt && (w === 'in' || w === 'near' || w === 'around' || w === 'by'));
    const end = stop < 0 ? words.length : stop;
    const thing = words.slice(bestAt + 1, end).filter((w, i) => !used[bestAt + 1 + i] && !(i === 0 && /^\d+$/.test(w)) && !BEST_FILLER.has(w));
    if (thing.length) {
      best = { thing: thing.join(' ') };
      for (let k = 0; k < end; k++) used[k] = true;
      if (stop >= 0) used[stop] = true;
    }
  }
  const topics = best ? [] : (Object.keys(TOPIC_WORDS) as Topic[]).filter(t => TOPIC_WORDS[t].filter(claim).length > 0);
  const question = ['why', 'what', 'whats', 'how', 'who', 'is'].includes(words[0] ?? '');
  const quadrantWord = words.find(w => QUADRANTS.has(w));
  words.forEach((w, i) => { if (QUADRANTS.has(w) || FILLER.has(w)) used[i] = true; });

  // A landmark is the whole of what's left: "westside", "westside rec".
  const leftover = compact(words.filter((_, i) => !used[i]).join(' '));
  const landmark = leftover ? LANDMARKS.find(l => l.keys.some(k => compact(k) === leftover)) : undefined;
  if (landmark) used.fill(true);

  // Communities: longest unclaimed run first, so "spring bank hill" beats "hill".
  const communities: CommunityMatch[] = [];
  for (let n = Math.min(4, words.length); n >= 1; n--) {
    for (let i = 0; i + n <= words.length; i++) {
      if (used.slice(i, i + n).some(Boolean)) continue;
      const run = words.slice(i, i + n);
      if (run.some(w => /^\d/.test(w))) continue;
      // "applewood place", "123 seton way": a community word followed by a suffix names a street there.
      const next = words[i + n];
      if (next && !used[i + n] && STREET_SUFFIX[next] && !INDEX.some(e => e.key === [...run, next].join(''))) continue;
      const m = matchPhrase(run.join(''));
      if (!m) continue;
      for (let k = i; k < i + n; k++) used[k] = true;
      if (!communities.some(c => c.community === m.community)) communities.push(m);
    }
  }
  // Prefer the quadrant someone typed when names repeat across the city.
  const quadrant = quadrantWord?.toUpperCase() as SearchIntent['quadrant'];

  // Whatever is left may be a street: "coppersome close", "123 applestone pl", "copperstone".
  const rest = words.map((w, i) => (used[i] ? null : w));
  let street: StreetGuess | null = null;
  const left = rest.filter((w): w is string => !!w);
  if (left.length && left.length <= 5) {
    const houseNumber = /^\d+$/.test(left[0]) && left.length > 1 ? left[0] : undefined;
    const body = houseNumber ? left.slice(1) : left;
    const last = body[body.length - 1];
    const suffix = body.length > 1 ? STREET_SUFFIX[last] : undefined;
    const nameWords = suffix ? body.slice(0, -1) : body;
    const name = nameWords.join(' ');
    const likely = nameWords.length && !/^\d/.test(nameWords[0]) ? communityByStreetPrefix(nameWords[0]) : undefined;
    // Only treat leftovers as a street when something says so; "zoo" isn't one.
    if (name && (suffix || houseNumber || likely)) {
      street = { typed: title(body.join(' ')), name: name.toUpperCase(), ...(suffix ? { suffix } : {}), ...(houseNumber ? { houseNumber } : {}), ...(likely ? { likely } : {}) };
    }
  }

  return { communities: communities.slice(0, 3), ...(quadrant ? { quadrant } : {}), time, topics, street, question, ...(landmark ? { landmark } : {}), ...(best ? { best } : {}) };
}

/**
 * "madigan" on its own: no community, no suffix, no listing. Many Calgary
 * streets (Madigan Drive NE) don't share their community's name, so a single
 * word of five letters or more is worth one exact register lookup. Callers
 * use it only when nothing else answered, and show it only when it's found.
 */
export function bareStreetGuess(intent: SearchIntent, q: string): StreetGuess | null {
  if (intent.communities.length || intent.street || intent.landmark || intent.best || intent.time || intent.topics.length) return null;
  const left = normalizeWords(q).filter(w => !FILLER.has(w) && !QUADRANTS.has(w));
  if (left.length !== 1 || !/^[a-z]{5,}$/.test(left[0])) return null;
  return { typed: title(left[0]), name: left[0].toUpperCase(), bare: true };
}

/** A citywide "what's been reported" answer: a topic or a time, but no place. */
export function showsCitywide(intent: SearchIntent): boolean {
  return !intent.communities.length && (intent.topics.length > 0 || !!intent.time);
}

/** How many ready-made answers a search gets, counted as results in Search demand. */
export function answerCount(intent: SearchIntent): number {
  return intent.communities.length + (intent.street ? 1 : 0) + (intent.landmark ? 1 : 0) + (showsCitywide(intent) ? 1 : 0);
}

/** One line on what search now answers for a term, for the admin page. */
export function describeAnswer(intent: SearchIntent): string | null {
  if (intent.landmark) return intent.landmark.name;
  if (intent.street) return `Street${intent.street.likely ? ` in ${intent.street.likely.community.name}` : ''}`;
  if (intent.communities.length) return intent.communities.map(c => c.community.name).join(', ');
  if (showsCitywide(intent)) return `${intent.time?.label ?? 'Recent'} reports`;
  return null;
}

/** Whether the page should show live reports for this search. */
export function wantsReports(intent: SearchIntent): boolean {
  return intent.communities.length > 0 || intent.topics.length > 0 || !!intent.time;
}

// ─── Reports ────────────────────────────────────────────────────────────────

const SAFETY: IncidentCategory[] = ['crime', 'emergency'];
const TOPIC_CATEGORIES: Record<Topic, IncidentCategory[] | null> = {
  police: SAFETY, helicopter: SAFETY, lockdown: SAFETY, crime: SAFETY, fire: ['emergency'],
  traffic: ['traffic'], outage: ['infrastructure'], weather: ['weather'], news: null,
};

/** Categories the topics ask for, or null for everything. */
export function categoriesFor(topics: Topic[]): IncidentCategory[] | null {
  if (!topics.length) return null;
  // "crime reports": the specific word wins over the generic one.
  const specific = topics.length > 1 ? topics.filter(t => t !== 'news') : topics;
  const sets = specific.map(t => TOPIC_CATEGORIES[t]);
  if (sets.some(s => s === null)) return null;
  return [...new Set(sets.flat() as IncidentCategory[])];
}

const TOPIC_TEXT: Partial<Record<Topic, RegExp>> = {
  police: /\bpolice|cps|officer|arrest|charged|tactical/i,
  helicopter: /helicopter|hawcs|air support/i,
  lockdown: /lockdown|hold and secure|shelter in place|school/i,
};

export function incidentInCommunity(incident: Pick<Incident, 'neighborhood' | 'lat' | 'lng'>, community: CalgaryCommunity, boundaries?: CommunityBoundary[]): boolean {
  const hood = compact(incident.neighborhood ?? '');
  const keys = [community.name, ...(community.aliases ?? [])].map(compact);
  if (hood && keys.some(k => hood === k || hood.startsWith(k) || (k.length >= 6 && hood.includes(k)))) return true;
  const b = boundaries?.find(x => x.name === community.name.toLowerCase());
  if (!b || !Number.isFinite(incident.lat) || !Number.isFinite(incident.lng)) return false;
  const [minLng, minLat, maxLng, maxLat] = b.bbox;
  if (incident.lng < minLng || incident.lng > maxLng || incident.lat < minLat || incident.lat > maxLat) return false;
  return b.polygons.some(p => pointInPolygon(incident.lng, incident.lat, p));
}

export interface ReportAnswer {
  reports: Incident[];
  window: { label: string; from: number; to: number };
  /** True when the window was empty and these are simply the latest matching reports. */
  widened: boolean;
}

/**
 * The reports that answer this search, newest first. Topic words narrow the
 * category, a community narrows the place, a time word narrows the window.
 * With no time word, a place looks back a week and a citywide topic two days.
 */
export function reportsForIntent(incidents: Incident[], intent: SearchIntent, now: number, boundaries?: CommunityBoundary[], max = 8): ReportAnswer {
  const cats = categoriesFor(intent.topics);
  const text = intent.topics.map(t => TOPIC_TEXT[t]).filter((r): r is RegExp => !!r);
  const window = intent.time ?? (intent.communities.length
    ? { label: 'In the last 7 days', from: now - 168 * HOUR, to: now }
    : { label: 'In the last 48 hours', from: now - 48 * HOUR, to: now });
  const matching = incidents
    .filter(i => i.timestamp <= now)
    .filter(i => !intent.communities.length || intent.communities.some(c => incidentInCommunity(i, c.community, boundaries)))
    .filter(i => !cats || cats.includes(i.category) || text.some(r => r.test(`${i.title} ${i.description}`)))
    .sort((a, b) => {
      // Posts that mention the exact thing asked about ("helicopter") lead.
      const score = (i: Incident) => (text.some(r => r.test(`${i.title} ${i.description}`)) ? 1 : 0);
      return score(b) - score(a) || b.timestamp - a.timestamp;
    });
  const inWindow = matching.filter(i => i.timestamp >= window.from && i.timestamp <= window.to);
  if (inWindow.length) return { reports: inWindow.slice(0, max), window, widened: false };
  return { reports: matching.slice(0, Math.min(3, max)), window, widened: true };
}

// ─── Street registry ────────────────────────────────────────────────────────

const ASSESSMENTS = 'https://data.calgary.ca/resource/4ur7-wsgc.json';

/**
 * Registry queries for a street, exact first, then a shortened prefix that
 * forgives a typo near the end ("COPPERSOME" → "COPPERS%" finds COPPERSTONE).
 */
export function streetLookupUrls(street: StreetGuess): string[] {
  const safe = (s: string) => s.replace(/'/g, "''").replace(/[%_]/g, '');
  const sfx = street.suffix ? ` ${street.suffix} ` : ' ';
  const name = safe(street.name);
  const head = street.houseNumber ? `${street.houseNumber} ` : '% ';
  const exact = `address like '${head}${name}${sfx}%'`;
  const stem = name.split(' ')[0].slice(0, Math.max(5, name.split(' ')[0].length - 3));
  const fuzzy = `address like '% ${stem}%${street.suffix ? ` ${street.suffix} ` : ''}%'`;
  const url = (where: string) => `${ASSESSMENTS}?$select=address,comm_name&$group=address,comm_name&$limit=200&$where=${encodeURIComponent(where)}`;
  // A bare word gets no typo pass: "% DOWNST%" would find a street nobody meant.
  return !street.bare && stem.length >= 5 && stem !== name ? [url(exact), url(fuzzy)] : [url(exact)];
}

export interface StreetAnswer { street: string; community: string; quadrant?: string; addresses: number }

/** "CL" → "Close": the register abbreviates, people don't. */
const SUFFIX_WORD: Record<string, string> = {
  ST: 'Street', AV: 'Avenue', RD: 'Road', DR: 'Drive', BV: 'Boulevard', TR: 'Trail', WY: 'Way', CL: 'Close', PL: 'Place', CR: 'Crescent',
  CO: 'Court', BA: 'Bay', GA: 'Gate', GD: 'Gardens', GR: 'Green', GV: 'Grove', HT: 'Heights', HE: 'Heath', HL: 'Hill', LD: 'Landing',
  LN: 'Lane', LI: 'Link', MR: 'Manor', ME: 'Mews', MT: 'Mount', PA: 'Park', PR: 'Parade', PT: 'Point', RI: 'Rise', RO: 'Row', SQ: 'Square',
  TC: 'Terrace', VW: 'View', VI: 'Villas', WK: 'Walk', CI: 'Circle', CM: 'Common', CV: 'Cove', PZ: 'Plaza', PS: 'Passage', GL: 'Glen', RG: 'Ridge',
};
const titleRegistry = (s: string) => {
  const parts = s.trim().split(/\s+/);
  return parts.map((w, i) => {
    const lower = w.toLowerCase();
    if (QUADRANTS.has(lower)) return w.toUpperCase();
    // Only the word just before the quadrant is a suffix: "PARK" in "COUNTRY HILLS PARK NW" yes, "PARK" elsewhere no.
    if (i === parts.length - 2 && QUADRANTS.has(parts[parts.length - 1].toLowerCase()) && SUFFIX_WORD[w.toUpperCase()]) return SUFFIX_WORD[w.toUpperCase()];
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  }).join(' ');
};

/** Group registry rows by street and pick the street (and its community) the person most likely meant. */
export function summarizeStreetRows(rows: Array<{ address?: string; comm_name?: string }>, street: StreetGuess): StreetAnswer | null {
  const by = new Map<string, { n: number; comm: Map<string, number> }>();
  for (const r of rows) {
    if (!r.address || !r.comm_name) continue;
    const parts = r.address.trim().split(/\s+/);
    while (parts.length > 3 && /^\d/.test(parts[0])) parts.shift();
    const name = parts.join(' ');
    const row = by.get(name) ?? { n: 0, comm: new Map() };
    row.n++; row.comm.set(r.comm_name, (row.comm.get(r.comm_name) ?? 0) + 1);
    by.set(name, row);
  }
  const target = compact(street.name);
  const distance = (a: string) => editDistance(compact(a.split(' ').slice(0, -2).join(' ') || a), target, 4);
  const ranked = [...by.entries()].sort(([a, x], [b, y]) => distance(a) - distance(b) || y.n - x.n);
  if (!ranked.length) return null;
  const [name, row] = ranked[0];
  // A bare word must be the whole street name: "madigan" is Madigan Dr, not Madigan Bay Estates Rd.
  if (street.bare && distance(name) !== 0) return null;
  const community = [...row.comm.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const quadrant = name.split(' ').pop();
  return { street: titleRegistry(name), community: titleRegistry(community), ...(quadrant && QUADRANTS.has(quadrant.toLowerCase()) ? { quadrant } : {}), addresses: row.n };
}

/** The bundled community for a registry name, when it's one we know. */
export function communityByName(name: string): CommunityMatch | undefined {
  const key = compact(name);
  const e = INDEX.find(x => !x.alias && x.key === key);
  return e ? { community: e.community, slug: toSlug(e.community.name), via: 'name' } : undefined;
}
