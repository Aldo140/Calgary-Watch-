import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

type SeoConfig = {
  title: string;
  description: string;
  index: boolean;
};

const BASE_TITLE = 'Calgary Watch';
const SITE_ORIGIN =
  typeof window !== 'undefined'
    ? window.location.origin + (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '')
    : 'https://aldo140.github.io/Calgary-Watch-';

const ROUTE_SEO: Record<string, SeoConfig> = {
  '/': {
    title: 'Calgary Watch | Real-Time Community Safety Map',
    description:
      'Track Calgary incidents in real time with community reports, live map awareness, and neighborhood intelligence.',
    index: true,
  },
  '/map': {
    title: 'Live Calgary Incident Map | Calgary Watch',
    description:
      'View and report live incidents across Calgary. Filter by category, inspect area context, and stay informed as events unfold.',
    index: true,
  },
  '/about': {
    title: 'About Calgary Watch | Community Safety Platform',
    description:
      'Learn how Calgary Watch combines community reporting and local context to improve real-time safety awareness.',
    index: true,
  },
  '/admin': {
    title: 'Admin Portal | Calgary Watch',
    description: 'Administrative dashboard for Calgary Watch operations and moderation.',
    index: false,
  },
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

export default function SeoManager() {
  const location = useLocation();

  useEffect(() => {
    const config = ROUTE_SEO[location.pathname] ?? ROUTE_SEO['/'];
    document.title = config.title;

    setMeta('description', 'name', config.description);
    setMeta('robots', 'name', config.index ? 'index, follow, max-image-preview:large' : 'noindex, nofollow');

    setMeta('og:title', 'property', config.title);
    setMeta('og:description', 'property', config.description);
    setMeta('og:url', 'property', `${SITE_ORIGIN}${location.pathname === '/' ? '/' : location.pathname}`);

    setMeta('twitter:title', 'name', config.title);
    setMeta('twitter:description', 'name', config.description);

    setCanonical(`${SITE_ORIGIN}${location.pathname === '/' ? '/' : location.pathname}`);
  }, [location.pathname]);

  return null;
}
