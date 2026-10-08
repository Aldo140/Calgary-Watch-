import type { Guide, GuideStop } from '../types/discovery';

export const mapSearchUrl = (query: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;

/** One walking-directions link through every stop on the main route (detours left out, so the line stays walkable). */
export function routeUrl(stops: readonly GuideStop[]): string | undefined {
  const path = stops.filter(s => !s.detour);
  if (path.length < 2) return undefined;
  const params = new URLSearchParams({ api: '1', origin: path[0].mapQuery, destination: path[path.length - 1].mapQuery, travelmode: 'walking' });
  const middle = path.slice(1, -1).slice(0, 8).map(s => s.mapQuery);
  if (middle.length) params.set('waypoints', middle.join('|'));
  return `https://www.google.com/maps/dir/?${params}`;
}

/** Newest guide leads; on a tie, the one added last. */
export function featuredGuide(guides: readonly Guide[]): Guide | undefined {
  return guides.reduce<Guide | undefined>((best, g) => !best || Date.parse(g.updatedAt) >= Date.parse(best.updatedAt) ? g : best, undefined);
}
