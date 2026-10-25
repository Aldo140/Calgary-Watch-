/**
 * Repeat reports: one feed record filed again and again at one spot.
 *
 * City 311 places a request at its community's centre and gives it a stock
 * title, so three neighbours calling about a disturbance in Hillhurst become
 * three identical "Disturbance reported in Hillhurst" cards on one point.
 * They are separate requests, but to a reader they look like the same post
 * three times. They now fold into the newest one, which carries how many
 * there were and when the first came in.
 *
 * Only feed records fold. Neighbours' own posts, emergencies and alerts never
 * do: two people posting about one thing is worth seeing as two posts.
 */
import type { Incident } from '@/src/types';

/** "Disturbance reported in Hillhurst" and "Disturbance in Hillhurst" are the same title. */
function titleKey(title: string | undefined): string {
  return (title ?? '')
    .toLowerCase()
    .replace(/\breported\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function foldable(i: Incident): boolean {
  if (i.category === 'emergency') return false;
  if (i.data_source !== 'official') return false;
  return Boolean(i.source_type) && Boolean(titleKey(i.title));
}

/**
 * Folds same-source, same-title records at one point into the newest.
 * Order is kept: each group appears where its newest record was.
 */
export function foldRepeats(incidents: Incident[]): Incident[] {
  const groups = new Map<string, Incident[]>();
  const keyOf = new Map<Incident, string>();
  for (const i of incidents) {
    if (!foldable(i)) continue;
    const lat = Number(i.lat);
    const lng = Number(i.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const key = `${i.source_type}|${i.category}|${lat.toFixed(4)},${lng.toFixed(4)}|${titleKey(i.title)}`;
    keyOf.set(i, key);
    const g = groups.get(key);
    if (g) g.push(i); else groups.set(key, [i]);
  }
  const out: Incident[] = [];
  const done = new Set<string>();
  for (const i of incidents) {
    const key = keyOf.get(i);
    if (!key) { out.push(i); continue; }
    if (done.has(key)) continue;
    done.add(key);
    const group = groups.get(key)!;
    if (group.length === 1) { out.push(i); continue; }
    const byTime = [...group].sort((a, b) => b.timestamp - a.timestamp);
    const lead = byTime[0];
    out.push({
      ...lead,
      repeat_count: group.length,
      repeat_first: byTime[byTime.length - 1].timestamp,
      repeat_ids: byTime.slice(1).map((r) => r.id),
    });
  }
  return out;
}
