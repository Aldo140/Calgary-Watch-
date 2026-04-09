import { useState, useEffect } from 'react';

export interface CrimeStatEntry {
  crime: number;
  disorder: number;
  year: number;
}

/**
 * Fetches Calgary Community Crime + Disorder statistics from Open Data.
 * Returns a Map<communityName_lowercase, CrimeStatEntry> for the most recent year.
 * Refreshes every 24 hours (data is not real-time).
 */
export function useCrimeStats(): {
  stats: Map<string, CrimeStatEntry>;
  isLoading: boolean;
} {
  const [stats, setStats] = useState<Map<string, CrimeStatEntry>>(new Map());
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const fetchStats = async () => {
      setIsLoading(true);
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

        if (cancelled) return;

        // Find the most recent year in each dataset
        const crimeByYearCommunity = new Map<string, number>();
        let maxCrimeYear = 0;
        for (const row of crimeData) {
          const year = parseInt(row.year ?? '0', 10);
          if (year > maxCrimeYear) maxCrimeYear = year;
        }
        for (const row of crimeData) {
          const year = parseInt(row.year ?? '0', 10);
          if (year !== maxCrimeYear) continue;
          const community = (row.community ?? '').toLowerCase().trim();
          if (!community) continue;
          const count = parseInt(row.crime_count ?? '0', 10);
          crimeByYearCommunity.set(community, (crimeByYearCommunity.get(community) ?? 0) + count);
        }

        const disorderByYearCommunity = new Map<string, number>();
        let maxDisorderYear = 0;
        for (const row of disorderData) {
          const year = parseInt(row.year ?? '0', 10);
          if (year > maxDisorderYear) maxDisorderYear = year;
        }
        for (const row of disorderData) {
          const year = parseInt(row.year ?? '0', 10);
          if (year !== maxDisorderYear) continue;
          const community = (row.community ?? '').toLowerCase().trim();
          if (!community) continue;
          const count = parseInt(row.event_count ?? '0', 10);
          disorderByYearCommunity.set(community, (disorderByYearCommunity.get(community) ?? 0) + count);
        }

        // Merge into a single Map
        const merged = new Map<string, CrimeStatEntry>();
        const allCommunities = new Set<string>();
        crimeByYearCommunity.forEach((_, community) => allCommunities.add(community));
        disorderByYearCommunity.forEach((_, community) => allCommunities.add(community));
        const communities = Array.from(allCommunities);
        for (const community of communities) {
          merged.set(community, {
            crime: crimeByYearCommunity.get(community) ?? 0,
            disorder: disorderByYearCommunity.get(community) ?? 0,
            year: Math.max(maxCrimeYear, maxDisorderYear),
          });
        }

        setStats(merged);
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

  return { stats, isLoading };
}
