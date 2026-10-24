/**
 * The map's crime board: real crime and safety records, kept apart from the
 * City's service signals so the signals can't push them off the map.
 *
 * Why this exists (2026-10-21 snapshot of the public incidents): the map loads
 * the newest 60 records, and 53 of those 60 were City 311 rows (debris, signal
 * faults, sewage back-ups, graffiti). Every Calgary Police release from the
 * previous month, and every neighbour's own report, sat past position 60 and
 * never reached the map, even though their records were still live.
 *
 * The ingest job (admin credentials) picks the crime and safety records out
 * of the last 35 days and writes them to one public document, `live_data/
 * crime_board`, so a map visit costs one extra read instead of hundreds.
 * Nothing here creates or rewrites a record: each entry is a copy of a public
 * incident, trimmed to the fields the map shows.
 */

import type { Incident } from '../types';
import { cleanText } from './cleanText';

export const CRIME_BOARD_DOC = { collection: 'live_data', id: 'crime_board' } as const;
/** How far back the board reaches. Police releases live 60 days, news crime 45, so "All" holds two months. */
export const CRIME_BOARD_WINDOW_MS = 60 * 24 * 60 * 60 * 1000;
export const CRIME_BOARD_MAX = 220;
/** Neighbours' safety reports to 311 on the board; they expire in 7 days and run ~80 a week. */
export const SAFETY_311_MAX = 60;
/** The ingest rebuilds the board at least this often, sooner when crime arrives. */
export const CRIME_BOARD_REFRESH_MS = 2 * 60 * 60 * 1000;
/** Older than this and the map ignores the board (a stalled job never shows a stale list as current). */
export const CRIME_BOARD_MAX_AGE_MS = 12 * 60 * 60 * 1000;

/**
 * How long a neighbour's own crime or safety report stays on the map. It used
 * to be the same five days as everything else, so a stolen-car report was gone
 * before most neighbours saw it.
 */
export const MEMBER_CRIME_MAP_MS = 30 * 24 * 60 * 60 * 1000;
/** Everything else a neighbour posts (a stalled train, a pothole). */
export const MEMBER_OTHER_MAP_MS = 5 * 24 * 60 * 60 * 1000;

type LaneFields = Pick<Incident, 'category' | 'source_type' | 'data_source' | 'authorUid'> & Partial<Pick<Incident, 'title'>>;

/**
 * 311 requests where a neighbour reported a person or a damaged, unsecured
 * place: disturbances, vandalism, transit safety, derelict buildings. They
 * are what neighbours saw, not police-confirmed offences (the record says so),
 * but they are the City's only street-level safety data, and on 2026-10-24
 * 77 of them sat hidden with the maintenance signals. Graffiti and problem
 * vehicles stay with the signals: high volume, low interest.
 */
const SAFETY_311_TITLE = /^(Disturbance|Vandalism|Transit safety|Derelict or unsecured property)\b/i;

export function isSafety311(incident: LaneFields): boolean {
  return incident.source_type === 'calgary_open_data' && incident.category === 'crime'
    && SAFETY_311_TITLE.test(incident.title ?? '');
}

/**
 * City service signals: 311 requests, roads, outages, water, weather. True
 * for every official feed except police releases, news stories and provincial
 * emergency alerts. Emergencies are never signals, whoever sent them.
 */
export function isCitySignal(incident: LaneFields): boolean {
  if (incident.category === 'emergency') return false;
  if (incident.data_source !== 'official' && incident.data_source !== 'system') return false;
  if (incident.source_type === 'calgary_police_crime') return false;
  if (incident.source_type === 'news_rss' && incident.category === 'crime') return false;
  if (isSafety311(incident)) return false;
  return true;
}

/** A report a real neighbour posted: not a feed, not the example pulse. */
export function isMemberReport(incident: LaneFields): boolean {
  if (incident.data_source === 'official' || incident.data_source === 'system' || incident.data_source === 'demo') return false;
  if (incident.authorUid === 'system' || incident.authorUid === 'demo') return false;
  return !incident.source_type || incident.source_type === 'user_report';
}

/** Belongs on the board: police, news crime, emergency alerts, 311 safety reports and neighbours' crime reports. */
export function isBoardIncident(incident: LaneFields): boolean {
  if (incident.category !== 'crime' && incident.category !== 'emergency') return false;
  if (isCitySignal(incident)) return false;
  if (incident.data_source === 'demo' || incident.authorUid === 'demo') return false;
  return true;
}

/**
 * Words a crime or safety report uses. A neighbour's post filed as crime
 * without any of them ("Nighttime Screamer", "CTrain is late") stays in the
 * feed for its usual life but isn't promoted to the board.
 */
const CRIME_WORDS = /\b(stol(e|en)|theft|thie(f|ves)|steal|rob(bed|bery|beries)?|break.?in|broke(n)? into|prowl|burglar|carjack|assault|attack|fight|punch|stab|knife|gun|shot|shoot|firearm|bb gun|weapon|vandal|smash|damage|graffiti|arson|fire|trespass|suspicious|sketchy|lurking|following|harass|threat|drug|needle|overdose|fraud|scam|porch pirate|package|license plate|plate|police|cops?|911|missing|abduct|indecent|exposure|stalk|creep)/i;

export function looksLikeCrime(text: string): boolean {
  return CRIME_WORDS.test(text);
}

const STOP = new Set(['the', 'a', 'an', 'in', 'on', 'at', 'of', 'for', 'to', 'and', 'after', 'with', 'by', 'from', 'calgary', 'calgarys', 'police', 'update', 'say', 'says', 'man', 'woman', 'is', 'was', 'into', 'outside', 'near', 'during']);
function words(title: string): Set<string> {
  return new Set(title.toLowerCase().replace(/[‘’'"“”]/g, '').split(/[^a-z0-9]+/).filter((w) => w.length > 1 && !STOP.has(w) && !/^\d+$/.test(w)));
}
function overlap(a: Set<string>, b: Set<string>): number {
  let shared = 0;
  for (const w of a) if (b.has(w)) shared++;
  return shared / Math.max(1, a.size + b.size - shared);
}
const EVENT = /\b(stabb?ing|stabbed|shooting|shot|robber(y|ies)|carjack\w*|homicide|fire|blaze|assault|collision|crash|missing)\b/i;
function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = (a.lat - b.lat) * 111;
  const dLng = (a.lng - b.lng) * 111 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dLat, dLng);
}

/**
 * Two records about the same event: three newsrooms on one strip-mall fire,
 * or a police release and its "Update #1". Same place (or within 3 km), and
 * either most headline words shared within a week, or the same kind of event
 * within a day and a half.
 */
export function sameStory(a: Incident, b: Incident): boolean {
  if (a.category !== b.category || isMemberReport(a) || isMemberReport(b)) return false;
  if (isSafety311(a) || isSafety311(b)) return false;
  const near = a.neighborhood === b.neighborhood || km(a, b) <= 3;
  if (!near) return false;
  const gap = Math.abs(a.timestamp - b.timestamp);
  const wa = words(a.title);
  const wb = words(b.title);
  if (gap <= 7 * 24 * 60 * 60 * 1000 && overlap(wa, wb) >= 0.5) return true;
  const ea = a.title.match(EVENT)?.[0].toLowerCase().replace(/^(stabb?ing|stabbed)$/, 'stab').replace(/^(blaze)$/, 'fire');
  const eb = b.title.match(EVENT)?.[0].toLowerCase().replace(/^(stabb?ing|stabbed)$/, 'stab').replace(/^(blaze)$/, 'fire');
  return gap <= 36 * 60 * 60 * 1000 && Boolean(ea) && ea === eb;
}

/** Text as people should read it: entities decoded, mojibake repaired. */
export function tidyIncidentText<T extends Pick<Incident, 'title' | 'description'>>(incident: T): T {
  const title = cleanText(incident.title ?? '');
  const description = cleanText(incident.description ?? '');
  return title === incident.title && description === incident.description ? incident : { ...incident, title, description };
}

/** How long a neighbour report stays on the map; null for feeds, which carry expires_at. */
export function memberMapLifetimeMs(incident: LaneFields): number | null {
  if (incident.data_source === 'official' || incident.data_source === 'system') return null;
  if (isMemberReport(incident) && (incident.category === 'crime' || incident.category === 'emergency')) {
    return MEMBER_CRIME_MAP_MS;
  }
  return MEMBER_OTHER_MAP_MS;
}

export interface BoardEntry extends Pick<Incident,
  'id' | 'title' | 'description' | 'category' | 'neighborhood' | 'lat' | 'lng' | 'timestamp' |
  'verified_status' | 'report_count' | 'anonymous' | 'name' | 'email'> {
  source_name?: string;
  source_url?: string;
  source_type?: Incident['source_type'];
  data_source?: Incident['data_source'];
  expires_at?: number;
  image_url?: string;
  /** A neighbour's report: the map re-checks it is still public before showing it. */
  member?: boolean;
  related_count?: number;
  related_sources?: string[];
  related_ids?: string[];
}

export interface CrimeBoard {
  checkedAt: number;
  entries: BoardEntry[];
}

function toEntry(incident: Incident): BoardEntry {
  const member = isMemberReport(incident);
  const entry: BoardEntry = {
    id: incident.id,
    title: incident.title,
    description: incident.description,
    category: incident.category,
    neighborhood: incident.neighborhood,
    lat: Number(incident.lat),
    lng: Number(incident.lng),
    timestamp: incident.timestamp,
    verified_status: incident.verified_status,
    report_count: incident.report_count ?? 1,
    anonymous: incident.anonymous === true,
    // A neighbour's name is shown only when they chose to show it; email never leaves the record.
    name: member && incident.anonymous ? 'Anonymous' : incident.name ?? '',
    email: '',
    source_name: incident.source_name,
    source_url: incident.source_url,
    source_type: incident.source_type,
    data_source: incident.data_source,
    expires_at: incident.expires_at,
    image_url: incident.image_url,
    member: member || undefined,
  };
  return entry;
}

/** Pick the board from public incidents. Pure, shared by the ingest and tests. */
export function buildCrimeBoard(incidents: Incident[], now: number): CrimeBoard {
  const eligible = incidents
    .filter((i) => (i.visibility ?? 'public') === 'public' && !i.deleted && !i.flagged)
    .filter((i) => Number.isFinite(Number(i.lat)) && Number.isFinite(Number(i.lng)) && Number.isFinite(i.timestamp))
    .filter((i) => now - i.timestamp < CRIME_BOARD_WINDOW_MS && i.timestamp <= now + 60 * 60 * 1000)
    .filter((i) => !i.expires_at || i.expires_at > now)
    .filter(isBoardIncident)
    .filter((i) => !isMemberReport(i) || (now - i.timestamp < MEMBER_CRIME_MAP_MS && looksLikeCrime(`${i.title} ${i.description ?? ''}`)))
    .map((i) => tidyIncidentText({ ...i, lat: Number(i.lat), lng: Number(i.lng) }))
    .sort((a, b) => b.timestamp - a.timestamp);

  // One pin per event: the newest record of a story stands for it and counts the rest.
  const stories: { lead: Incident; count: number; sources: Set<string>; ids: string[] }[] = [];
  let safety311 = 0;
  for (const incident of eligible) {
    if (isSafety311(incident)) {
      if (safety311 >= SAFETY_311_MAX) continue;
      safety311++;
    }
    const story = stories.find((s) => sameStory(s.lead, incident));
    if (story) {
      story.count++;
      story.ids.push(incident.id);
      if (incident.source_name) story.sources.add(incident.source_name);
      continue;
    }
    stories.push({ lead: incident, count: 1, sources: new Set(incident.source_name ? [incident.source_name] : []), ids: [] });
  }

  const entries = stories.slice(0, CRIME_BOARD_MAX).map(({ lead, count, sources, ids }) => {
    const entry = toEntry(lead);
    if (count > 1) {
      entry.related_count = count;
      entry.related_ids = ids.slice(0, 12);
      if (sources.size > 1) entry.related_sources = [...sources].slice(0, 4);
    }
    return entry;
  });
  // JSON round trip drops undefined fields, which Firestore refuses to store.
  return JSON.parse(JSON.stringify({ checkedAt: now, entries }));
}

/** Read the stored board; null when missing, malformed or stale. */
export function readCrimeBoard(data: unknown, now: number): CrimeBoard | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Partial<CrimeBoard>;
  if (typeof d.checkedAt !== 'number' || !Array.isArray(d.entries)) return null;
  if (now - d.checkedAt > CRIME_BOARD_MAX_AGE_MS || d.checkedAt > now + 5 * 60 * 1000) return null;
  const entries = d.entries.filter((e): e is BoardEntry =>
    Boolean(e) && typeof e.id === 'string' && typeof e.title === 'string' &&
    Number.isFinite(Number(e.lat)) && Number.isFinite(Number(e.lng)) && Number.isFinite(e.timestamp));
  return { checkedAt: d.checkedAt, entries };
}

/** A board entry as the map's Incident shape. */
export function boardEntryToIncident(entry: BoardEntry): Incident {
  const { member: _member, ...rest } = entry;
  return { ...rest, lat: Number(entry.lat), lng: Number(entry.lng), visibility: 'public' } as Incident;
}
