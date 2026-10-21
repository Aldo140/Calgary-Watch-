import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { bestPicks, correctQuery, daysFor, expandAbbreviations, parseListingQuery, searchListings, serviceFor, stem } from '../src/lib/listingSearch';
import type { DiscoveryEntity, MarketOccurrence } from '../src/types/discovery';

// Thursday 2026-10-15, 10:00 in Calgary.
const NOW = new Date('2026-10-15T16:00:00Z');
const base = { summary: '', description: '', categories: [], tags: [], sources: [], status: 'published', verification: 'source-checked', updatedAt: '2026-10-01' };
const event = (id: string, title: string, start: string, more: object = {}) => ({
  ...base, id, slug: id, kind: 'event', title, start, end: start.replace(/T(\d\d)/, (_, h) => `T${String(Number(h) + 2).padStart(2, '0')}`),
  timezone: 'America/Edmonton', pricing: 'paid', organizer: 'x', address: '', ...more,
}) as unknown as DiscoveryEntity;
const ENTITIES: DiscoveryEntity[] = [
  event('jazz', 'Jazz at the Lantern', '2026-10-17T02:00:00Z', { neighbourhood: 'Kensington', tags: ['music'] }),
  event('jazz-later', 'Late Jazz Session', '2026-10-24T02:00:00Z', { tags: ['music'] }),
  event('free-sat', 'Free Family Skate', '2026-10-17T18:00:00Z', { pricing: 'free', tags: ['family'] }),
  event('ended', 'Jazz Brunch', '2026-10-10T18:00:00Z'),
  { ...base, id: 'mkt', slug: 'mkt', kind: 'market', title: 'Hillhurst Sunnyside Farmers’ Market', neighbourhood: 'Kensington', amenities: [], organizer: 'x', vendorIds: [], images: [], address: '' } as unknown as DiscoveryEntity,
  { ...base, id: 'cafe', slug: 'cafe', kind: 'business', title: 'Higher Ground', name: 'Higher Ground', summary: 'Neighbourhood coffee house', categories: ['food'], tags: ['cafe'], neighbourhood: 'Kensington', services: [], images: [], socials: {}, claimed: false, partner: false, editorialSelection: false, address: '' } as unknown as DiscoveryEntity,
  { ...base, id: 'ramsay', slug: 'ramsay', kind: 'neighbourhood', title: 'Ramsay', summary: 'Panoramic views from the hill', quadrant: 'SE', entityIds: [] } as unknown as DiscoveryEntity,
  { ...base, id: 'nb', slug: 'kensington', kind: 'neighbourhood', title: 'Kensington', quadrant: 'NW', entityIds: [] } as unknown as DiscoveryEntity,
];
const OCC: MarketOccurrence[] = [{ id: 'o1', marketId: 'mkt', start: '2026-10-22T00:00:00Z', end: '2026-10-22T03:00:00Z', timezone: 'America/Edmonton', cancelled: false, source: { name: 'x', url: 'x', kind: 'official' } }];
const ids = (q: string) => Object.values(searchListings(ENTITIES, OCC, q, NOW).groups).flat().map(e => e!.id);

describe('listing search', () => {
  it('reads time words, "free" and kind words out of the query', () => {
    assert.deepEqual(parseListingQuery('free things to do this weekend'), { words: [], kinds: [], when: 'this-weekend', free: true });
    assert.deepEqual(parseListingQuery('farmers markets saturday').when, 'saturday');
    assert.deepEqual(parseListingQuery('events in Kensington'), { words: ['kensington'], kinds: ['event'], when: undefined, free: false });
    assert.equal(stem('markets'), 'market'); assert.equal(stem('galleries'), 'gallery'); assert.equal(stem('glass'), 'glass');
  });
  it('turns time words into Calgary calendar days', () => {
    assert.deepEqual(daysFor('this-weekend', NOW), ['2026-10-16', '2026-10-18']);
    assert.deepEqual(daysFor('saturday', NOW), ['2026-10-17', '2026-10-17']);
    assert.deepEqual(daysFor('tomorrow', NOW), ['2026-10-16', '2026-10-16']);
  });
  it('ranks title matches first, soonest first, and drops ended listings', () => {
    assert.deepEqual(ids('jazz'), ['jazz', 'jazz-later']);
  });
  it('filters by time and price', () => {
    assert.deepEqual(ids('free this weekend'), ['free-sat']);
    assert.deepEqual(ids('jazz this weekend'), ['jazz']);
    assert.deepEqual(ids('markets wednesday'), ['mkt']);
    assert.deepEqual(ids('markets saturday'), []);
  });
  it('leads with the kind the person named but keeps the rest', () => {
    const r = searchListings(ENTITIES, OCC, 'events in kensington', NOW);
    assert.equal(Object.keys(r.groups)[0], 'event');
    assert.ok(r.groups.neighbourhood?.length && r.groups.business?.length);
  });
  it('forgives plurals, typos and synonyms', () => {
    assert.ok(ids('kensinton').includes('nb'));
    assert.ok(ids('coffee').includes('cafe'));
    assert.ok(ids('concerts').includes('jazz'));
    assert.ok(ids('kids').includes('free-sat'));
  });
  it('treats a community name as a place, not keywords', () => {
    assert.deepEqual(ids('panorama hills'), []);
    assert.deepEqual(ids('panoramic hill'), ['ramsay']);
  });
  it('falls back to the closest matches and suggests a spelling', () => {
    const r = searchListings(ENTITIES, OCC, 'jazz helicopter', NOW);
    assert.equal(r.partial, true);
    assert.equal(correctQuery('jaz lanturn', ENTITIES), 'jaz lantern');
    assert.equal(correctQuery('kensingtn', ENTITIES), 'kensington');
    assert.deepEqual(searchListings(ENTITIES, OCC, '   ', NOW).total, 0);
  });

  it('spells out short forms and keeps three letters a whole word', () => {
    assert.equal(expandAbbreviations('ATP'), 'alberta theatre projects');
    assert.equal(expandAbbreviations('jazz'), 'jazz');
    const atp = { ...base, id: 'atp', slug: 'atp', kind: 'business', title: 'Alberta Theatre Projects', name: 'Alberta Theatre Projects', categories: ['arts'], tags: ['theatre'], services: [], images: [], socials: {}, claimed: false, partner: false, editorialSelection: false, address: '' } as unknown as DiscoveryEntity;
    const photo = event('photo', 'Holiday Photos with Santa', '2026-10-20T18:00:00Z', { tags: ['photo'] });
    assert.deepEqual(Object.values(searchListings([atp, photo], [], 'atp', NOW).groups).flat().map(e => e!.id), ['atp']);
    assert.equal(searchListings([atp, photo], [], 'pho', NOW).total, 0, '"pho" is soup, not photos');
    assert.equal(searchListings([atp, photo], [], 'phot', NOW).total, 1);
  });

  it('answers "best …" from listed places only, and names the Local service', () => {
    assert.deepEqual(bestPicks(ENTITIES, OCC, 'coffee', NOW).map(e => e.id), ['cafe']);
    assert.deepEqual(bestPicks(ENTITIES, OCC, 'jazz', NOW), [], 'events are not places to rank');
    assert.equal(serviceFor('plumbers')?.id, 'plumbing');
    assert.equal(serviceFor('snow removal')?.id, 'snow');
    assert.equal(serviceFor('window cleaners'), undefined, 'not house cleaning');
    assert.equal(serviceFor('pho'), undefined);
  });
});
