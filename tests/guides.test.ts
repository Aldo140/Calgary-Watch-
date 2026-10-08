import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import type { DiscoveryEntity, Guide } from '../src/types/discovery';
import { validateEntity } from '../src/lib/discovery';
import { featuredGuide, routeUrl } from '../src/lib/guides';
import { renderRouteHtml } from '../scripts/seo/rewriteHtml';

const editorial = JSON.parse(readFileSync('src/content/editorial-inventory.json', 'utf8')).entities as DiscoveryEntity[];
const index = JSON.parse(readFileSync('src/generated/discovery-index.json', 'utf8')).entities as DiscoveryEntity[];
const guides = editorial.filter((e): e is Guide => e.kind === 'guide');

describe('editorial guides', () => {
  it('are valid, published and carry a full route', () => {
    assert.ok(guides.length >= 4);
    for (const g of guides) {
      assert.equal(validateEntity(g), true, g.id);
      assert.equal(g.status, 'published');
      assert.ok(g.stops && g.stops.length >= 5, `${g.id} has stops`);
      assert.ok(g.facts && g.cover && g.tips?.length, `${g.id} has facts, cover and tips`);
    }
  });

  it('match the generated index, so the site shows them before the next export', () => {
    for (const g of guides) assert.deepEqual(index.find(e => e.id === g.id), g);
  });

  it('only link listings and guides that exist', () => {
    const ids = new Set(index.map(e => e.id));
    for (const g of guides) {
      for (const s of g.stops ?? []) if (s.entityId) assert.ok(ids.has(s.entityId), `${g.id}: ${s.name}`);
      for (const en of g.entries) assert.ok(ids.has(en.entityId), `${g.id}: ${en.entityId}`);
      for (const id of g.relatedGuideIds) assert.ok(ids.has(id), `${g.id}: ${id}`);
    }
  });
});

describe('guide helpers', () => {
  const bow = guides.find(g => g.id === 'guide-bow-river-trail')!;
  it('builds one walking route that skips detours', () => {
    const url = new URL(routeUrl(bow.stops!)!);
    assert.equal(url.searchParams.get('travelmode'), 'walking');
    assert.match(url.searchParams.get('origin')!, /Pearce Estate/);
    assert.match(url.searchParams.get('destination')!, /Crescent Road/);
    assert.doesNotMatch(url.searchParams.get('waypoints')!, /Central Library/);
  });
  it('has no route for a single stop', () => assert.equal(routeUrl(bow.stops!.slice(0, 1)), undefined));
  it('features the newest guide, the last added on a tie', () => {
    assert.equal(featuredGuide(guides)?.id, 'guide-calgary-for-free');
    assert.equal(featuredGuide([]), undefined);
  });
  it('prerenders every stop into the guide HTML', () => {
    const html = renderRouteHtml('<html><head></head><body><div id="root"></div></body></html>', '/guides/free-things-to-do-in-calgary', 'https://calgarywatch.ca');
    assert.match(html, /Devonian Gardens/);
    assert.match(html, /Crescent Heights lookout/);
  });
});
