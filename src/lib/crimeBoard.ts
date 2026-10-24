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

export const CRIME_BOARD_DOC = { collection: 'live_data', id: 'crime_board' } as const;
/** How far back the board reaches. Police releases live 35 days, news crime 28. */
export const CRIME_BOARD_WINDOW_MS = 35 * 24 * 60 * 60 * 1000;
export const CRIME_BOARD_MAX = 150;
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

type LaneFields = Pick<Incident, 'category' | 'source_type' | 'data_source' | 'authorUid'>;

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
  return true;
}

/** A report a real neighbour posted: not a feed, not the example pulse. */
export function isMemberReport(incident: LaneFields): boolean {
  if (incident.data_source === 'official' || incident.data_source === 'system' || incident.data_source === 'demo') return false;
  if (incident.authorUid === 'system' || incident.authorUid === 'demo') return false;
  return !incident.source_type || incident.source_type === 'user_report';
}

/** Belongs on the board: police, news crime, emergency alerts and neighbours' crime reports. */
export function isBoardIncident(incident: LaneFields): boolean {
  if (incident.category !== 'crime' && incident.category !== 'emergency') return false;
  if (isCitySignal(incident)) return false;
  if (incident.data_source === 'demo' || incident.authorUid === 'demo') return false;
  return true;
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
  const entries = incidents
    .filter((i) => (i.visibility ?? 'public') === 'public' && !i.deleted && !i.flagged)
    .filter((i) => Number.isFinite(Number(i.lat)) && Number.isFinite(Number(i.lng)) && Number.isFinite(i.timestamp))
    .filter((i) => now - i.timestamp < CRIME_BOARD_WINDOW_MS && i.timestamp <= now + 60 * 60 * 1000)
    .filter((i) => !i.expires_at || i.expires_at > now)
    .filter(isBoardIncident)
    .filter((i) => !isMemberReport(i) || now - i.timestamp < MEMBER_CRIME_MAP_MS)
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, CRIME_BOARD_MAX)
    .map(toEntry);
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
