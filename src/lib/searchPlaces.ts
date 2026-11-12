/**
 * Places people type that aren't a Calgary community or street: a postal
 * code ("t2k 2e2"), a town next door ("cochrane"), or the whole city.
 *
 * Postal areas: the first three characters of a Canadian postal code (the
 * forward sortation area) and the neighbourhoods Wikipedia's "List of postal
 * codes of Canada: T" gives for each (read 2026-11-12). A postal area covers
 * more than the communities named, so the page says "around", not "in".
 */

export const POSTAL_SOURCE = 'https://en.wikipedia.org/wiki/List_of_postal_codes_of_Canada:_T';

export interface PostalArea {
  fsa: string;
  /** Community names as bundled in calgaryCommunities.ts (unknown names are dropped by the caller). */
  communities: string[];
  /** For areas Wikipedia names only by direction. */
  quadrant?: 'NW' | 'NE' | 'SW' | 'SE';
  /** Landmarks the list names that aren't communities. */
  note?: string;
  /** Postal areas outside Calgary. */
  town?: string;
}

const P = (fsa: string, communities: string[], extra: Partial<PostalArea> = {}): PostalArea => ({ fsa, communities, ...extra });

export const POSTAL_AREAS: PostalArea[] = [
  P('T1Y', ['Rundle', 'Whitehorn', 'Monterey Park']),
  P('T2A', ['Penbrooke Meadows', 'Marlborough']),
  P('T2B', ['Forest Lawn', 'Dover', 'Erin Woods']),
  P('T2C', ['Ogden'], { note: 'Lynnwood Ridge, Great Plains and the Foothills industrial area' }),
  P('T2E', ['Bridgeland/Riverside', 'Greenview'], { note: 'the Calgary Zoo and YYC airport' }),
  P('T2G', ['Inglewood', 'Chinatown', 'Beltline'], { note: 'east Victoria Park and the Saddledome' }),
  P('T2H', [], { quadrant: 'SE', note: 'the Highfield and Burns industrial areas' }),
  P('T2J', ['Queensland', 'Lake Bonavista', 'Willow Park', 'Acadia']),
  P('T2K', ['Thorncliffe', 'Tuxedo Park']),
  P('T2L', ['Brentwood', 'Collingwood'], { note: 'Nose Hill' }),
  P('T2M', ['Mount Pleasant', 'Capitol Hill', 'Banff Trail']),
  P('T2N', ['Hillhurst', 'West Hillhurst', 'Parkdale', 'University Heights'], { note: 'Kensington and the University of Calgary' }),
  P('T2P', ['Downtown Commercial Core', 'Eau Claire'], { note: 'the Calgary Tower' }),
  P('T2R', ['Beltline'], { note: 'Connaught and west Victoria Park' }),
  P('T2S', ['Elbow Park', 'Britannia', 'Parkhill', 'Mission']),
  P('T2T', ['Altadore', 'Bankview', 'Richmond']),
  P('T2V', ['Oakridge', 'Haysboro', 'Kingsland', 'Kelvin Grove', 'Windsor Park']),
  P('T2W', ['Braeside', 'Cedarbrae', 'Woodbine']),
  P('T2X', ['Midnapore', 'Sundance']),
  P('T2Y', ['Millrise', 'Somerset', 'Bridlewood', 'Evergreen']),
  P('T2Z', ['Douglasdale/Glen', 'McKenzie Lake', 'Copperfield'], { note: 'the East Shepard industrial area' }),
  P('T3A', ['Dalhousie', 'Edgemont', 'Hamptons', 'Hidden Valley']),
  P('T3B', ['Montgomery', 'Bowness', 'Silver Springs', 'Greenwood/Greenbriar']),
  P('T3C', ['Rosscarrock', 'Westgate', 'Wildwood', 'Shaganappi', 'Sunalta']),
  P('T3E', ['Lakeview', 'Glendale', 'Killarney/Glengarry', 'Glamorgan']),
  P('T3G', ['Hawkwood', 'Arbour Lake', 'Citadel', 'Ranchlands', 'Royal Oak', 'Rocky Ridge']),
  P('T3H', ['Discovery Ridge', 'Signal Hill', 'West Springs', 'Christie Park', 'Patterson', 'Cougar Ridge']),
  P('T3J', ['Martindale', 'Taradale', 'Falconridge', 'Saddle Ridge']),
  P('T3K', ['Sandstone Valley', 'MacEwan Glen', 'Beddington Heights', 'Harvest Hills', 'Coventry Hills', 'Panorama Hills']),
  P('T3L', ['Tuscany', 'Scenic Acres']),
  P('T3M', ['Cranston', 'Auburn Bay', 'Mahogany']),
  P('T3N', [], { quadrant: 'NE' }),
  P('T3P', ['Evanston', 'Sage Hill', 'Kincora', 'Nolan Hill'], { note: 'Symons Valley' }),
  P('T3R', [], { quadrant: 'NW' }),
  P('T3S', [], { quadrant: 'SE' }),
  // Next door: their own towns, not Calgary.
  P('T4A', [], { town: 'Airdrie' }), P('T4B', [], { town: 'Airdrie' }), P('T4C', [], { town: 'Cochrane' }),
  P('T1X', [], { town: 'Chestermere' }), P('T1S', [], { town: 'Okotoks' }), P('T1P', [], { town: 'Strathmore' }),
  P('T1V', [], { town: 'High River' }), P('T1W', [], { town: 'Canmore' }), P('T1L', [], { town: 'Banff' }),
];

export interface PostalGuess { code: string; area: PostalArea }

/** "t2k 2e2", "T2K2E2", "t2k": a Calgary-region postal code or its first half. */
export function parsePostal(q: string): PostalGuess | null {
  const m = q.trim().toUpperCase().replace(/\s+/g, '').match(/^(T\d[A-Z])(\d[A-Z]\d)?$/);
  if (!m) return null;
  const area = POSTAL_AREAS.find(a => a.fsa === m[1]);
  return area ? { code: m[2] ? `${m[1]} ${m[2]}` : m[1], area } : null;
}

export interface Town {
  name: string;
  keys: string[];
  /** Where it is from Calgary, in a phrase. */
  where: string;
  /** The Calgary side people drive through to get there. */
  quadrant: 'NW' | 'NE' | 'SW' | 'SE';
  /** Calgary communities on that edge of the city, by bundled name. */
  near: string[];
  /** A CalgaryWatch page about the town, where one exists. */
  page?: { to: string; label: string };
}

export const TOWNS: Town[] = [
  { name: 'Cochrane', keys: ['cochrane'], where: 'west of Calgary on Highway 1A', quadrant: 'NW', near: ['Tuscany', 'Rocky Ridge'] },
  { name: 'Airdrie', keys: ['airdrie'], where: 'just north of Calgary on Highway 2', quadrant: 'NE', near: ['Livingston', 'Carrington'], page: { to: '/airdrie-crime-map', label: 'Airdrie crime map' } },
  { name: 'Chestermere', keys: ['chestermere'], where: 'on Calgary’s eastern edge, along 17 Avenue SE', quadrant: 'SE', near: [] },
  { name: 'Okotoks', keys: ['okotoks'], where: 'south of Calgary on Highway 2', quadrant: 'SW', near: [] },
  { name: 'Strathmore', keys: ['strathmore'], where: 'east of Calgary on the Trans-Canada', quadrant: 'NE', near: [] },
  { name: 'High River', keys: ['high river'], where: 'south of Calgary on Highway 2', quadrant: 'SE', near: [] },
  { name: 'Canmore', keys: ['canmore'], where: 'west of Calgary on the Trans-Canada, in the mountains', quadrant: 'NW', near: [] },
  { name: 'Banff', keys: ['banff'], where: 'west of Calgary on the Trans-Canada, in the national park', quadrant: 'NW', near: [] },
  { name: 'Bragg Creek', keys: ['bragg creek'], where: 'southwest of Calgary, on Highway 22', quadrant: 'SW', near: [] },
  { name: 'Crossfield', keys: ['crossfield'], where: 'north of Airdrie on Highway 2', quadrant: 'NE', near: [] },
  { name: 'Langdon', keys: ['langdon'], where: 'east of Calgary, past Chestermere', quadrant: 'SE', near: [] },
];

/** "north east", "northeast", "the nw": a quadrant spelled out. Longest first. */
export const QUADRANT_PHRASES: Array<[string, 'NW' | 'NE' | 'SW' | 'SE']> = [
  ['north east', 'NE'], ['north west', 'NW'], ['south east', 'SE'], ['south west', 'SW'],
  ['northeast', 'NE'], ['northwest', 'NW'], ['southeast', 'SE'], ['southwest', 'SW'],
  ['ne', 'NE'], ['nw', 'NW'], ['se', 'SE'], ['sw', 'SW'],
];

export const QUADRANT_NAME: Record<'NW' | 'NE' | 'SW' | 'SE', string> = { NW: 'Northwest', NE: 'Northeast', SW: 'Southwest', SE: 'Southeast' };

/** "sq" after a street word is a thumb slip for "sw" (q sits next to w). */
const NEAR_KEY: Record<string, string[]> = { w: ['q', 'e', 'a', 's'], e: ['w', 'r', 'd'] };
export function quadrantTypo(word: string): 'NW' | 'NE' | 'SW' | 'SE' | null {
  if (word.length !== 2 || !'ns'.includes(word[0])) return null;
  const hits = (['w', 'e'] as const).filter(k => NEAR_KEY[k].includes(word[1]));
  return hits.length === 1 ? (`${word[0]}${hits[0]}`.toUpperCase() as 'NW' | 'NE' | 'SW' | 'SE') : null;
}
