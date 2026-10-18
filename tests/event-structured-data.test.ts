import assert from 'node:assert/strict';
import test from 'node:test';
import { buildEntityJsonLd } from '../src/lib/discoverySeo';
import type { Business, Event, Market } from '../src/types/discovery';

const origin = 'https://calgarywatch.ca';
const base = { categories: [], tags: [], status: 'published' as const, verification: 'source-checked' as const, updatedAt: '2026-10-01T00:00:00-06:00', summary: 's', description: 'd' };
const event: Event = { ...base, id: 'ev-1', kind: 'event', slug: 'show', title: 'Show', address: '1 Main St, Calgary', venue: 'Jack Singer Concert Hall',
  start: '2026-11-01T19:00:00-06:00', end: '2026-11-01T21:00:00-06:00', timezone: 'America/Edmonton', pricing: 'unknown', organizer: 'Theatre Calgary',
  sources: [{ kind: 'official', name: 'Theatre Calgary', url: 'https://theatrecalgary.com/show' }] };
const org: Business = { ...base, id: 'biz-theatre-calgary', kind: 'business', slug: 'theatre-calgary', title: 'Theatre Calgary', name: 'Theatre Calgary', address: 'x', images: [], socials: {}, services: [], claimed: true, partner: false, editorialSelection: false, website: 'https://theatrecalgary.com', sources: [{ kind: 'official', name: 'TC', url: 'https://theatrecalgary.com' }] };
const ld = (e: Event, all: (Event | Business)[] = []) => buildEntityJsonLd(e, origin, [], all) as any;

test('event organizer and performer use the linked organizer profile', () => {
  const json = ld({ ...event, organizerEntityId: org.id }, [org]);
  assert.deepEqual(json.organizer, { '@type': 'Organization', name: 'Theatre Calgary', url: `${origin}/local/theatre-calgary`, sameAs: 'https://theatrecalgary.com' });
  assert.deepEqual(json.performer, json.organizer);
});
test('without a profile the organizer name is used, and a placeholder falls back to the venue', () => {
  assert.deepEqual(ld(event).organizer, { '@type': 'Organization', name: 'Theatre Calgary', url: 'https://theatrecalgary.com/show' });
  assert.equal(ld({ ...event, organizer: 'Organizer not listed — see ticket source' }).organizer.name, 'Jack Singer Concert Hall');
});
test('offers carry only real prices', () => {
  assert.deepEqual(ld({ ...event, pricing: 'free' }).offers, { '@type': 'Offer', url: `${origin}/events/show`, price: 0, priceCurrency: 'CAD', availability: 'https://schema.org/InStock' });
  assert.deepEqual(ld({ ...event, pricing: 'paid', priceRange: [25, 25], tickets: 'https://tix.example/1' }).offers, { '@type': 'Offer', url: 'https://tix.example/1', price: 25, priceCurrency: 'CAD', availability: 'https://schema.org/InStock' });
  assert.equal(ld({ ...event, pricing: 'paid', priceRange: [25, 90] }).offers['@type'], 'AggregateOffer');
  assert.deepEqual(ld(event).offers, { '@type': 'Offer', url: `${origin}/events/show` });
  assert.equal(ld({ ...event, ticketSaleStatus: 'not-on-sale' }).offers, undefined);
  assert.equal(ld({ ...event, cancelled: true }).offers, undefined);
});
test('market occurrences carry organizer, performer and a listing offer', () => {
  const market: Market = { ...base, id: 'mk', kind: 'market', slug: 'mk', title: 'Market', address: 'a', organizer: 'Inglewood BIA', amenities: [], vendorIds: [], images: [], sources: [{ kind: 'official', name: 'BIA', url: 'https://inglewoodyyc.ca' }] };
  const json = buildEntityJsonLd(market, origin, [{ id: 'o', marketId: 'mk', start: '2026-11-01T10:00:00-06:00', end: '2026-11-01T15:00:00-06:00', timezone: 'America/Edmonton', cancelled: false, source: market.sources[0] }]) as any;
  assert.equal(json.event[0].organizer.name, 'Inglewood BIA');
  assert.equal(json.event[0].performer.name, 'Inglewood BIA');
  assert.deepEqual(json.event[0].offers, { '@type': 'Offer', url: `${origin}/markets/mk` });
});
