import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { mapTicketmasterEvents, TicketmasterProvider } from '../scripts/discovery/providers';
import domain from '../functions/discovery-domain.cjs';

const baseEvent = { id: 'abc', name: 'Calgary Concert', url: 'https://www.ticketmaster.ca/event/abc', dates: { start: { localDate: '2026-10-03', localTime: '19:00:00' }, end: { localDate: '2026-10-03', localTime: '21:30:00' } }, _embedded: { venues: [{ name: 'Calgary Hall', address: { line1: '1 Main Street' }, city: { name: 'Calgary' }, state: { stateCode: 'AB' }, country: { countryCode: 'CA' } }] } };

describe('Ticketmaster Calgary provider', () => {
  it('normalizes Calgary events with local timezone offsets', () => {
    const records = mapTicketmasterEvents([{ id: 'abc', name: 'Calgary Concert', info: 'Live music', url: 'https://www.ticketmaster.ca/event/abc', dates: { start: { localDate: '2026-10-03', localTime: '19:00:00' }, end: { localDate: '2026-10-03', localTime: '21:30:00' } }, classifications: [{ segment: { name: 'Music' } }], _embedded: { venues: [{ name: 'Calgary Hall', address: { line1: '1 Main Street' }, city: { name: 'Calgary' }, state: { stateCode: 'AB' }, country: { countryCode: 'CA' }, location: { latitude: '51.0447', longitude: '-114.0719' } }] } }]);
    assert.equal(records.length, 1); assert.equal(records[0].input.kind, 'event'); assert.equal(records[0].input.start, '2026-10-03T19:00:00-06:00'); assert.equal(records[0].input.end, '2026-10-03T21:30:00-06:00'); assert.deepEqual(records[0].input.categories, ['music']);
    assert.doesNotThrow(() => domain.validateSubmission(records[0].input));
  });

  it('marks events without organizer end dates as estimated and drops non-Canadian venues', () => {
    const estimated = mapTicketmasterEvents([{ id: 'missing-end', name: 'TBA', url: 'https://www.ticketmaster.ca/event/x', dates: { start: { localDate: '2026-10-03', localTime: '19:00:00' } }, _embedded: { venues: [{ country: { countryCode: 'CA' }, address: { line1: 'Calgary' }, city: { name: 'Calgary' } }] } }]);
    assert.equal(estimated.length, 1);
    assert.equal(estimated[0].input.kind, 'event');
    if (estimated[0].input.kind === 'event') assert.equal(estimated[0].input.endTimeEstimated, true);
    assert.equal(mapTicketmasterEvents([{ id: 'us', name: 'US event', url: 'https://www.ticketmaster.ca/event/us', dates: { start: { localDate: '2026-10-03', localTime: '19:00:00' }, end: { localDate: '2026-10-03', localTime: '21:00:00' } }, _embedded: { venues: [{ country: { countryCode: 'US' }, address: { line1: 'Elsewhere' } }] } }]).length, 0);
  });

  describe('image and coordinates', () => {
    it('preserves the venue coordinates Ticketmaster supplies', () => {
      const [record] = mapTicketmasterEvents([{ ...baseEvent, _embedded: { venues: [{ ...baseEvent._embedded.venues[0], location: { latitude: '51.0447', longitude: '-114.0719' } }] } }]);
      assert.deepEqual(record.input.coordinates, { lat: 51.0447, lng: -114.0719 });
      assert.doesNotThrow(() => domain.validateSubmission(record.input));
    });

    it('discards missing or "0,0" placeholder coordinates rather than storing junk data', () => {
      const [missing] = mapTicketmasterEvents([baseEvent]);
      assert.equal(missing.input.coordinates, undefined);
      const [zero] = mapTicketmasterEvents([{ ...baseEvent, _embedded: { venues: [{ ...baseEvent._embedded.venues[0], location: { latitude: '0', longitude: '0' } }] } }]);
      assert.equal(zero.input.coordinates, undefined);
    });

    it('picks the widest 16:9 image when one is offered, and attaches provenance credit', () => {
      const [record] = mapTicketmasterEvents([{ ...baseEvent, images: [
        { url: 'https://s1.ticketm.net/small.jpg', width: 100, ratio: '16_9' },
        { url: 'https://s1.ticketm.net/wide.jpg', width: 1024, ratio: '16_9' },
        { url: 'https://s1.ticketm.net/tall.jpg', width: 2000, ratio: '3_2' },
      ] }]);
      assert.equal(record.input.image?.src, 'https://s1.ticketm.net/wide.jpg');
      assert.equal(record.input.image?.credit, 'Image via Ticketmaster');
      assert.match(record.input.image?.alt ?? '', /Calgary Concert/);
      assert.doesNotThrow(() => domain.validateSubmission(record.input));
    });

    it('falls back to the largest image when no 16:9 crop is offered', () => {
      const [record] = mapTicketmasterEvents([{ ...baseEvent, images: [
        { url: 'https://s1.ticketm.net/small.jpg', width: 100, ratio: '3_2' },
        { url: 'https://s1.ticketm.net/big.jpg', width: 800, ratio: '3_2' },
      ] }]);
      assert.equal(record.input.image?.src, 'https://s1.ticketm.net/big.jpg');
    });

    it('never stores an insecure image URL and has no image when Ticketmaster supplies none', () => {
      const [insecure] = mapTicketmasterEvents([{ ...baseEvent, images: [{ url: 'http://s1.ticketm.net/insecure.jpg', width: 800, ratio: '16_9' }] }]);
      assert.equal(insecure.input.image, undefined);
      const [none] = mapTicketmasterEvents([baseEvent]);
      assert.equal(none.input.image, undefined);
    });
  });

  describe('organizer semantics', () => {
    it('never claims Ticketmaster itself is the organizer', () => {
      const [record] = mapTicketmasterEvents([baseEvent]);
      if (record.input.kind !== 'event') throw Error('expected event');
      assert.doesNotMatch(record.input.organizer, /ticketmaster/i);
    });

    it('prefers the promoter name when Ticketmaster supplies one', () => {
      const [record] = mapTicketmasterEvents([{ ...baseEvent, promoter: { name: 'Live Nation Calgary' } }]);
      if (record.input.kind !== 'event') throw Error('expected event');
      assert.equal(record.input.organizer, 'Live Nation Calgary');
    });

    it('falls back to the promoters list, then the headline attraction, then an honest unknown', () => {
      const [fromPromotersList] = mapTicketmasterEvents([{ ...baseEvent, promoters: [{ name: 'Second Promoter' }] }]);
      if (fromPromotersList.input.kind !== 'event') throw Error('expected event');
      assert.equal(fromPromotersList.input.organizer, 'Second Promoter');

      const [fromAttraction] = mapTicketmasterEvents([{ ...baseEvent, _embedded: { ...baseEvent._embedded, attractions: [{ name: 'The Headliners' }] } }]);
      if (fromAttraction.input.kind !== 'event') throw Error('expected event');
      assert.equal(fromAttraction.input.organizer, 'The Headliners');

      const [fromNeither] = mapTicketmasterEvents([baseEvent]);
      if (fromNeither.input.kind !== 'event') throw Error('expected event');
      assert.equal(fromNeither.input.organizer, 'Organizer not listed — see ticket source');
    });
  });

  describe('pagination', () => {
    it('walks every page the API reports and stops once totalPages is reached', async (t) => {
      const pages = [
        { _embedded: { events: [{ ...baseEvent, id: 'page-0' }] }, page: { totalPages: 2 } },
        { _embedded: { events: [{ ...baseEvent, id: 'page-1' }] }, page: { totalPages: 2 } },
      ];
      const calls: string[] = [];
      const fetchMock = mock.fn(async (input: string | URL) => {
        const url = new URL(input);
        calls.push(url.searchParams.get('page') ?? '');
        return { ok: true, json: async () => pages[Number(url.searchParams.get('page'))] } as Response;
      });
      t.mock.method(globalThis, 'fetch', fetchMock);
      const originalKey = process.env.TICKETMASTER_API_KEY; process.env.TICKETMASTER_API_KEY = 'test-key';
      try {
        const provider = new TicketmasterProvider({ id: 'ticketmaster-calgary', name: 'Ticketmaster', approved: true, hosts: ['www.ticketmaster.ca'], kind: 'official', provider: 'ticketmaster' });
        const records = await provider.fetch();
        assert.deepEqual(calls, ['0', '1']);
        assert.deepEqual(records.map(r => r.id).sort(), ['page-0', 'page-1']);
      } finally {
        process.env.TICKETMASTER_API_KEY = originalKey;
      }
    });

    it('never requests more than the safety cap of pages', async (t) => {
      const fetchMock = mock.fn(async (input: string | URL) => {
        const url = new URL(input);
        return { ok: true, json: async () => ({ _embedded: { events: [] }, page: { totalPages: 500 } }) } as Response;
      });
      t.mock.method(globalThis, 'fetch', fetchMock);
      const originalKey = process.env.TICKETMASTER_API_KEY; process.env.TICKETMASTER_API_KEY = 'test-key';
      try {
        const provider = new TicketmasterProvider({ id: 'ticketmaster-calgary', name: 'Ticketmaster', approved: true, hosts: ['www.ticketmaster.ca'], kind: 'official', provider: 'ticketmaster' });
        await provider.fetch();
        assert.equal(fetchMock.mock.callCount(), 10);
      } finally {
        process.env.TICKETMASTER_API_KEY = originalKey;
      }
    });
  });
});
describe('Ticketmaster listings that are not Calgary events', () => {
  it('drops parking, upgrades and packages sold alongside a show', () => {
    for (const name of ['Parking: Calgary Flames vs Oilers', 'VIP Package - Big Tour', 'Season Tickets 2026', 'Premium Seating Upgrade']) {
      assert.equal(mapTicketmasterEvents([{ ...baseEvent, name }]).length, 0, name);
    }
    assert.equal(mapTicketmasterEvents([{ ...baseEvent, name: 'Parkway Drive' }]).length, 1);
  });

  it('keeps Calgary and nearby towns, drops the rest of southern Alberta', () => {
    const at = (city: string) => mapTicketmasterEvents([{ ...baseEvent, _embedded: { venues: [{ ...baseEvent._embedded.venues[0], city: { name: city } }] } }]).length;
    assert.equal(at('Calgary'), 1);
    assert.equal(at('Airdrie'), 1);
    assert.equal(at('Lethbridge'), 0);
    assert.equal(at('Red Deer'), 0);
  });
});
