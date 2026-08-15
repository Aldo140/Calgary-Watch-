/**
 * Address qualifier handling in the account settings form.
 *
 * A saved address is labelled "2011 Ulster Rd NW, Calgary". Feeding that label
 * straight back into the city registry search finds nothing, because the
 * registry stores the street address alone — so the form fell through to its
 * raw fallback and offered "2011 Ulster Rd NW, Calgary, Calgary, AB" as a
 * suggestion for an address the person had already saved.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { stripCityQualifier, withCityQualifier } from '../src/lib/address.ts';

describe('stripCityQualifier', () => {
  it('removes the city we appended, so the registry search can match', () => {
    assert.equal(stripCityQualifier('2011 Ulster Rd NW, Calgary'), '2011 Ulster Rd NW');
    assert.equal(stripCityQualifier('2011 Ulster Rd NW, Calgary, AB'), '2011 Ulster Rd NW');
  });

  it('removes a doubled qualifier left by the old fallback', () => {
    assert.equal(stripCityQualifier('2011 Ulster Rd NW, Calgary, Calgary, AB'), '2011 Ulster Rd NW');
  });

  it('leaves a bare street address alone', () => {
    assert.equal(stripCityQualifier('2011 Ulster Rd NW'), '2011 Ulster Rd NW');
  });

  it('does not eat a street that merely contains the letters', () => {
    // "Calgary Trail" is a street name, not the trailing city qualifier.
    assert.equal(stripCityQualifier('100 Calgary Trail NW'), '100 Calgary Trail NW');
  });

  it('survives an empty value', () => {
    assert.equal(stripCityQualifier(''), '');
    assert.equal(stripCityQualifier('  ,  '), '');
  });
});

describe('withCityQualifier', () => {
  it('appends the city once', () => {
    assert.equal(withCityQualifier('2011 Ulster Rd NW'), '2011 Ulster Rd NW, Calgary, AB');
  });

  it('does not append it twice — the bug this exists to prevent', () => {
    assert.equal(withCityQualifier('2011 Ulster Rd NW, Calgary'), '2011 Ulster Rd NW, Calgary, AB');
    assert.equal(
      withCityQualifier('2011 Ulster Rd NW, Calgary, Calgary, AB'),
      '2011 Ulster Rd NW, Calgary, AB',
    );
  });

  it('is idempotent, so repeated edits cannot accumulate qualifiers', () => {
    const once = withCityQualifier('2011 Ulster Rd NW');
    assert.equal(withCityQualifier(once), once);
    assert.equal(withCityQualifier(withCityQualifier(once)), once);
  });

  it('returns empty rather than a lone city for an empty address', () => {
    assert.equal(withCityQualifier(''), '');
  });
});
