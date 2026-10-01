import { DATA_SOURCE_BY_ID } from '../config/dataSources';

/**
 * Copy for /coverage. Shared with the prerender step (scripts/seo/rewriteHtml.ts) so the
 * first-response HTML and the rendered page list the same sources and answers.
 */
export type CoverageSource = {
  name: string;
  covers: string;
  often: string;
  /** Registry id in src/config/dataSources.ts, used for the source link. */
  id?: string;
  href?: string;
  note?: string;
};

export const coverageSourceLink = (s: CoverageSource) => s.href ?? (s.id ? DATA_SOURCE_BY_ID.get(s.id)?.homepage : undefined);

/** scripts/ingest/index.ts, run by .github/workflows/ingest-live-data.yml at :13 and :43. */
export const COVERAGE_SERVER_SOURCES: CoverageSource[] = [
  { id: 'calgary_311', name: 'City of Calgary 311', covers: 'Safety-related service requests only. A 311 request is never shown as an emergency.', often: 'Every 30 minutes' },
  { id: 'calgary_police_news', name: 'Calgary Police news releases', covers: 'Releases from the Calgary Police newsroom that name a Calgary community or quadrant. This is not a police dispatch log.', often: 'Every 30 minutes' },
  { id: 'environment_canada', name: 'Environment Canada warnings', covers: 'Active weather warnings for the Calgary area.', often: 'Every 30 minutes' },
  { id: 'alberta_emergency', name: 'Alberta Emergency Alerts', covers: 'Provincial alerts for Calgary, plus Alberta-wide alerts.', often: 'Every 30 minutes' },
  { id: 'global_news', name: 'Global News Calgary', covers: 'Safety stories that name a Calgary location.', often: 'Every 30 minutes' },
  { id: 'enmax_outages', name: 'ENMAX power outages', covers: 'Current power outages.', often: 'Every 5 minutes' },
  { id: 'alberta_511', name: '511 Alberta', covers: 'Road events in the Calgary region.', often: 'Every 30 minutes', note: 'When available' },
];

/** Loaded by the browser from src/pages/MapPage.tsx and its hooks. */
export const COVERAGE_BROWSER_SOURCES: CoverageSource[] = [
  { id: 'calgary_traffic', name: 'City of Calgary traffic incidents', covers: 'Current collisions, closures and other traffic disruptions.', often: 'Every 5 minutes' },
  { id: 'calgary_311', name: 'City of Calgary 311', covers: 'Open safety-related requests from the last 7 days.', often: 'Every 5 minutes' },
  { id: 'water_main', name: 'City of Calgary water main breaks', covers: 'Active water main breaks.', often: 'Every 5 minutes' },
  { name: 'River levels', href: 'https://rivers.alberta.ca/', covers: 'Bow River at Calgary, Elbow River below Glenmore Dam, and Elbow River at Bragg Creek. A pin appears only when a river is rising.', often: 'Every 30 minutes' },
  { id: 'open_meteo', name: 'Weather conditions (Open-Meteo)', covers: 'Current conditions. A pin appears only for rain, snow, fog, strong wind or extreme cold.', often: 'Every 30 minutes' },
  { name: 'Air quality (Open-Meteo)', href: 'https://open-meteo.com/en/docs/air-quality-api', covers: 'Smoke and fine particles. A pin appears only when air quality is moderate or worse.', often: 'Every 30 minutes' },
  { name: 'Traffic cameras', href: 'https://data.calgary.ca/d/k7p9-kppz', covers: 'City of Calgary traffic camera locations, with the live image. Turn the layer on in the map.', often: 'Once per visit' },
  { name: 'Intersection safety cameras', href: 'https://data.calgary.ca/d/dv2f-necx', covers: 'Locations of the City’s fixed red-light and speed-on-green cameras. Turn the layer on in the map.', often: 'Once per visit' },
];

export const COVERAGE_FAQS = [
  {
    q: 'Does CalgaryWatch cover towns outside Calgary?',
    a: 'CalgaryWatch is built for Calgary. The official feeds are filtered to the Calgary area. Neighbour reports can be pinned anywhere, and the map shows weather and air-quality pins for a few nearby towns such as Airdrie, Cochrane and Okotoks. It does not have full coverage outside Calgary.',
  },
  {
    q: 'Does an empty area mean nothing happened there?',
    a: 'No. The map only shows what neighbours posted and what the sources above published. Many incidents are never reported publicly. The number of pins is not a crime rate.',
  },
  {
    q: 'Are neighbour reports checked by police?',
    a: 'No. They are what residents saw. Each pin shows its source and when it was posted, and neighbours can mark a report as seen, still happening or resolved.',
  },
  {
    q: 'How do I report a crime?',
    a: 'Call 911 for an emergency or a crime in progress. For anything else, call Calgary Police non-emergency at 403-266-1234. Posting on CalgaryWatch does not create a police report.',
  },
  {
    q: 'Is CalgaryWatch free?',
    a: 'Yes. Anyone can look at the map without an account. You need a free account only to post a report.',
  },
];
