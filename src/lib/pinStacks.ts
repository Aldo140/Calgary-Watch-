/**
 * Pin stacks: reports that share one point on the map.
 *
 * Police releases, news and 311 requests are placed at their community's
 * centre, so a week of "Disturbance in East Village" calls sits on one exact
 * point. Drawn as separate markers they hid under each other: zoomed in it
 * looked like one post, zoomed out the cluster said 7. They now draw as one
 * pin with the count on it, and tapping it steps through every report there.
 */
import type { Incident } from '@/src/types';
import { isCitySignal } from '@/src/lib/crimeBoard';

export interface PinStack {
  /** Rounded point, about 10 m. */
  key: string;
  /** The report the pin shows: emergencies first, then crime over City signals, then newest. */
  lead: Incident;
  /** Every report at the point, in the same order, lead first. */
  members: Incident[];
}

function rank(i: Incident): number {
  if (i.category === 'emergency') return 0;
  return isCitySignal(i) ? 2 : 1;
}

export function stackByPoint(incidents: Incident[]): PinStack[] {
  const groups = new Map<string, Incident[]>();
  for (const i of incidents) {
    const lat = Number(i.lat);
    const lng = Number(i.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
    const g = groups.get(key);
    if (g) g.push(i); else groups.set(key, [i]);
  }
  return [...groups.entries()].map(([key, members]) => {
    members.sort((a, b) => rank(a) - rank(b) || b.timestamp - a.timestamp);
    return { key, lead: members[0], members };
  });
}
