import { useEffect, useState } from 'react';
import type { Incident } from '@/src/types';
import { parseRiverRows, riverToIncident, type RiverStation } from '@/src/lib/riverLevels';

/**
 * Bow and Elbow gauge readings from Alberta River Basins.
 *
 * Three stations, chosen because they are the ones that describe Calgary's
 * exposure: the Bow through the middle of the city, the Elbow below the dam
 * that controls it, and the Elbow upstream at Bragg Creek — which is where a
 * rise shows up before it reaches town.
 */
const STATIONS: RiverStation[] = [
  { id: '05BH004', label: 'Bow River at Calgary', lat: 51.05, lng: -114.0517 },
  { id: '05BJ001', label: 'Elbow River below Glenmore Dam', lat: 50.9992, lng: -114.1064 },
  { id: '05BJ004', label: 'Elbow River at Bragg Creek', lat: 50.9494, lng: -114.5711 },
];

const REFRESH_MS = 30 * 60 * 1000;

export function useRiverLevels(isAuthReady: boolean): Incident[] {
  const [incidents, setIncidents] = useState<Incident[]>([]);

  useEffect(() => {
    if (!isAuthReady) return;
    let cancelled = false;

    const load = async () => {
      const now = Date.now();
      const found: Incident[] = [];

      await Promise.allSettled(
        STATIONS.map(async (station) => {
          const url =
            'https://rivers.alberta.ca/apps/Basins/data/figures/river/abrivers/stationdata/' +
            `R_HG_${station.id}_table.json`;
          const res = await fetch(url);
          if (!res.ok) return;
          const payload = await res.json();
          const rows = Array.isArray(payload) ? payload[0]?.data : undefined;
          const incident = riverToIncident(station, parseRiverRows(rows), now);
          if (incident) found.push(incident);
        }),
      );

      if (cancelled) return;
      // Most days this is empty, which is correct — a gauge only earns a marker
      // when it is actually moving.
      setIncidents(found);
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
