import { useState, useEffect } from 'react';

export interface CrimeStatEntry {
  crime: number;
  violent: number;
  property: number;
  disorder: number;
  year: number;
}

export interface CrimeYearEntry {
  year: number;
  crime: number;
  violent: number;
  property: number;
  disorder: number;
}

// Categories from the Calgary Open Data crime dataset (78gh-n26t)
// Violent: Assault (Non-domestic), Commercial Robbery, Street Robbery, Violence 'Other' (Non-domestic)
// Property: Break & Enter variants, Theft FROM/OF Vehicle
function classifyCategory(category: string): 'violent' | 'property' | 'other' {
  const c = category.toLowerCase();
  if (/assault|robbery|violence/i.test(c)) return 'violent';
  if (/break.*enter|theft/i.test(c)) return 'property';
  return 'other';
}

/**
 * Fetches Calgary Community Crime + Disorder statistics from Open Data.
 * Returns:
 *   stats      — Map<community_lowercase, latest-year totals>
 *   yearlyStats — Map<community_lowercase, per-year breakdown sorted ascending>
 * Refreshes every 24 hours (data is not real-time).
 */
export function useCrimeStats(): {
  stats: Map<string, CrimeStatEntry>;
  yearlyStats: Map<string, CrimeYearEntry[]>;
  isLoading: boolean;
} {
  const [stats, setStats] = useState<Map<string, CrimeStatEntry>>(new Map());
  const [yearlyStats, setYearlyStats] = useState<Map<string, CrimeYearEntry[]>>(new Map());
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const fetchStats = async () => {
      setIsLoading(true);
      try {
        const [crimeRes, disorderRes] = await Promise.allSettled([
          fetch('https://data.calgary.ca/resource/78gh-n26t.json?$limit=50000'),
          fetch('https://data.calgary.ca/resource/h3h6-kgme.json?$limit=50000'),
        ]);

        const crimeData: any[] =
          crimeRes.status === 'fulfilled' && crimeRes.value.ok
            ? await crimeRes.value.json()
            : [];

        const disorderData: any[] =
          disorderRes.status === 'fulfilled' && disorderRes.value.ok
            ? await disorderRes.value.json()
            : [];

        if (cancelled) return;

        // Build per-community, per-year maps — total crime + violent + property breakdown
        const crimeByCommYr    = new Map<string, Map<number, number>>();
        const violentByCommYr  = new Map<string, Map<number, number>>();
        const propertyByCommYr = new Map<string, Map<number, number>>();
        let maxCrimeYear = 0;

        for (const row of crimeData) {
          const year = parseInt(row.year ?? '0', 10);
          const community = (row.community ?? '').toLowerCase().trim();
          if (!community || !year) continue;
          if (year > maxCrimeYear) maxCrimeYear = year;
          const count = parseInt(row.crime_count ?? '0', 10);
          const kind = classifyCategory(row.category ?? '');

          const addTo = (map: Map<string, Map<number, number>>) => {
            if (!map.has(community)) map.set(community, new Map());
            const yrMap = map.get(community)!;
            yrMap.set(year, (yrMap.get(year) ?? 0) + count);
          };

          addTo(crimeByCommYr);
          if (kind === 'violent') addTo(violentByCommYr);
          if (kind === 'property') addTo(propertyByCommYr);
        }

        // Per-community, per-year maps for disorder
        const disorderByCommYr = new Map<string, Map<number, number>>();
        let maxDisorderYear = 0;
        for (const row of disorderData) {
          const year = parseInt(row.year ?? '0', 10);
          const community = (row.community ?? '').toLowerCase().trim();
          if (!community || !year) continue;
          if (year > maxDisorderYear) maxDisorderYear = year;
          const count = parseInt(row.event_count ?? '0', 10);
          if (!disorderByCommYr.has(community)) disorderByCommYr.set(community, new Map());
          const yrMap = disorderByCommYr.get(community)!;
          yrMap.set(year, (yrMap.get(year) ?? 0) + count);
        }

        // Latest-year summary per community
        const merged = new Map<string, CrimeStatEntry>();
        const allCommunities = new Set<string>();
        crimeByCommYr.forEach((_, c) => allCommunities.add(c));
        disorderByCommYr.forEach((_, c) => allCommunities.add(c));
        for (const community of allCommunities) {
          const crimeYr    = crimeByCommYr.get(community);
          const violentYr  = violentByCommYr.get(community);
          const propertyYr = propertyByCommYr.get(community);
          const disorderYr = disorderByCommYr.get(community);
          merged.set(community, {
            crime:    crimeYr?.get(maxCrimeYear) ?? 0,
            violent:  violentYr?.get(maxCrimeYear) ?? 0,
            property: propertyYr?.get(maxCrimeYear) ?? 0,
            disorder: disorderYr?.get(maxDisorderYear) ?? 0,
            year: Math.max(maxCrimeYear, maxDisorderYear),
          });
        }

        // Yearly breakdown — last 6 years with data, sorted ascending
        const yearly = new Map<string, CrimeYearEntry[]>();
        for (const community of allCommunities) {
          const crimeYr    = crimeByCommYr.get(community)    ?? new Map<number, number>();
          const violentYr  = violentByCommYr.get(community)  ?? new Map<number, number>();
          const propertyYr = propertyByCommYr.get(community) ?? new Map<number, number>();
          const disorderYr = disorderByCommYr.get(community) ?? new Map<number, number>();
          const allYears = new Set<number>([...crimeYr.keys(), ...disorderYr.keys()]);
          const sorted = [...allYears]
            .filter(y => y > 0)
            .sort((a, b) => a - b)
            .slice(-6);
          yearly.set(community, sorted.map(year => ({
            year,
            crime:    crimeYr.get(year) ?? 0,
            violent:  violentYr.get(year) ?? 0,
            property: propertyYr.get(year) ?? 0,
            disorder: disorderYr.get(year) ?? 0,
          })));
        }

        setStats(merged);
        setYearlyStats(yearly);
      } catch (err) {
        console.warn('[CalgaryWatch] Crime stats fetch failed:', err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 24 * 60 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return { stats, yearlyStats, isLoading };
}
