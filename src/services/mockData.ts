import { AreaIntelligence } from '@/src/types';
// MOCK_INCIDENTS and MOCK_COMMUNITY_STATS were removed. The map uses only real
// user-submitted reports and data ingested by the pipeline in scripts/ingest/.
// Do NOT re-add fake incidents, invented percentages or random figures here:
// the area panel is read as fact by residents.

const TWO_HOURS = 2 * 60 * 60 * 1000;
const ONE_DAY = 24 * 60 * 60 * 1000;

interface AreaIncident {
  neighborhood?: string;
  timestamp: number;
}

/**
 * The baseline for the area panel, built only from reports already on the map.
 *
 * The richer figures (311 totals, yearly trends, city position) are layered on
 * by MapPage when the 311 proxy has a row for this community. When it does
 * not, the panel says less rather than inventing anything.
 */
export function getAreaIntelligence(
  communityName: string,
  incidents: readonly AreaIncident[] = [],
  now: number = Date.now(),
): AreaIntelligence {
  const key = communityName.toLowerCase().trim();
  const here = incidents.filter((i) => (i.neighborhood ?? '').toLowerCase().trim() === key);
  const lastDay = here.filter((i) => now - i.timestamp <= ONE_DAY && i.timestamp <= now + 60_000);
  const lastTwoHours = lastDay.filter((i) => now - i.timestamp <= TWO_HOURS);

  const liveOverlayInsight = lastTwoHours.length > 0
    ? `${lastTwoHours.length} ${lastTwoHours.length === 1 ? 'report' : 'reports'} on the map from ${communityName} in the last 2 hours.`
    : '';

  return {
    communityName,
    safetyScore: 0,
    description: `What neighbours and public sources reported in ${communityName}.`,
    activeIncidents: lastDay.length,
    trend: 'stable',
    monthlyTrends: [],
    insights: [],
    liveOverlayInsight,
  };
}
