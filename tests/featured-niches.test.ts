import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { featuredActive, ownsSearch, withFeaturedExpiry } from '../src/lib/featured';
import { searchListings } from '../src/lib/listingSearch';
import { businessReport, tradeOf } from '../src/lib/businessReport';
import editorial from '../src/content/editorial-inventory.json';
import type { Business, DiscoveryEntity } from '../src/types/discovery';

const NOW = Date.parse('2026-11-25T18:00:00Z');
const biz = (id: string, more: Partial<Business> = {}) => ({
  id, slug: id, kind: 'business', title: id, name: id, summary: '', description: '', categories: ['services'], tags: ['optometrist'],
  sources: [{ name: 'x', url: 'https://x.ca', kind: 'official', retrievedAt: '2026-11-01' }], status: 'published', verification: 'source-checked',
  updatedAt: '2026-11-01', address: '', services: [], images: [], socials: {}, claimed: false, partner: false, editorialSelection: false, ...more,
}) as unknown as DiscoveryEntity;

describe('Featured partner niches', () => {
  const owner = biz('zeta-optometry', { partner: true, featuredNiches: ['optometrist', 'eye exam'], featuredUntil: '2027-01-01T00:00:00-06:00', featuredPlan: 'paid', ownerVerifiedAt: '2026-11-25' });
  const others = [biz('alpha-optometry'), biz('beta-optometry')];
  it('owns the searches in its niche, plurals included', () => {
    assert.equal(ownsSearch(owner, 'optometrists', NOW), true);
    assert.equal(ownsSearch(owner, 'eye exam near me', NOW), true);
    assert.equal(ownsSearch(owner, 'eye', NOW), false);
  });
  it('shows first for its niche even when its name sorts last', () => {
    const ids = Object.values(searchListings([...others, owner], [], 'optometrist', new Date(NOW)).groups).flat().map(e => e!.id);
    assert.equal(ids[0], 'zeta-optometry');
  });
  it('switches itself off at the end date', () => {
    const later = Date.parse('2027-01-02T00:00:00Z');
    assert.equal(featuredActive(owner, later), false);
    assert.equal((withFeaturedExpiry(owner, later) as Business).partner, false);
    assert.equal((withFeaturedExpiry(owner, NOW) as Business).partner, true);
  });
  it('Verb Theatre\'s free trial ends with December', () => {
    const verb = editorial.entities.find(e => e.id === 'biz-verb-theatre') as unknown as Business;
    assert.equal(verb.featuredPlan, 'trial');
    assert.equal(featuredActive(verb, Date.parse('2026-12-31T12:00:00-06:00')), true);
    assert.equal(featuredActive(verb, Date.parse('2027-01-01T00:00:01-06:00')), false);
  });
});

describe('Admin listings & niches report', () => {
  it('files service listings by trade and counts the white pages', () => {
    const r = businessReport([
      biz('a', { awaitingClaim: true }), biz('b', { awaitingClaim: true, email: 'x@y.ca' }),
      biz('c', { partner: true, featuredNiches: ['optometrist'], featuredUntil: '2026-12-01T00:00:00-06:00', featuredPlan: 'trial', ownerVerifiedAt: '2026-11-20' }),
      biz('d', { categories: ['food'], tags: ['pizza'] }),
    ], NOW);
    assert.deepEqual(r.totals, { businesses: 4, whitePages: 2, live: 2, verified: 1, featured: 1, withEmail: 1 });
    assert.equal(r.trades[0].trade, 'optometrist');
    assert.equal(r.trades[0].whitePages, 2);
    assert.equal(r.featured[0].daysLeft, 6);
    assert.equal(tradeOf(biz('d', { categories: ['food'], tags: ['pizza'] }) as Business), 'food');
  });
});
