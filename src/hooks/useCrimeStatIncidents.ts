import { useMemo } from 'react';
import type { Incident, IncidentCategory } from '../types/index';
import type { CrimeStatEntry } from './useCrimeStats';
import { NEIGHBOURHOOD_COORDS } from '../data/neighbourhoodCoords';

function titleCase(str: string): string {
  return str.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export function useCrimeStatIncidents(
  stats: Map<string, CrimeStatEntry>
): Incident[] {
  return useMemo(() => {
    if (stats.size === 0) return [];

    type Entry = {
      community: string;
      totalCrime: number;
      totalDisorder: number;
      year: number;
      coords: [number, number];
    };

    const entries: Entry[] = [];
    const now = Date.now();

    for (const [community, entry] of stats) {
      const coords = NEIGHBOURHOOD_COORDS[community];
      if (!coords) continue;
      entries.push({
        community,
        totalCrime: entry.crime,
        totalDisorder: entry.disorder,
        year: entry.year,
        coords,
      });
    }

    entries.sort((a, b) => (b.totalCrime + b.totalDisorder) - (a.totalCrime + a.totalDisorder));
    const top20 = entries.slice(0, 20);

    return top20.map(({ community, totalCrime, totalDisorder, year, coords }) => ({
      id: `cps-crime-stat-${community.replace(/[\s/]+/g, '-')}`,
      title: `Crime Hotspot · ${titleCase(community)}`,
      description: `${totalCrime} criminal incidents and ${totalDisorder} disorder events reported in ${year}. Source: Calgary Police Service Community Crime Statistics.`,
      category: 'crime' as IncidentCategory,
      neighborhood: titleCase(community),
      lat: coords[0],
      lng: coords[1],
      timestamp: now,
      email: 'opendata@calgarypolice.ca',
      name: 'Calgary Police Service',
      anonymous: false,
      verified_status: 'community_confirmed' as const,
      report_count: totalCrime + totalDisorder,
      data_source: 'official' as const,
      source_name: 'Calgary Police Service',
      source_url: 'https://data.calgary.ca/',
      expires_at: undefined,
    }));
  }, [stats]);
}
