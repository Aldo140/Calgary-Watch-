import { useState, useEffect } from 'react';

export interface CrimeStatEntry {
  crime: number;
  violent: number;
  property: number;
  disorder: number;
  year: number;
  dataSource?: 'statcan' | '311';
}

export interface CrimeYearEntry {
  year: number;
  crime: number;
  violent: number;
  property: number;
  disorder: number;
}

// Edmonton EPS categories still classify by offence name.
function classifyCategory(category: string): 'violent' | 'property' | 'other' {
  const c = category.toLowerCase();
  if (/assault|robbery|violence/i.test(c)) return 'violent';
  if (/break.*enter|theft/i.test(c)) return 'property';
  return 'other';
}

// ── Calgary community concern index (311) ────────────────────────────────────
// The CPS "Community Crime Statistics" dataset was pulled from Calgary Open
// Data (returns 403 as of mid-2026). The community layer now derives from
// aggregated 311 service requests instead:
//   safety   → public-safety-shaped requests (bucketed as `violent`)
//   property → property-damage-shaped requests (bucketed as `property`)
//   crime    = safety + property   ("community concerns")
//   disorder = all other 311 activity in the community
// Buckets are aggregated server-side (three small grouped queries, ~900 rows
// each) — grouping by raw service_name explodes past Socrata's row caps.
const SAFETY_TERMS = ['DISTURBANCE', 'BEHAVIOUR', 'INDECENT', 'NEEDLE', 'DRUG', 'ENCAMPMENT', 'WEAPON', 'NOISE', 'PARTY', 'INTOXICAT', 'THREAT'];
const PROPERTY_TERMS = ['GRAFFITI', 'VANDAL', 'THEFT', 'STOLEN', 'BREAK AND ENTER', 'ABANDONED VEHICLE', 'DERELICT'];

function build311AggUrl(since: string, terms?: string[]): string {
  const likeClause = terms
    ? ' AND (' + terms.map((t) => `upper(service_name) like '%${t}%'`).join(' OR ') + ')'
    : '';
  return (
    'https://data.calgary.ca/resource/iahh-g8bj.json' +
    '?$select=' + encodeURIComponent('comm_name,date_extract_y(requested_date) as yr,count(*) as cnt') +
    '&$group=' + encodeURIComponent('comm_name,yr') +
    '&$where=' + encodeURIComponent(`requested_date>'${since}'${likeClause}`) +
    '&$limit=5000'
  );
}

type AggMap = Map<string, Map<number, number>>;

async function fetch311Agg(url: string): Promise<{ map: AggMap; maxYear: number }> {
  const map: AggMap = new Map();
  let maxYear = 0;
  const res = await fetch(url);
  if (!res.ok) return { map, maxYear };
  const rows: any[] = await res.json();
  for (const row of rows) {
    const community = (row.comm_name ?? '').toLowerCase().trim();
    const year = parseInt(row.yr ?? '0', 10);
    const count = parseInt(row.cnt ?? '0', 10);
    if (!community || !year || !count || /^\d/.test(community)) continue;
    if (year > maxYear) maxYear = year;
    if (!map.has(community)) map.set(community, new Map());
    const yrMap = map.get(community)!;
    yrMap.set(year, (yrMap.get(year) ?? 0) + count);
  }
  return { map, maxYear };
}

/**
 * Fetches Calgary Community Crime + Disorder statistics from Open Data.
 * Returns:
 *   stats      — Map<community_lowercase, latest-year totals>
 *   yearlyStats — Map<community_lowercase, per-year breakdown sorted ascending>
 * Refreshes every 24 hours (data is not real-time).
 */
// localStorage cache so the choropleth paints instantly on repeat visits;
// the network refresh still runs in the background when the cache is stale.
const STATS_CACHE_KEY = 'cw_311_stats_v2';
const STATS_CACHE_TTL = 12 * 60 * 60 * 1000; // 12 h

function readStatsCache(): { stats: Map<string, CrimeStatEntry>; yearly: Map<string, CrimeYearEntry[]>; fresh: boolean } | null {
  try {
    const raw = localStorage.getItem(STATS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { ts: number; stats: [string, CrimeStatEntry][]; yearly: [string, CrimeYearEntry[]][] };
    if (!Array.isArray(parsed.stats) || !Array.isArray(parsed.yearly)) return null;
    return {
      stats: new Map(parsed.stats),
      yearly: new Map(parsed.yearly),
      fresh: Date.now() - parsed.ts < STATS_CACHE_TTL,
    };
  } catch {
    return null;
  }
}

function writeStatsCache(stats: Map<string, CrimeStatEntry>, yearly: Map<string, CrimeYearEntry[]>): void {
  try {
    localStorage.setItem(STATS_CACHE_KEY, JSON.stringify({
      ts: Date.now(),
      stats: [...stats.entries()],
      yearly: [...yearly.entries()],
    }));
  } catch { /* storage full / private mode */ }
}

export function useCrimeStats(): {
  stats: Map<string, CrimeStatEntry>;
  yearlyStats: Map<string, CrimeYearEntry[]>;
  isLoading: boolean;
} {
  const [stats, setStats] = useState<Map<string, CrimeStatEntry>>(() => readStatsCache()?.stats ?? new Map());
  const [yearlyStats, setYearlyStats] = useState<Map<string, CrimeYearEntry[]>>(() => readStatsCache()?.yearly ?? new Map());
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    // Cache fresh enough → skip the network entirely this session
    const cached = readStatsCache();
    if (cached?.fresh && cached.stats.size > 0) return;

    const fetchStats = async () => {
      setIsLoading(true);
      try {
        // ~30 months so the yearly chart gets 3 buckets.
        const since = new Date(Date.now() - 30 * 30.5 * 24 * 3600 * 1000).toISOString().slice(0, 19);

        const [allAgg, safetyAgg, propertyAgg] = await Promise.all([
          fetch311Agg(build311AggUrl(since)),
          fetch311Agg(build311AggUrl(since, SAFETY_TERMS)),
          fetch311Agg(build311AggUrl(since, PROPERTY_TERMS)),
        ]);
        if (cancelled) return;

        const maxYear = Math.max(allAgg.maxYear, safetyAgg.maxYear, propertyAgg.maxYear);
        const at = (m: AggMap, community: string, year: number) => m.get(community)?.get(year) ?? 0;

        // Latest-year summary per community
        const merged = new Map<string, CrimeStatEntry>();
        const allCommunities = new Set<string>(allAgg.map.keys());
        for (const community of allCommunities) {
          const violent = at(safetyAgg.map, community, maxYear);
          const property = at(propertyAgg.map, community, maxYear);
          const total = at(allAgg.map, community, maxYear);
          merged.set(community, {
            crime: violent + property,
            violent,
            property,
            disorder: Math.max(0, total - violent - property),
            year: maxYear,
            dataSource: '311',
          });
        }

        // Yearly breakdown — ascending
        const yearly = new Map<string, CrimeYearEntry[]>();
        for (const community of allCommunities) {
          const years = [...(allAgg.map.get(community)?.keys() ?? [])]
            .filter((y) => y > 0)
            .sort((a, b) => a - b)
            .slice(-6);
          yearly.set(community, years.map((year) => {
            const violent = at(safetyAgg.map, community, year);
            const property = at(propertyAgg.map, community, year);
            const total = at(allAgg.map, community, year);
            return {
              year,
              crime: violent + property,
              violent,
              property,
              disorder: Math.max(0, total - violent - property),
            };
          }));
        }

        // ── Edmonton EPS Crime Stats ──────────────────────────────────────
        try {
          const epsRes = await fetch('https://dashboard.edmonton.ca/resource/xthe-mnvi.json?$limit=50000');
          if (epsRes.ok && !cancelled) {
            const epsData: any[] = await epsRes.json();
            const epsCrimeByNbrYr    = new Map<string, Map<number, number>>();
            const epsViolentByNbrYr  = new Map<string, Map<number, number>>();
            const epsPropertyByNbrYr = new Map<string, Map<number, number>>();
            let maxEpsYear = 0;

            for (const row of epsData) {
              const year = parseInt(row.year ?? row.occurrence_year ?? '0', 10);
              const nbhd = (row.neighbourhood ?? row.neighborhood ?? '').toLowerCase().trim();
              if (!nbhd || !year) continue;
              if (year > maxEpsYear) maxEpsYear = year;
              const count = parseInt(row.incident_count ?? row.crime_count ?? '1', 10);
              const kind = classifyCategory(row.offence_category ?? row.category ?? '');

              const addTo = (map: Map<string, Map<number, number>>) => {
                if (!map.has(nbhd)) map.set(nbhd, new Map());
                const yrMap = map.get(nbhd)!;
                yrMap.set(year, (yrMap.get(year) ?? 0) + count);
              };

              addTo(epsCrimeByNbrYr);
              if (kind === 'violent') addTo(epsViolentByNbrYr);
              if (kind === 'property') addTo(epsPropertyByNbrYr);
            }

            for (const [nbhd, crimeYr] of epsCrimeByNbrYr) {
              const key = `edmonton:${nbhd}`;
              const violentYr  = epsViolentByNbrYr.get(nbhd)  ?? new Map<number, number>();
              const propertyYr = epsPropertyByNbrYr.get(nbhd) ?? new Map<number, number>();
              merged.set(key, {
                crime:    crimeYr.get(maxEpsYear) ?? 0,
                violent:  violentYr.get(maxEpsYear) ?? 0,
                property: propertyYr.get(maxEpsYear) ?? 0,
                disorder: 0,
                year: maxEpsYear,
              });

              const allYears = new Set<number>(crimeYr.keys());
              const sorted = [...allYears].filter(y => y > 0).sort((a, b) => a - b).slice(-6);
              yearly.set(key, sorted.map(yr => ({
                year: yr,
                crime:    crimeYr.get(yr) ?? 0,
                violent:  violentYr.get(yr) ?? 0,
                property: propertyYr.get(yr) ?? 0,
                disorder: 0,
              })));
            }
          }
        } catch (epsErr) {
          console.warn('[CalgaryWatch] Edmonton EPS crime stats fetch failed:', epsErr);
        }

        setStats(merged);
        setYearlyStats(yearly);
        writeStatsCache(merged, yearly);
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

/**
 * Derives city-wide average crime/disorder counts from the full stats Map.
 * Used by AreaIntelligencePanel to show % of city average badges.
 */
export function computeCityAverages(stats: Map<string, CrimeStatEntry>): {
  avgViolent: number;
  avgProperty: number;
  avgDisorder: number;
} {
  if (stats.size === 0) return { avgViolent: 0, avgProperty: 0, avgDisorder: 0 };
  let totalViolent = 0;
  let totalProperty = 0;
  let totalDisorder = 0;
  stats.forEach(e => {
    totalViolent  += e.violent;
    totalProperty += e.property;
    totalDisorder += e.disorder;
  });
  const n = stats.size;
  return {
    avgViolent:  Math.round(totalViolent  / n),
    avgProperty: Math.round(totalProperty / n),
    avgDisorder: Math.round(totalDisorder / n),
  };
}
