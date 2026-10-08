/**
 * Market HQ: rosters, lineups, applications, vendor messages.
 *
 * Run with: npm test
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { applicationProblem, lineupSummary, messageRecipients, vendorId, vendorMessageFooter, vendorSlug } from '../src/lib/markets.ts';

describe('vendors and lineups', () => {
  it('slugs are stable and safe for document ids', () => {
    assert.equal(vendorSlug('Sunny Farm & Co.'), 'sunny-farm-and-co');
    assert.equal(vendorSlug('Crème Brûlée Bros'), 'creme-brulee-bros');
    assert.equal(vendorSlug('!!!'), 'vendor');
    assert.equal(vendorId('mkt1', 'sunny-farm'), 'mkt1__sunny-farm');
  });
  it('summarizes a lineup the way shoppers read it', () => {
    assert.equal(lineupSummary([]), '');
    assert.equal(lineupSummary(['A']), '1 vendor: A');
    assert.equal(lineupSummary(['A', 'B']), '2 vendors: A and B');
    assert.equal(lineupSummary(['A', 'B', 'C', 'D']), '4 vendors, including A, B and C');
  });
});

describe('who gets a vendor message', () => {
  const vendors = [{ slug: 'a', active: true }, { slug: 'b', active: true }, { slug: 'c', active: false }, { slug: 'd', active: true }];
  const contacts = [
    { vendorSlug: 'a', email: 'A@Farm.ca', optedOut: false },
    { vendorSlug: 'b', email: 'b@bake.ca', optedOut: true },
    { vendorSlug: 'c', email: 'c@x.ca', optedOut: false },
    { vendorSlug: 'd', email: 'not-an-email', optedOut: false },
    { vendorSlug: 'z', email: 'ghost@x.ca', optedOut: false },
  ];
  const lineups = [{ occurrenceId: 'o1', vendorSlugs: ['a', 'b', 'c'] }];
  it('all: active vendors with a real email who have not opted out', () => {
    assert.deepEqual(messageRecipients({ audience: 'all', occurrenceId: '' }, vendors, contacts, lineups), ['a@farm.ca']);
  });
  it('date: only that lineup, same rules', () => {
    assert.deepEqual(messageRecipients({ audience: 'date', occurrenceId: 'o1' }, vendors, contacts, lineups), ['a@farm.ca']);
    assert.deepEqual(messageRecipients({ audience: 'date', occurrenceId: 'nope' }, vendors, contacts, lineups), []);
  });
  it('dedupes one email shared by two vendors', () => {
    const shared = [...contacts, { vendorSlug: 'd', email: 'a@farm.ca', optedOut: false }];
    assert.deepEqual(messageRecipients({ audience: 'all', occurrenceId: '' }, vendors, shared, lineups), ['a@farm.ca']);
  });
  it('every message says who sent it, where, and how to stop', () => {
    const f = vendorMessageFooter('Dalhousie Harvest Market', 'marcom@dalhousiecalgary.ca', '2011 Ulster Road NW, Calgary');
    assert.match(f, /vendor at Dalhousie Harvest Market/);
    assert.match(f, /reply STOP to marcom@dalhousiecalgary\.ca/);
    assert.match(f, /2011 Ulster Road NW/);
  });
});

describe('vendor applications', () => {
  const ok = { businessName: 'Sunny Farm', category: 'Produce', description: 'Organic squash and greens', website: '', instagram: '', contactName: 'Sam', email: 'sam@farm.ca', phone: '', availability: '', agree: true };
  it('checks the form in order', () => {
    assert.equal(applicationProblem(ok), '');
    assert.match(applicationProblem({ ...ok, businessName: '' }), /business name/);
    assert.match(applicationProblem({ ...ok, category: '' }), /sell/);
    assert.match(applicationProblem({ ...ok, description: 'squash' }), /little about/);
    assert.match(applicationProblem({ ...ok, email: 'sam' }), /email/);
    assert.match(applicationProblem({ ...ok, agree: false }), /contact you/);
  });
});

describe('rules contract', () => {
  const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
  const block = (name: string, next: string) => rules.slice(rules.indexOf(`match /${name}/`), rules.indexOf(`match /${next}/`));
  it('organizer means an approved claim on that market', () => {
    assert.match(rules, /function isOrganizerOf\(marketId\)[\s\S]*?listing_claims\/\$\(request\.auth\.uid \+ '_' \+ marketId\)\)\.data\.status == 'approved'/);
  });
  it('roster is public; contacts are not', () => {
    assert.match(block('market_vendors', 'market_vendor_contacts'), /allow read: if true/);
    assert.match(block('market_vendor_contacts', 'market_lineups'), /allow read: if runsMarket\(resource\.data\.marketId\)/);
  });
  it('drafts stay private until published', () => {
    assert.match(block('market_lineups', 'vendor_applications'), /allow read: if resource\.data\.published == true \|\| runsMarket/);
  });
  it('applications start pending and only the market decides', () => {
    const b = block('vendor_applications', 'vendor_messages');
    assert.match(b, /status == 'pending'/);
    assert.match(b, /allow update: if runsMarket\(resource\.data\.marketId\)/);
  });
  it('messages are queued by the market and sent only by the job', () => {
    const b = block('vendor_messages', 'market_service_requests');
    assert.match(b, /status == 'queued'/);
    assert.match(b, /allow update, delete: if false/);
  });
});
