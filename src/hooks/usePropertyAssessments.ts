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
/**
 * Calgary Open Data returns assessed_value as a formatted string, and not
 * consistently: some roll years come through as "198,500" and others as
 * "198500".
 *
 * parseFloat("198,500") is 198 — it stops at the comma — so comma-formatted
 * years were being read as hundreds of dollars while uncommaed years read
 * correctly. That silently wrecked three things at once: the dollar figures on
 * the property tab, the year-over-year change (comparing $263 against $651,153
 * reads as +247,000% growth), and the safety-vs-value quadrant, where a value
 * of ~200 against a $1M axis pinned every community to the bottom of the chart
 * and labelled it "Hidden Gem" regardless of what it was worth.
 *
 * Strips every character that cannot form part of a number before parsing.
 */
export function parseAssessedValue(raw: string | undefined): number {
  if (!raw) return NaN;
  return parseFloat(String(raw).replace(/[^0-9.]/g, ''));
}

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
      // Residential only. Without the class filter the "average home value"
      // for a community silently included shops, offices and industrial land,
      // which inflated Forest Lawn from $541k to $646k and Marlborough from
      // $532k to $618k — enough to push ordinary residential areas above the
      // city's residential median and misplace them on the value axis.
      `?$where=comm_name='${encoded}' AND assessment_class='RE'` +
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
          const value = parseAssessedValue(row.assessed_value);
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
