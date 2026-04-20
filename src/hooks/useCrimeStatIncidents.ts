import { useState, useEffect } from 'react';
import type { Incident, IncidentCategory } from '../types/index';
import { NEIGHBOURHOOD_COORDS } from '../data/neighbourhoodCoords';

function titleCase(str: string): string {
  return str.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export function useCrimeStatIncidents(isAuthReady: boolean): Incident[] {
  const [incidents, setIncidents] = useState<Incident[]>([]);

  useEffect(() => {
    if (!isAuthReady) return;

    const fetchStats = async () => {
      try {
        const [crimeRes, disorderRes] = await Promise.allSettled([
          fetch('https://data.calgary.ca/resource/78gh-n26t.json?$limit=5000'),
          fetch('https://data.calgary.ca/resource/h3h6-kgme.json?$limit=5000'),
        ]);

        const crimeData: any[] =
          crimeRes.status === 'fulfilled' && crimeRes.value.ok
            ? await crimeRes.value.json()
            : [];

        const disorderData: any[] =
          disorderRes.status === 'fulfilled' && disorderRes.value.ok
            ? await disorderRes.value.json()
            : [];

        // Find most recent year across both datasets
        let maxYear = 0;
        for (const row of [...crimeData, ...disorderData]) {
          const y = parseInt(row.year ?? '0', 10);
          if (y > maxYear) maxYear = y;
        }
        if (!maxYear) return;

        // Aggregate crime counts by community and category for maxYear
        const crimeByCommunity = new Map<string, Map<string, number>>();
        for (const row of crimeData) {
          if (parseInt(row.year ?? '0', 10) !== maxYear) continue;
          const community = (row.community ?? '').trim().toUpperCase();
          if (!community) continue;
          const category = (row.category ?? 'Criminal Incident').trim();
          const count = parseInt(row.crime_count ?? '0', 10);
          if (!crimeByCommunity.has(community)) crimeByCommunity.set(community, new Map());
          const catMap = crimeByCommunity.get(community)!;
          catMap.set(category, (catMap.get(category) ?? 0) + count);
        }

        // Aggregate disorder counts by community for maxYear
        const disorderByCommunity = new Map<string, number>();
        for (const row of disorderData) {
          if (parseInt(row.year ?? '0', 10) !== maxYear) continue;
          const community = (row.community ?? '').trim().toUpperCase();
          if (!community) continue;
          const count = parseInt(row.event_count ?? '0', 10);
          disorderByCommunity.set(community, (disorderByCommunity.get(community) ?? 0) + count);
        }

        type Entry = {
          community: string;
          totalCrime: number;
          totalDisorder: number;
          dominantCategory: string;
          coords: [number, number];
        };

        const entries: Entry[] = [];

        for (const [community, catMap] of crimeByCommunity) {
          const coords = NEIGHBOURHOOD_COORDS[community.toLowerCase()];
          if (!coords) continue;

          let totalCrime = 0;
          let dominantCategory = 'Criminal Incident';
          let dominantCount = 0;
          for (const [cat, count] of catMap) {
            totalCrime += count;
            if (count > dominantCount) {
              dominantCount = count;
              dominantCategory = cat;
            }
          }
          const totalDisorder = disorderByCommunity.get(community) ?? 0;
          entries.push({ community, totalCrime, totalDisorder, dominantCategory, coords });
        }

        // Top 20 by combined total
        entries.sort((a, b) => (b.totalCrime + b.totalDisorder) - (a.totalCrime + a.totalDisorder));
        const top20 = entries.slice(0, 20);

        const yearTs = new Date(`${maxYear}-01-01T00:00:00.000Z`).getTime();

        const result: Incident[] = top20.map(({ community, totalCrime, totalDisorder, dominantCategory, coords }) => ({
          id: `cps-crime-stat-${community.toLowerCase().replace(/[\s/]+/g, '-')}`,
          title: `${dominantCategory} · ${titleCase(community)}`,
          description: `${totalCrime} criminal incidents and ${totalDisorder} disorder events reported in ${maxYear}. Source: Calgary Police Service Community Crime Statistics.`,
          category: 'crime' as IncidentCategory,
          neighborhood: titleCase(community),
          lat: coords[0],
          lng: coords[1],
          timestamp: yearTs,
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

        setIncidents(result);
      } catch (err) {
        console.warn('[CalgaryWatch] CPS crime stats fetch failed:', err);
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 24 * 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, [isAuthReady]);

  return incidents;
}
