import { GUIDE_FAQS, GUIDE_PATH } from '@/src/content/neighbourhoodWatchGuide';
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

export const ROUTE_SEO: Record<string, SeoConfig> = {
  '/': {
    title: 'Calgary Crime Watch & Neighbourhood Safety Map',
    description:
      'See it. Share it. Calgary knows. Live Calgary crime, traffic, weather and community reports on one free neighbourhood map. Sign in to report.',
    index: true,
    pageType: 'WebPage',
    dateModified: LAST_MOD,
    image: DEFAULT_IMAGE,
  },
  '/map': {
    title: 'Calgary Crime Map: Live Incidents Near You | Calgary Watch',
    description:
      'See it. Share it. Calgary knows. Community-reported crime, traffic, weather and emergency incidents across Calgary and Airdrie, on one live map.',
    index: true,
    pageType: 'WebPage',
    dateModified: LAST_MOD,
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
    title: 'Calgary Neighbourhood Watch Guide | Crime Map & Reporting',
    description:
      'Check recent incidents near you, understand Calgary crime-map sources, learn how Block Watch differs, and choose 911 or police non-emergency when needed.',
    index: true,
    pageType: 'WebPage',
    dateModified: LAST_MOD,
    image: DEFAULT_IMAGE,
  },
  '/airdrie-crime-map': {
    title: 'Airdrie Crime Map: Community Reports & Official Sources',
    description:
      'View recent Airdrie-area community reports, compare the official City of Airdrie crime map, and find the correct RCMP emergency and non-emergency contacts.',
    index: true,
    pageType: 'WebPage',
    dateModified: LAST_MOD,
    image: DEFAULT_IMAGE,
  },
  '/admin': {
    title: 'Admin Portal | Calgary Watch',
    description: 'Administrative dashboard for Calgary Watch operations and moderation.',
    index: false,
    pageType: 'WebPage',
  },
};

/** Breadcrumb entries per route for JSON-LD. */
export const ROUTE_BREADCRUMBS: Record<string, { name: string; item: string }[]> = {
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
    { name: 'Calgary Neighbourhood Watch Guide', item: `${PRODUCTION_ORIGIN}/calgary-neighbourhood-watch` },
  ],
  '/airdrie-crime-map': [
    { name: 'Home', item: `${PRODUCTION_ORIGIN}/` },
    { name: 'Airdrie Crime Map Guide', item: `${PRODUCTION_ORIGIN}/airdrie-crime-map` },
  ],
};

/** Routes that get a prerendered HTML file. Excludes noindex routes like /admin. */
export const PRERENDER_ROUTES = Object.entries(ROUTE_SEO)
  .filter(([, config]) => config.index)
  .map(([route]) => route);

export function getSeoConfig(pathname: string): SeoConfig {
  return ROUTE_SEO[pathname] ?? ROUTE_SEO['/'];
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
