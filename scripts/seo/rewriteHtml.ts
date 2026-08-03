/**
 * Pure HTML tag-rewriting used by the prerender step.
 *
 * Kept separate from the file I/O in prerender.ts so the interesting logic is
 * unit-testable without touching the filesystem or running a build.
 */

import {
  ROBOTS_INDEX,
  ROBOTS_NOINDEX,
  buildPageJsonLd,
  getSeoConfig,
  pageUrlFor,
} from '../../src/lib/seo.js';

/** Escape a string for safe use inside a double-quoted HTML attribute. */
export function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Escape text placed inside <title>. */
export function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Prevent a JSON-LD payload from terminating its own <script> block.
 * `</script>` inside JSON would end the element early and break the page.
 */
export function escapeJsonLd(json: string): string {
  return json.replace(/</g, '\\u003c');
}

/**
 * Replace the content of an existing meta tag, or append one before </head>.
 *
 * `[^>]*` spans newlines, so this handles the multi-line meta tags already in
 * index.html (where name and content sit on separate lines).
 */
export function upsertMeta(
  html: string,
  attr: 'name' | 'property',
  key: string,
  content: string,
): string {
  const tag = `<meta ${attr}="${key}" content="${escapeAttr(content)}" />`;
  const existing = new RegExp(`<meta[^>]*${attr}=["']${key}["'][^>]*>`, 'i');

  if (existing.test(html)) return html.replace(existing, tag);
  return html.replace('</head>', `    ${tag}\n  </head>`);
}

/** Replace <link rel="canonical">, or append one. */
export function upsertCanonical(html: string, href: string): string {
  const tag = `<link rel="canonical" href="${escapeAttr(href)}" />`;
  const existing = /<link[^>]*rel=["']canonical["'][^>]*>/i;

  if (existing.test(html)) return html.replace(existing, tag);
  return html.replace('</head>', `    ${tag}\n  </head>`);
}

/** Replace the <title> element's text. */
export function upsertTitle(html: string, title: string): string {
  const tag = `<title>${escapeText(title)}</title>`;
  if (/<title>[\s\S]*?<\/title>/i.test(html)) {
    return html.replace(/<title>[\s\S]*?<\/title>/i, tag);
  }
  return html.replace('</head>', `    ${tag}\n  </head>`);
}

/**
 * Replace the per-page JSON-LD block, or append one.
 *
 * Tagged with data-ld="page-schema" so it matches the id SeoManager uses at
 * runtime — the client then updates this same element rather than adding a
 * second, conflicting one on the first client-side navigation.
 */
export function upsertJsonLd(html: string, data: object): string {
  const tag = `<script type="application/ld+json" data-ld="page-schema">${escapeJsonLd(JSON.stringify(data))}</script>`;
  const existing = /<script[^>]*data-ld=["']page-schema["'][^>]*>[\s\S]*?<\/script>/i;

  if (existing.test(html)) return html.replace(existing, tag);
  return html.replace('</head>', `    ${tag}\n  </head>`);
}

/**
 * Produce the static HTML for one route from the built index.html shell.
 *
 * Everything here mirrors what SeoManager sets at runtime, sourced from the
 * same src/lib/seo.ts config, so a crawler that never runs JavaScript sees
 * exactly what a browser would end up with.
 */
export function renderRouteHtml(shell: string, pathname: string, origin: string): string {
  const config = getSeoConfig(pathname);
  const pageUrl = pageUrlFor(pathname, origin);

  let html = shell;
  html = upsertTitle(html, config.title);
  html = upsertMeta(html, 'name', 'description', config.description);
  html = upsertMeta(html, 'name', 'robots', config.index ? ROBOTS_INDEX : ROBOTS_NOINDEX);

  html = upsertMeta(html, 'property', 'og:title', config.title);
  html = upsertMeta(html, 'property', 'og:description', config.description);
  html = upsertMeta(html, 'property', 'og:url', pageUrl);
  if (config.image) html = upsertMeta(html, 'property', 'og:image', config.image);

  html = upsertMeta(html, 'name', 'twitter:title', config.title);
  html = upsertMeta(html, 'name', 'twitter:description', config.description);

  html = upsertCanonical(html, pageUrl);
  html = upsertJsonLd(html, buildPageJsonLd(pathname, origin));

  return html;
}
