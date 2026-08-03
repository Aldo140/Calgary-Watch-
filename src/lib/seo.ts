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
export const DEFAULT_IMAGE = 'https://calgarywatch.ca/images/hero-wide.webp';
const LAST_MOD = '2026-05-24';

export const ROUTE_SEO: Record<string, SeoConfig> = {
  '/': {
    title: 'Calgary Watch | Real-Time Crime Map & Community Safety — Calgary, Airdrie, Cochrane, Okotoks',
    description:
      'Calgary Watch is a free real-time crime map and community safety platform for Calgary and surrounding communities — Airdrie, Cochrane, Okotoks, Chestermere, Strathmore, High River, and more. See live incident reports, crime alerts, and neighborhood safety data before the news does.',
    index: true,
    pageType: 'WebPage',
    dateModified: LAST_MOD,
    image: DEFAULT_IMAGE,
  },
  '/map': {
    title: 'Live Calgary Crime & Incident Map | Calgary Watch',
    description:
      'View and report live crime incidents across Calgary, Airdrie, Cochrane, Okotoks, and surrounding Alberta communities. Filter by crime category, inspect neighbourhood context, and stay informed as events unfold in real time.',
    index: true,
    pageType: 'WebPage',
    dateModified: LAST_MOD,
    image: DEFAULT_IMAGE,
  },
  '/about': {
    title: 'About Calgary Watch | Free Community Crime & Safety Platform for Calgary Area',
    description:
      'Learn how Calgary Watch combines community reporting and open data to deliver real-time crime maps and safety awareness for Calgary, Airdrie, Cochrane, Okotoks, Chestermere, Strathmore, High River, and all surrounding communities.',
    index: true,
    pageType: 'AboutPage',
    dateModified: LAST_MOD,
    image: DEFAULT_IMAGE,
  },
  '/coverage': {
    title: 'Calgary Area Safety Guide | Coverage Map & Community Directory | Calgary Watch',
    description:
      'Explore Calgary Watch coverage across 30+ communities — Calgary, Airdrie, Cochrane, Okotoks, Chestermere, Strathmore, High River, Canmore, and more. Your complete guide to community safety resources across the Calgary metro region.',
    index: true,
    pageType: 'CollectionPage',
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

export const ROBOTS_INDEX = 'index, follow, max-image-preview:large';
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
  };
}
