/**
 * Every operational data source Calgary Watch depends on.
 *
 * Admin, ingestion scripts, documentation tests and health reporting all read
 * this registry. Adding or retiring a source here is intentionally required:
 * it prevents the map, scheduled workflows and admin dashboard from carrying
 * contradictory hand-maintained inventories.
 */

export type DataSourceHealthMode = 'scheduled' | 'direct';
export type DataSourceGroup = 'Incident ingestion' | 'Live map layers';

export interface DataSourceDefinition {
  id: string;
  name: string;
  shortName: string;
  description: string;
  group: DataSourceGroup;
  healthMode: DataSourceHealthMode;
  cadence: string;
  /** A scheduled source is stale after this many minutes without a check-in. */
  staleAfterMinutes?: number;
  optional?: boolean;
  setupHint?: string;
  homepage: string;
  /** Browser-safe probe used only for direct live layers. */
  checkUrl?: string;
}

export const DATA_SOURCES = [
  {
    id: 'calgary_311',
    name: 'Calgary 311 property reports',
    shortName: 'Calgary 311',
    description: 'Recent property-crime-related resident service requests with exact report times.',
    group: 'Incident ingestion',
    healthMode: 'scheduled',
    cadence: 'Every 30 minutes',
    staleAfterMinutes: 90,
    homepage: 'https://data.calgary.ca/Services-and-Amenities/311-Service-Requests/iahh-g8bj',
  },
  {
    id: 'calgary_police_news',
    name: 'Calgary Police newsroom',
    shortName: 'CPS newsroom',
    description: 'Official police releases that name a Calgary community or quadrant.',
    group: 'Incident ingestion',
    healthMode: 'scheduled',
    cadence: 'Every 30 minutes',
    staleAfterMinutes: 90,
    homepage: 'https://newsroom.calgary.ca/police-news-releases/',
  },
  {
    id: 'environment_canada',
    name: 'Environment Canada alerts',
    shortName: 'ECCC alerts',
    description: 'Active official warnings intersecting Calgary, with publication and expiry times.',
    group: 'Incident ingestion',
    healthMode: 'scheduled',
    cadence: 'Every 30 minutes',
    staleAfterMinutes: 90,
    homepage: 'https://weather.gc.ca/warnings/index_e.html?prov=ab',
  },
  {
    id: 'alberta_emergency',
    name: 'Alberta Emergency Alert',
    shortName: 'AB Emergency',
    description: 'Provincial emergency alerts relevant to Calgary and the surrounding area.',
    group: 'Incident ingestion',
    healthMode: 'scheduled',
    cadence: 'Every 30 minutes',
    staleAfterMinutes: 90,
    homepage: 'https://www.alberta.ca/alberta-emergency-alert.aspx',
  },
  {
    id: 'global_news',
    name: 'Global News Calgary RSS',
    shortName: 'Global News',
    description: 'Secondary local-news feed; only safety stories with a named Calgary location qualify.',
    group: 'Incident ingestion',
    healthMode: 'scheduled',
    cadence: 'Every 30 minutes',
    staleAfterMinutes: 90,
    homepage: 'https://globalnews.ca/calgary/',
  },
  {
    id: 'alberta_511',
    name: '511 Alberta traffic events',
    shortName: '511 Alberta',
    description: 'Calgary-region road events from the authenticated provincial developer API.',
    group: 'Incident ingestion',
    healthMode: 'scheduled',
    cadence: 'Every 30 minutes',
    staleAfterMinutes: 90,
    optional: true,
    setupHint: 'Add the ALBERTA_511_API_KEY GitHub Actions secret.',
    homepage: 'https://511.alberta.ca/developers/doc',
  },
  {
    id: 'enmax_outages',
    name: 'ENMAX power outages',
    shortName: 'ENMAX',
    description: 'Server-cached current outage snapshot used by the public map layer.',
    group: 'Incident ingestion',
    healthMode: 'scheduled',
    cadence: 'Every 5 minutes',
    staleAfterMinutes: 20,
    homepage: 'https://powerservices.enmax.com/',
  },
  {
    id: 'calgary_traffic',
    name: 'Calgary traffic incidents',
    shortName: 'Traffic',
    description: 'Current City traffic disruptions loaded directly by the map.',
    group: 'Live map layers',
    healthMode: 'direct',
    cadence: 'On map load',
    homepage: 'https://data.calgary.ca/Transportation-Transit/Traffic-Incidents/35ra-9556',
    checkUrl: 'https://data.calgary.ca/resource/35ra-9556.json?$limit=10&$order=start_dt%20DESC',
  },
  {
    id: 'water_main',
    name: 'Calgary water-main breaks',
    shortName: 'Water mains',
    description: 'Active City water-main breaks loaded directly by the map.',
    group: 'Live map layers',
    healthMode: 'direct',
    cadence: 'On map load',
    homepage: 'https://data.calgary.ca/Services-and-Amenities/Water-Main-Breaks/dpcu-jr23',
    checkUrl: 'https://data.calgary.ca/resource/dpcu-jr23.json?$limit=10&$order=break_date%20DESC&status=ACTIVE',
  },
  {
    id: 'open_meteo',
    name: 'Open-Meteo conditions',
    shortName: 'Open-Meteo',
    description: 'Current local conditions used for the map weather layer; official warnings remain ECCC.',
    group: 'Live map layers',
    healthMode: 'direct',
    cadence: 'On map load',
    homepage: 'https://open-meteo.com/',
    checkUrl: 'https://api.open-meteo.com/v1/forecast?latitude=51.048&longitude=-114.065&current=temperature_2m,weathercode&timezone=America%2FEdmonton',
  },
] as const satisfies readonly DataSourceDefinition[];

export type DataSourceId = (typeof DATA_SOURCES)[number]['id'];

export const DATA_SOURCE_BY_ID = new Map<string, DataSourceDefinition>(
  DATA_SOURCES.map((source) => [source.id, source]),
);

export const SCHEDULED_DATA_SOURCES = DATA_SOURCES.filter((source) => source.healthMode === 'scheduled');
export const DIRECT_DATA_SOURCES = DATA_SOURCES.filter((source) => source.healthMode === 'direct');
