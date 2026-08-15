/**
 * The personal briefing's pure helpers.
 *
 * The briefing is the one screen printed with a person's name and their own
 * address, so a wrong number here is wrong about somebody's home. These cover
 * the two things most likely to go quietly wrong: the address normalisation
 * that decides whether we can locate them at all, and the band boundaries that
 * decide what we call their community.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { toRegistryAddress, splitAddressParts } from '../src/hooks/useHomeLocation.ts';
import {
  formatDistance,
  walkingMinutes,
  bandFor,
  briefingRef,
  greetingFor,
  sourceLabel,
  selectRing,
  WALK_M,
  WALK_MIN,
} from '../src/components/PersonalBriefing.tsx';

describe('toRegistryAddress', () => {
  it('turns a saved address back into the register key', () => {
    // What the autocomplete stores → what the city parcel register holds.
    assert.equal(toRegistryAddress('158 Saddlemead Gr Ne, Calgary'), '158 SADDLEMEAD GR NE');
    assert.equal(toRegistryAddress('201 23 Av NE, Calgary'), '201 23 AV NE');
  });

  it('works when the city suffix was never added', () => {
    assert.equal(toRegistryAddress('36 Martindale Cl Ne'), '36 MARTINDALE CL NE');
  });

  it('collapses stray whitespace rather than failing the exact-match lookup', () => {
    assert.equal(toRegistryAddress('  158   Saddlemead  Gr Ne , Calgary '), '158 SADDLEMEAD GR NE');
  });
});

describe('splitAddressParts', () => {
  it('splits a named street', () => {
    assert.deepEqual(splitAddressParts('158 SADDLEMEAD GR NE'), {
      house_number: '158', street_name: 'SADDLEMEAD', street_type: 'GR', street_quad: 'NE',
    });
  });

  it('splits a numbered street, where the name is itself a number', () => {
    assert.deepEqual(splitAddressParts('201 23 AV NE'), {
      house_number: '201', street_name: '23', street_type: 'AV', street_quad: 'NE',
    });
  });

  it('returns null rather than guessing when there is no quadrant', () => {
    assert.equal(splitAddressParts('201 23 AV'), null);
    assert.equal(splitAddressParts('NOT AN ADDRESS'), null);
  });
});

describe('formatDistance', () => {
  it('names the near-zero case instead of printing a broken-looking "0 m"', () => {
    assert.equal(formatDistance(0), 'at home');
    assert.equal(formatDistance(24), 'at home');
    assert.equal(formatDistance(25), '30 m');
  });

  it('uses metres below a kilometre, rounded to something a person would say', () => {
    assert.equal(formatDistance(183), '180 m');
    assert.equal(formatDistance(46), '50 m');
  });

  it('switches to kilometres at 1000 m', () => {
    assert.equal(formatDistance(1000), '1.0 km');
    assert.equal(formatDistance(1420), '1.4 km');
  });
});

describe('walkingMinutes', () => {
  it('reads 400 m as a five-minute walk', () => {
    assert.equal(walkingMinutes(400), 5);
  });

  it('never claims a distance takes zero minutes', () => {
    assert.equal(walkingMinutes(5), 1);
    assert.equal(walkingMinutes(0), 1);
  });
});

describe('bandFor', () => {
  // Wording is a neighbour's, not a dispatcher's — "Busy" rather than "Hot".
  // The boundaries are what matter and they have not moved.
  it('bands the worst tenth as Busy and the better half as Quiet', () => {
    assert.equal(bandFor(1, 300).label, 'Busy');
    assert.equal(bandFor(30, 300).label, 'Busy');
    assert.equal(bandFor(31, 300).label, 'Above average');
    assert.equal(bandFor(75, 300).label, 'Above average');
    assert.equal(bandFor(150, 300).label, 'Middling');
    assert.equal(bandFor(151, 300).label, 'Quiet');
    assert.equal(bandFor(300, 300).label, 'Quiet');
  });

  it('does not divide by zero before the stats have loaded', () => {
    assert.equal(bandFor(0, 0).label, 'Quiet');
  });
});

describe('greetingFor', () => {
  const at = (h: number) => { const d = new Date(); d.setHours(h, 0, 0, 0); return d; };

  it('greets by the clock', () => {
    assert.equal(greetingFor(at(8)), 'Good morning');
    assert.equal(greetingFor(at(14)), 'Good afternoon');
    assert.equal(greetingFor(at(21)), 'Good evening');
  });

  it('has no gap at the boundaries', () => {
    assert.equal(greetingFor(at(0)), 'Good morning');
    assert.equal(greetingFor(at(11)), 'Good morning');
    assert.equal(greetingFor(at(12)), 'Good afternoon');
    assert.equal(greetingFor(at(16)), 'Good afternoon');
    assert.equal(greetingFor(at(17)), 'Good evening');
    assert.equal(greetingFor(at(23)), 'Good evening');
  });
});

describe('WALK_M', () => {
  it('is a fifteen-minute walk, matching what the page says', () => {
    assert.equal(walkingMinutes(WALK_M), WALK_MIN);
    assert.equal(WALK_MIN, 15);
  });
});

describe('briefingRef', () => {
  const day = new Date('2026-08-15T10:00:00Z').getTime();

  it('is stable for the same person on the same day, so they can quote it', () => {
    assert.equal(briefingRef('abc123', day), briefingRef('abc123', day));
  });

  it('differs between people', () => {
    assert.notEqual(briefingRef('abc123', day), briefingRef('xyz789', day));
  });

  it('never contains the account id it was derived from', () => {
    const uid = 'SomeRealFirebaseUid00001';
    assert.ok(!briefingRef(uid, day).includes(uid));
  });

  it('has a fixed shape', () => {
    assert.match(briefingRef('abc123', day), /^CW-\d{8}-[0-9A-Z]{5}$/);
  });
});

describe('sourceLabel', () => {
  // The walk section counts every source the map carries. Calling all of it
  // "things your neighbours reported" was wrong, and made a block that plainly
  // had things happening on it look empty.
  it('names a community post as a neighbour', () => {
    assert.equal(sourceLabel({ data_source: 'community' }), 'A neighbour');
  });

  it('credits an ingested record to the body that published it', () => {
    assert.equal(sourceLabel({ data_source: 'official', source_name: '511 Alberta' }), '511 Alberta');
    assert.equal(sourceLabel({ data_source: 'system', source_name: 'ENMAX' }), 'ENMAX');
  });

  it('falls back to the city rather than showing nothing', () => {
    assert.equal(sourceLabel({ data_source: 'official' }), 'City of Calgary');
    assert.equal(sourceLabel({ data_source: 'official', source_name: '  ' }), 'City of Calgary');
  });

  it('never credits an official record to a neighbour', () => {
    for (const s of ['official', 'system'] as const) {
      assert.notEqual(sourceLabel({ data_source: s, source_name: 'Calgary Police' }), 'A neighbour');
    }
  });
});

describe('selectRing', () => {
  const at = (m: number) => ({ distanceM: m });
  const rings = [
    { metres: 1200, label: 'within a 15-minute walk' },
    { metres: 3000, label: 'within 3 km' },
    { metres: 10_000, label: 'within 10 km' },
  ];

  it('uses the walk when the walk has something in it', () => {
    const r = selectRing([at(200), at(900), at(2500)], rings);
    assert.equal(r.metres, 1200);
    assert.equal(r.widened, false);
    assert.equal(r.items.length, 2);
  });

  it('widens rather than reporting a zero', () => {
    // A real address: nothing inside 1.2 km, four things between 2.2 and 2.8.
    // Leading with "0" there reports the radius we picked, not the place.
    const r = selectRing([at(2200), at(2300), at(2800), at(2800)], rings);
    assert.equal(r.metres, 3000);
    assert.equal(r.widened, true);
    assert.equal(r.items.length, 4);
    assert.equal(r.label, 'within 3 km');
  });

  it('keeps widening past the second ring', () => {
    const r = selectRing([at(7000)], rings);
    assert.equal(r.metres, 10_000);
    assert.equal(r.items.length, 1);
  });

  it('never returns something outside the ring it reports', () => {
    const r = selectRing([at(2200), at(50_000)], rings);
    assert.ok(r.items.every((x) => x.distanceM <= r.metres));
  });

  it('falls back to the widest ring when there is genuinely nothing', () => {
    const r = selectRing([at(90_000)], rings);
    assert.equal(r.metres, 10_000);
    assert.equal(r.items.length, 0);
    assert.equal(r.widened, true);
  });

  it('handles an empty feed without throwing', () => {
    const r = selectRing([], rings);
    assert.equal(r.items.length, 0);
    assert.ok(r.label.length > 0);
  });
});
