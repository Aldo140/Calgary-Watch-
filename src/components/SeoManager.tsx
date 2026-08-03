import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import {
  ROBOTS_INDEX,
  ROBOTS_NOINDEX,
  buildPageJsonLd,
  getSeoConfig,
  pageUrlFor,
} from '@/src/lib/seo';

/**
 * Keeps the live document's SEO tags in sync as the user navigates.
 *
 * The same values are baked into static HTML at build time by
 * scripts/prerender.ts — both read src/lib/seo.ts — so crawlers that never run
 * JavaScript still get correct metadata. This component handles the SPA
 * navigations that happen after the initial HTML load.
 */

const SITE_ORIGIN =
  typeof window !== 'undefined'
    ? window.location.origin + (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '')
    : 'https://calgarywatch.ca';

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
    const config = getSeoConfig(location.pathname);
    const pageUrl = pageUrlFor(location.pathname, SITE_ORIGIN);

    document.title = config.title;

    setMeta('description', 'name', config.description);
    setMeta('robots', 'name', config.index ? ROBOTS_INDEX : ROBOTS_NOINDEX);

    setMeta('og:title', 'property', config.title);
    setMeta('og:description', 'property', config.description);
    setMeta('og:url', 'property', pageUrl);
    if (config.image) setMeta('og:image', 'property', config.image);

    setMeta('twitter:title', 'name', config.title);
    setMeta('twitter:description', 'name', config.description);

    setCanonical(pageUrl);

    // Per-route WebPage JSON-LD — helps Google understand page type, breadcrumb, and freshness
    injectJsonLd('page-schema', buildPageJsonLd(location.pathname, SITE_ORIGIN));
  }, [location.pathname]);

  return null;
}
