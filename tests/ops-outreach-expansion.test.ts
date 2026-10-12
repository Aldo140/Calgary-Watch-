import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { organizerLeads, prospectLeads, checkPitch, hostOf, signature, type Prospect } from '../scripts/ops/lib/leads';
import { templatePitch } from '../scripts/ops/jobs/outreach';
import { outreachConfig } from '../scripts/ops/lib/brand';
import type { Entity } from '../scripts/ops/lib/posts';
import type { PartnerLead } from '../src/types/ops';

const ev = (id: string, organizer: string, url: string, start = '2026-10-10T19:00:00-06:00') =>
  ({ id, kind: 'event', status: 'published', title: `Show ${id}`, organizer, start, end: start, categories: ['arts'], sources: [{ name: organizer, url, kind: 'official' }] }) as unknown as Entity;

describe('outreach to organizers and prospects', () => {
  const now = Date.parse('2026-09-28T12:00:00-06:00');
  it('makes one lead per organizer, from its own site, never a ticket seller', () => {
    const leads = organizerLeads([
      ev('a', 'Theatre Calgary', 'https://www.theatrecalgary.com/shows/a'),
      ev('b', 'Theatre Calgary', 'https://www.theatrecalgary.com/shows/b'),
      ev('c', 'Some Promoter', 'https://www.ticketmaster.ca/event/123'),
      ev('d', 'Old Show', 'https://old.example.org/x', '2026-09-01T19:00:00-06:00'),
    ], now);
    assert.deepEqual(leads.map(l => l.id), ['lead-org-theatre-calgary']);
    assert.equal(leads[0].website, 'https://www.theatrecalgary.com/');
  });
  it('skips prospects whose website another lead already covers', () => {
    const p: Prospect[] = [{ name: 'Theatre Calgary', website: 'https://www.theatrecalgary.com/', category: 'arts', why: 'x' }, { name: 'Vertigo', website: 'https://www.vertigotheatre.com/', category: 'arts', why: 'y' }];
    assert.deepEqual(prospectLeads(p, new Set(['theatrecalgary.com'])).map(x => x.name), ['Vertigo']);
  });
  it('every prospect in the file has an https website and a reason', () => {
    const file = JSON.parse(readFileSync('brand/partner-prospects.json', 'utf8')) as { prospects: Prospect[] };
    assert.ok(file.prospects.length >= 20);
    for (const p of file.prospects) { assert.match(p.website, /^https:\/\//, p.name); assert.ok(hostOf(p.website)); assert.ok(p.why.length > 10, p.name); }
  });
  it('a prospect gets an invitation (not "we listed you") that still passes every CASL check', () => {
    const cfg = outreachConfig();
    const ADDRESS = '123 Test St SW, Calgary AB';
    const lead = { businessName: 'Vertigo Theatre' } as PartnerLead;
    const t = templatePitch(lead, 'Business: Vertigo Theatre', signature(cfg, ADDRESS));
    assert.match(t.subject, /Listing Vertigo Theatre's events/);
    assert.doesNotMatch(t.body, /We've added/);
    assert.deepEqual(checkPitch(t.body, cfg, ADDRESS), []);
  });
});

describe('outreach to Calgary service businesses', () => {
  it('invites a service business to the services directory, and the pitch passes every CASL check', async () => {
    const { serviceFacts } = await import('../scripts/ops/jobs/outreach');
    const cfg = outreachConfig();
    const ADDRESS = '123 Test St SW, Calgary AB';
    const lead = { businessName: 'Bow Valley Plumbing', category: 'plumbing', neighbourhood: '' } as PartnerLead;
    const facts = serviceFacts(lead)!;
    assert.match(facts, /local\/services#svc-plumbing/);
    const t = templatePitch(lead, facts, signature(cfg, ADDRESS));
    assert.match(t.subject, /services list/);
    assert.match(t.body, /plumbers/);
    assert.doesNotMatch(t.body, /events/);
    assert.deepEqual(checkPitch(t.body, cfg, ADDRESS), []);
  });
  it('leaves non-service leads on the existing templates', async () => {
    const { serviceFacts } = await import('../scripts/ops/jobs/outreach');
    assert.equal(serviceFacts({ businessName: 'Vertigo', category: 'arts', neighbourhood: '' }), null);
  });
});
