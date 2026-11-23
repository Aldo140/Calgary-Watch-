import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { directionsUrl } from '../src/lib/marketDays.ts';
import type { Business, DiscoveryEntity } from '../src/types/discovery.ts';

const root = new URL('../', import.meta.url);
const read = (path: string) => JSON.parse(readFileSync(new URL(path, root), 'utf8'));
const editorial = read('src/content/editorial-inventory.json') as { entities: DiscoveryEntity[] };
const generated = read('src/generated/discovery-index.json') as { entities: DiscoveryEntity[] };
const reviewed = read('scripts/discovery/reviewed-sources.json') as Array<{ source: { id: string }; records: Array<{ id: string; input: any }> }>;
const find = (id: string) => editorial.entities.find(e => e.id === id) as Business;

describe('November 23 replies', () => {
  it('Bike Root directions go to the northwest corner of the Arts Parkade, where the shop door is', () => {
    const bike = find('biz-bike-root');
    assert.deepEqual(bike.coordinates, { lat: 51.07532, lng: -114.13104 });
    assert.deepEqual(generated.entities.find(e => e.id === 'biz-bike-root'), bike);
    assert.equal(directionsUrl(bike), 'https://www.google.com/maps/dir/?api=1&destination=51.07532%2C-114.13104');
  });

  it('places without a pin still get directions by address', () => {
    assert.match(directionsUrl({ address: '3527 Boulton Rd NW, Calgary, AB', venue: 'Hope Lutheran Church' }), /destination=Hope%20Lutheran%20Church%2C%203527/);
  });

  it('Crossroads Community Church has a profile and its 6:30 p.m. Christmas Eve Candlelight service', () => {
    const church = find('biz-crossroads-community-church');
    assert.equal(church.claimed, false);
    assert.deepEqual(generated.entities.find(e => e.id === church.id), church);
    const event = reviewed.find(s => s.source.id === 'crossroads-community-church')!.records[0].input;
    assert.equal(event.start, '2026-12-24T18:30:00-06:00');
    assert.equal(event.organizer, 'Crossroads Community Church');
  });
});
