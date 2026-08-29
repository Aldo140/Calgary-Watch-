/**
 * Alert eligibility — the pure core of Phase 3.
 *
 * The persistent feed answers "what changed since I looked?"; alerts answer the
 * sharper question "what is worth interrupting me for, right now?" The bar is
 * deliberately high. Emergencies always clear it. A neighbour's report clears
 * it when it lands in a place the reader watches and a category they asked for.
 * The routine machine feeds never do — a 511 traffic slowdown is not a reason
 * to buzz a phone. Quiet hours silence everything an emergency does not.
 *
 * All policy lives here, pure, so the same decision drives an email alert, a
 * push, or a test — and none of them can mean something subtly different.
 */

import type { Incident, IncidentCategory } from '@/src/types';
import { isCommunityFacingIncident } from '@/src/types';
import { distanceMetres, neighborhoodMatches } from '@/src/lib/digest';

export interface WatchZone {
  id: string;
  label: string;
  /** Coordinates + radius take precedence; a name-only zone matches by area. */
  lat?: number;
  lng?: number;
  neighborhood?: string;
  radiusM: number;
}

export interface QuietHours {
  /** Local hour [0,24) the quiet window opens. */
  startHour: number;
  /** Local hour [0,24) it closes. Equal to start means "no quiet window". */
  endHour: number;
}

export interface AlertPreferences {
  zones: WatchZone[];
  quietHours: QuietHours | null;
  /** Categories the reader wants alerted; empty means all. */
  categories: IncidentCategory[];
  /** Emergencies bypass zones, categories and quiet hours when true. */
  emergencyAlways: boolean;
}

/** Whether an incident falls inside a watched zone. */
export function zoneMatchesIncident(zone: WatchZone, incident: Incident): boolean {
  if (zone.lat != null && zone.lng != null && zone.radiusM > 0) {
    return distanceMetres({ lat: zone.lat, lng: zone.lng }, { lat: incident.lat, lng: incident.lng }) <= zone.radiusM;
  }
  if (zone.neighborhood) return neighborhoodMatches(zone.neighborhood, incident.neighborhood);
  return false;
}

/**
 * Whether `now` falls in the reader's quiet window.
 *
 * The hour is read in UTC here; the delivery layer is responsible for passing a
 * moment already aligned to the reader's timezone. A window whose start is after
 * its end wraps past midnight (22 → 07 covers the night).
 */
export function isWithinQuietHours(prefs: AlertPreferences, now: number): boolean {
  const q = prefs.quietHours;
  if (!q || q.startHour === q.endHour) return false;
  const hour = new Date(now).getUTCHours();
  return q.startHour < q.endHour
    ? hour >= q.startHour && hour < q.endHour
    : hour >= q.startHour || hour < q.endHour;
}

/**
 * The incidents that warrant an alert since the reader last heard from us.
 *
 * Order of the gate matters: an emergency short-circuits every other check, so
 * it reaches someone even in a zone they never set or in the middle of the
 * night. Everything else must be recent (not older than `since`, not a
 * future-dated planned item), a real community report, in an allowed category,
 * inside a watched zone — and is dropped entirely during quiet hours.
 */
/**
 * The title and body of the push notification for a set of alerts. Shared by
 * the sender and the admin preview so what a moderator reviews is exactly what
 * a phone shows.
 */
export function alertPushContent(alerts: Incident[]): { title: string; body: string } {
  const lead = alerts[0];
  return {
    title: alerts.length === 1 ? 'Report near you' : `${alerts.length} reports near you`,
    body: alerts.length === 1 ? (lead?.title ?? '') : `${lead?.title ?? ''} +${alerts.length - 1} more`,
  };
}

export function selectAlerts(input: {
  incidents: Incident[];
  prefs: AlertPreferences;
  since: number;
  now: number;
}): Incident[] {
  const { incidents, prefs, since, now } = input;
  const quiet = isWithinQuietHours(prefs, now);

  return incidents.filter((i) => {
    if (i.timestamp <= since || i.timestamp > now) return false;

    if (i.category === 'emergency') return prefs.emergencyAlways;
    if (quiet) return false;
    if (!isCommunityFacingIncident(i)) return false;
    if (prefs.categories.length > 0 && !prefs.categories.includes(i.category)) return false;
    return prefs.zones.some((zone) => zoneMatchesIncident(zone, i));
  });
}
