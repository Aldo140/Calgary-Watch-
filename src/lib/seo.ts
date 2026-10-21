import { INDEXED_DISCOVERY_KINDS, discoveryIndexingEnabled } from './discoveryPublication';
import { GUIDE_FAQS, GUIDE_PATH } from '@/src/content/neighbourhoodWatchGuide';
import { COMMUNITY_FAQS, COMMUNITY_PATH } from '@/src/content/communityWatch';
import { DISCOVERY_SECTIONS, type DiscoveryRepository } from './discovery';
import { discoveryRepository } from '../data/discovery';
import { buildEntityJsonLd, indexableEntities, lastChecked } from './discoverySeo';
import { listingBreadcrumbs, listingDescription, listingTitle } from './listingSeo';
import {
  AIRDRIE_GUIDE_FAQS,
  AIRDRIE_GUIDE_PATH,
} from '@/src/content/airdrieCrimeMapGuide';
import { BEST_CATEGORIES } from '@/src/content/bestOf';
import { BEST_PATH, bestCategory, bestIndexJsonLd, bestItemListJsonLd, bestPath } from './bestOf';
import { DEFAULT_SHARE_ALT, DEFAULT_SHARE_IMAGE, SHARE_CARD, shareCardFor } from './shareImage';
import { SAFETY_PATH, SAFETY_TOPICS, SAFETY_UPDATED } from '@/src/content/safetyTopics';
import { safetyJsonLd, safetyPath } from './safety';

/**
 * Single source of truth for per-route SEO.
 *
 * Consumed by two places that must never disagree:
 *  - src/components/SeoManager.tsx — updates the live document on navigation
 *  - scripts/prerender.ts          — bakes the same tags into static HTML at
 *                                    build time, so crawlers that do not run
 *                                    JavaScript (Bing, and every social
 *                                    scraper) see the right metadata
 *
 * If these two ever drift, shared links start showing the wrong title. Keeping
 * the config and the JSON-LD builder here means they cannot.
 */

export type PageSchemaType = 'WebPage' | 'AboutPage' | 'CollectionPage';

export interface SeoConfig {
  title: string;
  description: string;
  index: boolean;
  pageType: PageSchemaType;
  dateModified?: string;
  image?: string;
  /** Link-preview image details; set together with `image` when its size is known. */
  imageAlt?: string;
  imageWidth?: number;
  imageHeight?: number;
}

export const PRODUCTION_ORIGIN = 'https://calgarywatch.ca';
export const DEFAULT_IMAGE = DEFAULT_SHARE_IMAGE;
const LAST_MOD = '2026-08-13';
const SEO_REFRESH_MOD = '2026-08-29';

export const ROUTE_SEO: Record<string, SeoConfig> = {
  '/community': {
    title: 'Calgary Crime Watch: Live Community Safety Map | CalgaryWatch',
    description: 'Calgary’s community watch map: crime and safety reports from neighbours, Calgary Police news releases, City of Calgary data and alerts, pinned where they happened. Free.',
    index: true,
    pageType: 'WebPage',
    image: DEFAULT_IMAGE,
  },
  '/': {
    title: 'Calgary Crime Watch, Live Safety Map & Events | CalgaryWatch',
    description:
      'What’s happening in Calgary: a live Calgary crime map from neighbours and official sources, plus events, markets and local places. Free, Calgary only.',
    index: true,
    pageType: 'WebPage',
    dateModified: LAST_MOD,
    image: DEFAULT_IMAGE,
  },
  '/map': {
    title: 'Calgary Crime Map: Recent Reports Near You | Calgary Watch',
    description:
      'Check recent Calgary crime, traffic, weather, infrastructure and emergency reports near you. Every map marker includes its time and source.',
    index: true,
    pageType: 'WebPage',
    dateModified: SEO_REFRESH_MOD,
    image: DEFAULT_IMAGE,
  },
  '/about': {
    title: 'About Calgary Watch | Community Crime & Safety Map',
    description:
      'Learn how Calgary Watch combines community reports and public data into one map for Calgary-area neighbours. See it. Share it. Calgary knows.',
    index: true,
    pageType: 'AboutPage',
    dateModified: LAST_MOD,
    image: DEFAULT_IMAGE,
  },
  '/coverage': {
    title: 'Calgary Safety Map Sources | Calgary Watch',
    description:
      'Every source behind the Calgary Watch safety map: neighbour reports, Calgary Police news releases, City of Calgary 311 and traffic, weather and emergency alerts, and power outages, with how often each updates.',
    index: true,
    pageType: 'CollectionPage',
    dateModified: LAST_MOD,
    image: DEFAULT_IMAGE,
  },
  '/calgary-neighbourhood-watch': {
    title: 'Calgary Crime Map & Neighbourhood Watch Guide',
    description:
      'Check recent Calgary reports near you, understand crime-map sources, learn how Block Watch differs, and choose the right official reporting channel.',
    index: true,
    pageType: 'WebPage',
    dateModified: SEO_REFRESH_MOD,
    image: DEFAULT_IMAGE,
  },
  '/airdrie-crime-map': {
    title: 'Airdrie Crime Map: Recent Reports & Official RCMP Map',
    description:
      'Check recent Airdrie-area community reports and compare the City of Airdrie’s official map for crime reported to RCMP. Includes reporting contacts.',
    index: true,
    pageType: 'WebPage',
    dateModified: SEO_REFRESH_MOD,
    image: DEFAULT_IMAGE,
  },
  '/check-your-community': {
    title: 'Where Does Your Calgary Community Rank? | CalgaryWatch',
    description:
      'Type your Calgary community, guess where it ranks for 311 reports, then see the answer, the trend and how it stacks up against your neighbours.',
    index: true,
    pageType: 'WebPage',
    dateModified: '2026-10-08',
    image: DEFAULT_IMAGE,
  },
  '/admin': {
    title: 'Admin Portal | Calgary Watch',
    description: 'Administrative dashboard for Calgary Watch operations and moderation.',
    index: false,
    pageType: 'WebPage',
  },
  '/admin/users': {
    title: 'User Directory | Calgary Watch Admin',
    description: 'Administrative user directory for Calgary Watch.',
    index: false,
    pageType: 'WebPage',
  },
  '/admin/incidents': {
    title: 'Report Directory | Calgary Watch Admin',
    description: 'Administrative report directory for Calgary Watch.',
    index: false,
    pageType: 'WebPage',
  },
  '/privacy': {
    title: 'Privacy Policy | Calgary Watch',
    description:
      'Learn what Calgary Watch collects, why it is needed, how long it is retained, and how to exercise your privacy choices.',
    index: true,
    pageType: 'WebPage',
    dateModified: SEO_REFRESH_MOD,
    image: DEFAULT_IMAGE,
  },
  '/date-night': {
    title: 'Date Night in Calgary: Shows, Festivals & Ideas for Two | CalgaryWatch',
    description:
      'Date night ideas in Calgary, checked with the organizers: theatre, concerts, festival nights and a Christmas market evening, plus what’s on this week and free ideas. Picks are never paid for.',
    index: true,
    pageType: 'WebPage',
    dateModified: '2026-09-28',
    image: DEFAULT_IMAGE,
  },
  '/partners': {
    title: 'How CalgaryWatch Works With Local Businesses | Calgary Watch',
    description:
      'Free, source-checked listings for Calgary businesses, picks that are never sold, how Featured partner placements will be labelled, and why we may have emailed you.',
    index: true,
    pageType: 'WebPage',
    dateModified: SEO_REFRESH_MOD,
    image: DEFAULT_IMAGE,
  },
  '/plans': {
    title: 'Your Calgary plans | CalgaryWatch',
    description: 'Pick what you’re into, say “I’m going” to Calgary events, collect badges and get Thursday event picks near home.',
    index: false,
    pageType: 'WebPage',
  },
  '/unsubscribe': {
    title: 'Email Preferences | Calgary Watch',
    description: 'Update Calgary Watch email preferences securely.',
    index: false,
    pageType: 'WebPage',
  },
};

// Inventory shells stay noindex until they contain verified, useful content.
for (const section of DISCOVERY_SECTIONS) {
  ROUTE_SEO[section.path] = { title: `${section.label} in Calgary | CalgaryWatch`, description: `Explore Calgary ${section.label.toLowerCase()}. Our first verified collection is being prepared.`, index: false, pageType: 'CollectionPage', image: DEFAULT_IMAGE };
}
// The hubs with real, source-checked content are indexed (owner decision 2026-09-28; /local joined
// 2026-10-21 once it had 42 sourced profiles). Single listings follow discoveryIndexingEnabled.
const HUBS: Record<string, { title: string; description: string }> = {
  '/events': { title: 'Events in Calgary This Week | CalgaryWatch', description: 'What’s on in Calgary: theatre, concerts, talks, festivals and family events, each checked against the organizer’s own listing. Updated every day.' },
  '/markets': { title: 'Calgary Farmers’ Markets & Makers’ Markets | CalgaryWatch', description: 'Calgary farmers’ and makers’ markets with their next real dates and hours, from Crossroads and Calgary Farmers’ Market to seasonal Christmas markets.' },
  '/guides': { title: 'Calgary Guides: Walks, Markets & Neighbourhoods | CalgaryWatch', description: 'Self-guided days out in Calgary: the Bow River walk, a free day downtown, the city’s farmers’ markets, and Inglewood and Ramsay on foot.' },
  '/local': { title: 'Local Calgary Places, Venues & Organizers | CalgaryWatch', description: 'Calgary theatres, markets, cafés, community associations and the organizers behind local events, each with its address, official links and what’s coming up.' },
  '/neighbourhoods': { title: 'Calgary Neighbourhood Guides | CalgaryWatch', description: 'Guides to Calgary neighbourhoods like Inglewood, Kensington, the Beltline, Bridgeland and Marda Loop: what’s there and what’s on.' },
};
for (const [path, hub] of Object.entries(HUBS)) ROUTE_SEO[path] = { ...ROUTE_SEO[path], ...hub, index: true };
// Best of Calgary (experiment, 2026-10-21): every fact is cited, so the lists are indexed.
ROUTE_SEO[BEST_PATH] = {
  title: 'Best of Calgary: Pho, Pizza & Trusted Local Services | CalgaryWatch',
  description: 'Calgary’s best pho and pizza, ranked only by how many independent guides and awards name them, plus local window cleaners and junk haulers compared. Every fact cited, nothing paid for.',
  index: true,
  pageType: 'CollectionPage',
  dateModified: '2026-10-21',
  image: DEFAULT_IMAGE,
};
for (const c of BEST_CATEGORIES) {
  ROUTE_SEO[bestPath(c)] = { title: c.seoTitle, description: c.seoDescription, index: true, pageType: 'CollectionPage', dateModified: c.updated, image: DEFAULT_IMAGE };
}
// Calgary safety news (experiment, 2026-10-21): one page per crime people search for.
ROUTE_SEO[SAFETY_PATH] = {
  title: 'Calgary Crime News Today: Police & Safety Headlines | CalgaryWatch',
  description: 'Recent Calgary crime and safety headlines from CTV, CBC, Global, CityNews, LiveWire and Calgary Police, sorted by topic, with who to call and what neighbours can do.',
  index: true,
  pageType: 'CollectionPage',
  dateModified: SAFETY_UPDATED,
  image: DEFAULT_IMAGE,
};
for (const t of SAFETY_TOPICS) {
  ROUTE_SEO[safetyPath(t)] = { title: t.seoTitle, description: t.seoDescription, index: true, pageType: 'CollectionPage', dateModified: SAFETY_UPDATED, image: DEFAULT_IMAGE };
}
ROUTE_SEO['/search'] = { title: 'Search CalgaryWatch', description: 'Search a Calgary neighbourhood or street for recent reports, or find events, markets and local places.', index: false, pageType: 'CollectionPage' };
for (const route of ['/events/today', '/events/this-weekend', '/markets/this-weekend', '/local/food', '/local/shopping', '/local/services', '/local/arts']) {
  ROUTE_SEO[route] = { ...ROUTE_SEO['/' + route.split('/')[1]], index: false, title: `${route.endsWith('this-weekend') ? 'This weekend' : route.endsWith('today') ? 'Today' : route.split('/').at(-1)} in Calgary | CalgaryWatch` };
}

/** Breadcrumb entries per route for JSON-LD. */
export const ROUTE_BREADCRUMBS: Record<string, { name: string; item: string }[]> = {
  '/community': [{ name: 'Home', item: `${PRODUCTION_ORIGIN}/` }, { name: 'Calgary Crime Watch', item: `${PRODUCTION_ORIGIN}/community` }],
  '/': [{ name: 'Home', item: `${PRODUCTION_ORIGIN}/` }],
  '/map': [
    { name: 'Home', item: `${PRODUCTION_ORIGIN}/` },
    { name: 'Live Map', item: `${PRODUCTION_ORIGIN}/map` },
  ],
  '/about': [
    { name: 'Home', item: `${PRODUCTION_ORIGIN}/` },
    { name: 'About', item: `${PRODUCTION_ORIGIN}/about` },
  ],
  '/coverage': [
    { name: 'Home', item: `${PRODUCTION_ORIGIN}/` },
    { name: 'Coverage Guide', item: `${PRODUCTION_ORIGIN}/coverage` },
  ],
  '/calgary-neighbourhood-watch': [
    { name: 'Home', item: `${PRODUCTION_ORIGIN}/` },
    { name: 'Calgary Crime Map & Neighbourhood Watch Guide', item: `${PRODUCTION_ORIGIN}/calgary-neighbourhood-watch` },
  ],
  '/airdrie-crime-map': [
    { name: 'Home', item: `${PRODUCTION_ORIGIN}/` },
    { name: 'Airdrie Crime Map Guide', item: `${PRODUCTION_ORIGIN}/airdrie-crime-map` },
  ],
  '/check-your-community': [
    { name: 'Home', item: `${PRODUCTION_ORIGIN}/` },
    { name: 'Check Your Community', item: `${PRODUCTION_ORIGIN}/check-your-community` },
  ],
  '/privacy': [
    { name: 'Home', item: `${PRODUCTION_ORIGIN}/` },
    { name: 'Privacy Policy', item: `${PRODUCTION_ORIGIN}/privacy` },
  ],
  '/partners': [
    { name: 'Home', item: `${PRODUCTION_ORIGIN}/` },
    { name: 'For local businesses', item: `${PRODUCTION_ORIGIN}/partners` },
  ],
};

ROUTE_BREADCRUMBS[SAFETY_PATH] = [{ name: 'Home', item: `${PRODUCTION_ORIGIN}/` }, { name: 'Calgary safety news', item: `${PRODUCTION_ORIGIN}${SAFETY_PATH}` }];
for (const t of SAFETY_TOPICS) {
  ROUTE_BREADCRUMBS[safetyPath(t)] = [...ROUTE_BREADCRUMBS[SAFETY_PATH], { name: t.label, item: `${PRODUCTION_ORIGIN}${safetyPath(t)}` }];
}

ROUTE_BREADCRUMBS[BEST_PATH] = [{ name: 'Home', item: `${PRODUCTION_ORIGIN}/` }, { name: 'Best of Calgary', item: `${PRODUCTION_ORIGIN}${BEST_PATH}` }];
for (const c of BEST_CATEGORIES) {
  ROUTE_BREADCRUMBS[bestPath(c)] = [...ROUTE_BREADCRUMBS[BEST_PATH], { name: c.label, item: `${PRODUCTION_ORIGIN}${bestPath(c)}` }];
}

/** Routes that get a prerendered HTML file. Excludes noindex routes like /admin. */
export const PRERENDER_ROUTES = Object.entries(ROUTE_SEO)
  .filter(([, config]) => config.index)
  .map(([route]) => route);

/**
 * Public utility pages also need correct first-response robots/canonical tags.
 * They are rendered as static files but deliberately excluded from the sitemap.
 */
export const PRERENDER_OUTPUT_ROUTES = [...PRERENDER_ROUTES, '/unsubscribe', '/plans', ...Object.keys(ROUTE_SEO).filter(route => DISCOVERY_SECTIONS.some(s => route.startsWith(s.path)) || route === '/search')];

/**
 * The SEO config for a route, with its link-preview card: listings, hubs and
 * Best of Calgary lists get their own generated card (src/lib/shareImage.ts),
 * everything else the site picture, both with size and alt text.
 */
export function getSeoConfig(pathname: string, repository: DiscoveryRepository = discoveryRepository): SeoConfig {
  const config = routeSeoConfig(pathname, repository);
  const card = shareCardFor(pathname, repository);
  if (card) return { ...config, image: `${PRODUCTION_ORIGIN}${card.path}`, imageAlt: card.alt, imageWidth: SHARE_CARD.width, imageHeight: SHARE_CARD.height };
  if (config.image === DEFAULT_IMAGE) return { ...config, imageAlt: DEFAULT_SHARE_ALT, imageWidth: SHARE_CARD.width, imageHeight: SHARE_CARD.height };
  return config;
}

function routeSeoConfig(pathname: string, repository: DiscoveryRepository): SeoConfig {
  if(pathname.startsWith('/organization/'))return {title:'Manage your organization | CalgaryWatch',description:'Your verified organization profile and events workspace.',index:false,pageType:'WebPage'};
  const claimMatch = pathname.match(/^\/claim\/([^/]+)$/);
  let claimId: string | undefined;
  try { claimId = claimMatch ? decodeURIComponent(claimMatch[1]) : undefined; } catch { /* Malformed route remains noindex below. */ }
  const claimEntity = claimId
    ? repository.list().find(entity => entity.id === claimId && ['event', 'market', 'business'].includes(entity.kind))
    : undefined;
  if (claimEntity) return {
    title: `Claim ${claimEntity.title} | CalgaryWatch`,
    description: `Verify that you represent ${claimEntity.title} to request updates to its CalgaryWatch dates, photos and links.`,
    index: false,
    pageType: 'WebPage',
    image: claimEntity.image ? new URL(claimEntity.image.src, PRODUCTION_ORIGIN).href : DEFAULT_IMAGE,
  };
  const [section, slug] = pathname.split('/').filter(Boolean);
  const kind = DISCOVERY_SECTIONS.find(s => s.path === `/${section}`)?.kind;
  const entity = kind && slug ? repository.find(kind, slug) : undefined;
  if (entity) return { title: listingTitle(entity, repository.list()), description: listingDescription(entity, repository.occurrences(), repository.list()), ...(lastChecked(entity) ? { dateModified: lastChecked(entity) } : {}), index: discoveryIndexingEnabled && INDEXED_DISCOVERY_KINDS.has(entity.kind) && indexableEntities([entity]).length > 0, pageType: 'WebPage', image: entity.image ? new URL(entity.image.src, PRODUCTION_ORIGIN).href : DEFAULT_IMAGE };
  return ROUTE_SEO[pathname] ?? { title: 'Listing unavailable | CalgaryWatch', description: 'This listing has not been published or could not be found.', index: false, pageType: 'WebPage' };
}

/** Absolute URL for a route, given the origin the page is being served from. */
export function pageUrlFor(pathname: string, origin: string): string {
  return `${origin}${pathname === '/' ? '/' : pathname}`;
}

export const ROBOTS_INDEX = 'index, follow, max-image-preview:large, max-snippet:-1';
export const ROBOTS_NOINDEX = 'noindex, nofollow';

/**
 * WebPage JSON-LD for a route. Shared so the prerendered markup and the
 * client-injected script are byte-identical.
 */
export function buildPageJsonLd(pathname: string, origin: string, repository: DiscoveryRepository = discoveryRepository): object {
  const config = getSeoConfig(pathname, repository);
  const pageUrl = pageUrlFor(pathname, origin);
  const [section, slug] = pathname.split('/').filter(Boolean);
  const hub = DISCOVERY_SECTIONS.find(s => s.path === `/${section}`);
  const kind = hub?.kind;
  const entity = kind && slug ? repository.find(kind, slug) : undefined;
  const best = section === BEST_PATH.slice(1) ? (slug ? bestCategory(slug) : undefined) : undefined;
  const bestList = best ? bestItemListJsonLd(best, origin) : pathname === BEST_PATH ? bestIndexJsonLd(origin) : undefined;
  const safety = safetyJsonLd(pathname);
  const crumbs = ROUTE_BREADCRUMBS[pathname]
    ?? (entity ? listingBreadcrumbs(entity).map(c => ({ name: c.name, item: `${PRODUCTION_ORIGIN}${c.path}` }))
      : hub && !slug ? [ROUTE_BREADCRUMBS['/'][0], { name: hub.label, item: `${PRODUCTION_ORIGIN}${hub.path}` }]
      : ROUTE_BREADCRUMBS['/']);

  return {
    '@context': 'https://schema.org',
    '@type': config.pageType,
    name: config.title,
    description: config.description,
    url: pageUrl,
    inLanguage: 'en-CA',
    ...(config.dateModified ? { dateModified: config.dateModified } : {}),
    ...(config.image ? { image: config.image } : {}),
    isPartOf: {
      '@type': 'WebSite',
      name: 'Calgary Watch',
      url: `${PRODUCTION_ORIGIN}/`,
    },
    breadcrumb: {
      '@type': 'BreadcrumbList',
      itemListElement: crumbs.map((c, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: c.name,
        item: c.item,
      })),
    },
    ...(entity && indexableEntities([entity]).length ? { mainEntity: buildEntityJsonLd(entity, origin, repository.occurrences(), repository.list()) } : {}),
    ...(bestList ? { mainEntity: bestList } : {}),
    ...(safety ?? {}),
    ...(pathname === COMMUNITY_PATH
      ? {
          about: ['Calgary crime map', 'Calgary crime watch', 'Community watch', 'Calgary public safety map'],
          mainEntity: COMMUNITY_FAQS.map((faq) => ({
            '@type': 'Question',
            name: faq.question,
            acceptedAnswer: { '@type': 'Answer', text: faq.answer },
          })),
        }
      : pathname === GUIDE_PATH
      ? {
          about: [
            'Calgary neighbourhood watch',
            'Calgary crime map',
            'Block Watch Calgary',
            'Calgary police non-emergency reporting',
          ],
          mainEntity: GUIDE_FAQS.map((faq) => ({
            '@type': 'Question',
            name: faq.question,
            acceptedAnswer: {
              '@type': 'Answer',
              text: faq.answer,
            },
          })),
        }
      : pathname === AIRDRIE_GUIDE_PATH
        ? {
            about: [
              'Airdrie crime map',
              'Airdrie community reports',
              'Airdrie RCMP reporting',
              'Airdrie police non-emergency contact',
            ],
            mainEntity: AIRDRIE_GUIDE_FAQS.map((faq) => ({
              '@type': 'Question',
              name: faq.question,
              acceptedAnswer: {
                '@type': 'Answer',
                text: faq.answer,
              },
            })),
          }
      : {}),
  };
}
