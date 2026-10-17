import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { boardRows, programmeOf, SHELVES, shelfOf } from '../src/lib/localShelves.ts';
import { initials } from '../src/components/discovery/LocalDirectory.tsx';
import { discoveryRepository } from '../src/data/discovery.ts';
import type { Business, DiscoveryEntity, Event } from '../src/types/discovery.ts';

const shop = (id: string, title: string, categories: string[], tags: string[] = []) => ({
  id, kind: 'business', slug: id, title, name: title, summary: '', description: '', categories, tags, sources: [], status: 'published',
  verification: 'source-checked', updatedAt: '2026-10-01T00:00:00Z', address: 'Calgary, AB', images: [], socials: {}, services: [],
  claimed: false, partner: false, editorialSelection: false,
}) as Business;

describe('Local shelves', () => {
  it('files each kind of profile on the shelf a Calgarian would look for it on', () => {
    assert.equal(shelfOf(shop('a', 'Vertigo Theatre', ['arts'], ['theatre'])), 'stages');
    assert.equal(shelfOf(shop('b', 'Calgary Opera', ['arts'], ['organization'])), 'stages');
    assert.equal(shelfOf(shop('c', 'Calgary Farmers’ Market', ['food', 'shopping'], ['organization'])), 'markets');
    assert.equal(shelfOf(shop('d', 'Acadia Community Association', ['markets', 'community'], ['organizer'])), 'community');
    assert.equal(shelfOf(shop('e', 'The Saskatoon Farm', ['markets', 'food', 'day-trip'], ['outside-calgary'])), 'day-trips');
    assert.equal(shelfOf(shop('f', 'Calgary Yuletide Festival Society', ['markets', 'community', 'holiday'])), 'seasonal');
    assert.equal(shelfOf(shop('g', 'Rosso Coffee Roasters', ['food', 'shopping'], ['coffee'])), 'coffee');
    assert.equal(shelfOf(shop('h', 'Heritage Park Historical Village', ['family', 'heritage'], ['organization'])), 'days-out');
    assert.equal(shelfOf(shop('i', 'Contemporary Calgary', ['arts'], ['organization'])), 'culture');
  });

  it('puts every published profile on a known shelf', () => {
    const ids = new Set(SHELVES.map(s => s.id));
    const profiles = discoveryRepository.list().filter((e): e is Business => e.kind === 'business');
    assert.ok(profiles.length > 0);
    for (const p of profiles) assert.ok(ids.has(shelfOf(p)), p.title);
  });

  it('gives each profile one row on the board, soonest first', () => {
    const now = Date.parse('2026-10-17T12:00:00-06:00');
    const ev = (id: string, org: string, start: string): Event => ({
      id, kind: 'event', slug: id, title: id, summary: '', description: '', categories: [], tags: [], sources: [{ name: org, url: 'https://example.org', kind: 'official' }], status: 'published', verification: 'source-checked',
      verifiedAt: '2026-10-17T00:00:00Z', updatedAt: '2026-10-17T00:00:00Z', address: '', start, end: start.replace('T19', 'T22'), timezone: 'America/Edmonton', pricing: 'unknown', organizer: org, organizerEntityId: org,
    });
    const a = shop('org-a', 'A', ['arts']); const b = shop('org-b', 'B', ['arts']);
    const all: DiscoveryEntity[] = [a, b, ev('a1', 'org-a', '2026-10-20T19:00:00-06:00'), ev('a2', 'org-a', '2026-10-18T19:00:00-06:00'), ev('b1', 'org-b', '2026-10-19T19:00:00-06:00')];
    const programmes = new Map([a, b].map(p => [p.id, programmeOf(p.id, all, [], now)]));
    assert.equal(programmes.get('org-a')!.count, 2);
    assert.deepEqual(boardRows([a, b], programmes).map(r => r.title), ['a2', 'b1']);
  });

  it('makes two-letter seals', () => {
    assert.equal(initials('Vertigo Theatre'), 'VT');
    assert.equal(initials('MAKERS'), 'MA');
    assert.equal(initials('The Confluence Historic Site & Parkland'), 'CH');
    assert.equal(initials('Rosso Coffee Roasters — Inglewood'), 'RC');
  });
});
