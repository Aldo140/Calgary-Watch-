/**
 * The "Right now in Calgary" / "Tonight near <area>" briefing, as plain
 * arithmetic over the reports the map already holds.
 *
 * Every figure comes from the incidents passed in. Nothing is estimated,
 * padded or carried over from elsewhere: an empty window reads as empty.
 * Illustrative demo rows are shown in the feed but, like every other count on
 * the site, are left out of these totals.
 */
import { INCIDENT_CATEGORIES } from '@/src/constants';
import { isDemoIncident, type Incident, type IncidentCategory } from '@/src/types';
import { inMapTimeWindow, type MapTimeWindow } from '@/src/lib/mapTimeWindow';

export type BriefingIncident = Pick<Incident, 'category' | 'timestamp' | 'data_source'>;

export interface NowBriefingSummary {
  /** Reports in the window (demo rows excluded). */
  total: number;
  /** Non-zero categories, in the site's category order. */
  byCategory: { category: IncidentCategory; label: string; count: number }[];
  /** Newest report time in the window, or null when there is none. */
  latestTimestamp: number | null;
  /** Posted by neighbours. */
  community: number;
  /** From public sources: City open data, 311, CPS newsroom, news, weather. */
  official: number;
}

/** Official and pipeline rows are public sources; anything else is a neighbour's post. */
export function isPublicSource(incident: Pick<Incident, 'data_source'>): boolean {
  return incident.data_source === 'official' || incident.data_source === 'system';
}

export function summarizeNowBriefing(
  incidents: readonly BriefingIncident[],
  window: MapTimeWindow,
  now: number,
): NowBriefingSummary {
  const counts = new Map<string, number>();
  let total = 0;
  let community = 0;
  let official = 0;
  let latest: number | null = null;

  for (const incident of incidents) {
    if (isDemoIncident(incident)) continue;
    if (!Number.isFinite(incident.timestamp)) continue;
    if (!inMapTimeWindow(incident.timestamp, window, now)) continue;
    total += 1;
    counts.set(incident.category, (counts.get(incident.category) ?? 0) + 1);
    if (isPublicSource(incident)) official += 1;
    else community += 1;
    if (latest === null || incident.timestamp > latest) latest = incident.timestamp;
  }

  const byCategory = INCIDENT_CATEGORIES
    .filter((c) => (counts.get(c.value) ?? 0) > 0)
    .map((c) => ({ category: c.value as IncidentCategory, label: c.label, count: counts.get(c.value)! }));

  return { total, byCategory, latestTimestamp: latest, community, official };
}

/** "just now", "12 min ago", "3 h ago", "2 days ago". */
export function shortAgo(timestamp: number, now: number): string {
  const mins = Math.max(0, Math.floor((now - timestamp) / 60_000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

/** The eyebrow word for a window, used as the marked word in the headline. */
export const BRIEFING_WINDOW_WORD: Record<MapTimeWindow, string> = {
  tonight: 'Tonight',
  '24h': 'Last 24 hours',
  yesterday: 'Yesterday',
  '7d': 'This week',
  all: 'Right now',
};

/** What an empty window says. Honest, calm, and never "all clear". */
export function emptyBriefingLine(window: MapTimeWindow): string {
  switch (window) {
    case 'tonight': return 'Quiet so far tonight. Nothing reported in this window.';
    case 'yesterday': return 'Nothing was reported yesterday in what the map has loaded.';
    case '24h': return 'Nothing reported in the last 24 hours.';
    case '7d': return 'Nothing reported in the last 7 days.';
    case 'all': return 'Nothing reported in what the map has loaded.';
  }
}

/** "3 reports" / "1 report". */
export function reportCount(n: number): string {
  return `${n} report${n === 1 ? '' : 's'}`;
}
