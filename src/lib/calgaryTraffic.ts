/**
 * City of Calgary traffic incidents (Socrata dataset 35ra-9556).
 *
 * The admin probe started getting HTTP 400 for the newest-first query in
 * October 2026. Socrata answers 400 when it rejects the query itself (an
 * $order column it no longer knows), not when the data is gone, so the map
 * asks once more without the ordering and sorts the rows here instead of
 * dropping the whole traffic layer.
 */

export const CALGARY_TRAFFIC_ENDPOINT = 'https://data.calgary.ca/resource/35ra-9556.json';

export function calgaryTrafficUrls(limit: number): [ordered: string, plain: string] {
  return [
    `${CALGARY_TRAFFIC_ENDPOINT}?$limit=${limit}&$order=start_dt%20DESC`,
    // Unordered pages are small and current: the dataset only holds open incidents.
    `${CALGARY_TRAFFIC_ENDPOINT}?$limit=${Math.max(limit, 200)}`,
  ];
}

type Row = Record<string, unknown>;

const when = (row: Row) => {
  for (const key of ['start_dt', 'modified_dt', 'start_date', 'start_time']) {
    const t = Date.parse(String(row[key] ?? ''));
    if (Number.isFinite(t)) return t;
  }
  return 0;
};

export function newestTrafficFirst<T extends Row>(rows: readonly T[], limit: number): T[] {
  return [...rows].sort((a, b) => when(b) - when(a)).slice(0, limit);
}

export interface TrafficFetch<T> {
  rows: T[];
  /** The ordered query was refused and the plain one answered instead. */
  fallback: boolean;
  status: number;
}

/** Throws on a network failure or when both queries are refused, like fetch + ok check. */
export async function fetchCalgaryTraffic<T extends Row = Row>(limit: number, init?: RequestInit): Promise<TrafficFetch<T>> {
  const [ordered, plain] = calgaryTrafficUrls(limit);
  const first = await fetch(ordered, init);
  if (first.ok) {
    const data = await first.json();
    return { rows: Array.isArray(data) ? data : [], fallback: false, status: first.status };
  }
  if (first.status !== 400) throw new Error(`HTTP ${first.status}`);
  const second = await fetch(plain, init);
  if (!second.ok) throw new Error(`HTTP ${second.status}`);
  const data = await second.json();
  return { rows: newestTrafficFirst(Array.isArray(data) ? data : [], limit), fallback: true, status: second.status };
}
