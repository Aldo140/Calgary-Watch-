/**
 * Tests for the SEO prerender tag rewriting.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  renderRouteHtml,
  escapeAttr,
  escapeJsonLd,
  buildStaticRouteBody,
  outputPathForRoute,
  upsertMeta,
} from '../scripts/seo/rewriteHtml.js';
import { PRERENDER_ROUTES, PRODUCTION_ORIGIN, ROUTE_SEO } from '../src/lib/seo.js';

/** Mirrors the real index.html, including its multi-line meta tags. */
const SHELL = `<!doctype html>
<html lang="en-CA">
  <head>
    <meta charset="UTF-8" />
    <title>Calgary Watch | Real-Time Community Safety Map</title>
    <meta
      name="description"
      content="Calgary Watch — real-time crime map."
    />
    <meta property="og:title" content="Calgary Watch" />
    <meta property="og:description" content="old og description" />
    <meta property="og:url" content="https://calgarywatch.ca/" />
    <meta property="og:image" content="https://calgarywatch.ca/images/hero-wide.webp" />
    <meta name="twitter:title" content="Calgary Watch" />
    <meta name="twitter:description" content="old twitter description" />
    <meta name="robots" content="index, follow, max-image-preview:large" />
    <link rel="canonical" href="https://calgarywatch.ca/" />
    <script type="module" src="/assets/index-abc123.js"></script>
  </head>
  <body><div id="root"></div></body>
</html>`;

describe('renderRouteHtml', () => {
  it('bakes the route title into the static HTML', () => {
    const html = renderRouteHtml(SHELL, '/map', PRODUCTION_ORIGIN);
    assert.match(html, /<title>Calgary Crime Map: Live Incidents Near You \| Calgary Watch<\/title>/);
    assert.doesNotMatch(html, /<title>Calgary Watch \| Real-Time Community Safety Map<\/title>/);
  });

  it('replaces the multi-line description rather than duplicating it', () => {
    const html = renderRouteHtml(SHELL, '/about', PRODUCTION_ORIGIN);
    const matches = html.match(/<meta[^>]*name=["']description["'][^>]*>/g) ?? [];
    assert.equal(matches.length, 1, 'exactly one description meta must remain');
    assert.match(html, /Learn how Calgary Watch combines community reports and public data/);
  });

  it('sets canonical and og:url to the route, not the homepage', () => {
    const html = renderRouteHtml(SHELL, '/coverage', PRODUCTION_ORIGIN);
    assert.match(html, /<link rel="canonical" href="https:\/\/calgarywatch\.ca\/coverage" \/>/);
    assert.match(html, /<meta property="og:url" content="https:\/\/calgarywatch\.ca\/coverage" \/>/);
  });

  it('keeps a single og:title / twitter:title after rewriting', () => {
    const html = renderRouteHtml(SHELL, '/map', PRODUCTION_ORIGIN);
    assert.equal((html.match(/property=["']og:title["']/g) ?? []).length, 1);
    assert.equal((html.match(/name=["']twitter:title["']/g) ?? []).length, 1);
    assert.match(html, /<meta property="og:title" content="Calgary Crime Map: Live Incidents Near You \| Calgary Watch" \/>/);
  });

  it('leaves the module script intact and places readable content in the app shell', () => {
    const html = renderRouteHtml(SHELL, '/map', PRODUCTION_ORIGIN);
    assert.match(html, /<script type="module" src="\/assets\/index-abc123\.js"><\/script>/);
    assert.match(html, /<div id="root"><main data-prerendered-route="\/map">/);
    assert.match(html, /<h1>Calgary Crime Map<\/h1>/);
  });

  it('provides substantive non-JavaScript content for every indexable route', () => {
    for (const route of PRERENDER_ROUTES) {
      const body = buildStaticRouteBody(route);
      assert.match(body, /<h1>/, `${route} needs a first-response heading`);
      assert.ok(body.length > 250, `${route} first-response content is too thin`);
    }
  });

  it('answers neighbourhood-watch search intent in the guide HTML', () => {
    const body = buildStaticRouteBody('/calgary-neighbourhood-watch');
    assert.match(body, /Current police activity near me/);
    assert.match(body, /Block Watch Calgary/);
    assert.match(body, /403-266-1234/);
    assert.match(body, /not operated by Calgary Police Service/);
  });

  it('injects page JSON-LD tagged so SeoManager updates it instead of duplicating', () => {
    const html = renderRouteHtml(SHELL, '/about', PRODUCTION_ORIGIN);
    const match = html.match(
      /<script type="application\/ld\+json" data-ld="page-schema">([\s\S]*?)<\/script>/,
    );
    assert.ok(match, 'JSON-LD block must be present');
    const parsed = JSON.parse(match[1].replace(/\\u003c/g, '<'));
    assert.equal(parsed['@type'], 'AboutPage');
    assert.equal(parsed.url, 'https://calgarywatch.ca/about');
    assert.equal(parsed.breadcrumb.itemListElement.length, 2);
  });

  it('produces distinct HTML for every prerendered route', () => {
    const rendered = PRERENDER_ROUTES.map((r) => renderRouteHtml(SHELL, r, PRODUCTION_ORIGIN));
    assert.equal(new Set(rendered).size, rendered.length, 'no two routes may share identical HTML');
  });

  it('only prerenders indexable routes — /admin is excluded', () => {
    assert.ok(!PRERENDER_ROUTES.includes('/admin'));
    assert.equal(ROUTE_SEO['/admin'].index, false);
  });
});

describe('outputPathForRoute', () => {
  it('writes flat .html files, not directories', () => {
    // A dist/map/ directory makes Firebase 301 /map -> /map/, which contradicts
    // the canonical URL and the sitemap. Flat files + cleanUrls avoid that.
    assert.equal(outputPathForRoute('/map'), 'map.html');
    assert.equal(outputPathForRoute('/about'), 'about.html');
    assert.equal(outputPathForRoute('/coverage'), 'coverage.html');
  });

  it('maps the root route onto index.html', () => {
    assert.equal(outputPathForRoute('/'), 'index.html');
  });

  it('never emits a path ending in a slash', () => {
    for (const route of PRERENDER_ROUTES) {
      assert.doesNotMatch(outputPathForRoute(route), /\/$/);
    }
  });
});

describe('escaping', () => {
  it('escapes quotes and angle brackets in attributes', () => {
    assert.equal(escapeAttr('a "b" <c> & d'), 'a &quot;b&quot; &lt;c&gt; &amp; d');
  });

  it('prevents JSON-LD from closing its own script tag', () => {
    const escaped = escapeJsonLd(JSON.stringify({ evil: '</script><img onerror=alert(1)>' }));
    assert.doesNotMatch(escaped, /<\/script>/i);
    assert.match(escaped, /\\u003c/);
  });

  it('appends a meta tag when none exists', () => {
    const html = upsertMeta('<head></head>', 'name', 'brand-new', 'value');
    assert.match(html, /<meta name="brand-new" content="value" \/>/);
  });
});
