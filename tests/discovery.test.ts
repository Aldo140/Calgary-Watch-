import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { createDiscoveryRepository, entityPath, matchesPeriod, normalizeSearch, searchEntities, validateEntity, DISCOVERY_SECTIONS } from '../src/lib/discovery';
import { discoveryFixtures } from '../src/data/discovery';
import { buildEntityJsonLd, buildSitemap, indexableEntities } from '../src/lib/discoverySeo';
import { getSeoConfig } from '../src/lib/seo';
import { renderRouteHtml } from '../scripts/seo/rewriteHtml';
import { DiscoveryHero } from '../src/components/discovery/DiscoveryHero';
import { LivePreview } from '../src/components/discovery/LivePreview';

describe('Discovery publication boundary', () => {
  it('keeps development fixtures out of production inventory and sitemaps', () => {
    assert.equal(createDiscoveryRepository(discoveryFixtures).list().length, 0);
    assert.equal(createDiscoveryRepository(discoveryFixtures, [], true).list().length, discoveryFixtures.length);
    assert.deepEqual(indexableEntities(discoveryFixtures), []);
    const sitemap = buildSitemap(['/', '/map'], discoveryFixtures, 'https://calgarywatch.ca');
    assert.ok(!sitemap.includes('preview')); assert.ok(sitemap.includes('/map</loc>'));
  });
  it('requires valid dates, safe slugs and provenance', () => {
    assert.ok(discoveryFixtures.every(validateEntity));
    assert.equal(validateEntity({ ...discoveryFixtures[0], sources: [] }), false);
    assert.equal(validateEntity({ ...discoveryFixtures[0], slug: '../map' }), false);
    const event = discoveryFixtures[0];
    if (event.kind === 'event') assert.equal(validateEntity({ ...event, end: event.start }), false);
  });
  it('never publishes drafts even in development', () => {
    assert.equal(createDiscoveryRepository([{ ...discoveryFixtures[0], status: 'draft' }], [], true).list().length, 0);
  });
  it('generates entity-specific structured data and deduplicates sitemap paths', () => {
    const event = { ...discoveryFixtures[0], developmentOnly: false, verifiedAt: new Date().toISOString(), verification: 'source-checked' as const, sources: [{ kind: 'official' as const, name: 'Organizer', url: 'https://example.org/event' }] };
    assert.equal((buildEntityJsonLd(event, 'https://calgarywatch.ca') as Record<string, unknown>)['@type'], 'Event');
    const xml = buildSitemap([entityPath(event)], [event], 'https://calgarywatch.ca');
    assert.equal((xml.match(/<url>/g) || []).length, 1);
  });
});
describe('Discovery search and calendar', () => {
  it('normalizes unicode and whitespace, caps input, and returns grouped results', () => {
    assert.equal(normalizeSearch('  ＭＡＲＫＥＴ  \n Calgary '), 'market calgary');
    assert.equal(normalizeSearch('x'.repeat(200)).length, 120);
    assert.ok(searchEntities(discoveryFixtures, 'market').market?.length);
    assert.deepEqual(searchEntities(discoveryFixtures, '   '), {});
    assert.deepEqual(searchEntities(discoveryFixtures, 'no-such-query'), {});
  });
  it('uses Calgary date near UTC midnight and excludes expired events', () => {
    const now = new Date('2026-09-27T01:00:00Z'); // Saturday evening Calgary
    assert.ok(matchesPeriod('2026-09-26T18:00:00-06:00', '2026-09-26T21:00:00-06:00', 'today', now));
    assert.equal(matchesPeriod('2026-09-26T09:00:00-06:00', '2026-09-26T10:00:00-06:00', 'today', now), false);
  });
  it('keeps Sunday in the current weekend and advances Monday to the next', () => {
    const start = '2026-09-27T14:00:00-06:00'; const end = '2026-09-27T17:00:00-06:00';
    assert.ok(matchesPeriod(start, end, 'this-weekend', new Date('2026-09-27T12:00:00-06:00')));
    assert.equal(matchesPeriod(start, end, 'this-weekend', new Date('2026-09-28T12:00:00-06:00')), false);
  });
});
describe('Discovery routes and presentation', () => {
  it('noindexes unfinished collections, search and unknown entity pages', () => {
    for (const path of [...DISCOVERY_SECTIONS.map(s => s.path), '/search', '/events/missing', '/local/food']) assert.equal(getSeoConfig(path).index, false);
    assert.equal(getSeoConfig('/map').index, true);
    assert.equal(getSeoConfig('/calgary-neighbourhood-watch').index, true);
    const hosting = JSON.parse(readFileSync('firebase.json', 'utf8')).hosting;
    for (const section of DISCOVERY_SECTIONS) assert.ok(hosting.headers.some((rule: { source: string; headers: { key: string; value: string }[] }) => rule.source === `${section.path}/**` && rule.headers.some(h => h.key === 'X-Robots-Tag' && h.value.includes('noindex'))));
  });
  it('keeps new routes lazy and retains every existing route', () => {
    const app = readFileSync('src/App.tsx', 'utf8');
    for (const path of [...DISCOVERY_SECTIONS.map(s => s.path), '/map', '/about', '/admin', '/admin/users', '/admin/incidents', '/coverage', '/privacy', '/unsubscribe', '/calgary-neighbourhood-watch', '/airdrie-crime-map']) assert.ok(app.includes(`path="${path}"`));
    assert.match(app, /lazy\(\(\) => import\('@\/src\/pages\/DiscoveryPage'\)\)/);
  });
  it('renders a semantic hero, working search and distinct Live path without fake numbers', () => {
    const html = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(DiscoveryHero), createElement(LivePreview)));
    assert.match(html, /What’s happening/); assert.match(html, /role="search"/); assert.match(html, /href="\/map"/);
    assert.match(html, /See it\. Share it\./); assert.ok(!html.includes('updated 2 min'));
  });
  it('prerenders noindex and removes the homepage preload from other routes', () => {
    const shell = '<html><head><link rel="preload" as="image" href="/hero.webp"></head><body><div id="root"></div></body></html>';
    const html = renderRouteHtml(shell, '/events', 'https://calgarywatch.ca');
    assert.match(html, /noindex, nofollow/); assert.ok(!html.includes('rel="preload"'));
  });
});
