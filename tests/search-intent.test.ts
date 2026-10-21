import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calgaryMidnight, categoriesFor, communityByStreetPrefix, editDistance, parseSearchIntent, reportsForIntent, streetLookupUrls, summarizeStreetRows, timeWindow } from '../src/lib/searchIntent';
import type { Incident } from '../src/types';

// Sat Oct 10 2026, 11:47 p.m. in Calgary (MDT, UTC-6).
const NOW = Date.parse('2026-10-11T05:47:00Z');
const names = (q: string) => parseSearchIntent(q, NOW).communities.map(c => c.community.name);

test('real searches from the admin page find the neighbourhood', () => {
  assert.deepEqual(names('panorama hills'), ['Panorama Hills']);
  assert.deepEqual(names('seton'), ['Seton']);
  assert.deepEqual(names('ranchlands'), ['Ranchlands']);
  assert.deepEqual(names('spring bank hill'), ['Springbank Hill']);
  assert.deepEqual(names('coral springs ne news'), ['Coral Springs']);
  assert.deepEqual(names('helicopter circling coral springs'), ['Coral Springs']);
  assert.deepEqual(names('Panaroma Hills'), ['Panorama Hills'], 'a transposed letter still lands');
  assert.deepEqual(names('kensington'), ['Hillhurst'], 'what people call it, not just the official name');
});

test('non-place words never turn into a community', () => {
  for (const q of ['zoo', 'cspace', 'yesterday police', 'why so much police active tonight', 'lockdowns', 'crime reports', 'yesterday', 'jazz', 'farmers market', 'family events']) {
    assert.deepEqual(names(q), [], q);
  }
});

test('streets are read as streets, with the community they are probably in', () => {
  const close = parseSearchIntent('coppersome close', NOW).street;
  assert.equal(close?.name, 'COPPERSOME');
  assert.equal(close?.suffix, 'CL');
  assert.equal(close?.likely?.community.name, 'Copperfield');
  assert.equal(parseSearchIntent('copperstone', NOW).street?.likely?.community.name, 'Copperfield');
  const apple = parseSearchIntent('applestone place', NOW);
  assert.equal(apple.street?.suffix, 'PL');
  assert.equal(apple.street?.likely?.community.name, 'Applewood Park');
  const wood = parseSearchIntent('applewood place', NOW);
  assert.deepEqual(wood.communities, [], 'a community word plus a suffix is a street there');
  assert.equal(wood.street?.likely?.community.name, 'Applewood Park');
  const house = parseSearchIntent('123 Seton Way SE', NOW).street;
  assert.equal(house?.houseNumber, '123');
  assert.equal(house?.likely?.community.name, 'Seton');
  assert.equal(parseSearchIntent('zoo', NOW).street, null);
  assert.equal(communityByStreetPrefix('sun'), undefined, 'too short to guess');
});

test('time and topic words are understood', () => {
  const y = parseSearchIntent('yesterday police', NOW);
  assert.equal(y.time?.key, 'yesterday');
  assert.deepEqual(y.topics, ['police']);
  assert.equal(y.time?.to, calgaryMidnight(NOW));
  assert.equal(y.time!.to - y.time!.from, 24 * 3_600_000);
  const t = parseSearchIntent('why so much police active tonight', NOW);
  assert.equal(t.time?.key, 'tonight');
  assert.ok(t.question);
  assert.deepEqual(parseSearchIntent('lockdowns', NOW).topics, ['lockdown']);
  assert.deepEqual(parseSearchIntent('helicopter circling coral springs', NOW).topics, ['helicopter']);
  assert.deepEqual(categoriesFor(parseSearchIntent('crime reports', NOW).topics), ['crime', 'emergency']);
  assert.equal(categoriesFor(parseSearchIntent('coral springs ne news', NOW).topics), null);
});

test('calgary midnight and tonight use Calgary time, not the browser', () => {
  assert.equal(new Date(calgaryMidnight(NOW)).toISOString(), '2026-10-10T06:00:00.000Z');
  assert.equal(new Date(timeWindow('tonight', NOW).from).toISOString(), '2026-10-10T23:00:00.000Z');
  const early = Date.parse('2026-10-11T08:30:00Z'); // 2:30 a.m. Calgary: still "tonight" from 5 p.m.
  assert.equal(new Date(timeWindow('tonight', early).from).toISOString(), '2026-10-10T23:00:00.000Z');
});

const inc = (id: string, over: Partial<Incident>): Incident => ({
  id, title: 't', description: '', category: 'crime', neighborhood: 'Beltline', lat: 51.03, lng: -114.07, timestamp: NOW - 3_600_000,
  name: 'x', verified_status: 'unverified', report_count: 1, ...over,
} as Incident);

test('reports are narrowed by place, topic and time', () => {
  const list = [
    inc('a', { neighborhood: 'SETON', timestamp: NOW - 2 * 3_600_000 }),
    inc('b', { neighborhood: 'Seton, Calgary', category: 'traffic', timestamp: NOW - 3_600_000 }),
    inc('c', { neighborhood: 'Coral Springs', title: 'Police helicopter assisting', timestamp: NOW - 30 * 3_600_000 }),
    inc('d', { neighborhood: 'Beltline', timestamp: NOW - 26 * 3_600_000 }),
    inc('e', { neighborhood: 'Coral Springs', timestamp: NOW - 2 * 3_600_000 }),
  ];
  assert.deepEqual(reportsForIntent(list, parseSearchIntent('seton', NOW), NOW).reports.map(r => r.id), ['b', 'a']);
  assert.deepEqual(reportsForIntent(list, parseSearchIntent('yesterday police', NOW), NOW).reports.map(r => r.id), ['c', 'd']);
  const heli = reportsForIntent(list, parseSearchIntent('helicopter circling coral springs', NOW), NOW);
  assert.deepEqual(heli.reports.map(r => r.id), ['c', 'e'], 'the post that mentions a helicopter leads');
  const empty = reportsForIntent(list, parseSearchIntent('ranchlands', NOW), NOW);
  assert.deepEqual(empty.reports, []);
  const widened = reportsForIntent(list, parseSearchIntent('coral springs last night', NOW), NOW);
  assert.equal(widened.widened, true, 'an empty window falls back to the latest reports there');
});

test('street lookup forgives a typo and names the community', () => {
  const urls = streetLookupUrls(parseSearchIntent('coppersome close', NOW).street!);
  assert.equal(urls.length, 2);
  assert.match(decodeURIComponent(urls[0]), /address like '% COPPERSOME CL %'/);
  assert.match(decodeURIComponent(urls[1]), /address like '% COPPERS% CL %'/);
  const answer = summarizeStreetRows([
    { address: '12 COPPERSTONE CL SE', comm_name: 'COPPERFIELD' },
    { address: '14 COPPERSTONE CL SE', comm_name: 'COPPERFIELD' },
    { address: '3 COPPERSMITH CL SE', comm_name: 'COPPERFIELD' },
  ], parseSearchIntent('coppersome close', NOW).street!);
  assert.deepEqual(answer, { street: 'Copperstone Close SE', community: 'Copperfield', quadrant: 'SE', addresses: 2 });
  assert.match(decodeURIComponent(streetLookupUrls({ typed: '', name: "O'BRIEN%", suffix: 'ST' })[0]), /'% O''BRIEN ST %'/, 'quotes escaped, wildcards dropped');
});

test('edit distance is capped', () => {
  assert.equal(editDistance('seton', 'setno'), 1);
  assert.equal(editDistance('abcdefgh', 'zzzzzzzz', 2), 3);
});

test('Oct 21 zero-result searches: Lynnwood is in Ogden, "westside" is the rec centre', () => {
  assert.deepEqual(names('lynnwood'), ['Ogden']);
  assert.deepEqual(names('lynn wood'), ['Ogden']);
  assert.deepEqual(names('millican'), ['Ogden']);
  const west = parseSearchIntent('westside', NOW);
  assert.equal(west.landmark?.name, 'Westside Recreation Centre');
  assert.deepEqual(west.communities, []);
  assert.equal(west.street, null);
  assert.equal(parseSearchIntent('westside rec', NOW).landmark?.name, 'Westside Recreation Centre');
  assert.equal(parseSearchIntent('westgate', NOW).landmark, undefined);
});

test('"best …" reads the thing asked for and leaves the place', () => {
  const best = (q: string) => parseSearchIntent(q, NOW).best?.thing;
  assert.equal(best('best pho'), 'pho');
  assert.equal(best('best pho places in calgary'), 'pho');
  assert.equal(best('top 10 pizza spots'), 'pizza');
  assert.equal(best('best window cleaners'), 'window cleaners');
  assert.equal(best('whats the best junk removal company'), 'junk removal');
  const local = parseSearchIntent('best pizza in beltline', NOW);
  assert.equal(local.best?.thing, 'pizza');
  assert.deepEqual(local.communities.map(c => c.community.name), ['Beltline']);
  assert.equal(parseSearchIntent('best pizza place', NOW).street, null, '"place" is not a street suffix here');
  assert.equal(best('police best'), undefined);
  assert.equal(best('best'), undefined);
});
