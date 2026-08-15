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
import {
  stripCityQualifier, withCityQualifier, buildAddressQuery,
  rankAddressMatches, rankFullTextMatches,
} from '../src/lib/address.ts';

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

describe('buildAddressQuery', () => {
  it('treats a leading digit as a house number and prefix-matches it', () => {
    // Reported: typing "2011" returned five suites of one University Drive
    // building, where 2011 was the street number and the house numbers were
    // 101–105. A house number is a prefix, so search it as one.
    assert.deepEqual(buildAddressQuery('2011'), { where: "starts_with(address, '2011')" });
  });

  it('narrows as more of the address is typed', () => {
    assert.deepEqual(buildAddressQuery('2011 uls'), { where: "starts_with(address, '2011 ULS')" });
  });

  it('uses full text for a street name, where prefix would match nothing', () => {
    assert.deepEqual(buildAddressQuery('ulster'), { q: 'ULSTER' });
  });

  it('strips the city qualifier, so re-editing a saved address still matches', () => {
    assert.deepEqual(
      buildAddressQuery('2011 Ulster Rd NW, Calgary'),
      { where: "starts_with(address, '2011 ULSTER RD NW')" },
    );
  });

  it('collapses stray whitespace rather than searching for a double space', () => {
    assert.deepEqual(buildAddressQuery('2011   ulster'), { where: "starts_with(address, '2011 ULSTER')" });
  });

  it('escapes a quote in the where clause, where it would end the SoQL literal', () => {
    assert.deepEqual(
      buildAddressQuery("12 o'brien road"),
      { where: "starts_with(address, '12 O''BRIEN ROAD')" },
    );
  });

  it('leaves a quote alone on the full-text path, which is a URL parameter', () => {
    // $q is encodeURIComponent'd, not interpolated into SoQL, so doubling the
    // quote here would search for a quote that is not in the data.
    assert.deepEqual(buildAddressQuery("o'brien road"), { q: "O'BRIEN ROAD" });
  });

  it('waits for enough to go on', () => {
    assert.equal(buildAddressQuery('20'), null);
    assert.equal(buildAddressQuery(''), null);
  });
});

describe('rankAddressMatches', () => {
  it('puts the house number ahead of a suite in a larger building', () => {
    // 2011 is a house number in the first and a suite in the second.
    const ranked = rankAddressMatches(['2011 1053 10 ST SW', '2011 ULSTER RD NW']);
    assert.equal(ranked[0], '2011 ULSTER RD NW');
  });

  it('does not penalise Calgary numbered streets', () => {
    const ranked = rankAddressMatches(['2011 135 13 AV SW', '2011 10 ST NW']);
    assert.equal(ranked[0], '2011 10 ST NW');
  });

  it('removes duplicates left by one row per roll year', () => {
    assert.deepEqual(rankAddressMatches(['2011 10 ST NW', '2011 10 ST NW']), ['2011 10 ST NW']);
  });
});

describe('rankFullTextMatches', () => {
  it('keeps the search order rather than re-sorting by simplicity', () => {
    // "17 av sw" prefix-matches nothing, so it falls back to full text. The
    // simplicity sort would surface the shortest row — "1000 5 AV SW" — which
    // is not on 17 Avenue at all.
    const rows = ['1001 17 AV SW', '1002 17 AV SW'];
    assert.deepEqual(rankFullTextMatches(rows, '17 av sw'), rows);
  });

  it('drops rows missing any word that was typed', () => {
    assert.deepEqual(
      rankFullTextMatches(['1000 5 AV SW', '1001 17 AV SW'], '17 av sw'),
      ['1001 17 AV SW'],
    );
  });

  it('ignores the city qualifier when checking the words', () => {
    assert.deepEqual(
      rankFullTextMatches(['2011 ULSTER RD NW'], '2011 Ulster Rd NW, Calgary'),
      ['2011 ULSTER RD NW'],
    );
  });
});
