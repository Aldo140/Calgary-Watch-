/**
 * Calgary's residential communities, bundled so search can recognise a
 * neighbourhood the moment someone types it, with no network round trip.
 *
 * Names follow the City's community boundary dataset (surr-xmvs), lowercased
 * there, title-cased here. toSlug(name) therefore lands on the same
 * /check-your-community?c= slug the 311 rankings use. Quadrant is the one
 * residents say out loud ("Coral Springs NE"), not the City's sector.
 *
 * Aliases are what people actually call a place when the official name isn't
 * it: Kensington is Hillhurst/Sunnyside, Marda Loop is Altadore, Savanna is
 * part of Saddle Ridge.
 */

export type Quadrant = 'NW' | 'NE' | 'SW' | 'SE' | 'Centre';

export interface CalgaryCommunity { name: string; quadrant: Quadrant; aliases?: string[] }

const NW = 'NW', NE = 'NE', SW = 'SW', SE = 'SE', C = 'Centre';
type Row = [string, Quadrant, string[]?];

const ROWS: Row[] = [
  // Centre
  ['Beltline', C, ['17th ave', '17 ave', 'victoria park']], ['Downtown Commercial Core', C, ['downtown', 'core', 'stephen ave']],
  ['Downtown East Village', C, ['east village']], ['Downtown West End', C, ['west end']], ['Eau Claire', C], ['Chinatown', C],
  ['Cliff Bungalow', C], ['Mission', C, ['4th street']], ['Lower Mount Royal', C],
  // NW
  ['Ambleton', NW], ['Arbour Lake', NW], ['Banff Trail', NW], ['Bowness', NW], ['Brentwood', NW], ['Briar Hill', NW],
  ['Cambrian Heights', NW], ['Capitol Hill', NW], ['Carrington', NW], ['Charleswood', NW], ['Citadel', NW], ['Collingwood', NW],
  ['Country Hills', NW], ['Country Hills Village', NW], ['Coventry Hills', NE], ['Crescent Heights', NW], ['Dalhousie', NW],
  ['Edgemont', NW], ['Evanston', NW], ['Glacier Ridge', NW], ['Hamptons', NW, ['the hamptons']], ['Harvest Hills', NE],
  ['Hawkwood', NW], ['Hidden Valley', NW], ['Highland Park', NW], ['Highwood', NW], ['Hillhurst', NW, ['kensington']],
  ['Hounsfield Heights/Briar Hill', NW], ['Huntington Hills', NW], ['Kincora', NW], ['Livingston', NW], ['Lucas', NW],
  ['Montgomery', NW, ['montgomery village']], ['Mount Pleasant', NW], ['Nolan Hill', NW], ['North Haven', NW], ['North Haven Upper', NW],
  ['Panorama Hills', NW, ['panorama']], ['Parkdale', NW], ['Point McKay', NW], ['Ranchlands', NW], ['Rocky Ridge', NW],
  ['Rosedale', NW], ['Rosemont', NW], ['Royal Oak', NW], ['Sage Hill', NW], ['Sandstone Valley', NW], ['Scenic Acres', NW],
  ['Sherwood', NW], ['Silver Springs', NW], ['St. Andrews Heights', NW], ['Sunnyside', NW, ['kensington']], ['Thorncliffe', NW],
  ['Tuscany', NW], ['Tuxedo Park', NW], ['University District', NW], ['University Heights', NW], ['Varsity', NW],
  ['West Hillhurst', NW], ['Greenwood/Greenbriar', NW], ['Valley Ridge', NW], ['Crestmont', SW], ['Beddington Heights', NW, ['beddington']],
  ['MacEwan Glen', NW],
  // NE
  ['Abbeydale', NE], ['Applewood Park', SE, ['applewood']], ['Bridgeland/Riverside', NE, ['bridgeland', 'riverside']],
  ['Castleridge', NE], ['Cityscape', NE], ['Coral Springs', NE], ['Cornerstone', NE], ['Falconridge', NE], ['Greenview', NE],
  ['Homestead', NE], ['Marlborough', NE], ['Marlborough Park', NE], ['Martindale', NE], ['Mayland Heights', NE],
  ['Monterey Park', NE], ['Pineridge', NE], ['Redstone', NE], ['Renfrew', NE], ['Rundle', NE],
  ['Saddle Ridge', NE, ['saddleridge', 'savanna']], ['Skyview Ranch', NE, ['skyview']], ['Taradale', NE], ['Temple', NE],
  ['Vista Heights', NE], ['Whitehorn', NE], ['Winston Heights/Mountview', NE, ['winston heights', 'mountview']], ['Crossroads', NE],
  // SE
  ['Acadia', SE], ['Albert Park/Radisson Heights', SE, ['albert park', 'radisson heights']], ['Auburn Bay', SE], ['Belvedere', SE],
  ['Bonavista Downs', SE], ['Copperfield', SE], ['Cranston', SE], ['Deer Ridge', SE], ['Deer Run', SE], ['Diamond Cove', SE],
  ['Douglasdale/Glen', SE, ['douglasdale', 'douglas glen']], ['Dover', SE], ['Erin Woods', SE, ['erinwoods']], ['Fairview', SE],
  ['Forest Heights', SE], ['Forest Lawn', SE, ['international avenue']], ['Hotchkiss', SE], ['Inglewood', SE], ['Lake Bonavista', SE, ['bonavista']],
  ['Legacy', SE], ['Mahogany', SE], ['Maple Ridge', SE], ['McKenzie Lake', SE], ['McKenzie Towne', SE], ['Midnapore', SE],
  ['New Brighton', SE], ['Ogden', SE, ['millican', 'millican ogden', 'millican estates', 'lynnwood', 'lynnwood ridge']], ['Parkland', SE], ['Penbrooke Meadows', SE, ['penbrooke']], ['Queensland', SE],
  ['Quarry Park', SE], ['Ramsay', SE], ['Rangeview', SE], ['Riverbend', SE], ['Seton', SE], ['Southview', SE], ['Walden', SE],
  ['Willow Park', SE], ['Wolf Willow', SE], ['Red Carpet', SE], ['Erlton', SE], ['Victoria Park', SE], ['Sundance', SE], ['Chaparral', SE],
  // SW
  ['Altadore', SW, ['marda loop']], ['Aspen Woods', SW], ['Bankview', SW], ['Bayview', SW], ['Belmont', SW], ['Braeside', SW],
  ['Bridlewood', SW], ['Britannia', SW], ['Canyon Meadows', SW], ['Cedarbrae', SW], ['Chinook Park', SW], ['Christie Park', SW],
  ['Coach Hill', SW], ['Cougar Ridge', SW], ['Currie Barracks', SW], ['Discovery Ridge', SW], ['Eagle Ridge', SW], ['Elbow Park', SW],
  ['Elboya', SW], ['Evergreen', SW], ['Garrison Green', SW], ['Garrison Woods', SW], ['Glamorgan', SW], ['Glenbrook', SW],
  ['Glendale', SW], ['Haysboro', SW], ['Kelvin Grove', SW], ['Killarney/Glengarry', SW, ['killarney', 'glengarry']], ['Kingsland', SW],
  ['Lakeview', SW], ['Lincoln Park', SW], ['Mayfair', SW], ['Meadowlark Park', SW], ['Millrise', SW], ['North Glenmore Park', SW],
  ['Oakridge', SW], ['Palliser', SW], ['Parkhill', SW], ['Patterson', SW], ['Pine Creek', SW], ['Pump Hill', SW], ['Richmond', SW],
  ['Rideau Park', SW], ['Rosscarrock', SW], ['Roxboro', SW], ['Rutland Park', SW], ['Scarboro', SW], ['Scarboro/Sunalta West', SW],
  ['Shaganappi', SW], ['Shawnee Slopes', SW], ['Shawnessy', SW], ['Signal Hill', SW], ['Silverado', SW], ['Somerset', SW],
  ['South Calgary', SW, ['marda loop']], ['Southwood', SW], ['Springbank Hill', SW, ['springbank']], ['Spruce Cliff', SW],
  ['Strathcona Park', SW], ['Sunalta', SW], ['Upper Mount Royal', SW, ['mount royal']], ['West Springs', SW], ['Westgate', SW],
  ['Wildwood', SW], ['Windsor Park', SW], ['Woodbine', SW], ['Woodlands', SW], ['Yorkville', SW], ['Alpine Park', SW],
];

const seen = new Set<string>();
export const CALGARY_COMMUNITIES: CalgaryCommunity[] = ROWS.filter(([name]) => !seen.has(name) && seen.add(name))
  .map(([name, quadrant, aliases]) => (aliases ? { name, quadrant, aliases } : { name, quadrant }));
