/**
 * Rankings behind /check-your-community.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { CrimeStatEntry, CrimeYearEntry } from '../src/hooks/useCrimeStats.js';
import {
  bandFor,
  buildRankings,
  displayName,
  findBySlug,
  formatInterval,
  minutesBetweenReports,
  pickChallenger,
  rankForTotal,
  guessVerdict,
  ladder,
  movers,
  neighbours,
  searchCommunities,
  teasers,
} from '../src/lib/communityRank.js';
import { BAND_DUOTONE, ringToPath, simplifyRing } from '../src/lib/coverArt.js';

const entry = (crime: number, disorder: number, year = 2026): CrimeStatEntry => ({
  crime, violent: Math.floor(crime / 2), property: crime - Math.floor(crime / 2), disorder, year, dataSource: '311',
});
const yr = (year: number, total: number): CrimeYearEntry => ({ year, crime: 0, violent: 0, property: 0, disorder: total });

const stats = new Map<string, CrimeStatEntry>([
  ['beltline', entry(400, 600)],
  ['bowness', entry(100, 200)],
  ['mckenzie towne', entry(50, 250)],
  ['erin woods', entry(20, 30)],
  ['edmonton:downtown', entry(9000, 9000)],
  ['empty', entry(0, 0)],
]);
const yearly = new Map<string, CrimeYearEntry[]>([
  ['beltline', [yr(2024, 1000), yr(2025, 1300), yr(2026, 1000)]],
  ['bowness', [yr(2024, 400), yr(2025, 300), yr(2026, 300)]],
  ['erin woods', [yr(2024, 40), yr(2025, 80), yr(2026, 50)]],
]);

describe('buildRankings', () => {
  const r = buildRankings(stats, yearly);

  it('ranks Calgary communities by total and leaves out other cities and empty rows', () => {
    assert.deepEqual(r.map((x) => x.key), ['beltline', 'bowness', 'mckenzie towne', 'erin woods']);
    assert.equal(r[0].rank, 1);
    assert.equal(r[0].count, 4);
  });

  it('gives tied communities the same rank', () => {
    assert.equal(r[1].total, r[2].total);
    assert.equal(r[1].rank, 2);
    assert.equal(r[2].rank, 2);
    assert.equal(r[3].rank, 4);
  });

  it('compares the last two full years, not the year in progress', () => {
    assert.deepEqual(r[0].change, { pct: 30, from: 1000, to: 1300, fromYear: 2024, toYear: 2025 });
    assert.equal(r[1].change?.pct, -25);
  });

  it('skips trends with too small a base or no history', () => {
    assert.equal(r.find((x) => x.key === 'erin woods')?.change, null);
    assert.equal(r.find((x) => x.key === 'mckenzie towne')?.change, null);
  });
});

describe('helpers', () => {
  const r = buildRankings(stats, yearly);

  it('formats names, including Mc prefixes', () => {
    assert.equal(displayName('mckenzie towne'), 'McKenzie Towne');
    assert.equal(displayName('ERIN WOODS'), 'Erin Woods');
  });

  it('finds a community from its link slug', () => {
    assert.equal(findBySlug(r, 'erin-woods')?.key, 'erin woods');
    assert.equal(findBySlug(r, 'Erin Woods')?.key, 'erin woods');
    assert.equal(findBySlug(r, 'nowhere'), undefined);
  });

  it('puts prefix matches first, including later words', () => {
    assert.deepEqual(searchCommunities(r, 'w').map((x) => x.key), ['erin woods', 'bowness', 'mckenzie towne']);
    assert.deepEqual(searchCommunities(r, '  '), []);
  });

  it('returns the communities either side', () => {
    const n = neighbours(r, 'bowness');
    assert.equal(n.above?.key, 'beltline');
    assert.equal(n.below?.key, 'mckenzie towne');
    assert.deepEqual(neighbours(r, 'nowhere'), {});
  });

  it('picks the top, biggest drop and biggest jump', () => {
    const t = teasers(r);
    assert.equal(t.top?.key, 'beltline');
    assert.equal(t.biggestDrop?.key, 'bowness');
    assert.equal(t.biggestJump?.key, 'beltline');
    assert.deepEqual(movers(r, 'down').map((x) => x.key), ['bowness']);
  });

  it('bands by position in the list', () => {
    assert.equal(bandFor(1, 300), 'Hot');
    assert.equal(bandFor(60, 300), 'High');
    assert.equal(bandFor(140, 300), 'Elevated');
    assert.equal(bandFor(280, 300), 'Calm');
  });

  it('says which way a guess was off', () => {
    assert.equal(guessVerdict(41, 41), 'Exactly right.');
    assert.equal(guessVerdict(44, 41), 'So close: 3 spots off.');
    assert.equal(guessVerdict(200, 41), "159 spots off. It's busier than you thought.");
    assert.equal(guessVerdict(10, 41), "31 spots off. It's quieter than you thought.");
  });
});

describe('ladder', () => {
  const r = buildRankings(stats, yearly);

  it('centres on the community when there is room', () => {
    assert.deepEqual(ladder(r, 'bowness', 1).map((x) => x.key), ['beltline', 'bowness', 'mckenzie towne']);
  });

  it('slides instead of shrinking at either end', () => {
    assert.deepEqual(ladder(r, 'beltline', 1).map((x) => x.key), ['beltline', 'bowness', 'mckenzie towne']);
    assert.deepEqual(ladder(r, 'erin woods', 1).map((x) => x.key), ['bowness', 'mckenzie towne', 'erin woods']);
  });
});

describe('game and story helpers', () => {
  const r = buildRankings(stats, yearly);

  it('ranks a guessed total against everyone else', () => {
    assert.equal(rankForTotal(r, 5000, 'bowness'), 1);
    assert.equal(rankForTotal(r, 400, 'bowness'), 2);
    assert.equal(rankForTotal(r, 1, 'bowness'), 4);
  });

  it('turns a yearly total into a cadence', () => {
    const minutes = minutesBetweenReports(24, 2026, new Date(2026, 0, 2));
    assert.equal(minutes, 60);
    assert.equal(minutesBetweenReports(0, 2026, new Date(2026, 5, 1)), null);
    assert.equal(formatInterval(0.5), '30 seconds');
    assert.equal(formatInterval(45), '45 minutes');
    assert.equal(formatInterval(104), '1h 44m');
    assert.equal(formatInterval(60 * 50), '2 days');
  });

  it('never deals a tie or the same community', () => {
    const bowness = r.find((x) => x.key === 'bowness')!;
    for (let i = 0; i < 20; i++) {
      const next = pickChallenger(r, bowness, new Set(), () => i / 20)!;
      assert.notEqual(next.key, 'bowness');
      assert.notEqual(next.total, bowness.total);
    }
  });
});

describe('coverArt', () => {
  it('drops the closing vertex and thins long rings', () => {
    const ring: [number, number][] = Array.from({ length: 101 }, (_, i) => [i, i] as [number, number]);
    ring.push([0, 0]);
    assert.equal(simplifyRing(ring, 10).length, 10);
    assert.deepEqual(simplifyRing([[0, 0], [1, 0], [1, 1], [0, 0]]), [[0, 0], [1, 0], [1, 1]]);
  });

  it('fits a boundary inside the cover with north up', () => {
    // A tall triangle: the northern tip should be near the top of the box.
    const path = ringToPath([[-114.07, 51.0], [-114.05, 51.0], [-114.06, 51.04]], 100, 10);
    const nums = path.match(/-?\d+(\.\d+)?/g)!.map(Number);
    for (const n of nums) assert.ok(n >= 9.9 && n <= 90.1, `${n} outside the padded box`);
    const ys = [nums[1], nums[3], nums[5]];
    assert.equal(Math.min(...ys), ys[2]);
    assert.ok(path.startsWith('M') && path.endsWith('Z'));
    assert.equal(ringToPath([[0, 0], [1, 1]]), '');
  });

  it('has a duotone for every band', () => {
    for (const band of ['Hot', 'High', 'Elevated', 'Calm'] as const) assert.match(BAND_DUOTONE[band].from, /^#[0-9a-f]{6}$/);
  });
});
