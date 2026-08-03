import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import {
  POSTING_WINDOWS,
  QUEUE,
  calgaryClock,
  createDailyPlan,
  selectDuePost,
} from '../scripts/seed/activity.js';

const activitySource = readFileSync('scripts/seed/activity.ts', 'utf8');

describe('community pulse content guardrails', () => {
  it('publishes examples, never fabricated community submissions', () => {
    assert.match(activitySource, /data_source: 'demo'/);
    assert.doesNotMatch(activitySource, /data_source: 'community'/);
    assert.match(activitySource, /expires_at:/);
  });

  it('contains vehicle and concerning-interaction examples without identifying people', () => {
    assert.ok(QUEUE.some((item) => /vehicle|car/i.test(`${item.title} ${item.description}`)));
    assert.ok(QUEUE.some((item) => /interaction/i.test(item.title)));
    for (const item of QUEUE) {
      assert.doesNotMatch(item.description, /\b(?:man|woman|male|female)\b/i);
    }
  });

  it('only schedules overnight discoveries in the morning', () => {
    const overnight = QUEUE.filter((item) =>
      /overnight|this morning/i.test(`${item.title} ${item.description}`),
    );
    assert.ok(overnight.length > 0);
    for (const item of overnight) assert.deepEqual(item.windows, ['morning'], item.id);
  });
});

describe('randomized daily community pulse plan', () => {
  const repeat = (value: number) => () => value;

  it('creates two or three ordered posts in different neighbourhoods', () => {
    for (const randomValue of [0, 0.25, 0.75, 0.999]) {
      const plan = createDailyPlan(8, [], repeat(randomValue));
      const neighborhoods = plan.map((post) =>
        QUEUE.find((item) => item.id === post.templateId)?.neighborhood,
      );
      assert.ok(plan.length >= 2 && plan.length <= 3);
      assert.equal(new Set(plan.map((post) => post.templateId)).size, plan.length);
      assert.equal(new Set(neighborhoods).size, plan.length);
      assert.deepEqual(plan, [...plan].sort((a, b) => a.dueMinute - b.dueMinute));
    }
  });

  it('places posts inside their named windows and respects the season', () => {
    for (let randomValue = 0; randomValue < 1; randomValue += 0.05) {
      const plan = createDailyPlan(8, [], repeat(randomValue));
      for (const post of plan) {
        const window = POSTING_WINDOWS[post.window];
        assert.ok(post.dueMinute >= window.start && post.dueMinute <= window.end);
        assert.notEqual(post.templateId, 'ramsay-black-ice');
      }
    }
  });

  it('publishes one oldest due item and never republishes it', () => {
    const plan = [
      { id: 'a', templateId: 'x', dueMinute: 500, window: 'morning' as const },
      { id: 'b', templateId: 'y', dueMinute: 700, window: 'afternoon' as const },
    ];
    assert.equal(selectDuePost(499, plan, []), null);
    assert.equal(selectDuePost(800, plan, [])?.id, 'a');
    assert.equal(selectDuePost(800, plan, ['a'])?.id, 'b');
    assert.equal(selectDuePost(800, plan, ['a', 'b']), null);
  });

  it('uses Calgary civil time in both daylight-saving and standard time', () => {
    assert.deepEqual(calgaryClock(new Date('2026-08-03T13:30:00Z')), {
      date: '2026-08-03', month: 8, minute: 450,
    });
    assert.deepEqual(calgaryClock(new Date('2026-01-03T14:30:00Z')), {
      date: '2026-01-03', month: 1, minute: 450,
    });
  });
});
