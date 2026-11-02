import { test } from 'node:test';
import assert from 'node:assert/strict';
import { discoveryRepository } from '../src/data/discovery';
import { buildSearchTrends, resolveDemandTerm, MIN_SEARCHES } from '../src/lib/searchTrendsBuild';
import { popularHref, primeByDemand, readTrends, tryChips } from '../src/lib/searchTrends';
import committed from '../src/generated/search-trends.json';

const all = discoveryRepository.list();
const occ = discoveryRepository.occurrences();
const now = new Date('2026-11-02T12:00:00Z');
const day = 86_400_000;
const at = (daysAgo: number) => now.getTime() - daysAgo * day;
const row = (q: string, daysAgo = 1, results = 3) => ({ q, results, ts: at(daysAgo) });

test('a term lands on the page the site names, under the site\'s own name', () => {
  assert.deepEqual(resolveDemandTerm('best pho', all, occ, now), { label: 'Best pho in Calgary', note: 'Best of Calgary', to: '/best/pho' });
  assert.equal(resolveDemandTerm('pho', all, occ, now)?.to, '/best/pho');
  assert.equal(resolveDemandTerm('car theft', all, occ, now)?.to, '/safety/car-theft');
  assert.equal(resolveDemandTerm('police tonight', all, occ, now)?.label, 'Police and safety tonight');
  const beltline = resolveDemandTerm('the beltline', all, occ, now);
  assert.equal(beltline?.label, 'Beltline');
  assert.equal(resolveDemandTerm('beltline', all, occ, now)?.to, beltline?.to);
  // A community without its own page goes to search, named officially.
  assert.equal(resolveDemandTerm('coral springs', all, occ, now)?.to, '/search?q=Coral%20Springs');
});

test('what someone typed never ships when it lands on nothing the site names', () => {
  for (const q of ['john smith', 'zzqx', 'my ex address', 'jo@x.ca', 'best', 'a']) {
    const d = resolveDemandTerm(q, all, occ, now);
    assert.ok(!d || d.label.toLowerCase() !== q, `${q} → ${d?.label}`);
  }
  const { file, unresolved } = buildSearchTrends([row('john smith'), row('john smith'), row('john smith')], all, occ, now);
  assert.deepEqual(file.items, []);
  assert.equal(unresolved[0].q, 'john smith');
  assert.equal(JSON.stringify(file).includes('john'), false);
});

test('spellings of one place count together; one search alone is not a trend', () => {
  const { file } = buildSearchTrends([row('beltline'), row('the beltline'), row('pho', 1)], all, occ, now);
  assert.equal(MIN_SEARCHES, 2);
  assert.deepEqual(file.items.map(i => i.label), ['Beltline']);
  assert.equal('searches' in file.items[0], false, 'counts stay out of the published file');
});

test('recent searches outrank old ones, and the window drops the oldest', () => {
  const rows = [
    row('pizza', 20), row('pizza', 21), row('pizza', 22),
    row('pho', 0), row('pho', 1),
    row('car theft', 45), row('car theft', 46), row('car theft', 47),
  ];
  const { file } = buildSearchTrends(rows, all, occ, now);
  assert.deepEqual(file.items.map(i => i.to), ['/best/pho', '/best/pizza']);
  assert.equal(file.windowDays, 30);
});

test('typeahead moves popular destinations up and keeps everything else in order', () => {
  const rank = (to: string) => ({ '/b': 0, '/d': 1 } as Record<string, number>)[to] ?? -1;
  const opts = ['/a', '/b', '/c', '/d', '/e'].map(to => ({ to }));
  assert.deepEqual(primeByDemand(opts, rank).map(o => o.to), ['/b', '/d', '/a', '/c', '/e']);
  assert.deepEqual(primeByDemand(opts, () => -1).map(o => o.to), ['/a', '/b', '/c', '/d', '/e']);
});

test('popular picks into /search are marked so they are not counted as demand again', () => {
  assert.equal(popularHref('/search?q=Coral%20Springs'), '/search?q=Coral%20Springs&via=popular');
  assert.equal(popularHref('/best/pho'), '/best/pho');
});

test('the hero chips lead with popular searches and top up with the fixed examples', () => {
  const TRY = ['Beltline', '17 Ave SW', 'police yesterday', 'jazz', 'Kensington', 'free this weekend'];
  const chips = tryChips([{ label: 'Beltline', note: 'Neighbourhood', to: '/neighbourhoods/beltline' }, { label: 'Best pho in Calgary', note: 'Best of Calgary', to: '/best/pho' }], TRY);
  assert.equal(chips.length, 6);
  assert.deepEqual(chips.slice(0, 2).map(c => c.to), ['/neighbourhoods/beltline', '/best/pho']);
  assert.equal(chips.filter(c => c.label === 'Beltline').length, 1);
  assert.equal(tryChips([], TRY).length, 6);
});

test('the committed and published file reads safely', () => {
  assert.ok(Array.isArray(readTrends(committed)));
  assert.deepEqual(readTrends({ items: [{ label: 'x', note: 'y', to: 'https://evil.example' }, { label: 'Ok', note: 'n', to: '/best', searches: 9 }, null] }), [{ label: 'Ok', note: 'n', to: '/best' }]);
  assert.deepEqual(readTrends(null), []);
});
