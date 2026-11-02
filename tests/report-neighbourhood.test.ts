import test from 'node:test';
import assert from 'node:assert/strict';
import { CALGARY_COMMUNITIES } from '../src/data/calgaryCommunities';
import { displayCommunity, matchCommunities, nearestFallbackCentre, resolveReportNeighbourhood } from '../src/lib/reportNeighbourhood';
import type { CommunityBoundary } from '../src/lib/communityLookup';

const square = (name: string, lng: number, lat: number): CommunityBoundary => ({
  name, bbox: [lng - 0.01, lat - 0.01, lng + 0.01, lat + 0.01],
  polygons: [[[[lng - 0.01, lat - 0.01], [lng + 0.01, lat - 0.01], [lng + 0.01, lat + 0.01], [lng - 0.01, lat + 0.01], [lng - 0.01, lat - 0.01]]]],
});

test('a pin inside a City polygon gets that community, spelled like the bundled list', async () => {
  const got = await resolveReportNeighbourhood(51.12, -114.2, async () => [square('ranchlands', -114.2, 51.12), square('bridgeland/riverside', -114.04, 51.06)]);
  assert.deepEqual(got, { name: 'Ranchlands', exact: true });
  const br = await resolveReportNeighbourhood(51.06, -114.04, async () => [square('bridgeland/riverside', -114.04, 51.06)]);
  assert.equal(br.name, 'Bridgeland/Riverside');
});

test('outside every polygon resolves to nothing, so the reporter picks', async () => {
  assert.deepEqual(await resolveReportNeighbourhood(51.29, -114.01, async () => [square('ranchlands', -114.2, 51.12)]), { name: '', exact: true });
});

test('without boundaries it falls back to the bundled centres', async () => {
  assert.deepEqual(await resolveReportNeighbourhood(51.0381, -114.068, async () => []), { name: 'Beltline', exact: false });
  assert.deepEqual(await resolveReportNeighbourhood(51.0381, -114.068, async () => { throw Error('offline'); }), { name: 'Beltline', exact: false });
  assert.equal(nearestFallbackCentre(51.5, -113), '');
});

test('every fallback centre name is a real community', () => {
  const names = new Set(CALGARY_COMMUNITIES.map(c => c.name));
  for (const [lat, lng] of [[51.0478, -114.0625], [51.0603, -114.0903], [51.0602, -114.0412], [51.1494, -113.967], [50.9083, -113.9534], [51.1303, -114.1827]]) {
    assert.ok(names.has(nearestFallbackCentre(lat, lng)), nearestFallbackCentre(lat, lng));
  }
});

test('typing finds communities by prefix, word and alias', () => {
  assert.equal(matchCommunities('hill')[0].name, 'Hillhurst');
  assert.ok(matchCommunities('ridge').some(c => c.name === 'Saddle Ridge'));
  const k = matchCommunities('kensington');
  assert.ok(k.length && k.every(c => c.via === 'kensington'));
  assert.deepEqual(matchCommunities('  '), []);
  assert.equal(displayCommunity('mckenzie towne'), 'McKenzie Towne');
});
