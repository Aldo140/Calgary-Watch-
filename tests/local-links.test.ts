import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Business, DiscoveryEntity, Guide, Market, MarketOccurrence, Neighbourhood } from '../src/types/discovery';
import { hoodOf, localLinks } from '../src/lib/localLinks';

const base = { summary: '', description: '', categories: [] as string[], tags: [] as string[], sources: [], status: 'published' as const, verification: 'source-checked' as const, updatedAt: '2026-10-01' };
const hood = (id: string, title: string): Neighbourhood => ({ ...base, kind: 'neighbourhood', id, slug: id, title, quadrant: 'NE', entityIds: [] });
const shop: Business = { ...base, kind: 'business', id: 'biz-lukes', slug: 'lukes', title: 'Luke’s Drug Mart', name: 'Luke’s', address: '112 4 St NE', neighbourhood: 'Bridgeland', images: [], socials: {}, services: [], claimed: false, partner: false, editorialSelection: true };
const market = (id: string, title: string, neighbourhood: string): Market => ({ ...base, kind: 'market', id, slug: id, title, neighbourhood, address: '', organizer: '', amenities: [], vendorIds: [], images: [] });
const occ = (marketId: string, start: string): MarketOccurrence => ({ id: `${marketId}-${start}`, marketId, start, end: start.replace('T09', 'T13'), timezone: 'America/Edmonton', cancelled: false, source: { name: '', url: 'https://x', kind: 'official' } });
const guide: Guide = { ...base, kind: 'guide', id: 'g-ne', slug: 'ne-walk', title: 'NE walk', introduction: '', methodology: '', entries: [{ entityId: 'hood-bridgeland', note: '' }], relatedGuideIds: [] };
const now = Date.parse('2026-10-11T12:00:00-06:00');

describe('local links', () => {
  it('finds a neighbourhood page from a short name', () => {
    assert.equal(hoodOf(shop, [hood('hood-bridgeland', 'Bridgeland-Riverside')])?.id, 'hood-bridgeland');
  });

  it('links the neighbourhood, its guides and the next market nearby', () => {
    const all: DiscoveryEntity[] = [shop, hood('hood-bridgeland', 'Bridgeland-Riverside'), guide,
      market('m-near', 'Riverside market', 'Riverside'), market('m-far', 'Far market', 'Bowness')];
    const links = localLinks(shop, all, [occ('m-near', '2026-10-18T09:00:00-06:00'), occ('m-far', '2026-10-12T09:00:00-06:00')], { pick: '', note: '', dontMiss: [], nearby: ['riverside'] }, now);
    assert.equal(links.hood?.id, 'hood-bridgeland');
    assert.deepEqual(links.guides.map(g => g.id), ['g-ne']);
    assert.equal(links.next?.title, 'Riverside market');
  });

  it('prefers a market held at the place and skips past dates', () => {
    const all: DiscoveryEntity[] = [shop, market('m-here', 'Market at Luke’s', 'Elsewhere'), market('m-near', 'Bridgeland market', 'Bridgeland')];
    const occs = [occ('m-here', '2026-10-25T09:00:00-06:00'), occ('m-near', '2026-10-12T09:00:00-06:00'), occ('m-near', '2026-10-01T09:00:00-06:00')];
    const links = localLinks(shop, all, occs, { pick: '', note: '', dontMiss: [], marketMatch: 'luke’s' }, now);
    assert.equal(links.next?.title, 'Market at Luke’s');
    assert.equal(links.next?.here, true);
    assert.equal(localLinks(shop, all, occs.slice(2), undefined, now).next, undefined);
  });
});
