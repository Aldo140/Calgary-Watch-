import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { activeOffers, offerMatches, offersForSearch } from '../src/lib/communityOffers';
import { featuredActive } from '../src/lib/featured';
import editorial from '../src/content/editorial-inventory.json';
import type { Business, DiscoveryEntity } from '../src/types/discovery';

const NOW = Date.parse('2026-11-26T12:00:00-06:00');
const all = editorial.entities as unknown as DiscoveryEntity[];
const docere = all.find(e => e.id === 'biz-docere-wellness-centre') as Business;

describe('Community partner offers', () => {
  it('Docere is a community partner, not a paid or featured listing', () => {
    assert.equal(docere.partner, false);
    assert.equal(featuredActive(docere, NOW), false);
    assert.equal(docere.sponsorshipDisclosure, undefined);
  });
  it('shows only to searches about the offer topics', () => {
    const ids = (q: string) => offersForSearch(all, q, NOW).map(o => o.offer.title);
    assert.deepEqual(ids('iv therapy'), ['$25 off the Immune IV']);
    assert.deepEqual(ids('b12 shots'), ['2 immune shots for $40']);
    assert.equal(ids('naturopaths near me').length, 2);
    assert.deepEqual(ids('pizza'), []);
    assert.deepEqual(ids('flu shot'), []);
    assert.deepEqual(ids('psychologist'), []);
    assert.deepEqual(ids(''), []);
  });
  it('ends by itself after December', () => {
    assert.equal(activeOffers(docere, Date.parse('2026-12-31T23:00:00-06:00')).length, 2);
    assert.equal(activeOffers(docere, Date.parse('2027-01-01T00:00:01-06:00')).length, 0);
    assert.deepEqual(offersForSearch(all, 'iv therapy', Date.parse('2027-01-02T00:00:00-06:00')), []);
  });
  it('matches whole topic words, plurals included', () => {
    const o = docere.communityOffers![0];
    assert.equal(offerMatches(o, 'IV drips'), true);
    assert.equal(offerMatches(o, 'ivy'), false);
  });
});
