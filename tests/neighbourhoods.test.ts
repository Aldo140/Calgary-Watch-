import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { closeCount, linksFor, placeOf } from '../src/lib/neighbourhoods';
import type { Business, DiscoveryEntity, Event, Guide, Market, MarketOccurrence, Neighbourhood } from '../src/types/discovery';

const base = { summary: '', description: '', categories: [], tags: [], sources: [], status: 'published' as const, verification: 'unverified' as const, updatedAt: '2026-10-01' };
const hood = (slug: string, title: string, quadrant: string): Neighbourhood => ({ ...base, kind: 'neighbourhood', id: `hood-${slug}`, slug, title, quadrant, entityIds: [] });
const event = (id: string, title: string, extra: Partial<Event> = {}): Event => ({
  ...base, kind: 'event', id, slug: id, title, start: '2026-10-20T19:00:00-06:00', end: '2026-10-20T21:00:00-06:00',
  timezone: 'America/Edmonton', pricing: 'free', organizer: 'x', address: 'Calgary', ...extra,
});
const market = (id: string, title: string, address: string): Market => ({ ...base, kind: 'market', id, slug: id, title, address, amenities: [], organizer: 'x', vendorIds: [], images: [] });
const shop = (id: string, title: string, address: string, neighbourhood?: string): Business => ({
  ...base, kind: 'business', id, slug: id, title, name: title, address, neighbourhood, images: [], socials: {}, services: [], claimed: false, partner: false, editorialSelection: false,
});

const inglewood = hood('inglewood', 'Inglewood', 'SE');
const ramsay = hood('ramsay', 'Ramsay', 'SE');
const bowness = hood('bowness', 'Bowness', 'NW');
const now = new Date('2026-10-11T12:00:00-06:00');
const occ = (marketId: string): MarketOccurrence => ({ id: `${marketId}-1`, marketId, start: '2026-10-17T09:00:00-06:00', end: '2026-10-17T15:00:00-06:00', timezone: 'America/Edmonton', cancelled: false, source: { name: 'x', url: 'https://x', kind: 'official' } });

describe('neighbourhood links', () => {
  it('finds listings that name the neighbourhood, and orders them before ones nearby', () => {
    const all: DiscoveryEntity[] = [
      inglewood, ramsay, bowness,
      event('e-ramsay', 'Scotsman’s Hill sunset', { neighbourhood: 'Ramsay' }),
      event('e-here', 'Record fair', { venue: 'Inglewood Community Hall' }),
      event('e-far', 'Lagoon skate', { neighbourhood: 'Bowness' }),
      shop('s-rosso', 'Rosso Coffee Roasters — Inglewood', '1402 9 Ave SE, Calgary, AB', 'Inglewood'),
    ];
    const links = linksFor(inglewood, all, [], now);
    assert.deepEqual(links.events.map(l => [l.entity.id, l.closeness]), [['e-here', 'here'], ['e-ramsay', 'nearby']]);
    assert.equal(links.places[0].entity.id, 's-rosso');
    assert.equal(links.neighbours[0].hood.id, 'hood-ramsay');
  });

  it('places markets from their address and only counts ones with upcoming dates', () => {
    const crossroads = market('m-crossroads', 'Crossroads Market', '1235 26 Ave SE, Calgary, AB');
    const done = market('m-done', 'Summer market in Inglewood', '9 Ave SE');
    const all: DiscoveryEntity[] = [inglewood, crossroads, done];
    assert.ok(placeOf(crossroads));
    const links = linksFor(inglewood, all, [occ('m-crossroads')], now);
    assert.deepEqual(links.markets.map(l => l.entity.id), ['m-crossroads']);
    assert.deepEqual(closeCount(links), { events: 0, markets: 1, places: 0 });
  });

  it('shows a weekly series once and lets a far venue in the quadrant only top up a thin list', () => {
    const all: DiscoveryEntity[] = [
      inglewood,
      event('e-1', 'Ghost walk (Fridays)', { address: '1900 Heritage Dr SE', venue: 'Far Park' }),
      event('e-2', 'Ghost walk (Saturdays)', { address: '1900 Heritage Dr SE', venue: 'Far Park', start: '2026-10-21T19:00:00-06:00', end: '2026-10-21T21:00:00-06:00' }),
      event('e-3', 'Tea in the garden', { address: '1900 Heritage Dr SE', venue: 'Far Park' }),
    ];
    const links = linksFor(inglewood, all, [], now);
    assert.deepEqual(links.events.map(l => l.entity.id), ['e-1']);
    assert.equal(closeCount(links).events, 0);
  });

  it('does not match a street number inside a longer one', () => {
    const all: DiscoveryEntity[] = [bowness, event('e', 'Talk', { address: '119 Ave SE' }), inglewood];
    assert.equal(linksFor(inglewood, all, [], now).events.filter(l => l.closeness === 'here').length, 0);
  });

  it('links guides that list the neighbourhood', () => {
    const guide: Guide = { ...base, kind: 'guide', id: 'g', slug: 'g', title: 'Inglewood & Ramsay on Foot', introduction: '', methodology: '', entries: [{ entityId: 'hood-ramsay', note: '' }], relatedGuideIds: [] };
    assert.deepEqual(linksFor(ramsay, [ramsay, guide], [], now).guides.map(g => g.id), ['g']);
    assert.deepEqual(linksFor(bowness, [bowness, guide], [], now).guides, []);
  });
});
