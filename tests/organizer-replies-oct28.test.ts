import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { createDiscoveryRepository, entityPath } from '../src/lib/discovery.ts';
import { associateOrganizers, organizerEvents, organizerProfile } from '../src/lib/organizations.ts';
import { publishedInventory } from '../src/lib/discoveryPublication.ts';
import { renderRouteHtml } from '../scripts/seo/rewriteHtml.ts';
import type { Business, DiscoveryEntity, Event, Market } from '../src/types/discovery.ts';

// Organizers who answered the October outreach. Each gets a profile before we reply with its link.
const profiles: Record<string, string> = {
  'montgomery-on-the-bow-bia': 'Montgomery on the Bow Business Improvement Area',
  'lake-bonavista-community-association': 'Lake Bonavista Community Association',
  'calgary-reggaefest': 'Calgary ReggaeFest',
  'calgary-allied-arts-foundation': 'Calgary Allied Arts Foundation',
  protospace: 'Protospace',
  'swintons-art-supplies': 'Swinton’s Art Supplies',
  'polaris-centre-for-the-performing-arts': 'Polaris Centre for the Performing Arts',
  'greenview-industrial-bia': 'Greenview Industrial Business Improvement Area',
  'carifest-calgary': 'Carifest Calgary',
};
// Reviewed sources whose listings must resolve to the organizer's profile, with record counts.
const sources: Record<string, number> = {
  'montgomery-on-the-bow-bia': 1,
  'lake-bonavista-community-association': 1,
  'calgary-reggaefest': 1,
  protospace: 7,
};

const root = new URL('../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');
const editorial = JSON.parse(read('src/content/editorial-inventory.json')) as { entities: DiscoveryEntity[] };
const generated = JSON.parse(read('src/generated/discovery-index.json')) as { entities: DiscoveryEntity[]; occurrences: [] };
const reviewed = JSON.parse(read('scripts/discovery/reviewed-sources.json')) as Array<{ source: { id: string; hosts: string[] }; records: Array<{ id: string; input: { organizer: string; sourceUrl: string } }> }>;
const repository = createDiscoveryRepository(generated.entities, generated.occurrences);
const shell = '<html><head><title>CalgaryWatch</title></head><body><div id="root"></div></body></html>';

describe('October 28 organizer profiles', () => {
  for (const [slug, title] of Object.entries(profiles)) {
    it(`${title} is one published, unclaimed profile with a free claim page`, () => {
      const id = `biz-${slug}`;
      const authored = editorial.entities.filter(e => e.id === id || (e.kind === 'business' && e.title === title));
      assert.equal(authored.length, 1);
      assert.deepEqual(generated.entities.filter(e => e.id === id), authored);
      const org = authored[0] as Business;
      assert.equal(org.status, 'published');
      assert.equal(org.claimed, false, 'never claimed on the organizer’s behalf');
      assert.equal(org.verification, 'source-checked');
      assert.ok(org.sources.some(s => s.kind === 'official'));
      assert.ok(publishedInventory(org, new Date('2026-10-28T12:00:00Z')), 'visible now, not stamped in the future');
      const found = repository.find('business', slug) as Business | undefined;
      assert.ok(found);
      assert.equal(entityPath(found), `/local/${slug}`);
      const html = renderRouteHtml(shell, `/claim/${id}`, 'https://calgarywatch.ca');
      assert.ok(html.includes(`<title>Claim ${title} | CalgaryWatch</title>`));
      assert.doesNotMatch(html, /Listing unavailable|Page not found/);
    });
  }

  it('links every reviewed listing to its organizer’s profile', () => {
    for (const [sourceId, count] of Object.entries(sources)) {
      const source = reviewed.find(s => s.source.id === sourceId);
      assert.ok(source, sourceId);
      assert.equal(source.records.length, count);
      for (const { input } of source.records) assert.ok(source.source.hosts.includes(new URL(input.sourceUrl).hostname));
      const listings = generated.entities.filter((e): e is Event | Market => (e.kind === 'event' || e.kind === 'market') && (e as Event).sourceId === sourceId);
      assert.equal(listings.length, count, sourceId);
      for (const listing of listings) {
        assert.equal(organizerProfile(listing as Event, generated.entities)?.id, `biz-${sourceId}`);
        assert.ok(publishedInventory(listing, new Date('2026-10-28T12:00:00Z')));
      }
      const stripped = generated.entities.map(e => (e as Event).sourceId === sourceId ? { ...e, organizerEntityId: undefined } : e);
      for (const e of associateOrganizers(stripped).filter(e => (e as Event).sourceId === sourceId)) assert.equal((e as Event).organizerEntityId, `biz-${sourceId}`);
    }
  });

  it('carries the dates the organizers sent', () => {
    const light = generated.entities.find((e): e is Event => e.kind === 'event' && e.sourceRecordId === 'light-up-montgomery-2026')!;
    assert.deepEqual([light.start, light.end, light.pricing], ['2026-11-14T17:00:00-06:00', '2026-11-14T20:00:00-06:00', 'free']);
    const reggae = generated.entities.find((e): e is Event => e.kind === 'event' && e.sourceRecordId === 'reggaefest-2027')!;
    assert.deepEqual([reggae.start, reggae.end, reggae.schedulePrecision], ['2027-08-27T00:00:00-06:00', '2027-08-29T00:00:00-06:00', 'date']);
    const tuesdays = generated.entities.filter((e): e is Event => e.kind === 'event' && e.sourceId === 'protospace');
    for (const e of tuesdays) {
      assert.equal(new Date(e.start).getUTCDay(), 3, 'Tuesday 7 p.m. MST is Wednesday in UTC');
      assert.equal(e.pricing, 'free');
    }
    assert.equal(organizerEvents('biz-protospace', generated.entities, Date.parse('2026-10-28T12:00:00-06:00')).length, 7);
  });
});
