import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isRepost, summarizeHistory, topicOf } from '../scripts/ops/jobs/accountHistory';
import type { HistoryRow } from '../src/types/ops';

const row = (over: Partial<HistoryRow>): HistoryRow => ({
  id: '1', permalink: 'p', caption: '', timestamp: 0, format: 'Reels', topic: 'other', topicLabel: 'Other', repost: false,
  weekday: 'Monday', hour: '12', likes: 0, comments: 0, views: null, reach: null, saves: null, shares: null, fetchedAt: null, ...over,
});

describe('account history', () => {
  it('tags topics and credited reposts from captions', () => {
    assert.equal(topicOf('A black bear strolling through Canmore')[0], 'wildlife');
    assert.equal(topicOf('Hail on Deerfoot right now')[0], 'weather');
    assert.equal(topicOf('Tonight in Calgary: three shows')[0], 'events');
    assert.ok(isRepost('Elk in the parking lot 🎥 @someone.yyc'));
    assert.ok(isRepost('via @calgarywildlife'));
    assert.ok(!isRepost('Full list on CalgaryWatch, link in bio.'));
  });

  it('ranks by views and groups by format with medians', () => {
    const h = summarizeHistory([
      row({ id: 'a', views: 5000, fetchedAt: 1 }), row({ id: 'b', views: 200, fetchedAt: 1 }),
      row({ id: 'c', format: 'Single images', views: 150, fetchedAt: 1 }),
    ], 4300, 10);
    assert.equal(h.top[0].id, 'a');
    assert.equal(h.byFormat[0].key, 'Reels');
    assert.equal(h.byFormat[0].best, 5000);
    assert.equal(h.measuredPosts, 3);
  });
});
