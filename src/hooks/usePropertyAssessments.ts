import { useState, useEffect } from 'react';

export interface PropertyYearEntry {
  year: number;
  avgValue: number;
  sampleCount: number;
}

// Module-level cache: community lowercase key → yearly entries
const _cache = new Map<string, PropertyYearEntry[]>();

/**
 * Fetches Calgary property assessment data for a single community.
 * Returns averaged assessed values grouped by year (last 6 years).
 * Results are cached for the session lifetime.
 */
export function usePropertyAssessments(communityName: string | null): {
  data: PropertyYearEntry[];
  isLoading: boolean;
} {
  const [data, setData]         = useState<PropertyYearEntry[]>([]);
  const [isLoading, setLoading] = useState(false);

  useEffect(() => {
    if (!communityName) { setData([]); return; }
    const cacheKey = communityName.toLowerCase();

    if (_cache.has(cacheKey)) {
      setData(_cache.get(cacheKey)!);
      return;
    }

    let cancelled = false;
    setLoading(true);

    // Calgary Open Data expects the community name in UPPER CASE
    const encoded = encodeURIComponent(communityName.toUpperCase());
    const url =
      `https://data.calgary.ca/resource/4ur7-wsgc.json` +
      `?$where=comm_name='${encoded}'` +
      `&$select=assessed_value,roll_year` +
      `&$limit=50000`;

    fetch(url)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((rows: { assessed_value?: string; roll_year?: string }[]) => {
        if (cancelled) return;

        const byYear = new Map<number, { sum: number; count: number }>();
        for (const row of rows) {
          const year  = parseInt(row.roll_year ?? '0', 10);
          const value = parseFloat(row.assessed_value ?? '0');
          if (!year || isNaN(value) || value <= 0) continue;
          const entry = byYear.get(year) ?? { sum: 0, count: 0 };
          entry.sum   += value;
          entry.count += 1;
          byYear.set(year, entry);
        }

        const result: PropertyYearEntry[] = [...byYear.entries()]
          .filter(([y]) => y > 0)
          .sort(([a], [b]) => a - b)
          .slice(-6)
          .map(([year, { sum, count }]) => ({
            year,
            avgValue: Math.round(sum / count),
            sampleCount: count,
          }));

        _cache.set(cacheKey, result);
        setData(result);
      })
      .catch(() => {
        if (!cancelled) setData([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [communityName]);

  return { data, isLoading };
}
