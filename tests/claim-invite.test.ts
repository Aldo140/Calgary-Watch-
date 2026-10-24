/**
 * Personal claim links: the outreach side writes them, the claim page reads
 * them, and the outreach checks still accept them as the listing's own page.
 *
 * Run with: npm test
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { decodeInvite, encodeInvite, inviteGreetingName, normalizeInvite, personalClaimUrl, signupFields } from '../src/lib/claimInvite.ts';
import { claimFactsFor, claimLanguageProblems, isClaimPageFor } from '../scripts/ops/lib/claimFacts.ts';
import { withClaimLink } from '../scripts/ops/jobs/outreach.ts';
import { profileIdentityProblems } from '../scripts/ops/lib/profileIdentity.ts';
import type { PartnerLead } from '../src/types/ops';

describe('claim invitations', () => {
  it('round-trips through the link, including accents', () => {
    const invite = { name: 'Clare Preuss', email: 'Clare@Downstage.ca', org: 'Théâtre Downstage', via: 'outlook' };
    const back = decodeInvite(encodeInvite(invite));
    assert.deepEqual(back, { name: 'Clare Preuss', email: 'clare@downstage.ca', org: 'Théâtre Downstage', via: 'outlook' });
    assert.match(personalClaimUrl('biz-downstage', invite), /^https:\/\/calgarywatch\.ca\/claim\/biz-downstage\?invite=[A-Za-z0-9_-]+$/);
    assert.equal(personalClaimUrl('biz-downstage', null), 'https://calgarywatch.ca/claim/biz-downstage');
  });

  it('drops anything that is not an invitation', () => {
    assert.equal(decodeInvite('not base64!'), null);
    assert.equal(decodeInvite(''), null);
    assert.equal(decodeInvite('x'.repeat(900)), null);
    assert.equal(decodeInvite(Buffer.from('[1,2]').toString('base64url')), null);
    assert.deepEqual(normalizeInvite({ e: 'nope', n: '<b>Jo</b>' }), { name: 'bJo/b' });
    assert.equal(normalizeInvite({ e: 'nope' }), null);
  });

  it('greets a person, never a role inbox', () => {
    assert.equal(inviteGreetingName({ name: 'Kendra Hutchinson' }), 'Kendra');
    assert.equal(inviteGreetingName({ name: 'Media Relations' }), '');
    assert.equal(inviteGreetingName({ name: 'Info Desk' }), '');
    assert.equal(inviteGreetingName({ email: 'info@x.ca' }), '');
  });

  it('labels only organizer sign-ups', () => {
    assert.deepEqual(signupFields({ as: 'organizer', entityId: 'biz-x', via: 'outlook' }), { signupAs: 'organizer', signupEntityId: 'biz-x', signupVia: 'outlook' });
    assert.deepEqual(signupFields({ as: 'organizer', entityId: 'biz-x' }), { signupAs: 'organizer', signupEntityId: 'biz-x', signupVia: 'claim' });
    assert.deepEqual(signupFields(null), {});
  });
});

describe('outreach uses personal claim links', () => {
  const sig = 'Aldo Ortiz\nFounder, CalgaryWatch';
  const listed = { id: 'biz-vertigo-theatre', kind: 'business', title: 'Vertigo Theatre', slug: 'vertigo-theatre', status: 'published' };
  const lead = (extra: Partial<PartnerLead> = {}) => ({ businessName: 'Vertigo Theatre', entityId: 'biz-vertigo-theatre', entityKind: 'business', status: 'new', ...extra }) as PartnerLead;

  it('a lead with a contact gets a link carrying that contact', () => {
    const f = claimFactsFor(lead({ contactEmail: 'kendra@vertigotheatre.com', contactName: 'Kendra Hutchinson' }), listed);
    assert.match(f.claimUrl!, /\/claim\/biz-vertigo-theatre\?invite=/);
    const invite = decodeInvite(new URL(f.claimUrl!).searchParams.get('invite'));
    assert.deepEqual(invite, { name: 'Kendra Hutchinson', email: 'kendra@vertigotheatre.com', via: 'outreach' });
    const body = withClaimLink(`Hello,\n\nWe listed you.\n\n${sig}`, f, sig, 'lead-1');
    assert.ok(body.includes(f.claimUrl!));
    assert.deepEqual(claimLanguageProblems(body, f), []);
  });

  it('drafts written before personal links still pass; another listing does not', () => {
    const f = claimFactsFor(lead({ contactEmail: 'kendra@vertigotheatre.com' }), listed);
    assert.deepEqual(claimLanguageProblems('Claim it: https://calgarywatch.ca/claim/biz-vertigo-theatre', f), []);
    assert.ok(claimLanguageProblems('Claim it: https://calgarywatch.ca/claim/biz-theatre-calgary', f).length);
    assert.ok(claimLanguageProblems('Claim it: https://calgarywatch.ca/claim/biz-vertigo-theatre?invite=%%%', f).length);
    assert.equal(isClaimPageFor('https://calgarywatch.ca/claim/biz-vertigo-theatre?utm=x', f.claimUrl!), false);
  });

  it('the profile identity check accepts the personal link for the same organization', () => {
    const base = { recipientOrganization: 'Vertigo Theatre', entity: listed, profileUrl: '/local/vertigo-theatre' };
    const personal = personalClaimUrl('biz-vertigo-theatre', { email: 'kendra@vertigotheatre.com' });
    assert.deepEqual(profileIdentityProblems({ ...base, claimUrl: personal }), []);
    assert.ok(profileIdentityProblems({ ...base, claimUrl: 'https://calgarywatch.ca/claim/biz-vertigo-theatre?x=1' }).length);
  });
});
