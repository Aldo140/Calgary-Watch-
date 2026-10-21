import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canonicalNeighborhood, looksLikeStreetAddress, readHomeArea } from '../src/lib/homeArea';
import { plansAreaPatch } from '../src/lib/plansSetup';
import { interestSupply, tallyAreas, tallyPlans } from '../src/lib/memberInsights';
import { buildDigestSummary } from '../src/lib/digest';
import type { DiscoveryEntity } from '../src/types/discovery';

test('home areas read the way members type them', () => {
  assert.deepEqual(readHomeArea('copperfield'), { kind: 'community', name: 'Copperfield', quadrant: 'SE' });
  assert.deepEqual(readHomeArea('Seton SE'), { kind: 'community', name: 'Seton', quadrant: 'SE' });
  assert.deepEqual(readHomeArea('Varsity, Calgary AB'), { kind: 'community', name: 'Varsity', quadrant: 'NW' });
  assert.deepEqual(readHomeArea('panorama'), { kind: 'community', name: 'Panorama Hills', quadrant: 'NW' });
  assert.deepEqual(readHomeArea('Cochrane'), { kind: 'nearby', name: 'Cochrane' });
  assert.deepEqual(readHomeArea('8948 elbow drive'), { kind: 'address' });
  assert.deepEqual(readHomeArea('somewhere new'), { kind: 'other', name: 'Somewhere New' });
  assert.equal(readHomeArea('  '), null);
});

test('street addresses are told apart from community names with numbers or street words', () => {
  for (const a of ['8948 elbow drive', '123 Main St SW', '12a 17 Ave SE', 'Unit 4 220 Seton Way SE']) assert.equal(looksLikeStreetAddress(a), true, a);
  for (const a of ['Beltline', 'Elbow Park', 'Signal Hill', 'Panorama Hills', 'Mission', 'Country Hills Village']) assert.equal(looksLikeStreetAddress(a), false, a);
});

test('saved neighbourhoods get their proper spelling; aliases and unknown names keep the reader’s words', () => {
  assert.equal(canonicalNeighborhood('copperfield'), 'Copperfield');
  assert.equal(canonicalNeighborhood('EVERGREEN'), 'Evergreen');
  assert.equal(canonicalNeighborhood('Kensington'), 'Kensington');
  assert.equal(canonicalNeighborhood('marda loop'), 'Marda Loop');
  assert.equal(canonicalNeighborhood('Sunalta, Calgary'), 'Sunalta');
});

test('a street address typed in the neighbourhood box is saved as the address', () => {
  const draft = { neighborhood: '8948 elbow drive', address: '', inferredNeighborhood: '', consent: true };
  const patch = plansAreaPatch(draft, null, 5);
  assert.equal(patch.neighborhood, '');
  assert.equal(patch.address, '8948 elbow drive');
  assert.equal(patch.locationPreferenceType, 'address');
  assert.equal(patch.piiConsentAt, 5);
  assert.equal(plansAreaPatch({ ...draft, neighborhood: 'copperfield' }, null, 5).neighborhood, 'Copperfield');
  // An address already given wins; the typed area stays an area.
  assert.equal(plansAreaPatch({ ...draft, neighborhood: 'Seton', address: '1 Seton Way SE' }, null, 5).neighborhood, 'Seton');
});

test('the Monday briefing never prints a street address as the area name', () => {
  const now = Date.parse('2026-10-20T15:00:00Z');
  const summary = buildDigestSummary({ incidents: [], profile: { uid: 'u', neighborhood: '8948 elbow drive' }, now } as Parameters<typeof buildDigestSummary>[0]);
  assert.doesNotMatch(JSON.stringify(summary), /8948/);
  const lower = buildDigestSummary({ incidents: [], profile: { uid: 'u', neighborhood: 'copperfield' }, now } as Parameters<typeof buildDigestSummary>[0]);
  assert.match(JSON.stringify(lower), /Copperfield/);
});

test('plans split into coming up and already happened, keeping their dates', () => {
  const now = Date.parse('2026-10-21T06:00:00Z');
  const { upcoming, past } = tallyPlans([
    { eventId: 'a', start: '2026-10-25T19:00:00-06:00' },
    { eventId: 'a', start: '2026-10-25T19:00:00-06:00' },
    { eventId: 'b', start: '2026-10-22T19:00:00-06:00' },
    { eventId: 'c', start: '2026-10-04T10:00:00-06:00' },
    { eventId: 'd', start: '' },
    { start: '2026-10-25' },
  ], now);
  assert.deepEqual(upcoming.map((p) => [p.id, p.count]), [['a', 2], ['b', 1], ['d', 1]]);
  assert.deepEqual(past.map((p) => [p.id, p.count, p.start]), [['c', 1, '2026-10-04T10:00:00-06:00']]);
});

test('home-area tally merges spellings, counts addresses without naming them, and groups by quadrant', () => {
  const t = tallyAreas([
    { neighborhood: 'Varsity' }, { neighborhood: 'varsity' }, { inferredNeighborhood: 'Varsity' },
    { neighborhood: 'copperfield' }, { neighborhood: '8948 elbow drive' }, { neighborhood: 'Cochrane' }, { neighborhood: '' },
  ]);
  assert.deepEqual(t.areas, [['Varsity', 3], ['Cochrane', 1], ['Copperfield', 1], ['Street address (hidden)', 1]]);
  assert.equal(t.addresses, 1);
  assert.doesNotMatch(JSON.stringify(t), /elbow/i);
  assert.deepEqual(Object.fromEntries(t.quadrants), { NW: 3, SE: 1, 'Outside Calgary': 1, Unplaced: 1 });
});

test('interest supply counts dated listings in the next two weeks, markets by their dates', () => {
  const now = Date.parse('2026-10-21T06:00:00Z');
  const base = { summary: '', description: '', tags: [], sources: [], status: 'published', verification: 'source-checked', updatedAt: '' };
  const entities = [
    { ...base, kind: 'event', id: 'e1', slug: 'e1', title: 'Park walk', categories: ['outdoors'], pricing: 'free', start: '2026-10-24T10:00:00-06:00', end: '2026-10-24T12:00:00-06:00', cancelled: false },
    { ...base, kind: 'event', id: 'e2', slug: 'e2', title: 'Later walk', categories: ['outdoors'], pricing: 'free', start: '2026-12-24T10:00:00-06:00', end: '2026-12-24T12:00:00-06:00', cancelled: false },
    { ...base, kind: 'market', id: 'm1', slug: 'm1', title: 'Market', categories: ['markets'] },
    { ...base, kind: 'market', id: 'm2', slug: 'm2', title: 'Closed market', categories: ['markets'] },
  ] as unknown as DiscoveryEntity[];
  const supply = interestSupply(entities, [{ marketId: 'm1', start: '2026-10-25T09:00:00-06:00', end: '2026-10-25T14:00:00-06:00' }], now);
  assert.equal(supply.get('outdoors'), 1);
  assert.equal(supply.get('free'), 1);
  assert.equal(supply.get('markets'), 1);
});
