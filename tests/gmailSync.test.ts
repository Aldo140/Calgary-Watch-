/** HQ's Gmail sync from the routine: the summary it builds, how runs merge, and the seal (pure; no network). */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildSummary, gmailQuery, mergeSummary, newKeyPair, open, seal, sealInParts, threadUrl, type RawMail } from '../scripts/ops/lib/gmailSync';

const HOUR = 3_600_000;
const now = Date.parse('2026-10-10T04:00:00Z');
const iso = (hoursAgo: number) => new Date(now - hoursAgo * HOUR).toISOString();

const mail: RawMail = {
  account: 'mrotiz14@gmail.com',
  threads: [
    {
      id: 'a1',
      messages: [
        { at: iso(50), from: 'aldo@vowmotionweddings.com', to: ['hello@venue.ca'], subject: 'Wedding films', text: 'Hi! I run Vow Motion, wedding films in Calgary.' },
        { at: iso(10), from: 'Jo Smith <hello@venue.ca>', to: 'aldo@vowmotionweddings.com', subject: 'Re: Wedding films', text: 'Sounds great, what are your rates?\n\nOn Tue, Aldo wrote:\n> Hi!' },
      ],
    },
    {
      id: 'b2',
      messages: [{ at: iso(5), from: 'aldo@arctoslaunchpad.com', to: 'owner@shop.ca', subject: 'Your website', text: 'Arctos Launchpad builds sites.' }],
    },
    {
      id: 'c3',
      messages: [
        { at: iso(30), from: 'aldo@arctoslaunchpad.com', to: 'a@b.ca', subject: 'Hello', text: 'Arctos' },
        { at: iso(29), from: 'a@b.ca', to: 'aldo@arctoslaunchpad.com', subject: 'Automatic reply: Hello', text: 'I am away' },
      ],
    },
    // Ages out.
    { id: 'd4', messages: [{ at: iso(24 * 40), from: 'aldo@calgarywatch.ca', to: 'x@y.ca', subject: 'Old', text: '' }] },
  ],
};

describe('the summary the routine builds', () => {
  const s = buildSummary(mail, now);

  it('matches the Apps Script: sends, replies, kinds and who answered', () => {
    assert.equal(s.account, 'mrotiz14@gmail.com');
    assert.deepEqual(s.sends.map((x) => [x.to, x.business, x.first, x.replied]), [
      ['hello@venue.ca', 'vowmotion', true, true],
      ['owner@shop.ca', 'arctos', true, false],
      ['a@b.ca', 'arctos', true, true],
    ]);
    const jo = s.replies.find((r) => r.from === 'hello@venue.ca');
    assert.ok(jo);
    assert.equal(jo.name, 'Jo Smith');
    assert.equal(jo.snippet, 'Sounds great, what are your rates?');
    assert.equal(jo.kind, 'reply');
    assert.equal(jo.toPitch, true);
    assert.equal(jo.answered, false);
    assert.equal(jo.url, threadUrl('a1'));
    assert.equal(s.replies.find((r) => r.from === 'a@b.ca')?.kind, 'auto');
  });

  it('gives the newest unanswered real reply its conversation', () => {
    const jo = s.replies.find((r) => r.from === 'hello@venue.ca');
    assert.deepEqual(jo?.thread?.map((m) => m.ours), [true, false]);
    assert.equal(s.replies.find((r) => r.from === 'a@b.ca')?.thread, undefined);
  });

  it('searches every business address', () => {
    assert.match(gmailQuery(2), /^newer_than:2d \(from:aldo@vowmotionweddings\.com OR/);
  });
});

describe('merging a run into what HQ has', () => {
  it('replaces the threads read this run, keeps the others, drops mail older than 30 days', () => {
    const first = buildSummary(mail, now);
    const later = now + HOUR;
    const answered: RawMail = {
      account: mail.account,
      threads: [{ id: 'a1', messages: [...mail.threads[0].messages, { at: new Date(later).toISOString(), from: 'aldo@vowmotionweddings.com', to: 'hello@venue.ca', text: 'Sent!' }] }],
    };
    const old = { ...first, sends: [...first.sends, { ...first.sends[0], url: threadUrl('z9'), at: now - 31 * 24 * HOUR }] };
    const merged = mergeSummary(old, buildSummary(answered, later), ['a1'], later);
    assert.equal(merged.replies.find((r) => r.from === 'hello@venue.ca')?.answered, true);
    assert.ok(merged.sends.some((x) => x.to === 'owner@shop.ca'));
    assert.ok(!merged.sends.some((x) => x.url === threadUrl('z9')));
    assert.equal(merged.sends.filter((x) => x.url === threadUrl('a1')).length, 2);
  });
});

describe('the seal', () => {
  const { publicKey, privateKey } = newKeyPair();

  it('opens only with the private key', () => {
    const sealed = seal({ threadIds: ['a1'], summary: buildSummary(mail, now) }, publicKey);
    assert.doesNotMatch(sealed, /venue|rates/);
    assert.deepEqual(open(sealed, privateKey).threadIds, ['a1']);
    assert.throws(() => open(sealed, newKeyPair().privateKey));
  });

  it('splits a big read into parts that fit a workflow input', () => {
    const big: RawMail = {
      account: mail.account,
      threads: Array.from({ length: 400 }, (_, i) => ({
        id: `t${i}`,
        messages: [
          { at: iso(20), from: 'aldo@vowmotionweddings.com', to: `p${i}@venue${i}.ca`, subject: `Films ${i} ${Math.random()}`, text: 'Vow Motion' },
          { at: iso(10), from: `p${i}@venue${i}.ca`, to: 'aldo@vowmotionweddings.com', subject: 'Re', text: Array.from({ length: 120 }, () => Math.random().toString(36)).join(' ') },
        ],
      })),
    };
    const parts = sealInParts(big, publicKey, now);
    assert.ok(parts.length > 1);
    assert.ok(parts.every((p) => p.length <= 60_000));
    assert.equal(parts.flatMap((p) => open(p, privateKey).threadIds).length, 400);
  });
});
