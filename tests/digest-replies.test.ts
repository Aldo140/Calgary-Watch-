import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { loadSenderConfig } from '../scripts/digest/send.js';

const sender = readFileSync('scripts/digest/send.ts', 'utf8');
const weekly = readFileSync('scripts/digest/weekly.ts', 'utf8');
const sync = readFileSync('scripts/digest/sync-replies.ts', 'utf8');
const workflow = readFileSync('.github/workflows/sync-email-replies.yml', 'utf8');
const weeklyWorkflow = readFileSync('.github/workflows/weekly-digest.yml', 'utf8');
const inbox = readFileSync('src/components/admin/DigestReplyInbox.tsx', 'utf8');
const planner = readFileSync('src/components/admin/WeeklyEmailPlanner.tsx', 'utf8');
const rules = readFileSync('firestore.rules', 'utf8');

describe('digest reply routing', () => {
  it('resolves inbound, explicit fallback and support addresses in that order', () => {
    const base = { RESEND_API_KEY: 'test-key', DIGEST_DRY_RUN: 'false' };
    assert.equal(loadSenderConfig({ ...base, DIGEST_SUPPORT_EMAIL: 'support@example.com' }).replyTo, 'support@example.com');
    assert.equal(loadSenderConfig({ ...base, DIGEST_SUPPORT_EMAIL: 'support@example.com', DIGEST_REPLY_TO: 'desk@example.com' }).replyTo, 'desk@example.com');
    assert.equal(loadSenderConfig({
      ...base,
      DIGEST_SUPPORT_EMAIL: 'support@example.com',
      DIGEST_REPLY_TO: 'desk@example.com',
      DIGEST_INBOUND_ADDRESS: 'replies@inbound.example.com',
    }).replyTo, 'replies@inbound.example.com');
  });

  it('always has a human fallback and prefers the inbound route when configured', () => {
    assert.match(sender, /DIGEST_INBOUND_ADDRESS[\s\S]*DIGEST_REPLY_TO[\s\S]*DIGEST_SUPPORT_EMAIL/);
    assert.match(weeklyWorkflow, /DIGEST_INBOUND_ADDRESS/);
    assert.match(weeklyWorkflow, /DIGEST_REPLY_TO/);
  });

  it('uses a unique opaque token per send and preserves it in the private ledger', () => {
    assert.match(weekly, /randomBytes\(10\)\.toString\('hex'\)/);
    assert.match(weekly, /replyToken,/);
    assert.match(weekly, /tokenizedReplyAddress\(sender\.inboundAddress, replyToken\)/);
  });

  it('keeps manual proofs separate from Monday while retaining reply context', () => {
    assert.match(weekly, /claimWeekKey = sender\.testRecipient/);
    assert.match(weekly, /REPLY_ROUTES\)\.doc\(replyToken\)\.set/);
    assert.match(weekly, /await claim\.delete/);
    assert.match(sync, /collection\(REPLY_ROUTES\)\.doc\(token\)/);
  });
});

describe('reply synchronization safety', () => {
  it('runs on the free-plan GitHub scheduler and reports source health', () => {
    assert.match(workflow, /cron: '\*\/10 \* \* \* \*'/);
    assert.match(workflow, /RESEND_API_KEY/);
    assert.match(sync, /collection\(HEALTH\)\.doc\(SOURCE_ID\)/);
  });

  it('stores bounded plain text, never active inbound HTML or attachment downloads', () => {
    assert.match(sync, /MAX_BODY_CHARS = 20_000/);
    assert.match(sync, /safePlainText\(email\.text, email\.html\)/);
    assert.doesNotMatch(sync, /download_url/);
    assert.match(sync, /attachments = .*slice\(0, 20\)/s);
  });

  it('deduplicates by provider id and links tokenized replies to the send ledger', () => {
    assert.match(sync, /collection\(REPLIES\)\.doc\(summary\.id\)/);
    assert.match(sync, /where\('replyToken', '==', token\)/);
    assert.match(sync, /if \(\(await ref\.get\(\)\)\.exists\) continue/);
  });
});

describe('admin reply inbox', () => {
  it('is admin-only and only permits workflow-field edits', () => {
    const block = rules.slice(rules.indexOf('match /digest_replies/'));
    assert.match(block.slice(0, 1200), /allow read: if isAdmin\(\)/);
    assert.match(block.slice(0, 1200), /changedKeys\(\)\.hasOnly/);
    assert.match(block.slice(0, 1200), /allow create, delete: if false/);
    assert.match(rules, /match \/digest_reply_routes\/[\s\S]*allow read, write: if false/);
  });

  it('supports a compact response workflow without rendering inbound HTML', () => {
    assert.match(planner, /id: 'replies'/);
    assert.match(inbox, /Needs action/);
    assert.match(inbox, /Mark handled/);
    assert.match(inbox, /Archive/);
    assert.match(inbox, /Internal note/);
    assert.doesNotMatch(inbox, /dangerouslySetInnerHTML/);
  });
});
