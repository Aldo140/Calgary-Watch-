import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { createDiscoveryRepository, entityPath } from '../src/lib/discovery.ts';
import { organizerEvents, organizerProfile } from '../src/lib/organizations.ts';
import { renderRouteHtml } from '../scripts/seo/rewriteHtml.ts';
import type { Business, DiscoveryEntity, Event } from '../src/types/discovery.ts';

const entityId = 'biz-the-shakespeare-company';
const slug = 'the-shakespeare-company';
const root = new URL('../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');
const editorial = JSON.parse(read('src/content/editorial-inventory.json')) as { entities: DiscoveryEntity[] };
const generated = JSON.parse(read('src/generated/discovery-index.json')) as { entities: DiscoveryEntity[]; occurrences: [] };
const reviewed = JSON.parse(read('scripts/discovery/reviewed-sources.json')) as Array<{
  source: { id: string; hosts: string[]; kind: string };
  records: Array<{ id: string; input: { start: string; end: string; organizer: string; sourceUrl: string; schedulePrecision?: string; tickets?: string; priceRange?: unknown } }>;
}>;
const repository = createDiscoveryRepository(generated.entities, generated.occurrences);
const host = (url: string) => new URL(url).hostname.replace(/^www\./, '');

describe('The Shakespeare Company organization listing', () => {
  it('is one published, unclaimed Local profile, retained by the export', () => {
    const authored = editorial.entities.filter(item => item.id === entityId || item.title === 'The Shakespeare Company');
    assert.equal(authored.length, 1, 'exactly one authored profile');
    const exported = generated.entities.find(item => item.id === entityId);
    assert.deepEqual(exported, authored[0]);
    const org = authored[0] as Business;
    assert.equal(org.status, 'published');
    assert.equal(org.claimed, false, 'never claimed on the company’s behalf');
    assert.equal(org.ownerVerifiedAt, undefined);
    assert.equal(org.verification, 'source-checked');
    for (const source of org.sources) assert.equal(host(source.url), 'shakespearecompany.com');
  });

  it('resolves to the public profile and the free claim route', () => {
    const entity = repository.find('business', slug) as Business | undefined;
    assert.ok(entity);
    assert.equal(entityPath(entity), '/local/the-shakespeare-company');
    const html = renderRouteHtml('<html><head><title>CalgaryWatch</title></head><body><div id="root"></div></body></html>', `/claim/${entityId}`, 'https://calgarywatch.ca');
    assert.match(html, /<title>Claim The Shakespeare Company \| CalgaryWatch<\/title>/);
    assert.doesNotMatch(html, /Listing unavailable|Page not found/);
  });

  it('publishes only what the official site states, linked to the company', () => {
    const source = reviewed.find(item => item.source.id === 'the-shakespeare-company');
    assert.ok(source);
    assert.deepEqual(source.source.hosts, ['shakespearecompany.com', 'www.shakespearecompany.com']);
    for (const { input } of source.records) {
      assert.equal(input.organizer, 'The Shakespeare Company');
      assert.equal(host(input.sourceUrl), 'shakespearecompany.com');
      // Times, prices and ticket links were not confirmed; the run is date-only.
      assert.equal(input.schedulePrecision, 'date');
      assert.equal(input.tickets, undefined);
      assert.equal(input.priceRange, undefined);
    }
    const events = generated.entities.filter((e): e is Event => e.kind === 'event' && e.sourceId === 'the-shakespeare-company');
    assert.equal(events.length, source.records.length);
    for (const event of events) assert.equal(organizerProfile(event, generated.entities)?.id, entityId);
    const tisPity = events.find(e => e.sourceRecordId === 'tis-pity-shes-a-whore-2026');
    assert.ok(tisPity);
    assert.deepEqual([tisPity.start, tisPity.end], ['2026-10-22T00:00:00-06:00', '2026-11-01T00:00:00-06:00']);
    assert.equal(organizerEvents(entityId, generated.entities, Date.parse('2026-10-25T12:00:00-06:00')).length, 1);
  });
});
