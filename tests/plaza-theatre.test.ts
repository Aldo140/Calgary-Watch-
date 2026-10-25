import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { createDiscoveryRepository, entityPath } from '../src/lib/discovery.ts';
import { associateOrganizers, organizerEvents, organizerProfile } from '../src/lib/organizations.ts';
import { claimPresentation } from '../src/lib/claimPresentation.ts';
import { publishedInventory } from '../src/lib/discoveryPublication.ts';
import { renderRouteHtml } from '../scripts/seo/rewriteHtml.ts';
import type { Business, DiscoveryEntity, Event } from '../src/types/discovery.ts';

const entityId = 'biz-the-plaza-theatre';
const slug = 'the-plaza-theatre';
const root = new URL('../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');
const editorial = JSON.parse(read('src/content/editorial-inventory.json')) as { entities: DiscoveryEntity[] };
const generated = JSON.parse(read('src/generated/discovery-index.json')) as { entities: DiscoveryEntity[]; occurrences: [] };
const reviewed = JSON.parse(read('scripts/discovery/reviewed-sources.json')) as Array<{
  source: { id: string; hosts: string[]; kind: string };
  records: Array<{ id: string; input: { start: string; end: string; organizer: string; venue?: string; sourceUrl: string; schedulePrecision?: string; tickets?: string; priceRange?: unknown } }>;
}>;
const repository = createDiscoveryRepository(generated.entities, generated.occurrences);
const host = (url: string) => new URL(url).hostname.replace(/^www\./, '');

describe('The Plaza Theatre organization listing', () => {
  it('is one published, unclaimed Local profile, retained by the export', () => {
    const authored = editorial.entities.filter(item => item.id === entityId || /plaza theatre/i.test(String(item.title)));
    assert.equal(authored.length, 1, 'exactly one authored profile');
    const exported = generated.entities.filter(item => item.kind === 'business' && /plaza theatre/i.test(String(item.title)));
    assert.deepEqual(exported, authored);
    const org = authored[0] as Business;
    assert.equal(org.status, 'published');
    assert.equal(org.claimed, false, 'never claimed on the theatre’s behalf');
    assert.equal(org.ownerVerifiedAt, undefined);
    assert.equal(org.verification, 'source-checked');
    assert.equal(org.address, '1133 Kensington Road NW, Calgary, AB T2N 3P4');
    for (const source of org.sources) assert.equal(host(source.url), 'theplaza.ca');
  });

  it('resolves to the public profile and the free claim route', () => {
    const entity = repository.find('business', slug) as Business | undefined;
    assert.ok(entity);
    assert.equal(entityPath(entity), '/local/the-plaza-theatre');
    const html = renderRouteHtml('<html><head><title>CalgaryWatch</title></head><body><div id="root"></div></body></html>', `/claim/${entityId}`, 'https://calgarywatch.ca');
    assert.match(html, /<title>Claim The Plaza Theatre \| CalgaryWatch<\/title>/);
    assert.doesNotMatch(html, /Listing unavailable|Page not found/);
  });

  it('publishes only what the official site states, linked to the theatre', () => {
    const source = reviewed.find(item => item.source.id === 'the-plaza-theatre');
    assert.ok(source);
    assert.deepEqual(source.source.hosts, ['theplaza.ca', 'www.theplaza.ca']);
    for (const { input } of source.records) {
      assert.equal(input.organizer, 'The Plaza Theatre');
      assert.equal(input.venue, 'The Plaza Theatre');
      assert.match(input.sourceUrl, /^https:\/\/www\.theplaza\.ca\/whats-on\/[a-z0-9-]+$/, 'links the screening’s own page');
      // The screening page still shows 2024 times and prices, so the run is date-only.
      assert.equal(input.schedulePrecision, 'date');
      assert.equal(input.tickets, undefined);
      assert.equal(input.priceRange, undefined);
    }
    const events = generated.entities.filter((e): e is Event => e.kind === 'event' && e.sourceId === 'the-plaza-theatre');
    assert.equal(events.length, source.records.length);
    for (const event of events) assert.equal(organizerProfile(event, generated.entities)?.id, entityId);
    // The export's own association step reaches the same profile without the stored id.
    const stripped = generated.entities.map(e => e.kind === 'event' && e.sourceId === 'the-plaza-theatre' ? { ...e, organizerEntityId: undefined } : e);
    for (const e of associateOrganizers(stripped).filter(e => e.kind === 'event' && (e as Event).sourceId === 'the-plaza-theatre')) assert.equal((e as Event).organizerEntityId, entityId);
    const rocky = events.find(e => e.sourceRecordId === 'rocky-horror-picture-show-2026');
    assert.ok(rocky);
    assert.equal(rocky.slug, 'the-rocky-horror-picture-show-7f93b0');
    // A verifiedAt in the future would hide the listing from the site.
    assert.ok(publishedInventory(rocky, new Date(Date.parse(rocky.verifiedAt!) + 60_000)));
    assert.deepEqual([rocky.start, rocky.end], ['2026-10-22T00:00:00-06:00', '2026-11-01T00:00:00-06:00']);
    assert.equal(organizerEvents(entityId, generated.entities, Date.parse('2026-10-25T12:00:00-06:00')).length, 1);
  });
});

describe('The Plaza Theatre claim page copy', () => {
  it('speaks to a cinema, not a theatre season', () => {
    const org = generated.entities.find(item => item.id === entityId)!;
    const event = generated.entities.find((e): e is Event => e.kind === 'event' && e.sourceId === 'the-plaza-theatre')!;
    for (const listing of [org, event]) {
      const copy = claimPresentation(listing, org);
      assert.equal(copy.label, 'For cinemas & film organizers');
      assert.equal(copy.dates, 'Screenings & special events');
    }
  });
});
