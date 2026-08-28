import type { Incident } from '@/src/types';

export type LocatedIncident = { incident: Incident; distanceM: number };

const STORY_WEIGHT: Record<Incident['category'], number> = {
  emergency: 900,
  crime: 760,
  weather: 470,
  infrastructure: 260,
  traffic: 0,
};

const STORY_SPECIFICS = /\b(stolen|theft|break.?in|robbery|wanted|charged|arrested|fraud|vandal|assault|missing|evacuat|closure|outage|warning)\b/i;

/** A lead needs evidence or detail; proximity alone cannot make filler news. */
function isLeadWorthy(incident: Incident): boolean {
  if (incident.category === 'emergency') return true;
  const text = `${incident.title} ${incident.description}`;
  const trustedEditorialSource = incident.source_type === 'calgary_police_crime'
    || incident.source_type === 'news_rss';
  const confirmed = incident.verified_status === 'community_confirmed'
    || incident.verified_status === 'multiple_reports';
  const hasUsefulDetail = (incident.description?.trim().length ?? 0) >= 70;
  return trustedEditorialSource || (hasUsefulDetail && (confirmed || STORY_SPECIFICS.test(text)));
}

function fingerprint(incident: Incident): string {
  return `${incident.title} ${incident.description}`
    .toLowerCase()
    .replace(/\b(reported|report|near|at|the|a|an|calgary)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .slice(0, 9)
    .join(' ');
}

/**
 * Rank useful local reporting without rewarding fear or clickbait. Official
 * detail, first-hand community context, confirmation, recency and proximity
 * all matter; generic traffic rows are deliberately excluded by callers.
 */
export function personalStoryScore(item: LocatedIncident, now: number): number {
  const { incident, distanceM } = item;
  const ageHours = Math.max(0, (now - incident.timestamp) / 3_600_000);
  const source = incident.data_source === 'community'
    ? 180
    : incident.source_type === 'calgary_police_crime'
      ? 210
      : incident.source_type === 'news_rss'
        ? 150
        : 0;
  const confirmed = incident.verified_status === 'community_confirmed'
    ? 80
    : incident.verified_status === 'multiple_reports'
      ? 55
      : 0;
  const detail = Math.min(90, Math.max(0, (incident.description?.trim().length ?? 0) - 55));
  const usefulSpecifics = STORY_SPECIFICS.test(`${incident.title} ${incident.description}`) ? 75 : 0;
  const proximity = Math.max(0, 130 - distanceM / 80);
  const recency = Math.max(0, 160 - ageHours * 2.5);
  return STORY_WEIGHT[incident.category] + source + confirmed + detail + usefulSpecifics + proximity + recency;
}

/** Two lead stories followed by up to five additional crime reports. */
export function curatePersonalStories(items: LocatedIncident[], now: number) {
  const ranked = items
    .filter(({ incident }) => incident.category !== 'traffic' && incident.data_source !== 'demo')
    .sort((a, b) => personalStoryScore(b, now) - personalStoryScore(a, now)
      || b.incident.timestamp - a.incident.timestamp
      || a.incident.id.localeCompare(b.incident.id));
  const seen = new Set<string>();
  const takeUnique = (pool: LocatedIncident[], limit: number) => {
    const selected: LocatedIncident[] = [];
    for (const item of pool) {
      if (selected.length >= limit) break;
      const key = fingerprint(item.incident);
      if (seen.has(key)) continue;
      seen.add(key);
      selected.push(item);
    }
    return selected;
  };
  const leads = takeUnique(ranked.filter(({ incident }) => isLeadWorthy(incident)), 2);
  const leadIds = new Set(leads.map(({ incident }) => incident.id));
  const crimes = takeUnique(
    ranked.filter(({ incident }) => incident.category === 'crime' && !leadIds.has(incident.id)),
    5,
  );
  return { leads, crimes };
}

const TRAFFIC_PRIORITY = /\b(collision|accident|closed|closure|hazard|debris|spill|flood|signal|light out)\b/i;

/**
 * Keep 85% of City traffic rows, preserving the ones most likely to change a
 * trip. The reduction is proportional, so quieter API responses stay honest.
 */
export function curateTrafficReports(incidents: Incident[], retention = 0.85): Incident[] {
  if (incidents.length === 0 || retention <= 0) return [];
  const target = Math.min(incidents.length, Math.max(1, Math.round(incidents.length * retention)));
  return [...incidents]
    .sort((a, b) => {
      const aPriority = TRAFFIC_PRIORITY.test(`${a.title} ${a.description}`) ? 1 : 0;
      const bPriority = TRAFFIC_PRIORITY.test(`${b.title} ${b.description}`) ? 1 : 0;
      return bPriority - aPriority || b.timestamp - a.timestamp || a.id.localeCompare(b.id);
    })
    .slice(0, target);
}
