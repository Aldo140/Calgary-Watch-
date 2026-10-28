/**
 * Admin claim alerts: every new claim, and organizer sign-ups whose claim
 * never arrived, reach an admin's inbox once.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { SIGNUP_GRACE_MS, SIGNUP_LOOKBACK_MS, adminAlertEmail, alertKey, signupNeedsAlert, type ClaimAlert, type SignupAlert } from '../src/lib/claimAdminAlert.ts';

const now = Date.UTC(2026, 9, 28, 19);
const claim: ClaimAlert = {
  kind: 'claim', claimId: 'u1_biz-lake', entityTitle: 'Lake Bonavista Community Association', entityPath: '/local/lake-bonavista-community-association',
  name: 'Cara Example', role: 'Staff', workEmail: 'cara@thelbca.ca', accountEmail: 'cara@thelbca.ca', phone: '', note: '', evidence: 'account-domain', createdAt: now - 60_000,
};
const signup: SignupAlert = {
  kind: 'signup', uid: 'u2', name: 'Sam', email: 'sam@gmail.com', entityTitle: 'Sample Market', entityPath: '/markets/sample', emailVerified: false, createdAt: now - SIGNUP_GRACE_MS,
};

describe('claim admin alerts', () => {
  it('keys each claim and sign-up separately so each is reported once', () => {
    assert.equal(alertKey(claim), 'claim_u1_biz-lake');
    assert.equal(alertKey(signup), 'signup_u2');
  });

  it('waits out the grace period, skips old sign-ups and ones whose claim arrived', () => {
    assert.equal(signupNeedsAlert(now - SIGNUP_GRACE_MS + 1, false, now), false);
    assert.equal(signupNeedsAlert(now - SIGNUP_GRACE_MS, false, now), true);
    assert.equal(signupNeedsAlert(now - SIGNUP_GRACE_MS, true, now), false);
    assert.equal(signupNeedsAlert(now - SIGNUP_LOOKBACK_MS - 1, false, now), false);
    assert.equal(signupNeedsAlert(0, false, now), false);
  });

  it('names the organization in the subject of a single alert', () => {
    const mail = adminAlertEmail([claim]);
    assert.equal(mail.subject, '[CalgaryWatch] 1 new claim: Lake Bonavista Community Association');
    assert.match(mail.text, /Signed in at the organization’s domain/);
    assert.match(mail.text, /calgarywatch\.ca\/admin/);
  });

  it('counts both kinds and says why a sign-up is stuck', () => {
    const mail = adminAlertEmail([claim, signup]);
    assert.equal(mail.subject, '[CalgaryWatch] 1 new claim, 1 organizer sign-up without a claim');
    assert.match(mail.text, /Email not verified yet/);
    assert.match(adminAlertEmail([{ ...signup, emailVerified: true }]).text, /never sent/);
  });

  it('escapes claimant text in the HTML', () => {
    assert.doesNotMatch(adminAlertEmail([{ ...claim, note: '<script>x</script>' }]).html, /<script>/);
  });

  it('runs hourly and only admins can read what was sent', () => {
    assert.match(readFileSync('.github/workflows/discovery-actions.yml', 'utf8'), /scripts\/claims\/notify-admins\.ts/);
    assert.match(readFileSync('firestore.rules', 'utf8'), /match \/admin_alerts\/\{id\} \{ allow read: if isAdmin\(\); allow write: if false; \}/);
  });
});
