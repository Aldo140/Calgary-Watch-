/**
 * Claiming a listing: evidence, form checks, rules and the outreach link.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { claimEvidence, claimId, claimProblem, emailDomain, siteDomain, sourceDomains } from '../src/lib/claims.ts';
import { withClaimLink } from '../scripts/ops/jobs/outreach.ts';
import { NO_CLAIM, claimFactsFor } from '../scripts/ops/lib/claimFacts.ts';
import type { PartnerLead } from '../src/types/ops.ts';

const ballet = [{ url: 'https://www.albertaballet.com/shows/the-nutcracker' }];
const vertigo = [{ url: 'https://purchase.vertigotheatre.com/Events?attribute_EventType=2627Season' }];

describe('who is claiming', () => {
  it('reads domains from emails and sites, subdomains folded', () => {
    assert.equal(emailDomain('Info@AlbertaBallet.com'), 'albertaballet.com');
    assert.equal(emailDomain('not an email'), '');
    assert.equal(siteDomain('https://purchase.vertigotheatre.com/x'), 'vertigotheatre.com');
    assert.equal(siteDomain('https://farmersmarket.hsca.ca/'), 'hsca.ca');
    assert.equal(siteDomain('https://www.gov.ab.ca/x'), 'gov.ab.ca');
    assert.deepEqual(sourceDomains([{ url: 'https://sites.google.com/x' }, { url: 'https://bridgelandfm.ca' }]), ['google.com', 'bridgelandfm.ca']);
  });
  it('ranks a Google account at the organization’s domain strongest', () => {
    assert.equal(claimEvidence({ accountEmail: 'kendra.hutchinson@vertigotheatre.com', workEmail: 'x@gmail.com', sources: vertigo }), 'account-domain');
    assert.equal(claimEvidence({ accountEmail: 'kim@gmail.com', workEmail: 'Info@albertaballet.com', sources: ballet }), 'work-domain');
    assert.equal(claimEvidence({ accountEmail: 'kim@gmail.com', workEmail: 'kim@agency.ca', sources: ballet }), 'other-domain');
    assert.equal(claimEvidence({ accountEmail: 'm@gmail.com', workEmail: 'farmersmakersmarket@gmail.com', sources: [{ url: 'https://www.farmersmakersmarket.ca/' }] }), 'free-mail');
    assert.equal(claimEvidence({ accountEmail: 'a@b.ca', workEmail: 'a@b.ca', sources: [] }), 'no-source');
  });
  it('does not let a look-alike domain pass', () => {
    assert.notEqual(claimEvidence({ accountEmail: 'x@notalbertaballet.com', workEmail: 'x@notalbertaballet.com', sources: ballet }), 'account-domain');
    assert.equal(claimEvidence({ accountEmail: 'x@notalbertaballet.com', workEmail: 'x@notalbertaballet.com', sources: ballet }), 'other-domain');
  });
  it('checks the form in order', () => {
    const ok = { name: 'Kim Bradley', role: 'Marketing or communications', workEmail: 'kim@albertaballet.com', phone: '', note: '', agree: true };
    assert.equal(claimProblem(ok), '');
    assert.match(claimProblem({ ...ok, name: '' }), /name/);
    assert.match(claimProblem({ ...ok, role: '' }), /role/);
    assert.match(claimProblem({ ...ok, workEmail: 'kim' }), /email/);
    assert.match(claimProblem({ ...ok, agree: false }), /allowed/);
    assert.equal(claimId('u1', 'e9'), 'u1_e9');
  });
});

describe('rules contract', () => {
  const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
  const block = (name: string) => rules.slice(rules.indexOf(`match /${name}/`), rules.indexOf('}', rules.indexOf(`match /${name}/`) + 2000));
  it('a claim is one per account per listing, pending, about yourself', () => {
    const claims = rules.slice(rules.indexOf('match /listing_claims/'), rules.indexOf('match /listing_updates/'));
    assert.match(claims, /id == request\.auth\.uid \+ '_' \+ request\.resource\.data\.entityId/);
    assert.match(claims, /request\.resource\.data\.status == 'pending'/);
    assert.match(claims, /accountEmail == request\.auth\.token\.email\.lower\(\)/);
    assert.match(claims, /email_verified == true/);
    assert.match(claims, /allow update: if isAdmin\(\)/);
  });
  it('legacy requests are read-only for members; new owner edits use the weekly publisher', () => {
    const updates = rules.slice(rules.indexOf('match /listing_updates/'), rules.indexOf('match /verified_listings/'));
    assert.match(updates, /allow create: if false/);
    assert.match(updates, /allow update: if isAdmin\(\)/);
    assert.match(updates, /allow delete: if false/);
  });
  it('the verified mark is public to read, admin to write', () => {
    const v = block('verified_listings');
    assert.match(v, /listing_claims/);
    assert.match(v, /allow create, update: if isAdmin\(\)/);
  });
  it('the client writes exactly the fields the rule allows', () => {
    const api = readFileSync(new URL('../src/lib/claimsApi.ts', import.meta.url), 'utf8');
    for (const f of ['uid', 'entityId', 'entityTitle', 'entityPath', 'name', 'role', 'workEmail', 'accountEmail', 'phone', 'note', 'status', 'createdAt']) assert.match(api, new RegExp(`\\b${f}:`));
  });
});

describe('outreach carries the claim link', () => {
  const sig = 'Aldo Ortiz\nFounder, CalgaryWatch';
  const claimable = claimFactsFor({ entityId: 'abc', entityKind: 'organizer', status: 'new' } as PartnerLead, { id: 'abc', kind: 'event', title: 'A', slug: 'a', status: 'published' });
  it('goes just above the signature, once', () => {
    const body = withClaimLink(`Hello,\n\nWe listed you.\n\n${sig}`, claimable, sig);
    assert.match(body, /claim the event listing for free and send changes directly: https:\/\/calgarywatch\.ca\/claim\/abc\n\nAldo Ortiz/);
    assert.equal(withClaimLink(body, claimable, sig), body);
  });
  it('is left out for prospects we have not listed', () => {
    assert.equal(withClaimLink('Hi', NO_CLAIM, sig), 'Hi');
  });
});
