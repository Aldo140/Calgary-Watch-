import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { RecurringMarketProvider, type RecurringMarketDefinition, type SourceConfig } from '../scripts/discovery/providers';
import domain from '../functions/discovery-domain.cjs';

function source(markets: RecurringMarketDefinition[]): SourceConfig {
  return { id: 'test-markets', name: 'Test markets', approved: true, hosts: ['example.com'], kind: 'editorial', provider: 'recurring-market', markets };
}

const yearRound: RecurringMarketDefinition = {
  id: 'weekly-market', title: 'Weekly Market', summary: 'A weekly market.', description: 'A weekly market in Calgary.',
  address: '1 Main St, Calgary, AB', organizer: 'Test Organizer', sourceUrl: 'https://example.com/market',
  categories: ['market'], tags: [], amenities: ['local produce'],
  dayOfWeek: 3, startTime: '15:00:00', endTime: '19:00:00',
};

describe('Recurring market provider', () => {
  it('generates the requested count of upcoming weekly occurrences with correct local offsets', async () => {
    // 2026-09-21 is a Monday; the next Wednesday is 2026-09-23.
    const provider = new RecurringMarketProvider(source([{ ...yearRound, occurrenceCount: 3 }]), new Date('2026-09-21T12:00:00Z'));
    const records = await provider.fetch();
    assert.equal(records.length, 1);
    assert.equal(records[0].input.kind, 'market');
    if (records[0].input.kind !== 'market') return;
    assert.deepEqual(records[0].input.occurrences.map(o => o.start), [
      '2026-09-23T15:00:00-06:00',
      '2026-09-30T15:00:00-06:00',
      '2026-10-07T15:00:00-06:00',
    ]);
    assert.doesNotThrow(() => domain.validateSubmission(records[0].input));
  });

  it('crosses the daylight-saving boundary with the correct offset', async () => {
    // Past fall-back (2025-11-02): tzdata 2026c keeps Alberta on UTC-6 from November 2026.
    const provider = new RecurringMarketProvider(source([{ ...yearRound, occurrenceCount: 8 }]), new Date('2025-09-22T12:00:00Z'));
    const records = await provider.fetch();
    if (records[0].input.kind !== 'market') throw Error('expected market');
    const beforeDst = records[0].input.occurrences.find(o => o.start.startsWith('2025-10-29'));
    const afterDst = records[0].input.occurrences.find(o => o.start.startsWith('2025-11-05'));
    assert.equal(beforeDst?.start.endsWith('-06:00'), true);
    assert.equal(afterDst?.start.endsWith('-07:00'), true);
  });

  it('supports one market opening on several weekdays without duplicating the listing', async () => {
    const provider = new RecurringMarketProvider(source([{
      ...yearRound,
      dayOfWeek: undefined,
      startTime: undefined,
      endTime: undefined,
      schedules: [
        { dayOfWeek: 5, startTime: '09:00:00', endTime: '17:00:00' },
        { dayOfWeek: 6, startTime: '10:00:00', endTime: '16:00:00' },
        { dayOfWeek: 0, startTime: '09:00:00', endTime: '17:00:00' },
      ],
      occurrenceCount: 5,
    }]), new Date('2026-09-21T12:00:00Z'));
    const records = await provider.fetch();
    assert.equal(records.length, 1);
    if (records[0].input.kind !== 'market') throw Error('expected market');
    assert.deepEqual(records[0].input.occurrences.map(o => [o.start.slice(0, 10), o.start.slice(11, 19)]), [
      ['2026-09-25', '09:00:00'],
      ['2026-09-26', '10:00:00'],
      ['2026-09-27', '09:00:00'],
      ['2026-10-02', '09:00:00'],
      ['2026-10-03', '10:00:00'],
    ]);
  });

  it('respects season bounds and produces no occurrences once the season has ended', async () => {
    const seasonal: RecurringMarketDefinition = { ...yearRound, id: 'seasonal-market', dayOfWeek: 4, seasonStart: '2026-06-18', seasonEnd: '2026-10-01' };
    const inSeason = await new RecurringMarketProvider(source([seasonal]), new Date('2026-09-21T12:00:00Z')).fetch();
    assert.equal(inSeason.length, 1);
    if (inSeason[0].input.kind !== 'market') throw Error('expected market');
    assert.deepEqual(inSeason[0].input.occurrences.map(o => o.start.slice(0, 10)), ['2026-09-24', '2026-10-01']);

    const afterSeason = await new RecurringMarketProvider(source([seasonal]), new Date('2026-10-05T12:00:00Z')).fetch();
    assert.equal(afterSeason.length, 0);
  });

  it('drops markets with no configured occurrences rather than emitting an empty record', async () => {
    const records = await new RecurringMarketProvider(source([]), new Date('2026-09-21T12:00:00Z')).fetch();
    assert.deepEqual(records, []);
  });
});
