/**
 * Tests for the SEO prerender tag rewriting.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { renderRouteHtml, escapeAttr, escapeJsonLd, upsertMeta } from '../scripts/seo/rewriteHtml.js';
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
    assert.match(html, /<title>Live Calgary Crime &amp; Incident Map \| Calgary Watch<\/title>/);
    assert.doesNotMatch(html, /<title>Calgary Watch \| Real-Time Community Safety Map<\/title>/);
  });

  it('replaces the multi-line description rather than duplicating it', () => {
    const html = renderRouteHtml(SHELL, '/about', PRODUCTION_ORIGIN);
    const matches = html.match(/<meta[^>]*name=["']description["'][^>]*>/g) ?? [];
    assert.equal(matches.length, 1, 'exactly one description meta must remain');
    assert.match(html, /Learn how Calgary Watch combines community reporting/);
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
    assert.match(html, /<meta property="og:title" content="Live Calgary Crime &amp; Incident Map \| Calgary Watch" \/>/);
  });

  it('leaves the script tags and app shell untouched', () => {
    const html = renderRouteHtml(SHELL, '/map', PRODUCTION_ORIGIN);
    assert.match(html, /<script type="module" src="\/assets\/index-abc123\.js"><\/script>/);
    assert.match(html, /<div id="root"><\/div>/);
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
