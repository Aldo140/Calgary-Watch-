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
    const provider = new RecurringMarketProvider(source([{ ...yearRound, occurrenceCount: 8 }]), new Date('2026-09-21T12:00:00Z'));
    const records = await provider.fetch();
    if (records[0].input.kind !== 'market') throw Error('expected market');
    const beforeDst = records[0].input.occurrences.find(o => o.start.startsWith('2026-10-28'));
    const afterDst = records[0].input.occurrences.find(o => o.start.startsWith('2026-11-04'));
    assert.equal(beforeDst?.start.endsWith('-06:00'), true);
    assert.equal(afterDst?.start.endsWith('-07:00'), true);
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
