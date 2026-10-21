/**
 * Best of Calgary (/best): every fact cited, order only from citations.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { BEST_CATEGORIES, BEST_SOURCES } from '../src/content/bestOf';
import { bestCategory, bestForQuery, bestItemListJsonLd, bestPath, isRanked, publishersOf, rankPlaces } from '../src/lib/bestOf';
import { PRERENDER_ROUTES, buildPageJsonLd, getSeoConfig } from '../src/lib/seo';
import { buildStaticRouteBody, renderRouteHtml } from '../scripts/seo/rewriteHtml';

const SOURCE_IDS = new Set(BEST_SOURCES.map(s => s.id));

describe('best of content', () => {
  it('cites a known source, or the company’s own site, for every fact and recommendation', () => {
    for (const c of BEST_CATEGORIES) for (const p of c.places) {
      for (const id of p.namedBy) assert.ok(SOURCE_IDS.has(id), `${c.slug}/${p.name}: unknown source ${id}`);
      for (const f of p.facts) {
        if (f.self) {
          assert.match(f.source, /^https:\/\//, `${p.name}: self fact needs the company URL`);
          assert.equal(new URL(f.source).host, new URL(p.website!).host, `${p.name}: self fact must come from its own site`);
        } else assert.ok(SOURCE_IDS.has(f.source), `${c.slug}/${p.name}: unknown fact source ${f.source}`);
      }
    }
  });

  it('only lists food places that an independent source names', () => {
    for (const c of BEST_CATEGORIES.filter(x => x.kind === 'food')) for (const p of c.places) assert.ok(p.namedBy.length > 0, `${p.name} has no recommendation`);
  });

  it('never marks a place verified by hand (only approved claims may)', () => {
    for (const c of BEST_CATEGORIES) for (const p of c.places) assert.equal(p.verified, undefined, p.name);
  });

  it('has unique slugs and unique names within a list', () => {
    assert.equal(new Set(BEST_CATEGORIES.map(c => c.slug)).size, BEST_CATEGORIES.length);
    for (const c of BEST_CATEGORIES) assert.equal(new Set(c.places.map(p => p.name)).size, c.places.length, c.slug);
  });
});

describe('ranking', () => {
  it('counts a publisher once however many of its lists name a place', () => {
    const dauBo = bestCategory('pho')!.places.find(p => p.name === 'Pho Dau Bo')!;
    assert.deepEqual(publishersOf(dauBo), ['Daily Hive']);
  });

  it('puts the most-cited pizzerias first, then A–Z ignoring "The"', () => {
    const order = rankPlaces(bestCategory('pizza')!.places).map(p => p.name);
    assert.deepEqual(order.slice(0, 3), ['Noble Pie', 'Pizza Culture', 'Una Pizza + Wine']);
    assert.equal(order[3], 'Acme Pizza Co.');
    const junk = rankPlaces(bestCategory('junk-removal')!.places).map(p => p.name);
    assert.deepEqual(junk, ['All In Junk', 'Junk Direct', 'The Junk Man', 'The Junk Movement', 'The Junk People', 'YYC Junk Removal']);
  });

  it('sorts a verified owner first without changing anyone else', () => {
    const places = bestCategory('pizza')!.places.map(p => p.name === 'Sinatras Pizzeria' ? { ...p, verified: true } : p);
    assert.equal(rankPlaces(places)[0].name, 'Sinatras Pizzeria');
    assert.equal(rankPlaces(places)[1].name, 'Noble Pie');
  });

  it('says a list is ranked only when citations differ', () => {
    assert.equal(isRanked(bestCategory('pizza')!), true);
    assert.equal(isRanked(bestCategory('window-cleaning')!), false);
  });
});

describe('search', () => {
  it('finds lists by whole words', () => {
    assert.deepEqual(bestForQuery('best pho near me').map(c => c.slug), ['pho']);
    assert.deepEqual(bestForQuery('Phở').map(c => c.slug), ['pho']);
    assert.deepEqual(bestForQuery('junk removal calgary').map(c => c.slug), ['junk-removal']);
    assert.deepEqual(bestForQuery('window cleaners').map(c => c.slug), ['window-cleaning']);
    assert.deepEqual(bestForQuery('phone'), []);
    assert.deepEqual(bestForQuery('seton'), []);
    assert.equal(bestForQuery('best of calgary').length, BEST_CATEGORIES.length);
  });
});

describe('seo', () => {
  it('indexes the hub and every list, with its own title', () => {
    for (const route of ['/best', ...BEST_CATEGORIES.map(bestPath)]) {
      assert.ok(PRERENDER_ROUTES.includes(route), route);
      assert.equal(getSeoConfig(route).index, true);
    }
    assert.match(getSeoConfig('/best/pizza').title, /^Best Pizza in Calgary/);
  });

  it('describes each list as an ItemList in page order', () => {
    const c = bestCategory('pizza')!;
    const list = bestItemListJsonLd(c, 'https://calgarywatch.ca') as { itemListElement: Array<{ position: number; item: { name: string; address?: unknown } }> };
    assert.equal(list.itemListElement[0].item.name, 'Noble Pie');
    assert.equal(list.itemListElement[0].position, 1);
    const page = buildPageJsonLd('/best/pizza', 'https://calgarywatch.ca') as { mainEntity: { '@type': string }; breadcrumb: { itemListElement: unknown[] } };
    assert.equal(page.mainEntity['@type'], 'ItemList');
    assert.equal(page.breadcrumb.itemListElement.length, 3);
  });

  it('prerenders the list and its sources into the first response', () => {
    const body = buildStaticRouteBody('/best/pho');
    assert.match(body, /<h1>Best pho in Calgary\.<\/h1>/);
    assert.match(body, /Pho Dau Bo/);
    assert.match(body, /dailyhive\.com\/calgary\/best-pho-calgary-2026/);
    assert.equal(buildStaticRouteBody('/best/nope'), '');
    const html = renderRouteHtml('<!doctype html><html><head><title>x</title></head><body><div id="root"></div></body></html>', '/best/junk-removal', 'https://calgarywatch.ca');
    assert.match(html, /Junk Removal in Calgary/);
    assert.match(html, /"@type":"ItemList"/);
  });
});
