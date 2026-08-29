/**
 * The adapter between a stored profile and the alert engine.
 *
 * A signed-in user document is a loose bag of optional fields; selectAlerts
 * wants a normalized AlertPreferences. Keeping the translation here — pure and
 * tested — means a legacy or half-filled profile still yields something safe:
 * emergencies always on, a home zone derived from whatever area the reader
 * saved, and no quiet window unless both bounds are present.
 */

import type { IncidentCategory } from '@/src/types';
import type { AlertPreferences, WatchZone } from '@/src/lib/alerts';

export interface AlertProfileFields {
  alertsEnabled?: boolean;
  neighborhood?: string;
  inferredNeighborhood?: string;
  alertZones?: WatchZone[];
  alertCategories?: IncidentCategory[];
  alertQuietStartHour?: number;
  alertQuietEndHour?: number;
}

export function readAlertPreferences(profile: AlertProfileFields): AlertPreferences & { enabled: boolean } {
  const homeArea = (profile.neighborhood || profile.inferredNeighborhood || '').trim();
  const zones: WatchZone[] = [];
  if (homeArea) zones.push({ id: 'home', label: 'Home', neighborhood: homeArea, radiusM: 0 });
  if (Array.isArray(profile.alertZones)) zones.push(...profile.alertZones);

  const start = profile.alertQuietStartHour;
  const end = profile.alertQuietEndHour;
  const quietHours =
    typeof start === 'number' && typeof end === 'number' ? { startHour: start, endHour: end } : null;

  return {
    enabled: profile.alertsEnabled === true,
    zones,
    quietHours,
    categories: Array.isArray(profile.alertCategories) ? profile.alertCategories : [],
    emergencyAlways: true,
  };
}
