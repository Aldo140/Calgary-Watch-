/** The Scout's ranking and creator discovery (pure; no network). */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { creditedHandles, rank, summarize } from '../scripts/ops/lib/scout';
import type { AccountMedia, DiscoveredAccount } from '../scripts/ops/lib/instagram';

const DAY = 86_400_000;
const now = Date.parse('2026-10-08T18:00:00Z');
const post = (daysAgo: number, likes: number, extra: Partial<AccountMedia> = {}): AccountMedia => ({
  id: String(Math.random()), caption: '', mediaType: 'VIDEO', productType: 'REELS', permalink: `https://instagram.com/p/${daysAgo}`,
  timestamp: now - daysAgo * DAY, likes, comments: 0, ...extra,
});
const account = (username: string, followers: number, media: AccountMedia[]): DiscoveredAccount => ({ username, followers, mediaCount: media.length, media });

describe('scout summary', () => {
  it('measures recent activity and engagement', () => {
    const s = summarize(account('UrbaCalgary', 1000, [post(1, 100), post(5, 50, { productType: 'FEED', mediaType: 'IMAGE' }), post(40, 10)]), 'creator', now);
    assert.equal(s.handle, 'urbacalgary');
    assert.equal(s.posts30, 2);
    assert.equal(s.daysSinceLastPost, 1);
    assert.equal(s.medianEngagement, 50);
    assert.equal(s.engagementRate, 5);
    assert.equal(s.reelShare, 0.67);
    assert.equal(s.active, true);
    assert.equal(s.top?.engagement, 100);
  });
  it('marks an account that stopped posting as quiet', () => {
    const s = summarize(account('albertahub', 771, [post(1600, 60)]), 'creator', now);
    assert.equal(s.active, false);
    assert.equal(s.posts30, 0);
  });
  it('copes with an account that has no posts', () => {
    const s = summarize(account('empty', 10, []), 'creator', now);
    assert.equal(s.daysSinceLastPost, null);
    assert.equal(s.top, null);
    assert.equal(s.active, false);
  });
  it('ranks active accounts ahead of bigger quiet ones', () => {
    const quiet = summarize(account('big', 100000, [post(400, 5000)]), 'media', now);
    const active = summarize(account('small', 900, [post(2, 80)]), 'creator', now);
    assert.deepEqual(rank([quiet, active]).map(e => e.handle), ['small', 'big']);
  });
});

describe('creator discovery', () => {
  it('finds credited creators, most credited first, skipping ones we know', () => {
    const found = creditedHandles([
      'Chinook arch tonight 📸 @skyguy.yyc',
      'Deerfoot at 5pm 🎥: @RoadWatcher',
      'via @roadwatcher',
      'Credit @urbacalgary',
      'Just a caption mentioning @someone without credit',
    ], ['urbacalgary']);
    assert.deepEqual(found, ['roadwatcher', 'skyguy.yyc']);
  });
});
