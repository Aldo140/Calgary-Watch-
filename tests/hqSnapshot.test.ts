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

import { activity, hqPosts, inbox } from '../scripts/ops/lib/hqSnapshot';
import { applyLeadCommand, applyPostCommand, type HqCommand } from '../scripts/ops/lib/hqCommands';

const cmd = (over: Partial<HqCommand>): HqCommand => ({ id: 'c1', type: 'approve-post', targetId: 'p1', payload: {}, by: 'aldo@calgarywatch.ca', at: now, ...over });

describe('HQ actions', () => {
  it('approves a drafted post for its suggested slot, with an edited caption', () => {
    const r = applyPostCommand(cmd({ payload: { caption: ' New caption ' } }), post({ status: 'drafted', suggestedFor: now + 2 * HOUR }), now);
    assert.ok(r.ok);
    assert.equal(r.update.status, 'approved');
    assert.equal(r.update.scheduledFor, now + 2 * HOUR);
    assert.equal(r.update.caption, 'New caption');
    assert.equal(r.update.reviewedByEmail, 'aldo@calgarywatch.ca (HQ)');
  });
  it('never schedules in the past, and refuses posts that already went out', () => {
    const late = applyPostCommand(cmd({}), post({ status: 'drafted', suggestedFor: now - HOUR }), now);
    assert.ok(late.ok && late.update.scheduledFor === now);
    assert.equal(applyPostCommand(cmd({}), post({ status: 'published' }), now).ok, false);
    assert.equal(applyPostCommand(cmd({}), null, now).ok, false);
  });
  it('rejects, redrafts with a note, and unschedules', () => {
    const rej = applyPostCommand(cmd({ type: 'reject-post' }), post({ status: 'drafted' }), now);
    assert.ok(rej.ok && rej.update.status === 'rejected');
    const red = applyPostCommand(cmd({ type: 'redraft-post', payload: { note: 'lead with the free entry' } }), post({ status: 'drafted' }), now);
    assert.ok(red.ok && red.update.status === 'redraft' && red.update.note === 'lead with the free entry');
    assert.equal(applyPostCommand(cmd({ type: 'unschedule-post' }), post({ status: 'drafted' }), now).ok, false);
  });
  it('approves an edited pitch only while it is waiting, and never for a do-not-contact lead', () => {
    const ok = applyLeadCommand(cmd({ type: 'approve-pitch', payload: { subject: 'Hi', body: 'Body' } }), lead({ status: 'ready', contactEmail: 'a@b.ca' }), now);
    assert.ok(ok.ok && ok.update.status === 'approved' && ok.update.draftBody === 'Body');
    assert.equal(applyLeadCommand(cmd({ type: 'approve-pitch' }), lead({ status: 'contacted' }), now).ok, false);
    assert.equal(applyLeadCommand(cmd({ type: 'approve-pitch' }), lead({ status: 'ready', doNotContact: true }), now).ok, false);
  });
  it('approves or closes a reply through nested fields', () => {
    const reply = { at: now, from: 'x', subject: '', text: 'Tell me more', classification: 'interested' as const, suggestedSubject: '', suggestedBody: 'Draft', approved: false, sent: false };
    const a = applyLeadCommand(cmd({ type: 'approve-reply', payload: { body: 'Edited' } }), lead({ lastReply: reply }), now);
    assert.ok(a.ok && a.update['lastReply.approved'] === true && a.update['lastReply.suggestedBody'] === 'Edited');
    const h = applyLeadCommand(cmd({ type: 'handled-reply' }), lead({ lastReply: reply }), now);
    assert.ok(h.ok && h.update['lastReply.sent'] === true);
    assert.equal(applyLeadCommand(cmd({ type: 'approve-reply' }), lead({ lastReply: { ...reply, sent: true } }), now).ok, false);
  });
});

describe('snapshot v2', () => {
  it('keeps open posts and the last 14 days of published ones, newest first', () => {
    const ps = hqPosts([
      post({ id: 'old', status: 'published', publishedAt: now - 20 * 24 * HOUR }),
      post({ id: 'pub', status: 'published', publishedAt: now - HOUR }),
      post({ id: 'draft', status: 'drafted', suggestedFor: now + HOUR }),
      post({ id: 'rej', status: 'rejected' }),
    ], now);
    assert.deepEqual(ps.map(p => p.id), ['draft', 'pub']);
    assert.equal(ps[0].format, 'image');
  });
  it('puts waiting replies and pitches in the inbox, never opt-outs', () => {
    const r = (classification: 'interested' | 'stop') => ({ at: now, from: 'x', subject: '', text: '', classification, suggestedSubject: '', suggestedBody: '', approved: false, sent: false });
    const box = inbox([lead({ id: 'a', lastReply: r('interested') }), lead({ id: 'b', lastReply: r('stop') }), lead({ id: 'c', status: 'follow-up-ready' })], now);
    assert.deepEqual(box.replies.map(x => x.leadId), ['a']);
    assert.deepEqual(box.pitches.map(x => [x.leadId, x.followUp]), [['c', true]]);
  });
  it('lists recent sends, replies and posts newest first', () => {
    const a = activity([lead({ businessName: 'Biz', history: [{ at: now - HOUR, type: 'sent', summary: 'Pitch sent' }, { at: now - 100 * HOUR, type: 'sent', summary: 'old' }] })], [post({ status: 'published', publishedAt: now - 2 * HOUR })], now);
    assert.deepEqual(a.map(x => x.type), ['Email sent', 'Posted']);
  });
});

import { pipelineDetail } from '../scripts/ops/lib/hqSnapshot';
import { outperformers, ownSummary } from '../scripts/ops/lib/scout';

describe('Instagram and inspiration', () => {
  const media = (daysAgo: number, likes: number, extra = {}) => ({ id: String(daysAgo), caption: `post ${daysAgo}`, mediaType: 'VIDEO', productType: 'REELS', permalink: `p${daysAgo}`, timestamp: now - daysAgo * 24 * HOUR, likes, comments: 0, mediaUrl: `img${daysAgo}`, ...extra });
  it('ranks posts by lift over their own account, so a small account can win', () => {
    const big = { username: 'Big', followers: 100000, mediaCount: 3, media: [media(1, 1000), media(2, 900), media(3, 1100)] };
    const small = { username: 'small', followers: 900, mediaCount: 3, media: [media(1, 400), media(2, 40), media(3, 50)] };
    const out = outperformers([big, small], now);
    assert.equal(out[0].handle, 'small');
    assert.equal(out[0].lift, 8);
    assert.ok(!out.some(o => o.handle === 'big'));
  });
  it('summarizes an own account with its recent posts and images', () => {
    const o = ownSummary({ username: 'arctoslaunchpad', followers: 120, mediaCount: 2, media: [media(1, 10), media(40, 4, { productType: 'FEED', mediaType: 'IMAGE' })] }, 'arctos', now);
    assert.equal(o.business, 'arctos');
    assert.equal(o.posts30, 1);
    assert.equal(o.recent[0].mediaUrl, 'img1');
    assert.equal(o.recent[1].reel, false);
  });
});

describe('pipeline detail', () => {
  it('counts sends and replies per day, reply rate and categories', () => {
    const dateOf = (t: number) => new Date(t).toISOString().slice(0, 10);
    const d = pipelineDetail([
      lead({ id: 'a', category: 'Market', status: 'interested', history: [{ at: now - 30 * HOUR, type: 'sent', summary: '' }, { at: now - 6 * HOUR, type: 'reply', summary: '' }], lastReply: { at: now - 6 * HOUR, from: '', subject: '', text: '', classification: 'interested', suggestedSubject: '', suggestedBody: '', approved: false, sent: false } }),
      lead({ id: 'b', category: 'Market', status: 'contacted', history: [{ at: now - 30 * HOUR, type: 'sent', summary: '' }] }),
      lead({ id: 'c', category: 'Theatre', status: 'ready' }),
    ], now, dateOf);
    assert.equal(d.replyRate, 50);
    assert.equal(d.medianHoursToReply, 24);
    assert.equal(d.sendsByDay.length, 30);
    assert.equal(d.sendsByDay.reduce((n, x) => n + x.sent, 0), 2);
    assert.deepEqual(d.byCategory[0], { category: 'Market', total: 2, contacted: 2, replied: 1, interested: 1 });
    assert.equal(d.leads[0].id, 'a');
  });
});
