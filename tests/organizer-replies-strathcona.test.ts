import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import domain from '../functions/discovery-domain.cjs';
import { associateOrganizers } from '../src/lib/organizations.ts';
import { publishedInventory } from '../src/lib/discoveryPublication.ts';
import type { Business, DiscoveryEntity } from '../src/types/discovery.ts';

const root = new URL('../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');
const editorial = JSON.parse(read('src/content/editorial-inventory.json')) as { entities: DiscoveryEntity[] };
const reviewed = JSON.parse(read('scripts/discovery/reviewed-sources.json')) as Array<{ source: { id: string; hosts: string[] }; records: Array<{ id: string; input: Record<string, unknown> & { sourceUrl: string } }> }>;

// Sherry Norman replied to the Oct 26 outreach with the events page and the Dec 5 craft fair.
describe('Strathcona Community Association reply', () => {
  const org = editorial.entities.find(e => e.id === 'biz-strathcona-community-association') as Business;

  it('is one published, unclaimed, source-checked profile', () => {
    assert.ok(org);
    assert.equal(editorial.entities.filter(e => e.kind === 'business' && e.title === org.title).length, 1);
    assert.equal(org.claimed, false);
    assert.equal(org.verification, 'source-checked');
    assert.ok(publishedInventory(org, new Date('2026-10-28T20:00:00Z')));
  });

  it('compiles the Christmas Craft Fair and links it to the profile', () => {
    const batch = reviewed.find(b => b.source.id === 'strathcona-community-association')!;
    assert.equal(batch.records.length, 1);
    const [record] = batch.records;
    assert.ok(batch.source.hosts.includes(new URL(record.input.sourceUrl).hostname));
    const { entity, occurrences } = domain.normalizeRecord(record.input, batch.source, record.id, '2026-10-28T19:40:00.000Z');
    assert.equal(entity.kind, 'market');
    assert.deepEqual(occurrences.map((o: { start: string; end: string }) => [o.start, o.end]), [['2026-12-05T10:00:00-07:00', '2026-12-05T16:00:00-07:00']]);
    const [linked] = associateOrganizers([{ ...entity, status: 'published' }, org]) as Array<{ organizerEntityId?: string }>;
    assert.equal(linked.organizerEntityId, org.id);
  });

  it('describes Trickster Theatre as school programs, not public shows', () => {
    const trickster = editorial.entities.find(e => e.id === 'biz-trickster-theatre') as Business;
    assert.match(trickster.description, /no public performances/);
    assert.ok(!trickster.categories.includes('family'));
  });
});

// Oct 28 evening replies: Amanda Lovig Hagg sent the MAG Holiday Market; Two Rivers' founder said the distillery burned down in June.
describe('Meadowlark Park and Two Rivers replies', () => {
  const org = editorial.entities.find(e => e.id === 'biz-meadowlark-park-community-association') as Business;

  it('publishes the Meadowlark Park profile and the MAG Holiday Market at its hall', () => {
    assert.ok(publishedInventory(org, new Date('2026-10-28T21:00:00Z')));
    const batch = reviewed.find(b => b.source.id === 'meadowlark-park-community-association')!;
    const [record] = batch.records;
    const { entity, occurrences } = domain.normalizeRecord(record.input, batch.source, record.id, '2026-10-28T20:50:00.000Z');
    assert.equal(entity.kind, 'market');
    assert.deepEqual(occurrences.map((o: { start: string; end: string }) => [o.start, o.end]), [['2026-12-05T12:00:00-07:00', '2026-12-05T20:00:00-07:00']]);
    // MAG runs the market; the association hosts it, so the organizer stays MAG.
    assert.equal(entity.organizer, 'MAG Holiday Market');
    assert.equal(entity.venue, 'Meadowlark Park Community Hall');
  });

  it('takes the Two Rivers Distillery profile down', () => {
    const twoRivers = editorial.entities.find(e => e.id === 'biz-two-rivers-distillery')!;
    assert.equal(twoRivers.status, 'archived');
    assert.ok(!publishedInventory(twoRivers));
  });
});
