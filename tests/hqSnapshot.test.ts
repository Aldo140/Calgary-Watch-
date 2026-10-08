/** The HQ snapshot: what's waiting on you, pipelines, spend and bottlenecks (pure; no network). */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { bottlenecks, calgaryWatchPipeline, spendSummary, todayItems } from '../scripts/ops/lib/hqSnapshot';
import { priceUsage } from '../scripts/ops/lib/claude';
import type { OpsHealth, OpsPost, PartnerLead } from '../src/types/ops';

const HOUR = 3_600_000;
const now = Date.parse('2026-10-08T18:00:00Z');

const post = (over: Partial<OpsPost> & { updatedAt?: number }): OpsPost => ({
  id: 'p1', brand: 'calgarydaily', template: 'event', status: 'drafted', fingerprint: 'f', entityIds: [], entityStarts: {}, sourceUrls: [],
  facts: '', caption: 'Caption', altText: '', link: '', imageText: { eyebrow: '', headline: 'Headline', details: [], footer: '' },
  imageUrl: null, imagePath: null, warnings: [], sponsored: false, relevantUntil: null, suggestedFor: null, ...over,
} as OpsPost);

const lead = (over: Partial<PartnerLead>): PartnerLead => ({
  id: 'l1', entityId: null, entityKind: null, businessName: 'Biz', category: '', neighbourhood: '', website: null, contactName: null, contactRole: null,
  contactEmail: null, emailSourceUrl: null, emailFoundAt: null, consentBasis: null, noSolicitationNotice: false, reasonRelevant: '', status: 'contacted',
  draftSubject: '', draftBody: '', followUps: 0, lastContactAt: null, nextFollowUpAt: null, conversationId: null, doNotContact: false, notes: '',
  history: [], createdAt: 0, updatedAt: 0, ...over,
});

describe('waiting on you', () => {
  it('lists drafts, fixes, failures, replies and pitches oldest first', () => {
    const items = todayItems(
      [post({ id: 'a', status: 'drafted', updatedAt: now - 2 * HOUR }), post({ id: 'b', status: 'needs-correction', updatedAt: now - 5 * HOUR }), post({ id: 'c', status: 'published' })],
      [lead({ id: 'r', lastReply: { at: now - 30 * HOUR, from: 'x', subject: '', text: 'Sounds good, tell me more', classification: 'interested', suggestedSubject: '', suggestedBody: '', approved: false, sent: false } }),
       lead({ id: 's', lastReply: { at: now, from: 'x', subject: '', text: 'stop', classification: 'stop', suggestedSubject: '', suggestedBody: '', approved: false, sent: false } }),
       lead({ id: 'q', status: 'ready', draftSubject: 'Hello', updatedAt: now - HOUR })],
      { checkedAt: now, items: [{ id: 'claude', label: 'Drafting', ok: false, detail: 'No key' }, { id: 'x', label: 'Fine', ok: true, detail: '' }] },
    );
    assert.deepEqual(items.map(i => i.id), ['reply-r', 'post-b', 'post-a', 'pitch-q', 'health-claude']);
  });
});

describe('pipelines', () => {
  it('counts stages and the last 30 days of sends and replies', () => {
    const p = calgaryWatchPipeline([
      lead({ status: 'contacted', history: [{ at: now - HOUR, type: 'sent', summary: '' }] }),
      lead({ status: 'interested', updatedAt: now, history: [{ at: now - 40 * 24 * HOUR, type: 'sent', summary: '' }, { at: now - HOUR, type: 'reply', summary: '' }] }),
      lead({ status: 'ready' }),
    ], now);
    assert.deepEqual(p.stages.map(s => s.count), [1, 1, 0, 1, 0]);
    assert.equal(p.sent30, 1);
    assert.equal(p.replies30, 1);
    assert.equal(p.interested30, 1);
  });
});

describe('spend', () => {
  it('prices usage per model, with cache reads at a tenth of input', () => {
    assert.equal(priceUsage('claude-opus-5', { input_tokens: 1_000_000, output_tokens: 0 }), 5);
    assert.equal(priceUsage('claude-opus-5', { input_tokens: 0, output_tokens: 1_000_000, cache_read_input_tokens: 1_000_000 }), 25.5);
    assert.equal(priceUsage('claude-haiku-5-5', { input_tokens: 1_000_000, output_tokens: 1_000_000 }), 0.6);
  });
  it('sums month to date, last 7 and last 30 days', () => {
    const s = spendSummary([
      { date: '2026-09-25', usd: 10, calls: 1, byTask: {} },
      { date: '2026-10-01', usd: 2, calls: 1, byTask: {} },
      { date: '2026-10-08', usd: 1.5, calls: 1, byTask: {} },
    ], '2026-10-08');
    assert.equal(s.monthToDate, 3.5);
    assert.equal(s.last7, 1.5);
    assert.equal(s.last30, 13.5);
  });
});

describe('bottlenecks', () => {
  it('flags old decisions, late posts and a stale inbox', () => {
    const health: OpsHealth = { checkedAt: now, items: [{ id: 'workflows', label: 'Scheduled jobs', ok: false, detail: 'Failed: Ops' }] };
    const b = bottlenecks({
      today: [{ id: 'x', business: 'calgarydaily', kind: 'post-review', title: '', detail: '', since: now - 80 * HOUR, link: null }],
      performance: { updatedAt: now, followers: {}, byFormat: [], bySlot: [], byKind: [], top: [], avgDelayMinutes: 45 },
      inboxCheckedAt: now - 8 * HOUR, health, failed7d: 0, now,
    });
    const by = Object.fromEntries(b.map(x => [x.id, x.severity]));
    assert.deepEqual(by, { you: 'bad', late: 'warn', inbox: 'bad', failed: 'ok', workflows: 'bad' });
  });
});
