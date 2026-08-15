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
  it('calls the worst tenth Hot and the better half Calm', () => {
    assert.equal(bandFor(1, 300).label, 'Hot');
    assert.equal(bandFor(30, 300).label, 'Hot');
    assert.equal(bandFor(31, 300).label, 'High');
    assert.equal(bandFor(75, 300).label, 'High');
    assert.equal(bandFor(150, 300).label, 'Elevated');
    assert.equal(bandFor(151, 300).label, 'Calm');
    assert.equal(bandFor(300, 300).label, 'Calm');
  });

  it('does not divide by zero before the stats have loaded', () => {
    assert.equal(bandFor(0, 0).label, 'Calm');
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
