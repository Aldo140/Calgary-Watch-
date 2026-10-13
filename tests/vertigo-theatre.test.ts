import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { createDiscoveryRepository, entityPath } from '../src/lib/discovery.ts';
import { renderRouteHtml } from '../scripts/seo/rewriteHtml.ts';
import type { Business, DiscoveryEntity, Event } from '../src/types/discovery.ts';

const entityId = 'biz-vertigo-theatre';
const slug = 'vertigo-theatre';
const sourceId = 'vertigo-theatre';
const root = new URL('../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');
const editorial = JSON.parse(read('src/content/editorial-inventory.json')) as { entities: DiscoveryEntity[] };
const generated = JSON.parse(read('src/generated/discovery-index.json')) as { entities: DiscoveryEntity[]; occurrences: [] };
const reviewed = JSON.parse(read('scripts/discovery/reviewed-sources.json')) as Array<{
  source: { id: string; hosts: string[]; kind: string };
  records: Array<{ id: string; input: { start: string; end: string; organizer: string; sourceUrl: string } }>;
}>;
const repository = createDiscoveryRepository(generated.entities, generated.occurrences);
const entity = repository.find('business', slug) as Business | undefined;
const expectedProductions = new Map([
  ['the-lodger-2026', ['2026-09-26T19:30:00-06:00', '2026-10-25T16:00:00-06:00']],
  ['sherlock-holmes-hunt-for-moriarty-2026', ['2026-11-14T19:30:00-06:00', '2026-12-19T22:00:00-06:00']],
  ['the-veil-2027', ['2027-01-16T19:30:00-06:00', '2027-02-14T16:00:00-06:00']],
  ['last-candle-2027', ['2027-02-26T19:30:00-06:00', '2027-03-07T16:00:00-06:00']],
  ['the-39-steps-2027', ['2027-03-13T19:30:00-06:00', '2027-04-17T22:00:00-06:00']],
  ['the-midnight-torch-2027', ['2027-05-15T19:30:00-06:00', '2027-06-13T16:00:00-06:00']],
]);

describe('Vertigo Theatre organization listing', () => {
  it('is a real published, claimable Local entity retained by the export', () => {
    const authored = editorial.entities.find(item => item.id === entityId) as Business | undefined;
    const exported = generated.entities.find(item => item.id === entityId);
    assert.ok(authored, 'listing must be authored in editorial-inventory.json');
    assert.ok(exported, 'discovery export must retain the listing');
    assert.equal(authored.kind, 'business');
    assert.equal(authored.status, 'published');
    assert.equal(authored.developmentOnly, undefined);
    assert.equal(authored.claimed, false);
    assert.deepEqual(exported, authored);
  });

  it('resolves to the public listing and direct claim routes', () => {
    assert.ok(entity);
    assert.equal(entity.id, entityId);
    assert.equal(entityPath(entity), '/local/vertigo-theatre');
    assert.equal(`/claim/${entity.id}`, '/claim/biz-vertigo-theatre');
    const claimLookup = repository.list().find(item => item.id === entityId && ['event', 'market', 'business'].includes(item.kind));
    assert.equal(claimLookup?.title, 'Vertigo Theatre');
  });

  it('uses only Vertigo official sources and exposes its season page', () => {
    assert.ok(entity);
    assert.equal(entity.verification, 'source-checked');
    assert.equal(entity.sourceId, sourceId);
    assert.equal(entity.socials.season, 'https://purchase.vertigotheatre.com/Events?attribute_EventType=2627Season');
    for (const source of entity.sources) {
      assert.equal(new URL(source.url).hostname.replace(/^www\./, '').endsWith('vertigotheatre.com'), true);
      assert.equal(source.kind, 'official');
    }
  });

  it('uses the existing claim CTA and route', () => {
    assert.match(read('src/App.tsx'), /path="\/claim\/:id"/);
    assert.match(read('src/pages/ClaimListingPage.tsx'), /Run \{entity\.title\}\? <em>Claim it\.<\/em>/);
    assert.match(read('src/components/entity/ListingDetail.tsx'), /<ClaimCta entityId=\{place\.id\} title=\{place\.title\} kind="business" \/>/);
    assert.match(read('src/components/entity/ClaimCta.tsx'), /to=\{`\/claim\/\$\{encodeURIComponent\(entityId\)\}`\}/);
  });

  it('prerenders a useful direct claim page for Firebase Hosting', () => {
    const shell = '<html><head><title>CalgaryWatch</title></head><body><div id="root"></div></body></html>';
    const html = renderRouteHtml(shell, '/claim/biz-vertigo-theatre', 'https://calgarywatch.ca');
    assert.match(html, /<title>Claim Vertigo Theatre \| CalgaryWatch<\/title>/);
    assert.match(html, /name="robots" content="noindex, nofollow"/);
    assert.match(html, /<h1>Run Vertigo Theatre\? Claim it\.<\/h1>/);
    assert.doesNotMatch(html, /Listing unavailable|Page not found/);
    assert.match(read('scripts/seo/prerender.ts'), /`\/claim\/\$\{encodeURIComponent\(entity\.id\)\}`/);
  });

  it('preserves all six reviewed productions and relates them through sourceId', () => {
    const source = reviewed.find(item => item.source.id === sourceId);
    assert.ok(source);
    assert.equal(source.source.kind, 'official');
    assert.equal(source.records.length, 6);
    for (const record of source.records) {
      const dates = expectedProductions.get(record.id);
      assert.ok(dates, `unexpected Vertigo production ${record.id}`);
      assert.deepEqual([record.input.start, record.input.end], dates);
      assert.equal(record.input.organizer, 'Vertigo Theatre');
      assert.equal(new URL(record.input.sourceUrl).hostname.replace(/^www\./, ''), 'vertigotheatre.com');
    }

    const productions = generated.entities.filter((item): item is Event => item.kind === 'event' && item.sourceId === sourceId);
    assert.equal(productions.length, 6);
    assert.deepEqual(new Set(productions.map(item => item.sourceRecordId)), new Set(expectedProductions.keys()));
  });

  it('renders the reusable organization-to-productions relationship', () => {
    const listing = read('src/components/entity/ListingDetail.tsx');
    assert.match(listing, /entity\.sourceId === place\.sourceId/);
    assert.match(listing, /Upcoming at \{place\.title\}/);
    assert.match(listing, /entity\.sourceId === event\.sourceId/);
    assert.match(listing, /<Link to=\{entityPath\(organization\)\}>\{event\.organizer\}<\/Link>/);
  });
});
