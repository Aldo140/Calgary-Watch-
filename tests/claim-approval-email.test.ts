/**
 * Claim approval email: sent once per approved claim, only for claims approved
 * after the feature shipped, and it only describes what's actually built.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { APPROVAL_EMAILS_SINCE, approvalEmail, approvalRecipients, needsApprovalEmail } from '../src/lib/claimApprovalEmail.ts';
import { guaranteeProblems } from '../scripts/ops/lib/claimFacts.ts';

const claim = {
  uid: 'u1', entityId: 'biz-sample', entityTitle: 'Sample Bakery', entityPath: '/local/sample-bakery',
  name: 'Jordan Lee', workEmail: 'jordan@samplebakery.ca', accountEmail: 'jordan@gmail.com',
  status: 'approved', reviewedAt: APPROVAL_EMAILS_SINCE + 60_000,
};

describe('claim approval email', () => {
  it('is due only for approved claims reviewed after the cutoff and not yet emailed', () => {
    assert.equal(needsApprovalEmail(claim), true);
    assert.equal(needsApprovalEmail({ ...claim, status: 'pending' }), false);
    assert.equal(needsApprovalEmail({ ...claim, status: 'rejected' }), false);
    assert.equal(needsApprovalEmail({ ...claim, reviewedAt: APPROVAL_EMAILS_SINCE - 1 }), false);
    assert.equal(needsApprovalEmail({ ...claim, reviewedAt: null }), false);
    for (const s of ['sending', 'sent', 'failed', 'skipped'] as const) assert.equal(needsApprovalEmail({ ...claim, approvalEmailStatus: s }), false);
  });

  it('goes to the account email and a different work email, once each', () => {
    assert.deepEqual(approvalRecipients(claim), ['jordan@gmail.com', 'jordan@samplebakery.ca']);
    assert.deepEqual(approvalRecipients({ accountEmail: 'A@x.ca', workEmail: 'a@x.ca' }), ['A@x.ca']);
    assert.deepEqual(approvalRecipients({ accountEmail: 'a@x.ca', workEmail: 'not an email' }), ['a@x.ca']);
  });

  it('names the listing and links the listing, dashboard and claim page', () => {
    const m = approvalEmail(claim, { mailingAddress: '1 Main St, Calgary AB' });
    assert.equal(m.subject, 'Sample Bakery is now verified on CalgaryWatch');
    assert.match(m.text, /^Hi Jordan,/);
    for (const url of ['https://calgarywatch.ca/local/sample-bakery', 'https://calgarywatch.ca/plans', 'https://calgarywatch.ca/claim/biz-sample']) {
      assert.ok(m.text.includes(url), url);
      assert.ok(m.html.includes(url), url);
    }
    assert.match(m.text, /Verified · Confirmed by the organization/);
    assert.match(m.text, /business account/);
    assert.match(m.text, /1 Main St, Calgary AB/);
  });

  it('mentions the ranking weight only while it is switched on, and never promises placement', () => {
    const on = approvalEmail(claim, { mailingAddress: '', priorityEnabled: true });
    const off = approvalEmail(claim, { mailingAddress: '', priorityEnabled: false });
    assert.match(on.text, /more weight/);
    assert.doesNotMatch(off.text, /weight|priorit/);
    assert.deepEqual(guaranteeProblems(on.text), []);
    assert.doesNotMatch(on.text, /guarantee|top rank|always (shown|appear)|featured everywhere/i);
  });

  it('escapes the listing title in the HTML', () => {
    const m = approvalEmail({ ...claim, entityTitle: 'Tom & Jerry <Cafe>' }, { mailingAddress: '' });
    assert.ok(m.html.includes('Tom &amp; Jerry &lt;Cafe&gt;'));
    assert.ok(!m.html.includes('<Cafe>'));
  });

  it('runs hourly with the other admin queues and can send a sample', () => {
    const wf = readFileSync(new URL('../.github/workflows/discovery-actions.yml', import.meta.url), 'utf8');
    assert.match(wf, /scripts\/claims\/send-approval-emails\.ts/);
    assert.match(wf, /CLAIM_EMAIL_SAMPLE_TO/);
  });
});
