import { AreaIntelligence, CommunityStats } from '@/src/types';
// MOCK_INCIDENTS intentionally removed — the app now uses only real
// user-submitted reports and data ingested by the pipeline in
// scripts/ingest/. Do NOT re-add fake incidents here.

export const MOCK_COMMUNITY_STATS: CommunityStats[] = [
  {
    community: 'Beltline',
    month: 'March 2024',
    violent_crime: 12,
    property_crime: 45,
    disorder_calls: 78,
    safety_score: 68,
  },
  {
    community: 'Kensington',
    month: 'March 2024',
    violent_crime: 4,
    property_crime: 22,
    disorder_calls: 34,
    safety_score: 82,
  },
  {
    community: 'Bridgeland',
    month: 'March 2024',
    violent_crime: 6,
    property_crime: 28,
    disorder_calls: 41,
    safety_score: 79,
  },
  {
    community: 'Mission',
    month: 'March 2024',
    violent_crime: 5,
    property_crime: 31,
    disorder_calls: 45,
    safety_score: 75,
  },
  {
    community: 'Inglewood',
    month: 'March 2024',
    violent_crime: 7,
    property_crime: 35,
    disorder_calls: 52,
    safety_score: 72,
  },
  {
    community: 'Bowness',
    month: 'March 2024',
    violent_crime: 3,
    property_crime: 18,
    disorder_calls: 25,
    safety_score: 88,
  },
  {
    community: 'Downtown',
    month: 'March 2024',
    violent_crime: 15,
    property_crime: 55,
    disorder_calls: 92,
    safety_score: 62,
  },
];

export function getAreaIntelligence(communityName: string): AreaIntelligence {
  const months = ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];
  const baseStats = MOCK_COMMUNITY_STATS.find(s => s.community === communityName) || MOCK_COMMUNITY_STATS[0];

  return {
    communityName,
    safetyScore: baseStats.safety_score,
    description: `${communityName} is a ${baseStats.safety_score > 75 ? 'vibrant and safe' : 'dynamic'} neighborhood in Calgary. Recent data shows a ${baseStats.safety_score > 75 ? 'low' : 'moderate'} rate of incidents compared to the city average.`,
    activeIncidents: Math.floor(Math.random() * 5 + 1),
    trend: baseStats.safety_score > 75 ? 'improving' : 'stable',
    monthlyTrends: months.map((month, idx) => ({
      month,
      violent_crime: Math.max(0, baseStats.violent_crime + Math.floor(Math.random() * 6 - 3)),
      property_crime: Math.max(0, baseStats.property_crime + Math.floor(Math.random() * 10 - 5)),
      disorder_calls: Math.max(0, baseStats.disorder_calls + Math.floor(Math.random() * 20 - 10)),
    })),
    insights: [
      `↑ ${Math.floor(Math.random() * 15 + 5)}% increase in property crime in ${communityName} this month`,
      `Safety score of ${baseStats.safety_score} is ${baseStats.safety_score > 75 ? 'above' : 'near'} the city average`,
      'Consistent with historical trends for this season',
      communityName === 'Beltline' || communityName === 'Downtown' ? 'High density area with frequent disorder calls' : 'Residential area with lower incident density',
    ],
    liveOverlayInsight: '3 live reports in last 2 hours (unusual activity for this time of day).',
  };
}
