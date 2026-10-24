/**
 * City alerts: weather warnings, emergency alerts, smoke and river readings.
 *
 * These come from public APIs and cover a whole area, not a spot on a street,
 * so they are not incident reports. A "Snowfall warning" pinned at the city
 * centroid read as if something had happened downtown, and the browser's
 * forecast-model readings put one "Rain" pin per zone, Airdrie included. The
 * map keeps them off the pins, the feed and the counts, and shows them as an
 * alert strip that opens a full alert card instead.
 *
 * A neighbour's own weather post ("Black ice on 17 Ave") is still a report:
 * anything community-facing stays on the map.
 */
import { isCommunityFacingIncident, type Incident } from '@/src/types';

export type AlertKind = 'emergency' | 'warning' | 'watch' | 'advisory' | 'air' | 'river' | 'conditions';
export type AlertHazard = 'snow' | 'rain' | 'storm' | 'wind' | 'cold' | 'heat' | 'smoke' | 'flood' | 'fog' | 'ice' | 'general';

export interface MapAlert {
  id: string;
  kind: AlertKind;
  hazard: AlertHazard;
  title: string;
  body: string;
  /** Zones or areas the alert covers, de-duplicated, Calgary first. */
  areas: string[];
  source: string;
  sourceUrl?: string;
  issuedAt: number;
  expiresAt?: number;
  /** True for an issued alert (Environment Canada, Alberta Emergency Alert). */
  official: boolean;
  /** The incident records this alert was built from. */
  incidentIds: string[];
}

/** Highest first: the strip shows the first alert in this order. */
export const ALERT_KIND_RANK: Record<AlertKind, number> = {
  emergency: 6, warning: 5, watch: 4, river: 3, air: 3, advisory: 2, conditions: 1,
};

/** Short label for the tag on the strip and the card eyebrow. */
export const ALERT_KIND_LABEL: Record<AlertKind, string> = {
  emergency: 'Emergency alert',
  warning: 'Warning',
  watch: 'Watch',
  advisory: 'Advisory',
  air: 'Air quality',
  river: 'River level',
  conditions: 'Right now',
};

/**
 * True when a record is an area-wide alert or reading rather than a report:
 * any non-community weather record (Environment Canada, forecast model, air,
 * river, news weather) and Alberta Emergency Alerts.
 */
export function isCityAlertRecord(incident: Pick<Incident, 'category' | 'data_source' | 'source_type'>): boolean {
  if (isCommunityFacingIncident(incident)) return false;
  if (incident.source_type === 'alberta_emergency_alert') return true;
  return incident.category === 'weather';
}

/** Splits a merged incident list into map reports and city alerts. */
export function splitCityAlerts<T extends Incident>(incidents: T[]): { reports: T[]; alertRecords: T[] } {
  const reports: T[] = [];
  const alertRecords: T[] = [];
  for (const i of incidents) (isCityAlertRecord(i) ? alertRecords : reports).push(i);
  return { reports, alertRecords };
}

export function alertHazard(text: string): AlertHazard {
  const t = text.toLowerCase();
  if (/smoke|air quality|pm2\.5|haze/.test(t)) return 'smoke';
  if (/flood|river|water level|overland/.test(t)) return 'flood';
  if (/freezing|ice|sleet|pellet/.test(t)) return 'ice';
  if (/snow|blizzard|squall/.test(t)) return 'snow';
  if (/thunder|tornado|hail|funnel/.test(t)) return 'storm';
  if (/cold|frost|wind ?chill/.test(t)) return 'cold';
  if (/wind|gust/.test(t)) return 'wind';
  if (/heat|hot/.test(t)) return 'heat';
  if (/fog/.test(t)) return 'fog';
  if (/rain|drizzle|shower/.test(t)) return 'rain';
  return 'general';
}

function kindOf(i: Incident): AlertKind {
  if (i.source_type === 'alberta_emergency_alert') return 'emergency';
  if (i.id.startsWith('air-')) return 'air';
  if (i.id.startsWith('river-')) return 'river';
  if (i.id.startsWith('wx-')) return 'conditions';
  const t = i.title.toLowerCase();
  if (/warning/.test(t)) return 'warning';
  if (/watch/.test(t)) return 'watch';
  return 'advisory';
}

/** Forecast-model readings say "Heavy Snowfall"; only issued alerts may say "Warning". */
function plainConditionTitle(title: string): string {
  return title.replace(/\s+(warning|advisory|watch)$/i, '').trim() || title;
}

/** The forecast model covers towns around Calgary too; the map is about Calgary. */
function isCalgaryArea(area: string | undefined): boolean {
  return !area || /calgary/i.test(area);
}

/**
 * Builds the alert deck from alert records: issued alerts as they are,
 * forecast-model readings merged by title across Calgary zones (one "Light
 * snow · NW, Downtown" instead of five pins), towns outside Calgary dropped.
 * Sorted by kind rank, then newest.
 */
export function buildAlertDeck(records: Incident[], now = Date.now()): MapAlert[] {
  const byKey = new Map<string, MapAlert>();
  for (const i of records) {
    if (i.expires_at && i.expires_at <= now) continue;
    const kind = kindOf(i);
    if ((kind === 'conditions' || kind === 'air') && !isCalgaryArea(i.neighborhood)) continue;
    const title = kind === 'conditions' ? plainConditionTitle(i.title) : i.title;
    const key = kind === 'conditions' || kind === 'air' ? `${kind}:${title.toLowerCase()}` : i.id;
    const area = (i.neighborhood || 'Calgary').trim();
    const existing = byKey.get(key);
    if (existing) {
      if (!existing.areas.includes(area)) existing.areas.push(area);
      existing.incidentIds.push(i.id);
      existing.issuedAt = Math.max(existing.issuedAt, i.timestamp);
      if (i.expires_at) existing.expiresAt = Math.max(existing.expiresAt ?? 0, i.expires_at);
      continue;
    }
    byKey.set(key, {
      id: key,
      kind,
      hazard: alertHazard(`${i.title} ${kind === 'air' ? 'smoke' : ''} ${kind === 'river' ? 'river' : ''}`),
      title,
      body: kind === 'conditions'
        // The zone-specific sentence ("(Northwest Calgary, -3°C)") stops being
        // true once zones are merged.
        ? i.description.replace(/\s*\([^)]*\)\s*$/, '').trim()
        : i.description,
      areas: [area],
      source: kind === 'conditions' ? 'Open-Meteo forecast model' : (i.source_name || i.name || 'Public feed'),
      sourceUrl: i.source_url,
      issuedAt: i.timestamp,
      expiresAt: i.expires_at,
      official: kind === 'emergency' || kind === 'warning' || kind === 'watch' || kind === 'advisory',
      incidentIds: [i.id],
    });
  }
  return [...byKey.values()].sort((a, b) =>
    ALERT_KIND_RANK[b.kind] - ALERT_KIND_RANK[a.kind] || b.issuedAt - a.issuedAt);
}

/** "NW Calgary, Downtown" style label for the strip; long lists collapse. */
export function alertAreaLabel(areas: string[]): string {
  const short = areas.map((a) => a
    .replace(/^Northwest /i, 'NW ').replace(/^Northeast /i, 'NE ')
    .replace(/^Southwest /i, 'SW ').replace(/^Southeast /i, 'SE ')
    .replace(/^Downtown Calgary$/i, 'Downtown'));
  if (short.length >= 4) return 'Across Calgary';
  return short.join(', ');
}

/** "until 6 am" / "until Sun 6 am" on the Calgary clock. */
export function alertUntilLabel(expiresAt: number | undefined, now = Date.now()): string | null {
  if (!expiresAt || expiresAt <= now) return null;
  const sameDay = new Date(expiresAt).toLocaleDateString('en-CA', { timeZone: 'America/Edmonton' })
    === new Date(now).toLocaleDateString('en-CA', { timeZone: 'America/Edmonton' });
  const time = new Date(expiresAt).toLocaleTimeString('en-CA', {
    timeZone: 'America/Edmonton', hour: 'numeric', minute: '2-digit',
  }).replace(':00', '').replace(/\./g, '').toLowerCase();
  if (sameDay) return `until ${time}`;
  const day = new Date(expiresAt).toLocaleDateString('en-CA', { timeZone: 'America/Edmonton', weekday: 'short' });
  return `until ${day} ${time}`;
}

/** What to do, by hazard. Plain, short, nothing that sounds like a forecast. */
export const ALERT_TIPS: Record<AlertHazard, string[]> = {
  snow: ['Allow extra travel time; plows work main routes first.', 'Clear your sidewalk within 24 hours of the snow ending.', 'Check on a neighbour who may need a hand.'],
  ice: ['Expect sidewalks, bridges and ramps to be slick.', 'Leave more room to stop at intersections.', 'Sand or salt your steps.'],
  rain: ['Watch for pooling on underpasses.', 'Slow down on wet roads.'],
  storm: ['Go indoors when you hear thunder.', 'Move vehicles under cover if hail is likely.', 'Secure patio furniture and bins.'],
  wind: ['Secure bins, patio furniture and anything loose.', 'Give high-sided vehicles room on Deerfoot and Stoney.'],
  cold: ['Cover exposed skin; frostbite can set in fast.', 'Bring pets in.', 'If someone outside looks like they need shelter, call 311.'],
  heat: ['Drink water and find shade in the afternoon.', 'Never leave children or pets in a parked car.'],
  smoke: ['Limit time and exercise outdoors.', 'Keep windows closed and run a filter if you have one.', 'People with asthma or heart conditions should take extra care.'],
  flood: ['Keep off pathways close to the riverbank.', 'Move vehicles and belongings away from low ground.', 'Follow Alberta Emergency Alert for any orders.'],
  fog: ['Drive with headlights on and slow down.'],
  general: ['Follow the instructions in the alert.', 'Call 911 only for an emergency.'],
};
