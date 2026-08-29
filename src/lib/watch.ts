/**
 * The "My Watch" feed engine.
 *
 * The map already loads every currently-visible incident and decays them after
 * a day. What it never answered is the question a resident actually returns
 * for: *what changed near the places I care about since I last looked?* This
 * narrows the set the client already holds — by recency, by home distance, by
 * category — and sections it so an emergency and a routine road restriction are
 * not the same weight in the same list.
 *
 * It is deliberately pure: no Firestore reads, no React. The map's notification
 * panel and the weekly email both consume it, so a "since you last checked"
 * summary on screen and the email agree on what counts as near and relevant.
 * Ranking reuses the digest's scoring rather than inventing a second one.
 */

import type { Incident, IncidentCategory, SourceType } from '@/src/types';
import { isCommunityFacingIncident } from '@/src/types';
import {
  distanceMetres,
  digestHighlightScore,
  type Point,
  type ScoredIncident,
} from '@/src/lib/digest';

/** Where an incident sits in the feed, strongest signal first. */
export type WatchSection = 'emergency' | 'community' | 'official' | 'routine';

export interface WatchPrefs {
  /** Metres from home the reader cares about; null means no radius filter. */
  radiusM: number | null;
  /** Categories the reader wants; empty means every category. */
  categories: IncidentCategory[];
}

export interface WatchItem {
  incident: Incident;
  /** Metres from home, or null when there is no home to measure from. */
  distanceM: number | null;
  section: WatchSection;
}

export interface WatchFeed {
  items: WatchItem[];
  counts: Record<WatchSection, number>;
  /** Plain-language header; "" when nothing is new. */
  sinceSummary: string;
}

const SECTION_RANK: Record<WatchSection, number> = {
  emergency: 0,
  community: 1,
  official: 2,
  routine: 3,
};

/**
 * The high-volume machine feeds. These are the "routine API activity" the spec
 * wants demoted: 511 traffic disruptions, 311 open-data service requests, and
 * ambient weather/air readings. They are useful only when especially close, so
 * they sit last rather than jostling with a neighbour's report of a break-in.
 * ENMAX outages, police crime, emergency alerts, water-main breaks and news are
 * deliberately absent — those are meaningful official updates, not noise.
 */
const ROUTINE_SOURCE_TYPES: ReadonlySet<SourceType> = new Set<SourceType>([
  '511_alberta_traffic',
  'calgary_open_data',
  'env_canada_weather',
  'edmonton_open_data',
]);

/**
 * Which pane an incident belongs to.
 *
 * Emergencies outrank everything — someone is in danger. Real neighbour
 * reports come next: they are the lived, local signal the product exists to
 * carry. Then meaningful official updates (ENMAX outages, police, alerts).
 * Everything from the routine machine feeds sits last and earns its place only
 * by proximity.
 */
function sectionOf(incident: Incident): WatchSection {
  if (incident.category === 'emergency') return 'emergency';
  if (isCommunityFacingIncident(incident)) return 'community';
  if (incident.source_type && ROUTINE_SOURCE_TYPES.has(incident.source_type)) return 'routine';
  return 'official';
}

export function buildWatchFeed(input: {
  incidents: Incident[];
  home: Point | null;
  since: number | null;
  prefs: WatchPrefs;
  now: number;
}): WatchFeed {
  const { incidents, home, since, prefs, now } = input;

  const items: WatchItem[] = incidents
    // "Since you last checked": strictly newer than the last-seen mark. A null
    // mark is a first visit, so nothing is filtered out.
    .filter((i) => since === null || i.timestamp > since)
    .filter((i) => prefs.categories.length === 0 || prefs.categories.includes(i.category))
    .map((i) => ({
      incident: i,
      distanceM: home ? distanceMetres(home, { lat: i.lat, lng: i.lng }) : null,
      section: sectionOf(i),
    }))
    // Radius trims the far field, but a name-only match (null distance) is kept
    // rather than silently dropped — "we don't know how far" is not "too far".
    .filter((it) => prefs.radiusM === null || it.distanceM === null || it.distanceM <= prefs.radiusM);

  items.sort(
    (a, b) =>
      SECTION_RANK[a.section] - SECTION_RANK[b.section] ||
      digestHighlightScore({ incident: b.incident, distanceM: b.distanceM } as ScoredIncident, now) -
        digestHighlightScore({ incident: a.incident, distanceM: a.distanceM } as ScoredIncident, now) ||
      b.incident.timestamp - a.incident.timestamp,
  );

  const counts: Record<WatchSection, number> = { emergency: 0, community: 0, official: 0, routine: 0 };
  for (const it of items) counts[it.section] += 1;

  return { items, counts, sinceSummary: summarize(counts, Boolean(home)) };
}

/**
 * A plain-language header, e.g.
 * "2 neighbour reports, 1 outage and 1 official update near home".
 *
 * Kept separate and exported so the copy can be unit-tested without building a
 * whole feed, and reused by the email's subject line.
 */
export function summarize(counts: Record<WatchSection, number>, hasHome: boolean): string {
  const parts: string[] = [];
  if (counts.emergency) {
    parts.push(`${counts.emergency} emergency ${counts.emergency === 1 ? 'warning' : 'warnings'}`);
  }
  if (counts.community) {
    parts.push(`${counts.community} neighbour ${counts.community === 1 ? 'report' : 'reports'}`);
  }
  if (counts.official) {
    parts.push(`${counts.official} official ${counts.official === 1 ? 'update' : 'updates'}`);
  }
  if (counts.routine) {
    parts.push(`${counts.routine} nearby ${counts.routine === 1 ? 'item' : 'items'}`);
  }
  if (parts.length === 0) return '';
  const list =
    parts.length === 1
      ? parts[0]
      : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  return `${list}${hasHome ? ' near home' : ''}`;
}
