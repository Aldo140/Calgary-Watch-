import inventory from '../generated/discovery-index.json';
import type { MarketOccurrence } from '../types/discovery';
import type { DiscoveryEntity, EntityBase } from '../types/discovery';
import { createDiscoveryRepository } from '../lib/discovery';

const base: Omit<EntityBase, 'kind' | 'id' | 'title' | 'slug'> = {
  summary: 'A little inspiration for your next day out.', description: 'An illustrative preview of the CalgaryWatch discovery experience. Confirm details with an organizer before making plans.',
  categories: [], tags: [], sources: [{ name: 'CalgaryWatch design fixture', url: 'https://calgarywatch.ca', kind: 'fixture' }],
  status: 'published', verification: 'unverified', updatedAt: '2026-09-21', developmentOnly: true,
};
/** Deliberately never returned by the production repository. These are not real listings. */
export const discoveryFixtures: DiscoveryEntity[] = [
  { ...base, kind: 'event', id: 'event-walk', slug: 'a-riverwalk-afternoon', title: 'A riverwalk kind of afternoon', summary: 'Take the long way home. A walk, a coffee, a little city discovery.', categories: ['outdoors'], tags: ['date night'], start: '2026-09-26T13:00:00-06:00', end: '2026-09-26T16:00:00-06:00', timezone: 'America/Edmonton', pricing: 'free', organizer: 'Sample organizer', address: 'Calgary', neighbourhood: 'Downtown', image: { src: '/images/photo/calgary4.webp', alt: 'The Peace Bridge over the Bow River' } },
  { ...base, kind: 'event', id: 'event-city', slug: 'city-after-hours', title: 'Make an evening of it', summary: 'Good company. A new corner of the city. No big itinerary required.', categories: ['arts'], tags: ['date night'], start: '2026-09-26T18:00:00-06:00', end: '2026-09-26T21:00:00-06:00', timezone: 'America/Edmonton', pricing: 'unknown', organizer: 'Sample organizer', address: 'Calgary', image: { src: '/images/photo/calgary1.webp', alt: 'Calgary at sunset' } },
  { ...base, kind: 'market', id: 'market-preview', slug: 'neighbourhood-market-preview', title: 'Meet you at the market', summary: 'Room for growers, makers and a Saturday morning well spent.', categories: ['markets'], tags: ['food', 'shopping'], address: 'Calgary', organizer: 'Sample organizer', amenities: ['Local vendors'], vendorIds: [], images: [], image: { src: '/images/photo/calgary5.webp', alt: 'Friends making plans together in the city' } },
  { ...base, kind: 'business', id: 'business-preview', slug: 'your-next-local-stop', name: 'Your next local stop', title: 'Your next local stop', summary: 'The independent places that make a neighbourhood feel like itself.', categories: ['food'], tags: ['coffee'], address: 'Calgary', images: [], socials: {}, services: [], claimed: false, partner: false, editorialSelection: false, image: { src: '/images/photo/calgary5.webp', alt: 'Friends outside in Calgary' } },
  { ...base, kind: 'guide', id: 'guide-preview', slug: 'a-day-by-the-bow', title: 'A day by the Bow', summary: 'Slow down. Follow the river. See where the afternoon takes you.', categories: ['outdoors'], tags: ['date night'], introduction: 'A preview of entity-based Calgary guides.', methodology: 'Development sample; editorial review and source verification are required before publication.', entries: [{ entityId: 'event-walk', note: 'Start with a walk.' }], relatedGuideIds: [] },
  { ...base, kind: 'neighbourhood', id: 'neighbourhood-preview', slug: 'downtown-preview', title: 'Downtown', summary: 'Find a different rhythm in the heart of the city.', categories: ['neighbourhoods'], tags: ['downtown'], quadrant: 'Centre', entityIds: ['event-walk'], image: { src: '/images/photo/calgary1.webp', alt: 'Downtown Calgary skyline' } },
];
// Local dev has no Firestore export to read from, so discovery-index.json ships empty
// (see scripts/discovery/export.ts, which only runs with real credentials in CI). Fall
// back to the illustrative fixtures so `npm run dev` isn't blank. import.meta.env.DEV is
// statically false for `vite build`, so this can never ship in a production bundle; the
// optional chain also covers plain-Node execution (tests, the prerender/SEO scripts),
// where import.meta.env doesn't exist at all outside Vite.
const isDevServer = Boolean(import.meta.env?.DEV);
const entities = isDevServer
  ? [...(inventory.entities as DiscoveryEntity[]), ...discoveryFixtures]
  : (inventory.entities as DiscoveryEntity[]);
export const discoveryRepository = createDiscoveryRepository(entities, inventory.occurrences as MarketOccurrence[], isDevServer);
