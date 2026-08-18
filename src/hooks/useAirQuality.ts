import { useEffect, useState } from 'react';
import type { Incident } from '@/src/types';
import { airQualityToIncident, type AirZoneReading } from '@/src/lib/airQuality';

/**
 * Regional air quality, surfaced as ordinary incidents.
 *
 * Deliberately far fewer points than the weather hook's fifteen. Weather is
 * local — it can rain in Bowness and not downtown — but wildfire smoke arrives
 * as a regional airmass, so sampling every quadrant would be fifteen requests
 * returning near-identical numbers. Six points cover the same ground honestly
 * and cost a fraction as much of somebody else's free service.
 */
const AIR_ZONES: [string, number, number][] = [
  ['Calgary', 51.0447, -114.0719],
  ['Airdrie', 51.292, -114.014],
  ['Okotoks', 50.726, -113.975],
  ['Cochrane', 51.189, -114.467],
  ['Canmore', 51.09, -115.359],
  ['Edmonton', 53.544, -113.49],
];

const REFRESH_MS = 30 * 60 * 1000;

export function useAirQuality(isAuthReady: boolean): Incident[] {
  const [incidents, setIncidents] = useState<Incident[]>([]);

  useEffect(() => {
    if (!isAuthReady) return;
    let cancelled = false;

    const load = async () => {
      const now = Date.now();
      const readings: AirZoneReading[] = [];

      await Promise.allSettled(
        AIR_ZONES.map(async ([zone, lat, lng]) => {
          const url =
            'https://air-quality-api.open-meteo.com/v1/air-quality' +
            `?latitude=${lat}&longitude=${lng}` +
            '&current=pm2_5,us_aqi&timezone=America%2FEdmonton';
          const res = await fetch(url);
          if (!res.ok) return;
          const data = await res.json();
          const pm25 = data?.current?.pm2_5;
          if (typeof pm25 !== 'number') return;
          readings.push({ zone, lat, lng, pm25, usAqi: data.current.us_aqi });
        }),
      );

      if (cancelled) return;
      // Partial failures are fine — whichever zones answered still say
      // something true. An empty result only means nothing crossed the
      // threshold, which is the common case and the quiet one.
      setIncidents(
        readings
          .map((r) => airQualityToIncident(r, now))
          .filter((i): i is Incident => i !== null),
      );
    };

    void load();
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, REFRESH_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isAuthReady]);

  return incidents;
}
