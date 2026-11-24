import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import type { DiscoveryEntity } from '../src/types/discovery.ts';

const root = new URL('../', import.meta.url);
const read = (path: string) => JSON.parse(readFileSync(new URL(path, root), 'utf8'));
const editorial = read('src/content/editorial-inventory.json') as { entities: DiscoveryEntity[] };
const generated = read('src/generated/discovery-index.json') as { entities: DiscoveryEntity[] };
const reviewed = read('scripts/discovery/reviewed-sources.json') as Array<{ source: { id: string }; records: Array<{ id: string; input: any }> }>;

describe('November 24 replies', () => {
  it("St. Andrew's Anglican has a profile and the three Christmas services Emma confirmed", () => {
    const church = editorial.entities.find(e => e.id === 'biz-st-andrews-anglican-church')!;
    assert.equal((church as any).claimed, false);
    assert.deepEqual(generated.entities.find(e => e.id === church.id), church);
    const records = reviewed.find(s => s.source.id === 'st-andrews-anglican-church')!.records.map(r => r.input);
    assert.deepEqual(records.map(r => [r.start, r.end]), [
      ['2026-12-24T16:00:00-06:00', '2026-12-24T17:00:00-06:00'],
      ['2026-12-24T19:00:00-06:00', '2026-12-24T21:00:00-06:00'],
      ['2026-12-25T10:00:00-06:00', '2026-12-25T11:00:00-06:00'],
    ]);
    for (const r of records) assert.equal(r.address, "1611 St. Andrew's Place NW, Calgary, AB");
  });
});

describe('November 24 replies, afternoon', () => {
  it('Arch & Bow Exteriors asked to be listed under fences and decks', () => {
    const biz = editorial.entities.find(e => e.id === 'biz-arch-and-bow-exteriors') as any;
    assert.equal(biz.status, 'published');
    assert.ok(!biz.awaitingClaim, 'the owner asked for the listing, so it is live now');
    assert.ok(biz.tags.includes('fence builder') && biz.tags.includes('deck builder'));
    assert.deepEqual(generated.entities.find(e => e.id === biz.id), biz);
  });
});
