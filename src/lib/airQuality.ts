import type { Incident } from '@/src/types';

/**
 * Wildfire smoke, as a thing you can see on the map.
 *
 * Calgary's recurring summer hazard is smoke, and it is the one hazard that is
 * invisible on an incident map: nobody files a report saying "the air is bad
 * today" because it is not an incident, it is a condition. So it has to come
 * from a measurement.
 *
 * ── On not claiming to be AQHI ──────────────────────────────────────────────
 * Canada's public standard is the Air Quality Health Index, which combines
 * ozone, nitrogen dioxide and fine particulate through a specific formula.
 * We do not compute it, so we must not print it — labelling something "AQHI 7"
 * that was not derived the way AQHI is derived would be inventing an official
 * reading. What we have is modelled PM2.5, so that is what is stated, in its
 * own units, with the number visible. During smoke season PM2.5 is the
 * dominant pollutant anyway, which is exactly when this matters.
 *
 * Bands follow the widely used PM2.5 breakpoints. The wording is about what a
 * person should do, not about the chemistry.
 */

export type AirBand = 'good' | 'moderate' | 'sensitive' | 'unhealthy' | 'severe';

export interface AirAssessment {
  band: AirBand;
  title: string;
  advice: string;
}

/** µg/m³ lower bounds, highest first so the first match wins. */
const BANDS: Array<{ min: number; band: AirBand; title: string; advice: string }> = [
  {
    min: 150,
    band: 'severe',
    title: 'Very Poor Air Quality',
    advice: 'Heavy smoke. Everyone should stay indoors with windows closed and avoid exertion outside.',
  },
  {
    min: 55,
    band: 'unhealthy',
    title: 'Poor Air Quality',
    advice: 'Smoke is thick enough to affect anyone. Keep outdoor activity short and windows closed.',
  },
  {
    min: 35,
    band: 'sensitive',
    title: 'Air Quality — Sensitive Groups',
    advice: 'Children, older adults, and anyone with asthma or heart conditions should limit time outdoors.',
  },
  {
    min: 12,
    band: 'moderate',
    title: 'Smoke Haze',
    advice: 'Noticeable haze. Most people are fine; reduce heavy outdoor exertion if you feel it.',
  },
];

/**
 * Band a PM2.5 reading.
 *
 * Returns null below the moderate threshold — clean air is not an alert, and a
 * map that announces "the air is fine" every day teaches people to ignore it
 * on the day it isn't.
 */
export function classifyPm25(pm25: number): AirAssessment | null {
  if (!Number.isFinite(pm25) || pm25 < 0) return null;
  const hit = BANDS.find((b) => pm25 >= b.min);
  return hit ? { band: hit.band, title: hit.title, advice: hit.advice } : null;
}

/** True when the band warrants the map's emergency treatment rather than a notice. */
export function isSevereAir(band: AirBand): boolean {
  return band === 'unhealthy' || band === 'severe';
}

export interface AirZoneReading {
  zone: string;
  lat: number;
  lng: number;
  pm25: number;
  /** Open-Meteo's own US AQI, carried through rather than recomputed. */
  usAqi?: number;
}

/**
 * Shape a reading as an incident so it flows through the existing feed, filters
 * and detail panel unchanged.
 *
 * Category is `weather`, not a new one: the category list is a fixed contract
 * that the Firestore rules and a contract test both enforce, and smoke is a
 * weather-adjacent condition rather than a sixth kind of thing.
 */
export function airQualityToIncident(reading: AirZoneReading, now: number): Incident | null {
  const assessment = classifyPm25(reading.pm25);
  if (!assessment) return null;

  const aqi = typeof reading.usAqi === 'number' && Number.isFinite(reading.usAqi)
    ? ` US AQI ${Math.round(reading.usAqi)}.`
    : '';

  return {
    id: `air-${reading.zone.replace(/\s+/g, '-').toLowerCase()}`,
    title: assessment.title,
    description:
      `${assessment.advice} Fine particulate (PM2.5) measured at ` +
      `${reading.pm25.toFixed(0)} µg/m³ in ${reading.zone}.${aqi}`,
    category: 'weather',
    neighborhood: reading.zone,
    lat: reading.lat,
    lng: reading.lng,
    timestamp: now,
    email: 'air@open-meteo.com',
    name: 'Open-Meteo Air Quality',
    anonymous: false,
    verified_status: 'community_confirmed',
    report_count: 1,
    data_source: 'official',
    source_name: 'Open-Meteo air quality model',
    source_url: 'https://open-meteo.com/en/docs/air-quality-api',
    // Two hours, matching the weather alerts. Smoke moves, and a stale reading
    // on a map is worse than no reading.
    expires_at: now + 2 * 60 * 60 * 1000,
  };
}
