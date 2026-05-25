import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

type PageSchemaType = 'WebPage' | 'AboutPage' | 'CollectionPage';

type SeoConfig = {
  title: string;
  description: string;
  index: boolean;
  pageType: PageSchemaType;
  dateModified?: string;
  image?: string;
};

const SITE_ORIGIN =
  typeof window !== 'undefined'
    ? window.location.origin + (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '')
    : 'https://calgarywatch.ca';

const DEFAULT_IMAGE = 'https://calgarywatch.ca/images/hero-wide.webp';
const LAST_MOD = '2026-05-24';

const ROUTE_SEO: Record<string, SeoConfig> = {
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

/** Breadcrumb entries per route for JSON-LD */
const ROUTE_BREADCRUMBS: Record<string, { name: string; item: string }[]> = {
  '/': [{ name: 'Home', item: 'https://calgarywatch.ca/' }],
  '/map': [
    { name: 'Home', item: 'https://calgarywatch.ca/' },
    { name: 'Live Map', item: 'https://calgarywatch.ca/map' },
  ],
  '/about': [
    { name: 'Home', item: 'https://calgarywatch.ca/' },
    { name: 'About', item: 'https://calgarywatch.ca/about' },
  ],
  '/coverage': [
    { name: 'Home', item: 'https://calgarywatch.ca/' },
    { name: 'Coverage Guide', item: 'https://calgarywatch.ca/coverage' },
  ],
};

const setMeta = (selector: string, attr: 'name' | 'property', value: string) => {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${selector}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, selector);
    document.head.appendChild(el);
  }
  el.setAttribute('content', value);
};

const setCanonical = (href: string) => {
  let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!link) {
    link = document.createElement('link');
    link.setAttribute('rel', 'canonical');
    document.head.appendChild(link);
  }
  link.setAttribute('href', href);
};

const injectJsonLd = (id: string, data: object) => {
  let el = document.head.querySelector<HTMLScriptElement>(`script[data-ld="${id}"]`);
  if (!el) {
    el = document.createElement('script');
    el.setAttribute('type', 'application/ld+json');
    el.setAttribute('data-ld', id);
    document.head.appendChild(el);
  }
  el.textContent = JSON.stringify(data);
};

export default function SeoManager() {
  const location = useLocation();

  useEffect(() => {
    const config = ROUTE_SEO[location.pathname] ?? ROUTE_SEO['/'];
    const pageUrl = `${SITE_ORIGIN}${location.pathname === '/' ? '/' : location.pathname}`;

    document.title = config.title;

    setMeta('description', 'name', config.description);
    setMeta('robots', 'name', config.index ? 'index, follow, max-image-preview:large' : 'noindex, nofollow');

    setMeta('og:title', 'property', config.title);
    setMeta('og:description', 'property', config.description);
    setMeta('og:url', 'property', pageUrl);
    if (config.image) setMeta('og:image', 'property', config.image);

    setMeta('twitter:title', 'name', config.title);
    setMeta('twitter:description', 'name', config.description);

    setCanonical(pageUrl);

    // Per-route WebPage JSON-LD — helps Google understand page type, breadcrumb, and freshness
    const crumbs = ROUTE_BREADCRUMBS[location.pathname] ?? ROUTE_BREADCRUMBS['/'];
    injectJsonLd('page-schema', {
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
        url: 'https://calgarywatch.ca/',
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
    });
  }, [location.pathname]);

  return null;
}
