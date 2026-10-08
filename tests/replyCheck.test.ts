/** HQ's reply check: which Gmail replies reach the board and what the agent is shown (pure; no network). */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { boardState, linksIn, replyBoard, sameParty, triageContext, triageKey, waitingReplies } from '../scripts/ops/lib/replyCheck';
import type { GmailReply, GmailSend, GmailSummary, ReplyTriage, TriageDecision } from '../scripts/ops/lib/replyCheck';

const HOUR = 3_600_000;
const now = Date.parse('2026-10-08T18:00:00Z');

const reply = (over: Partial<GmailReply>): GmailReply => ({
  at: now - 2 * HOUR, alias: 'aldo@vowmotionweddings.com', business: 'vowmotion', from: 'jo@venue.ca', name: 'Jo', subject: 'Re: Films',
  snippet: 'Sounds good, what are your rates?', kind: 'reply', toPitch: true, answered: false, url: 'https://mail.google.com/mail/u/0/#all/t1', ...over,
});
const send = (over: Partial<GmailSend>): GmailSend => ({
  at: now - 48 * HOUR, alias: 'aldo@vowmotionweddings.com', business: 'vowmotion', to: 'jo@venue.ca', domain: 'venue.ca', subject: 'Films',
  first: true, wrongAlias: null, replied: true, url: 'https://mail.google.com/mail/u/0/#all/t1', ...over,
});
const gmail = (replies: GmailReply[], sends: GmailSend[] = []): GmailSummary => ({ generatedAt: now, account: 'me@gmail.com', days: 30, sends, replies });
const triage = (r: GmailReply, needsAction: boolean): ReplyTriage => ({
  key: triageKey(r), url: r.url, replyAt: r.at, from: r.from, at: now, fingerprint: 'f', needsAction, category: needsAction ? 'question' : 'informational',
  reason: needsAction ? 'They asked for rates.' : 'Just a thank-you.', checks: [], related: [],
  subtask: needsAction ? { title: 'Send Jo the rate card', detail: '', draftReply: null } : null,
});
const decision = (r: GmailReply, d: TriageDecision['decision'], at = now): TriageDecision => ({ key: triageKey(r), decision: d, title: null, by: 'aldo', at });

describe('which replies wait', () => {
  it('keeps only the newest unanswered real reply per thread, counting the earlier ones', () => {
    const older = reply({ at: now - 5 * HOUR, snippet: 'Hi!' });
    const newer = reply({ at: now - HOUR });
    const answered = reply({ url: 'x/#all/t2', answered: true });
    const auto = reply({ url: 'x/#all/t3', kind: 'auto' });
    const notPitch = reply({ url: 'x/#all/t4', toPitch: false });
    const w = waitingReplies(gmail([older, newer, answered, auto, notPitch]));
    assert.equal(w.length, 1);
    assert.equal(w[0].reply.at, newer.at);
    assert.equal(w[0].earlier, 1);
  });

  it('gives a new reply in the same thread a new key', () => {
    assert.notEqual(triageKey(reply({ at: 1 })), triageKey(reply({ at: 2 })));
    assert.match(triageKey(reply({})), /^[\w-]+$/);
  });
});

describe('where a reply lands', () => {
  it('follows the agent until Aldo decides, then follows Aldo', () => {
    const r = reply({});
    assert.equal(boardState(undefined, undefined), 'unchecked');
    assert.equal(boardState(triage(r, true), undefined), 'proposed');
    assert.equal(boardState(triage(r, false), undefined), 'filtered');
    assert.equal(boardState(triage(r, true), decision(r, 'approved')), 'approved');
    assert.equal(boardState(triage(r, true), decision(r, 'dismissed')), 'filtered');
    assert.equal(boardState(triage(r, false), decision(r, 'reopened')), 'reopened');
    assert.equal(boardState(triage(r, true), decision(r, 'done')), 'done');
  });

  it('keeps no-action replies off the board and lists them as filtered', () => {
    const a = reply({ url: 'x/#all/a', from: 'a@a.ca' });
    const b = reply({ url: 'x/#all/b', from: 'b@b.ca' });
    const c = reply({ url: 'x/#all/c', from: 'c@c.ca' });
    const { board, filtered } = replyBoard({ gmail: gmail([a, b, c]), triage: { items: [triage(a, true), triage(b, false)] }, decisions: [] });
    assert.deepEqual(board.map((i) => i.reply.from).sort(), ['a@a.ca', 'c@c.ca']);
    assert.deepEqual(filtered.map((i) => i.reply.from), ['b@b.ca']);
  });

  it('uses the latest decision on a reply', () => {
    const r = reply({});
    const { board } = replyBoard({ gmail: gmail([r]), triage: { items: [triage(r, true)] }, decisions: [decision(r, 'approved', now), decision(r, 'dismissed', now - HOUR)] });
    assert.equal(board[0].state, 'approved');
  });

  it("ignores a decision on an older reply once they've written again", () => {
    const first = reply({ at: now - 5 * HOUR });
    const again = reply({ at: now - HOUR });
    const { board } = replyBoard({ gmail: gmail([first, again]), triage: { items: [] }, decisions: [decision(first, 'dismissed')] });
    assert.equal(board[0].state, 'unchecked');
  });
});

describe('what the agent is shown', () => {
  it('includes the whole conversation and mail with the same organisation elsewhere', () => {
    const r = reply({ thread: [
      { at: now - 48 * HOUR, ours: true, from: 'aldo@vowmotionweddings.com', text: 'Would you like a film of your venue?' },
      { at: now - 2 * HOUR, ours: false, from: 'jo@venue.ca', text: 'Sounds good, what are your rates?' },
    ] });
    const elsewhere = send({ at: now - HOUR, to: 'events@venue.ca', subject: 'Our rate card', first: true, url: 'x/#all/t9' });
    const unrelated = send({ to: 'someone@else.ca', url: 'x/#all/t8' });
    const text = triageContext(r, gmail([r], [send({}), elsewhere, unrelated]), now);
    assert.match(text, /US \(aldo@vowmotionweddings.com\): Would you like a film/);
    assert.match(text, /THEM \(jo@venue.ca\): Sounds good/);
    assert.match(text, /US to events@venue.ca .*Our rate card/);
    assert.doesNotMatch(text, /someone@else/);
  });

  it('says when only a snippet is available', () => {
    assert.match(triageContext(reply({}), gmail([reply({})]), now), /Only a short snippet/);
  });

  it("doesn't treat webmail domains as one organisation", () => {
    assert.ok(sameParty('a@venue.ca', 'b@venue.ca'));
    assert.ok(!sameParty('a@gmail.com', 'b@gmail.com'));
    assert.ok(sameParty('A@gmail.com', 'a@gmail.com'));
  });

  it('checks links to our sites and theirs only', () => {
    const text = 'Your link https://vowmotionweddings.com/rates. is broken, see (https://www.venue.ca/a) and http://169.254.169.254/x https://evil.com';
    assert.deepEqual(linksIn(text, 'jo@venue.ca'), ['https://vowmotionweddings.com/rates', 'https://www.venue.ca/a']);
    assert.deepEqual(linksIn('https://gmail.com/x', 'jo@gmail.com'), []);
  });
});
