/**
 * Business accounts: claiming needs an account, and an approved claim marks
 * that account as a business account. Only an admin can set the mark.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { BUSINESS_FIELDS, businessAccountPatch, businessAccountsFromClaims, readBusinessAccount } from '../src/lib/businessAccount.ts';
import { readPlansProfile } from '../src/lib/plansProfile.ts';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

describe('business account state', () => {
  it('a profile without the mark is personal', () => {
    assert.equal(readBusinessAccount({ role: 'user' }), null);
    assert.equal(readBusinessAccount({ accountType: 'personal' }), null);
    assert.equal(readPlansProfile({ displayName: 'Kim' }).business, null);
  });

  it('approval marks the account, keeps earlier listings and the first date', () => {
    const first = businessAccountPatch({ role: 'user' }, 'biz-vertigo-theatre', 100);
    assert.deepEqual(first, { accountType: 'business', businessListings: ['biz-vertigo-theatre'], businessSince: 100 });
    const second = businessAccountPatch({ ...first }, 'ev-vertigo-1', 200);
    assert.deepEqual(second, { accountType: 'business', businessListings: ['biz-vertigo-theatre', 'ev-vertigo-1'], businessSince: 100 });
    assert.deepEqual(businessAccountPatch(second, 'ev-vertigo-1', 300), second, 'approving twice changes nothing');
    assert.deepEqual(readPlansProfile(second).business, { since: 100, listings: ['biz-vertigo-theatre', 'ev-vertigo-1'] });
  });

  it('only approved claims count when bringing older accounts in line', () => {
    const rows = businessAccountsFromClaims([
      { uid: 'u1', entityId: 'a', status: 'approved', reviewedAt: 50 },
      { uid: 'u1', entityId: 'b', status: 'approved', reviewedAt: 20 },
      { uid: 'u2', entityId: 'c', status: 'pending' },
      { uid: 'u3', entityId: 'd', status: 'rejected', reviewedAt: 10 },
    ]);
    assert.deepEqual([...rows], [['u1', { listings: ['a', 'b'], since: 20 }]]);
  });
});

describe('who can set it', () => {
  const rules = read('firestore.rules');
  const users = rules.slice(rules.indexOf('match /users/{userId}'), rules.indexOf('match /incidents/'));

  it('members cannot create or change business fields on their own profile', () => {
    assert.match(users, /allow create: if isOwner\(userId\) &&[\s\S]*?!request\.resource\.data\.keys\(\)\.hasAny\(\['accountType', 'businessListings', 'businessSince'\]\)/);
    assert.match(users, /allow update: if isOwner\(userId\) &&[\s\S]*?!request\.resource\.data\.diff\(resource\.data\)\.affectedKeys\(\)\.hasAny\(\['accountType', 'businessListings', 'businessSince'\]\)/);
    assert.deepEqual([...BUSINESS_FIELDS], ['accountType', 'businessListings', 'businessSince']);
  });

  it('admins can set them, with a fixed set of account types', () => {
    assert.match(users, /hasOnly\(\[\s*'displayName', 'notes', 'role', 'accountType', 'businessListings', 'businessSince'\s*\]\)/);
    assert.match(users, /get\('accountType', 'personal'\) in \['personal', 'business'\]/);
  });

  it('claiming needs a signed-in account with a verified email', () => {
    const claims = rules.slice(rules.indexOf('match /listing_claims/'), rules.indexOf('match /listing_updates/'));
    assert.match(claims, /allow create: if isAuthenticated\(\) &&\s*request\.auth\.token\.email_verified == true/);
  });

  it('approving a claim in admin marks the claimant’s account', () => {
    const panel = read('src/components/admin/ClaimsPanel.tsx');
    assert.match(panel, /approveOrganizationClaim/);
    const server=readFileSync(new URL('../scripts/claims/approve-organization.ts',import.meta.url),'utf8');
    assert.match(server,/runTransaction/);
    assert.match(server, /claimApprovalWrites/);
    assert.match(server, /tx.update\(accountRef,writes.account\)/);
    assert.match(panel, /doc\(db, 'users', uid\)/);
  });
});
