import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const people = readFileSync('src/pages/admin/AdminUserListPage.tsx', 'utf8');
const settings = readFileSync('src/pages/MapPage.tsx', 'utf8');
const sender = readFileSync('scripts/digest/weekly.ts', 'utf8');
const rules = readFileSync('firestore.rules', 'utf8');

describe('admin digest subscriber tracking', () => {
  it('shows every operational audience state with useful counts and filters', () => {
    for (const label of [
      'Active digest', 'Welcome next', 'Weekly brief', 'Opt-out pending',
      'Unsubscribed', 'Needs attention', 'Not subscribed',
    ]) assert.match(people, new RegExp(label));
    assert.match(people, /digest_unsubscribes/);
    assert.match(people, /Consent recorded/);
    assert.match(people, /Opt-out requested/);
  });

  it('tracks both unsubscribe routes without deleting their evidence', () => {
    assert.match(settings, /digestUnsubscribeSource: optedOutNow/);
    assert.match(settings, /'account-settings'/);
    assert.match(sender, /digestUnsubscribeSource: 'email-link'/);
    assert.match(rules, /Deleting would destroy the proof/);
  });

  it('keeps a newer re-subscription authoritative over an older opt-out request', () => {
    assert.match(sender, /newConsentAt > requestedAt/);
    assert.match(sender, /superseded-by-new-consent/);
    assert.match(people, /requestWasSuperseded/);
  });

  it('does not let the directory edit a reader consent decision', () => {
    assert.doesNotMatch(people, /onPatch\([^)]*weeklyDigestOptIn/);
  });
});
