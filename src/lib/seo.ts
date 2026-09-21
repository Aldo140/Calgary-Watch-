import { GUIDE_FAQS, GUIDE_PATH } from '@/src/content/neighbourhoodWatchGuide';
import { DISCOVERY_SECTIONS } from './discovery';
import { discoveryRepository } from '../data/discovery';
import { buildEntityJsonLd, indexableEntities } from './discoverySeo';
import {
  AIRDRIE_GUIDE_FAQS,
  AIRDRIE_GUIDE_PATH,
} from '@/src/content/airdrieCrimeMapGuide';

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
}

export const PRODUCTION_ORIGIN = 'https://calgarywatch.ca';
export const DEFAULT_IMAGE = 'https://calgarywatch.ca/images/hero/hero-wide.webp';
const LAST_MOD = '2026-08-13';
const SEO_REFRESH_MOD = '2026-08-29';

export const ROUTE_SEO: Record<string, SeoConfig> = {
  '/community': {
    title: 'Calgary Watch Community | See it. Share it. Calgary knows.',
    description: 'The original Calgary Watch homepage. Explore the community safety platform and open the live map for local reports, traffic, weather and outages.',
    index: true,
    pageType: 'WebPage',
    image: DEFAULT_IMAGE,
  },
  '/': {
    title: 'What’s happening in Calgary? | CalgaryWatch',
    description:
      'Discover Calgary events, markets, local places and neighbourhoods, alongside live community reports, traffic, weather and outages.',
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
    title: 'Calgary Area Safety Map Coverage | Calgary Watch',
    description:
      'See where Calgary Watch can accept or display community and public-source incident reports across Calgary, Airdrie, Cochrane, Okotoks and nearby communities.',
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
ROUTE_SEO['/search'] = { title: 'Search CalgaryWatch', description: 'Find events, markets, local places, guides and neighbourhoods.', index: false, pageType: 'CollectionPage' };
for (const route of ['/events/today', '/events/this-weekend', '/markets/this-weekend', '/local/food', '/local/shopping', '/local/services', '/local/arts']) {
  ROUTE_SEO[route] = { ...ROUTE_SEO['/' + route.split('/')[1]], title: `${route.endsWith('this-weekend') ? 'This weekend' : route.endsWith('today') ? 'Today' : route.split('/').at(-1)} in Calgary | CalgaryWatch` };
}

/** Breadcrumb entries per route for JSON-LD. */
export const ROUTE_BREADCRUMBS: Record<string, { name: string; item: string }[]> = {
  '/community': [{ name: 'Home', item: `${PRODUCTION_ORIGIN}/` }, { name: 'Original Calgary Watch homepage', item: `${PRODUCTION_ORIGIN}/community` }],
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
  '/privacy': [
    { name: 'Home', item: `${PRODUCTION_ORIGIN}/` },
    { name: 'Privacy Policy', item: `${PRODUCTION_ORIGIN}/privacy` },
  ],
};

/** Routes that get a prerendered HTML file. Excludes noindex routes like /admin. */
export const PRERENDER_ROUTES = Object.entries(ROUTE_SEO)
  .filter(([, config]) => config.index)
  .map(([route]) => route);

/**
 * Public utility pages also need correct first-response robots/canonical tags.
 * They are rendered as static files but deliberately excluded from the sitemap.
 */
export const PRERENDER_OUTPUT_ROUTES = [...PRERENDER_ROUTES, '/unsubscribe', ...Object.keys(ROUTE_SEO).filter(route => DISCOVERY_SECTIONS.some(s => route.startsWith(s.path)) || route === '/search')];

export function getSeoConfig(pathname: string): SeoConfig {
  const [section, slug] = pathname.split('/').filter(Boolean);
  const kind = DISCOVERY_SECTIONS.find(s => s.path === `/${section}`)?.kind;
  const entity = kind && slug ? discoveryRepository.find(kind, slug) : undefined;
  if (entity) return { title: `${entity.title} | CalgaryWatch`, description: entity.summary, index: indexableEntities([entity]).length > 0, pageType: 'WebPage', image: entity.image ? new URL(entity.image.src, PRODUCTION_ORIGIN).href : DEFAULT_IMAGE };
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
export function buildPageJsonLd(pathname: string, origin: string): object {
  const config = getSeoConfig(pathname);
  const pageUrl = pageUrlFor(pathname, origin);
  const crumbs = ROUTE_BREADCRUMBS[pathname] ?? ROUTE_BREADCRUMBS['/'];
  const [section, slug] = pathname.split('/').filter(Boolean);
  const kind = DISCOVERY_SECTIONS.find(s => s.path === `/${section}`)?.kind;
  const entity = kind && slug ? discoveryRepository.find(kind, slug) : undefined;

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
    ...(entity && indexableEntities([entity]).length ? { mainEntity: buildEntityJsonLd(entity, origin) } : {}),
    ...(pathname === GUIDE_PATH
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
