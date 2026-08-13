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
import {
  GUIDE_COMPARISON,
  GUIDE_FAQS,
  GUIDE_PATH,
  GUIDE_SOURCES,
  GUIDE_UPDATED,
} from '../../src/content/neighbourhoodWatchGuide.js';

/**
 * Where a route's static HTML is written, relative to dist/.
 *
 * Flat `<route>.html` rather than `<route>/index.html` on purpose: a directory
 * makes Firebase Hosting 301-redirect /map to /map/, which contradicts the
 * canonical URL and the sitemap. With `cleanUrls: true` Firebase serves
 * map.html at /map with no redirect, and GitHub Pages resolves extensionless
 * URLs to the matching .html file natively.
 */
export function outputPathForRoute(route: string): string {
  if (route === '/') return 'index.html';
  return `${route.replace(/^\//, '').replace(/\/$/, '')}.html`;
}

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

function staticLink(href: string, label: string): string {
  return `<a href="${escapeAttr(href)}">${escapeText(label)}</a>`;
}

/**
 * Meaningful first-response HTML for crawlers and browsers before React boots.
 * The copy mirrors content that is visible in the corresponding React page;
 * it is not crawler-only content or a separate keyword variant.
 */
export function buildStaticRouteBody(pathname: string): string {
  if (pathname === GUIDE_PATH) {
    const comparisons = GUIDE_COMPARISON.map((row) => `
      <tr>
        <td>${escapeText(row.need)}</td>
        <td>${escapeText(row.source)}</td>
        <td>${staticLink(row.action, row.actionLabel)}</td>
      </tr>`).join('');
    const faqs = GUIDE_FAQS.map((faq) => `
      <details>
        <summary>${escapeText(faq.question)}</summary>
        <p>${escapeText(faq.answer)}</p>
      </details>`).join('');
    const sources = GUIDE_SOURCES.map((source) =>
      `<li>${staticLink(source.url, source.name)}</li>`,
    ).join('');

    return `<main data-prerendered-route="${escapeAttr(pathname)}">
      <article>
        <header>
          <p>Independent community safety guide · Reviewed ${escapeText(GUIDE_UPDATED)}</p>
          <h1>Calgary neighbourhood watch, without the guesswork.</h1>
          <p>See what has recently been reported near you, understand where the information came from, and choose the right official channel when something needs action.</p>
          <p>${staticLink('/map', 'Check incidents near me')} · ${staticLink('/map?report=true', 'Sign in to report')}</p>
        </header>
        <section>
          <h2>“Current police activity near me” is not one kind of data.</h2>
          <p>People use that search to mean different things: a siren nearby, a road closed after a collision, a community report, or official crime statistics. No single public map contains every live police call or officer location.</p>
          <p>Calgary Watch shows recent community observations and selected public-source incidents. Every marker should be read with its timestamp and source. It is useful for awareness, but it is not a dispatch feed and cannot confirm that police attended an event.</p>
        </section>
        <section>
          <h2>Choose the source that matches the question.</h2>
          <table><thead><tr><th>What you need</th><th>Best starting point</th><th>Action</th></tr></thead><tbody>${comparisons}</tbody></table>
        </section>
        <section>
          <h2>Block Watch Calgary and Calgary Watch are different.</h2>
          <p>Block Watch generally means neighbours organizing on their own block to reduce opportunities for crime, share prevention information, and report suspicious activity through the appropriate channels.</p>
          <p>Calgary Watch is an independent public map. It is not a Block Watch chapter and is not operated by Calgary Police Service.</p>
        </section>
        <section>
          <h2>Report through the right channel first.</h2>
          <p>Call 911 for an emergency or crime in progress. For Calgary police matters not in progress, call 403-266-1234. Posting to Calgary Watch does not create a police report.</p>
        </section>
        <section><h2>Frequently asked questions</h2>${faqs}</section>
        <section><h2>Official references</h2><ul>${sources}</ul></section>
      </article>
    </main>`;
  }

  const summaries: Record<string, { heading: string; copy: string; links: [string, string][] }> = {
    '/': {
      heading: 'Calgary crime. Mapped live. By neighbours.',
      copy: 'Calgary Watch is a free Calgary crime map and neighbourhood safety network with recent community, traffic, weather, infrastructure, and emergency reports.',
      links: [['/map', 'Open the live Calgary crime map'], [GUIDE_PATH, 'Read the Calgary neighbourhood watch guide']],
    },
    '/map': {
      heading: 'Calgary Crime Map',
      copy: 'Explore recent community-reported and public-source incidents across Calgary and nearby communities. Check the time and source on each marker; Calgary Watch is not a police dispatch feed.',
      links: [[GUIDE_PATH, 'How to interpret activity near you'], ['/about', 'How Calgary Watch works']],
    },
    '/about': {
      heading: 'How Calgary Watch works',
      copy: 'Calgary Watch combines community reports with selected, attributed public-source information to support local awareness. It is independent from Calgary Police Service and is not a substitute for 911.',
      links: [['/map', 'View the live map'], [GUIDE_PATH, 'Neighbourhood watch and reporting guide']],
    },
    '/coverage': {
      heading: 'Calgary-area community coverage',
      copy: 'Calgary Watch supports reports across Calgary, Airdrie, Cochrane, Okotoks, Chestermere, and other nearby Alberta communities.',
      links: [['/map', 'View the Calgary-area incident map'], [GUIDE_PATH, 'Read the neighbourhood watch guide']],
    },
  };
  const summary = summaries[pathname];
  if (!summary) return '';
  const links = summary.links.map(([href, label]) => staticLink(href, label)).join(' · ');
  return `<main data-prerendered-route="${escapeAttr(pathname)}"><article><h1>${escapeText(summary.heading)}</h1><p>${escapeText(summary.copy)}</p><p>${links}</p></article></main>`;
}

/** Place route content inside the React mount point for the first response. */
export function upsertStaticRouteBody(html: string, pathname: string): string {
  const body = buildStaticRouteBody(pathname);
  if (!body) return html;
  return html.replace(/<div id=["']root["']>[\s\S]*?<\/div>/i, `<div id="root">${body}</div>`);
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
  html = upsertStaticRouteBody(html, pathname);

  return html;
}
