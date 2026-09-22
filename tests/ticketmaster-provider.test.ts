import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mapTicketmasterEvents } from '../scripts/discovery/providers';
import domain from '../functions/discovery-domain.cjs';

describe('Ticketmaster Calgary provider', () => {
  it('normalizes Calgary events with local timezone offsets', () => {
    const records = mapTicketmasterEvents([{ id: 'abc', name: 'Calgary Concert', info: 'Live music', url: 'https://www.ticketmaster.ca/event/abc', dates: { start: { localDate: '2026-10-03', localTime: '19:00:00' }, end: { localDate: '2026-10-03', localTime: '21:30:00' } }, classifications: [{ segment: { name: 'Music' } }], _embedded: { venues: [{ name: 'Calgary Hall', address: { line1: '1 Main Street' }, city: { name: 'Calgary' }, state: { stateCode: 'AB' }, country: { countryCode: 'CA' }, location: { latitude: '51.0447', longitude: '-114.0719' } }] } }]);
    assert.equal(records.length, 1); assert.equal(records[0].input.kind, 'event'); assert.equal(records[0].input.start, '2026-10-03T19:00:00-06:00'); assert.equal(records[0].input.end, '2026-10-03T21:30:00-06:00'); assert.deepEqual(records[0].input.categories, ['music']);
    assert.doesNotThrow(() => domain.validateSubmission(records[0].input));
  });

  it('marks events without organizer end dates as estimated and drops non-Canadian venues', () => {
    const estimated = mapTicketmasterEvents([{ id: 'missing-end', name: 'TBA', url: 'https://www.ticketmaster.ca/event/x', dates: { start: { localDate: '2026-10-03', localTime: '19:00:00' } }, _embedded: { venues: [{ country: { countryCode: 'CA' }, address: { line1: 'Calgary' } }] } }]);
    assert.equal(estimated.length, 1);
    assert.equal(estimated[0].input.kind, 'event');
    if (estimated[0].input.kind === 'event') assert.equal(estimated[0].input.endTimeEstimated, true);
    assert.equal(mapTicketmasterEvents([{ id: 'us', name: 'US event', url: 'https://www.ticketmaster.ca/event/us', dates: { start: { localDate: '2026-10-03', localTime: '19:00:00' }, end: { localDate: '2026-10-03', localTime: '21:00:00' } }, _embedded: { venues: [{ country: { countryCode: 'US' }, address: { line1: 'Elsewhere' } }] } }]).length, 0);
  });
});