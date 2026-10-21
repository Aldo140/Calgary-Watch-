/**
 * The map briefing's counting helper. Every number on the "Right now in
 * Calgary" card comes from here, so these pin that it counts only what was
 * passed in, only inside the chosen window, and never counts demo rows.
 *
 * Run with: npm test
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { summarizeNowBriefing, shortAgo, emptyBriefingLine, reportCount } from '../src/lib/nowBriefing.ts';

const H = 3_600_000;
const NOW = Date.UTC(2026, 9, 21, 18, 0, 0); // noon in Calgary (MDT)

const row = (category: string, hoursAgo: number, data_source?: string) => ({
  category: category as any,
  timestamp: NOW - hoursAgo * H,
  data_source: data_source as any,
});

describe('summarizeNowBriefing', () => {
  it('counts only reports inside the window', () => {
    const s = summarizeNowBriefing([row('crime', 1), row('traffic', 5), row('crime', 30)], '24h', NOW);
    assert.equal(s.total, 2);
    assert.deepEqual(s.byCategory.map((c) => [c.category, c.count]), [['crime', 1], ['traffic', 1]]);
  });

  it('splits neighbours from public sources', () => {
    const s = summarizeNowBriefing(
      [row('crime', 1), row('crime', 1, 'community'), row('infrastructure', 2, 'official'), row('weather', 2, 'system')],
      'all',
      NOW,
    );
    assert.equal(s.community, 2);
    assert.equal(s.official, 2);
    assert.equal(s.total, 4);
  });

  it('leaves demo rows out of every count', () => {
    const s = summarizeNowBriefing([row('crime', 1, 'demo'), row('traffic', 1)], 'all', NOW);
    assert.equal(s.total, 1);
    assert.equal(s.community, 1);
    assert.deepEqual(s.byCategory.map((c) => c.category), ['traffic']);
  });

  it('reports the newest time, and nothing when empty', () => {
    assert.equal(summarizeNowBriefing([row('crime', 3), row('crime', 1)], 'all', NOW).latestTimestamp, NOW - H);
    const empty = summarizeNowBriefing([], 'tonight', NOW);
    assert.equal(empty.total, 0);
    assert.equal(empty.latestTimestamp, null);
    assert.deepEqual(empty.byCategory, []);
  });

  it('keeps the site category order', () => {
    const s = summarizeNowBriefing([row('weather', 1), row('emergency', 1), row('traffic', 1)], 'all', NOW);
    assert.deepEqual(s.byCategory.map((c) => c.category), ['emergency', 'traffic', 'weather']);
  });
});

describe('briefing copy helpers', () => {
  it('formats short ages', () => {
    assert.equal(shortAgo(NOW - 20_000, NOW), 'just now');
    assert.equal(shortAgo(NOW - 12 * 60_000, NOW), '12 min ago');
    assert.equal(shortAgo(NOW - 3 * H, NOW), '3 h ago');
    assert.equal(shortAgo(NOW - 25 * H, NOW), '1 day ago');
  });

  it('says plainly when a window is empty', () => {
    assert.equal(emptyBriefingLine('tonight'), 'Quiet so far tonight. Nothing reported in this window.');
    assert.equal(reportCount(1), '1 report');
    assert.equal(reportCount(3), '3 reports');
  });
});
