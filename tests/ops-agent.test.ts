/**
 * The operations agent's rules: what gets posted, what a draft must satisfy,
 * which address a business may be emailed at, and when nothing may be sent.
 * Everything here is pure; no network, Firestore or model calls.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import type { PartnerLead } from '../src/types/ops';
import { brandKit, outreachConfig } from '../scripts/ops/lib/brand';
import {
  checkPitch, consentBasisFor, extractEmails, hasNoSolicitationNotice, inSendWindow, isStopRequest, sendBlocker, signature,
} from '../scripts/ops/lib/leads';
import { checkDraft, happenings, selectCandidates, templateDraft, type DiscoveryIndex, type Entity } from '../scripts/ops/lib/posts';
import { calgaryDate, calgaryToEpoch, nextSlot, timeRange } from '../scripts/ops/lib/time';
import { templatePitch } from '../scripts/ops/jobs/outreach';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cw = brandKit('calgarywatch');
const cd = brandKit('calgarydaily');
const cfg = outreachConfig();
const ADDRESS = '100 Example Ave SW, Calgary, AB T2P 0A1';

function event(id: string, start: string, extra: Partial<Entity> = {}): Entity {
  return {
    id, kind: 'event', slug: id, title: `Event ${id}`, status: 'published', start, end: null, venue: 'Hall', pricing: 'free',
    organizer: `Org ${id}`, categories: ['arts'], sources: [{ name: 'Organizer', url: `https://example.org/${id}`, kind: 'official' }], ...extra,
  } as Entity;
}

describe('Calgary time', () => {
  it('converts wall-clock times across daylight saving', () => {
    assert.equal(new Date(calgaryToEpoch('2026-07-01', '12:00')).toISOString(), '2026-07-01T18:00:00.000Z');
    assert.equal(new Date(calgaryToEpoch('2026-12-01', '12:00')).toISOString(), '2026-12-01T19:00:00.000Z');
  });
  it('schedules the next slot after now, rolling to tomorrow', () => {
    const at = calgaryToEpoch('2026-09-24', '19:00');
    assert.equal(nextSlot(at, ['11:30', '18:30']), calgaryToEpoch('2026-09-25', '11:30'));
    assert.equal(nextSlot(at, ['11:30', '18:30'], 1), calgaryToEpoch('2026-09-25', '18:30'));
  });
  it('writes compact time ranges', () => {
    assert.equal(timeRange(Date.parse('2026-09-30T15:00:00-06:00'), Date.parse('2026-09-30T19:00:00-06:00')), '3 to 7 pm');
    assert.equal(timeRange(Date.parse('2026-09-30T09:00:00-06:00'), Date.parse('2026-09-30T13:30:00-06:00')), '9 am to 1:30 pm');
  });
});

describe('choosing posts', () => {
  const wednesday = calgaryToEpoch('2026-09-23', '06:30');
  const index: DiscoveryIndex = {
    entities: [
      event('a', '2026-09-25T19:00:00-06:00'),
      event('b', '2026-09-26T11:00:00-06:00'),
      event('c', '2026-09-27T14:00:00-06:00'),
      event('d', '2026-09-28T14:00:00-06:00'),
      event('x', '2026-09-26T12:00:00-06:00', { cancelled: true }),
      event('draft', '2026-09-26T12:00:00-06:00', { status: 'draft' }),
    ],
    occurrences: [],
  };

  it('never offers cancelled or unpublished listings', () => {
    const ids = happenings(index).map(h => h.entity.id);
    assert.ok(!ids.includes('x') && !ids.includes('draft'));
  });

  it('drafts a weekend roundup on Wednesdays plus single posts, without repeating a listing', () => {
    const c = selectCandidates(index, cw, wednesday, new Set());
    assert.equal(c[0].template, 'roundup');
    assert.equal(c[0].items.length, 3);
    assert.equal(c.length, cw.postsPerDay);
    const again = selectCandidates(index, cw, wednesday, new Set(c.map(x => x.fingerprint)));
    assert.ok(again.every(x => !c.some(y => y.fingerprint === x.fingerprint)));
  });

  it('only drafts a CalgaryDaily "today" roundup when two or more things are on', () => {
    const friday = calgaryToEpoch('2026-09-25', '06:30');
    assert.equal(selectCandidates(index, cd, friday, new Set()).length, 0);
    const busy = { ...index, entities: [...index.entities, event('e', '2026-09-25T12:00:00-06:00')] };
    const c = selectCandidates(busy, cd, friday, new Set());
    assert.equal(c.length, 1);
    assert.ok(c.every(x => x.items.every(i => calgaryDate(i.start) === '2026-09-25')));
  });

  it('template drafts from the real published index always pass the brand checks', () => {
    const real = JSON.parse(readFileSync(join(root, 'src/generated/discovery-index.json'), 'utf8')) as DiscoveryIndex;
    const monday = calgaryToEpoch(calgaryDate(Date.now()), '06:30');
    for (const kit of [cw, cd]) {
      for (let day = 0; day < 7; day++) {
        for (const c of selectCandidates(real, { ...kit, postsPerDay: 5 }, monday + day * 86_400_000, new Set())) {
          assert.deepEqual(checkDraft(templateDraft(c, kit), kit), [], `${kit.id}: ${c.title}`);
        }
      }
    }
  });
});

describe('draft checks', () => {
  const ok = { caption: 'Market day.\n\n#yyc #calgary', altText: 'Market day', imageText: { eyebrow: 'MARKET', headline: 'Market day', details: [], footer: 'calgarywatch.ca' } };
  it('passes a plain draft', () => assert.deepEqual(checkDraft(ok, cw), []));
  it('catches banned phrases and hashtag spam', () => {
    assert.ok(checkDraft({ ...ok, caption: 'The best in Calgary!' }, cw).some(p => p.includes('banned')));
    assert.ok(checkDraft({ ...ok, caption: '#a #b #c #d #e #f' }, cw).some(p => p.includes('hashtags')));
  });
  it('requires the Featured partner label on paid posts, in caption and image', () => {
    assert.equal(checkDraft(ok, cw, { sponsored: true }).length, 2);
    const paid = { ...ok, caption: 'Featured partner: Market day.', imageText: { ...ok.imageText, eyebrow: 'FEATURED PARTNER' } };
    assert.deepEqual(checkDraft(paid, cw, { sponsored: true }), []);
  });
});

describe('finding a business address', () => {
  it('prefers a general address on the business’s own domain and ignores junk', () => {
    const html = `<a href="mailto:owner.personal@gmail.com">x</a> info@rosso.ca <img src="logo@2x.png"> noreply@rosso.ca <script>var e="hidden@rosso.ca"</script>`;
    assert.deepEqual(extractEmails(html, 'rosso.ca'), ['info@rosso.ca', 'owner.personal@gmail.com']);
  });
  it('decodes common obfuscation', () => {
    assert.deepEqual(extractEmails('hello [at] market.ca', 'market.ca'), ['hello@market.ca']);
    assert.deepEqual(extractEmails('hello&#64;market.ca', 'market.ca'), ['hello@market.ca']);
  });
  it('detects no-solicitation notices', () => {
    assert.ok(hasNoSolicitationNotice('Please note: we do not accept unsolicited offers.', cfg));
    assert.ok(hasNoSolicitationNotice('NO SOLICITATION', cfg));
    assert.ok(!hasNoSolicitationNotice('Contact us about vendor applications.', cfg));
  });
});

describe('outreach safety', () => {
  const lead: PartnerLead = {
    id: 'lead-1', entityId: 'e1', entityKind: 'market', businessName: 'Test Market', category: 'market', neighbourhood: 'Bridgeland',
    website: 'https://test.ca/', contactName: null, contactRole: null, contactEmail: 'info@test.ca',
    emailSourceUrl: 'https://test.ca/contact', emailFoundAt: 1, consentBasis: consentBasisFor('https://test.ca/contact'),
    noSolicitationNotice: false, reasonRelevant: 'x', status: 'approved', draftSubject: 's', draftBody: 'b', followUps: 0,
    lastContactAt: null, nextFollowUpAt: null, conversationId: null, lastReply: null, doNotContact: false, notes: '', history: [],
    createdAt: 0, updatedAt: 0,
  };
  const none = new Set<string>();

  it('allows a lead with a recorded consent basis', () => assert.equal(sendBlocker(lead, none, none), null));
  it('blocks every unsafe case', () => {
    assert.ok(sendBlocker({ ...lead, doNotContact: true }, none, none));
    assert.ok(sendBlocker({ ...lead, status: 'do-not-contact' }, none, none));
    assert.ok(sendBlocker({ ...lead, noSolicitationNotice: true }, none, none));
    assert.ok(sendBlocker({ ...lead, consentBasis: null }, none, none));
    assert.ok(sendBlocker({ ...lead, emailSourceUrl: null }, none, none));
    assert.ok(sendBlocker(lead, new Set(['info@test.ca']), none));
    assert.ok(sendBlocker(lead, none, new Set(['test.ca'])));
    assert.ok(sendBlocker({ ...lead, contactEmail: null }, none, none));
  });

  it('every message identifies the sender, gives a mailing address and an opt-out', () => {
    const sig = signature(cfg, ADDRESS);
    const t = templatePitch(lead, 'Listing: Test Market (market) — https://calgarywatch.ca/markets/test', sig);
    assert.deepEqual(checkPitch(t.body, cfg, ADDRESS), []);
    assert.ok(checkPitch(t.body.replace(cfg.unsubscribeLine, ''), cfg, ADDRESS).some(p => p.includes('opt-out')));
    assert.ok(checkPitch(t.body.replace(ADDRESS, ''), cfg, ADDRESS).some(p => p.includes('mailing address')));
  });

  it('refuses pricing talk while the paid offer is off', () => {
    assert.equal(cfg.paidOfferEnabled, false);
    const sig = signature(cfg, ADDRESS);
    assert.ok(checkPitch(`Our Featured partner package is $500.\n\n${sig}`, cfg, ADDRESS).some(p => p.includes('paid')));
  });

  it('recognizes opt-outs in their own words only', () => {
    for (const t of ['STOP', 'Please stop emailing us.', 'Unsubscribe', 'Take us off your list', 'Please don’t email me again', 'Not interested, please remove us']) {
      assert.ok(isStopRequest(t), t);
    }
    for (const t of ['Stop by our booth on Saturday!'.replace(/^Stop by/, 'Come stop by'), 'Thanks! Happy to chat.\n\nOn Tue, Aldo wrote:\n> reply "stop" and I won\'t email you again']) {
      assert.ok(!isStopRequest(t), t);
    }
  });

  it('sends only on weekday business hours in Calgary', () => {
    assert.ok(inSendWindow(calgaryToEpoch('2026-09-29', '10:00'), cfg));   // Tuesday
    assert.ok(!inSendWindow(calgaryToEpoch('2026-09-29', '20:00'), cfg));
    assert.ok(!inSendWindow(calgaryToEpoch('2026-09-27', '10:00'), cfg));  // Sunday
  });
});

describe('operations rules contract', () => {
  const rules = readFileSync(join(root, 'firestore.rules'), 'utf8');
  const block = (name: string) => rules.slice(rules.indexOf(`match /${name}/`), rules.indexOf('match /', rules.indexOf(`match /${name}/`) + 10));

  it('keeps every operations collection admin-only', () => {
    for (const c of ['ops_queue', 'partner_leads', 'outreach_suppression', 'ops_health']) {
      assert.match(block(c), /allow read: if isAdmin\(\);/, c);
    }
  });
  it('never lets a browser publish, send, or record Instagram ids', () => {
    const q = block('ops_queue');
    for (const k of ['igMediaId', 'permalink', 'publishedAt', 'publishingAt', 'imageUrl']) assert.ok(!q.includes(`'${k}'`), k);
    assert.ok(!/request\.resource\.data\.status in \[[^\]]*'published'[^\]]*\]/.test(q));
    const l = block('partner_leads');
    for (const k of ['conversationId', 'lastContactAt', 'replyIds', 'followUps']) assert.ok(!l.includes(`'${k}'`), k);
    assert.ok(!l.includes("'contacted'"));
  });
  it('uses only regex repeat counts the rules engine accepts (RE2 caps them at 1000)', () => {
    // A {4,2000} in ops_queue once made the whole ruleset fail to compile on deploy.
    for (const m of rules.matchAll(/\{(\d+)(?:,(\d*))?\}/g)) {
      assert.ok(Number(m[1]) <= 1000 && (!m[2] || Number(m[2]) <= 1000), `regex repeat ${m[0]} exceeds 1000`);
    }
  });
  it('makes suppressions permanent and do-not-contact one-way', () => {
    assert.match(block('outreach_suppression'), /allow update, delete: if false;/);
    assert.match(block('partner_leads'), /!\(resource\.data\.doNotContact == true && request\.resource\.data\.doNotContact != true\)/);
  });
});
