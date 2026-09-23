export type StorySourceType = 'all' | 'official' | 'community';
export type QuadrantCode = 'NW' | 'NE' | 'SW' | 'SE';

export interface StoryTimelineEntry {
  time: string;
  note: string;
  actor: string;
}

export interface TrendingStory {
  id: string;
  title: string;
  summary: string;
  fullReport: string;
  neighborhood: string;
  quadrant: QuadrantCode;
  sourceType: 'official' | 'community';
  sourceName: string;
  sourceUrl?: string;
  category: 'safety' | 'infrastructure' | 'wildlife' | 'transit' | 'community' | 'environment' | 'traffic';
  verifiedCount: number;
  trendingRank: number;
  viewsCount: number;
  timeAgo: string;
  status: 'active' | 'monitoring' | 'resolved';
  image: string;
  coordinates: { lat: number; lng: number };
  timeline: StoryTimelineEntry[];
  tags: string[];
}

export const CURATED_STORIES: TrendingStory[] = [
  {
    id: 'story-inglewood-bow-flow',
    title: 'Bow River Basin Flow Steady: Riprap Pathway Reinforcement Underway',
    summary: 'City hydrologists confirm Bow River flow steady at 56 m³/s. Scheduled bank stabilization on the south pathway near Harvie Passage active through Friday.',
    fullReport: 'The City of Calgary Water Resources team has issued its bi-weekly Bow River flow telemetry. Real-time gauge 05BH004 at Calgary Central recorded 56.4 m³/s, well within the seasonal median. To protect riverbank pathway integrity ahead of autumn freeze-thaw cycles, specialized gravel riprap reinforcement is being placed along the 9 Ave SE pathway bend. Path remains passable with a minor gravel detour for cyclists.',
    neighborhood: 'Inglewood',
    quadrant: 'SE',
    sourceType: 'official',
    sourceName: 'City of Calgary Water & Parks',
    sourceUrl: 'https://data.calgary.ca/dataset/Historical-River-Flow-Data/h9fb-586y',
    category: 'environment',
    verifiedCount: 18,
    trendingRank: 1,
    viewsCount: 420,
    timeAgo: '18m ago',
    status: 'active',
    image: '/images/hero/calgarywatch-live-watch-v1.webp',
    coordinates: { lat: 51.0394, lng: -114.0242 },
    tags: ['Bow River', 'Harvie Passage', 'Riprap Detour', 'Water Flow'],
    timeline: [
      { time: '08:00 AM', note: 'Morning hydrological gauge verification logged at 56.4 m³/s', actor: 'City of Calgary Open Data' },
      { time: '09:30 AM', note: 'Gravel trucks arrived for pathway bank stabilization work', actor: 'Inglewood Residents Watch' },
      { time: '10:15 AM', note: 'Pathway detour flagged clear and signposted for cyclists', actor: 'Calgary Parks Advisory' }
    ]
  },
  {
    id: 'story-kensington-copper-reunited',
    title: 'Reunited: Senior Beagle "Copper" Recovered Safe Near Riley Park',
    summary: 'Fled during an afternoon thunderclap. Eight Kensington neighbours coordinated sighting pins along 10th St NW and safely recovered him behind the cricket pitch.',
    fullReport: 'A heartening outcome in Kensington this morning. An 11-year-old beagle named Copper bolted from a 2nd Ave NW backyard during sudden thunder. Within 20 minutes of the first alert filed to CalgaryWatch, three local shopkeepers and five pedestrians began tracking sightings moving south toward Riley Park. A barista at 10th St flagged his location sheltering beneath the cricket pavilion benches, where he was safely caught and returned uninjured.',
    neighborhood: 'Kensington',
    quadrant: 'NW',
    sourceType: 'community',
    sourceName: 'Kensington Community Watch',
    category: 'community',
    verifiedCount: 14,
    trendingRank: 2,
    viewsCount: 580,
    timeAgo: '42m ago',
    status: 'resolved',
    image: '/images/illustration/calgarywatch-start-weekend-v1.webp',
    coordinates: { lat: 51.0538, lng: -114.0886 },
    tags: ['Riley Park', 'Pet Rescue', '10th St NW', 'Neighbour Network'],
    timeline: [
      { time: '07:45 AM', note: 'Missing dog report posted by owner on 2nd Ave NW', actor: 'Owner Report' },
      { time: '08:10 AM', note: 'Sighting verified near 10 St NW pedestrian crossing', actor: 'Kensington Pedestrian' },
      { time: '08:35 AM', note: 'Located safe at Riley Park cricket pavilion and reunited', actor: 'Community Verification' }
    ]
  },
  {
    id: 'story-bridgeland-memorial-flyover',
    title: 'Memorial Drive 4th St Flyover Maintenance: Overnight Lane Adjustments',
    summary: 'Structural expansion joint maintenance on the 4th St flyover entering Downtown. Southbound traffic guided by lighted message boards between 10 PM and 5 AM.',
    fullReport: 'Calgary Roads and 511 Alberta have scheduled preventative joint work on the Memorial Drive flyover entering the downtown core from Bridgeland. Crews will operate exclusively during nocturnal windows to minimize commuter congestion. Pedestrian pathways below the structure along the riverwalk remain fully lit and unaffected.',
    neighborhood: 'Bridgeland',
    quadrant: 'NE',
    sourceType: 'official',
    sourceName: '511 Alberta & City of Calgary Roads',
    sourceUrl: 'https://data.calgary.ca/dataset/Traffic-Incidents/35ra-9556',
    category: 'infrastructure',
    verifiedCount: 12,
    trendingRank: 3,
    viewsCount: 310,
    timeAgo: '1h ago',
    status: 'monitoring',
    image: '/images/photo/calgary1.webp',
    coordinates: { lat: 51.0503, lng: -114.0532 },
    tags: ['Memorial Drive', 'Downtown Flyover', 'Night Work', '511 Alberta'],
    timeline: [
      { time: 'Yesterday', note: 'Notice published on City of Calgary Roads dispatch', actor: 'City of Calgary' },
      { time: '06:00 AM', note: 'Message boards placed on Memorial Drive eastbound & westbound', actor: 'Roads Crew' },
      { time: '10:00 AM', note: 'Telemetry confirmed: smooth morning flow during daylight', actor: 'CalgaryWatch Live Radar' }
    ]
  },
  {
    id: 'story-marda-loop-prowler-alert',
    title: 'Marda Loop Vehicle Safety Notice: Doorbell Video Network Confirms Prowler Alert',
    summary: 'Neighbours on 33rd Ave SW logged matching footage of individuals checking vehicle door handles at 3:15 AM. Information shared directly with CPS.',
    fullReport: 'Residents along 33rd Ave and 34th Ave SW verified suspicious activity in front carports overnight. Three separate doorbell cameras captured footage of two individuals in dark clothing checking parked truck door handles. No broken windows were reported; vehicle owners are reminded to remove garage openers, remotes, and valuables overnight.',
    neighborhood: 'Marda Loop',
    quadrant: 'SW',
    sourceType: 'community',
    sourceName: 'Marda Loop Community Watch',
    category: 'safety',
    verifiedCount: 9,
    trendingRank: 4,
    viewsCount: 640,
    timeAgo: '2h ago',
    status: 'active',
    image: '/images/photo/calgary7.webp',
    coordinates: { lat: 51.0252, lng: -114.1147 },
    tags: ['33 Ave SW', 'Doorbell Network', 'Preventative Watch', 'CPS Notified'],
    timeline: [
      { time: '03:15 AM', note: 'Camera footage logged on 33 Ave SW', actor: 'Resident Cam 1' },
      { time: '03:22 AM', note: 'Second angle confirmed 2 blocks west on 34 Ave SW', actor: 'Resident Cam 2' },
      { time: '07:00 AM', note: 'Neighbour alert compiled and 9 neighbours confirmed locks checked', actor: 'Community Moderator' }
    ]
  },
  {
    id: 'story-beltline-17ave-sensor',
    title: '17th Ave SW Acoustic Water Feeder Sensor Network Active & Clear',
    summary: 'Acoustic pipe sensors installed along the 17 Ave corridor show zero anomalies. Road surface restored at 5 St SW with standard curbside parking reinstated.',
    fullReport: 'Following infrastructure telemetry enhancements across downtown Calgary, City of Calgary Water Services verified that permanent acoustic correlators installed along the 17 Ave corridor indicate normal pipeline pressure. Pavement restoration at the intersection of 5 St SW has been finalized and curbside parking meters are back in standard operation.',
    neighborhood: 'Beltline',
    quadrant: 'SW',
    sourceType: 'official',
    sourceName: 'City of Calgary Water Services',
    sourceUrl: 'https://data.calgary.ca/dataset/Water-Distribution-System/6y4t-r8v8',
    category: 'infrastructure',
    verifiedCount: 22,
    trendingRank: 5,
    viewsCount: 390,
    timeAgo: '3h ago',
    status: 'resolved',
    image: '/images/photo/calgary5.webp',
    coordinates: { lat: 51.0378, lng: -114.0736 },
    tags: ['17 Ave SW', 'Feeder Main', 'Acoustic Sensors', 'Road Restored'],
    timeline: [
      { time: '07:00 AM', note: 'Acoustic pressure reading logged: 72 PSI steady', actor: 'Water Telemetry' },
      { time: '09:00 AM', note: 'Asphalt paving completed and lane striping dry', actor: 'Paving Contractor' },
      { time: '11:00 AM', note: 'Street parking meters reactivated at 5 St SW', actor: 'Calgary Parking Authority' }
    ]
  },
  {
    id: 'story-nose-hill-coyotes',
    title: 'Nose Hill Park Wildlife Notice: Coyote Denning on South Ravine Ascent',
    summary: 'Park rangers urge dog walkers to keep pets on-leash along the 14th Street ascent. Three active family dens identified with directional warning markers.',
    fullReport: 'Alberta Environment and City of Calgary Urban Forestry have placed advisory signage near the lower south access trails of Nose Hill Park. Coyotes with young pups are naturally territorial. Walkers with dogs should keep them on a standard 2-metre leash and avoid off-trail brambles between sunrise and dusk.',
    neighborhood: 'Nose Hill',
    quadrant: 'NW',
    sourceType: 'official',
    sourceName: 'Alberta Parks & Urban Conservation',
    sourceUrl: 'https://www.calgary.ca/parks/nose-hill-park.html',
    category: 'wildlife',
    verifiedCount: 15,
    trendingRank: 6,
    viewsCount: 510,
    timeAgo: '4h ago',
    status: 'active',
    image: '/images/hero/calgarywatch-city-guide-v1.webp',
    coordinates: { lat: 51.1118, lng: -114.1136 },
    tags: ['14th St Ascent', 'Urban Wildlife', 'On-Leash Notice', 'Park Rangers'],
    timeline: [
      { time: '06:30 AM', note: 'Denning activity confirmed by morning trail supervisor', actor: 'Park Ranger' },
      { time: '08:00 AM', note: 'Yellow caution signage erected at trailhead', actor: 'Parks Crew' },
      { time: '09:45 AM', note: 'Walkers report respectful spacing maintained on trail', actor: 'Trail Users' }
    ]
  },
  {
    id: 'story-bowness-lagoon-aspen',
    title: 'Bowness Lagoon Pathway Cleared: Windthrown Aspen Moved by Cyclists',
    summary: 'High winds brought down a mature poplar branch blocking the north bike loop. Three local cyclists hauled the hazard clear and flagged 311 for chipping.',
    fullReport: 'Early morning gusts in the Bow Valley caused a large poplar limb to fall across the Bowness Lagoon bike path near the playground pavilion. Three local cyclists dismounted and teamed up with a neighbour walking their dog to haul the heavy limb onto the turf shoulder, clearing the trail before the morning stroller rush. 311 service request #26-004818 logged for wood chipping.',
    neighborhood: 'Bowness',
    quadrant: 'NW',
    sourceType: 'community',
    sourceName: 'Bow River Pathway Watch',
    category: 'community',
    verifiedCount: 7,
    trendingRank: 7,
    viewsCount: 280,
    timeAgo: '5h ago',
    status: 'resolved',
    image: '/images/photo/calgary4.webp',
    coordinates: { lat: 51.0963, lng: -114.2185 },
    tags: ['Bowness Park', 'Pathway Cleared', '311 Logged', 'Bike Loop'],
    timeline: [
      { time: '06:15 AM', note: 'Wind hazard spotted across north loop', actor: 'Cyclist Report' },
      { time: '06:28 AM', note: 'Neighbours hauled trunk onto grass verge', actor: 'Community Effort' },
      { time: '07:05 AM', note: '311 ticket generated for municipal brush removal', actor: 'City 311' }
    ]
  },
  {
    id: 'story-ramsay-alley-toolshare',
    title: 'Ramsay Historic Laneway Tool Share & Brick Clean-Up Unites 40+ Residents',
    summary: 'Community members gathered on 8 St SE to share pressure washers, prune overgrown lilac hedges, and sweep historic red brick gutters.',
    fullReport: 'A spontaneous neighborhood pride initiative in Ramsay drew more than 40 homeowners and tenants onto the historic brick-paved laneway between 8 St and 9 St SE. Residents shared weed trimmers, pressure washers, and wheeled carts to clear overgrowth and preserve the heritage stone streetscape. A barbecue lunch followed with sourdough bread donated by local bakeries.',
    neighborhood: 'Ramsay',
    quadrant: 'SE',
    sourceType: 'community',
    sourceName: 'Ramsay Community Watch',
    category: 'community',
    verifiedCount: 24,
    trendingRank: 8,
    viewsCount: 670,
    timeAgo: '6h ago',
    status: 'active',
    image: '/images/illustration/calgarywatch-start-market-v1.webp',
    coordinates: { lat: 51.0345, lng: -114.0458 },
    tags: ['8 St SE', 'Historic Brick', 'Tool Share', 'Laneway Pride'],
    timeline: [
      { time: '09:00 AM', note: 'Tool share pop-up open in carriage house courtyard', actor: 'Ramsay Host' },
      { time: '11:30 AM', note: 'Over 200 metres of historic brick gutter cleared', actor: 'Resident Volunteers' },
      { time: '01:00 PM', note: 'Community lunch & seed exchange at local parklet', actor: 'Ramsay Community' }
    ]
  }
];
