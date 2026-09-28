import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import domain from '../functions/discovery-domain.cjs';
import { mapVisitCalgaryEvents, vcTime, visitCalgaryPlace, type VisitCalgaryHit } from '../scripts/discovery/visitCalgary';
import { mapSquarespaceEvents } from '../scripts/discovery/squarespace';
import { startClock } from '../src/lib/discovery';

const vcSource = { id: 'visit-calgary', name: 'Tourism Calgary events calendar', approved: true, hosts: ['www.visitcalgary.com'], kind: 'editorial' as const, provider: 'visitcalgary' as const };
const now = Date.parse('2026-09-28T12:00:00-06:00');
const hit = (slug: string, data: VisitCalgaryHit['data'], tax = ''): VisitCalgaryHit => ({ slug, permalink: `/events/${slug}`, data, searchable_taxonomies: tax });

describe('Tourism Calgary events', () => {
  it('reads times in either clock', () => {
    assert.equal(vcTime('19:00'), '19:00'); assert.equal(vcTime('7:30 PM'), '19:30'); assert.equal(vcTime('12 am'), '00:00'); assert.equal(vcTime(null), null); assert.equal(vcTime('TBA'), null);
  });
  it('keeps Calgary-area events only, splits series, keeps festivals whole, and produces valid records', () => {
    const places = new Map([
      ['brunch', { street: '1300 Zoo Rd NE', locality: 'Calgary', venue: 'Calgary Zoo' }],
      ['fest', { street: '1 Main St', locality: 'Calgary', venue: 'Park' }],
      ['far', { street: 'Racetrack', locality: 'Millarville', venue: 'Racetrack' }],
    ]);
    const recs = mapVisitCalgaryEvents([
      hit('brunch', { title: 'Sunday Brunch', description: 'Brunch at the zoo every Sunday this fall.', start_time: '9:00', end_time: '13:00', event_dates: ['2026-10-04', '2026-10-11'], is_free: false, price: '$45' }, 'Family Friendly | Food & Drink'),
      hit('fest', { title: 'Big Fest', description: 'A three-day festival downtown with music.', start_time: null, event_dates: ['2026-10-09', '2026-10-10', '2026-10-11'], is_free: true, is_adult: true }, 'Music | Family Friendly'),
      hit('far', { title: 'Country Market', description: 'x', event_dates: ['2026-10-05'] }),
      hit('past', { title: 'Old', description: 'x', event_dates: ['2026-09-01'] }),
    ], places, now);
    assert.deepEqual(recs.map(r => r.id), ['brunch@2026-10-04', 'brunch@2026-10-11', 'fest@2026-10-09']);
    const fest = recs[2].input as any;
    assert.equal(fest.start, '2026-10-09T00:00:00-06:00'); assert.equal(fest.end, '2026-10-11T23:59:00-06:00');
    assert.equal(fest.pricing, 'free'); assert.ok(!fest.categories.includes('family'), '18+ drops family');
    const brunch = recs[0].input as any;
    assert.equal(brunch.start, '2026-10-04T09:00:00-06:00'); assert.equal(brunch.end, '2026-10-04T13:00:00-06:00');
    assert.deepEqual(brunch.priceRange, [45, 45]); assert.equal(brunch.address, '1300 Zoo Rd NE, Calgary, AB');
    for (const r of recs) domain.normalizeRecord(r.input, vcSource, r.id);
  });
  it('reads the venue address from an event page', () => {
    const html = '<script type="application/ld+json">{"@context":"https://schema.org","@type":"Event","name":"X","location":{"@type":"Place","name":"Studio Bell","address":{"@type":"PostalAddress","streetAddress":"850 4 Street SE","addressLocality":"Calgary"}}}</script>';
    assert.deepEqual(visitCalgaryPlace(html), { street: '850 4 Street SE', locality: 'Calgary', venue: 'Studio Bell' });
  });
});

describe('Squarespace events', () => {
  const src = { id: 'the-confluence', name: 'The Confluence', approved: true, hosts: ['www.theconfluence.ca'], kind: 'official' as const, provider: 'squarespace' as const, feedUrl: 'https://www.theconfluence.ca/events' };
  it('maps upcoming Calgary events to valid records with local offsets', () => {
    const recs = mapSquarespaceEvents([
      { id: 'a', title: 'Walk', excerpt: '<p>Free event. A guided walk along the river.</p>', fullUrl: '/events/walk', startDate: Date.parse('2026-09-30T16:00:00Z'), endDate: Date.parse('2026-09-30T23:00:00Z'), categories: ['Indigenous Programming'], location: { addressTitle: 'The Confluence', addressLine1: '750 9 Avenue Southeast', addressLine2: 'Calgary, AB, T2G 5E1' } },
      { id: 'b', title: 'Elsewhere', startDate: Date.parse('2026-10-01T16:00:00Z'), endDate: Date.parse('2026-10-01T18:00:00Z'), location: { addressLine1: '1 St', addressLine2: 'Edmonton, AB' } },
    ], src, now);
    assert.equal(recs.length, 1);
    const i = recs[0].input as any;
    assert.equal(i.start, '2026-09-30T10:00:00-06:00'); assert.equal(i.pricing, 'free'); assert.equal(i.sourceUrl, 'https://www.theconfluence.ca/events/walk');
    assert.equal(i.address, '750 9 Avenue Southeast, Calgary, AB');
    domain.normalizeRecord(i, src, recs[0].id);
  });
});

describe('all-day listings', () => {
  it('show "All day" instead of midnight', () => {
    const clock = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton', hour: 'numeric', minute: '2-digit' });
    assert.equal(startClock('2026-10-09T00:00:00-06:00', clock), 'All day');
    assert.notEqual(startClock('2026-10-09T19:30:00-06:00', clock), 'All day');
  });
});
