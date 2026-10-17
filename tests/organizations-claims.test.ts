import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { associateOrganizers, organizerEvents, organizerProfile } from '../src/lib/organizations';
import { claimApprovalWrites, approvedPublicMark } from '../src/lib/claimApproval';
import { restoreClaimDraft } from '../src/lib/claimDraft';
import { ownerVerification, applyOwnerVerification } from '../src/lib/verified';
import { claimFactsFor, claimLanguageProblems, NO_CLAIM } from '../scripts/ops/lib/claimFacts';
import { entityPath, createDiscoveryRepository } from '../src/lib/discovery';
import type { DiscoveryEntity, Event, Business } from '../src/types/discovery';
import type { ListingClaim } from '../src/lib/claims';
import { isReviewedReplacement } from '../src/lib/reviewedSource';
const index = JSON.parse(readFileSync(new URL('../src/generated/discovery-index.json', import.meta.url), 'utf8'));
const now = Date.parse('2026-10-15T12:00:00Z');
const profile = index.entities.find((e: DiscoveryEntity) => e.id === 'biz-theatre-calgary') as Business;
const show = (extra: Partial<Event> = {}): Event => ({ id: 'test-event', kind: 'event', slug: 'test-event', title: 'Show', organizer: 'Theatre Calgary', organizerEntityId: profile.id, start: '2026-10-20T19:00:00-06:00', end: '2026-10-20T21:00:00-06:00', status: 'published', verification: 'source-checked', verifiedAt: '2026-10-15T00:00:00Z', updatedAt: '2026-10-15T00:00:00Z', sources: [{ kind: 'official', name: 'Theatre Calgary', url: 'https://www.theatrecalgary.com/shows/test' }], categories: ['arts'], tags: [], description: '', summary: '', address: 'Calgary', timezone: 'America/Edmonton', pricing: 'unknown', ...extra });
const claim = (status: ListingClaim['status'] = 'pending'): ListingClaim => ({ uid: 'representative', entityId: '6972906c904ecd4acb9407299e22', entityTitle: 'Mercantile on 9th', entityPath: '/events/mercantile-on-9th-697290', name: 'Representative', role: 'Staff', accountEmail: 'representative@example.org', workEmail: 'office@example.org', phone: '', note: '', createdAt: now, status });

describe('permanent organization profiles and provenance', () => {
  for (const [id, slug] of [['biz-theatre-calgary', 'theatre-calgary'], ['biz-alliance-francaise-calgary', 'alliance-francaise-calgary'], ['biz-werklund-centre', 'werklund-centre']]) {
    it(`${id} is one published permanent entity with its own public and claim route`, () => {
      const matches = index.entities.filter((e: DiscoveryEntity) => e.id === id);
      assert.equal(matches.length, 1); const e = matches[0]; assert.equal(e.kind, 'business'); assert.equal(entityPath(e), `/local/${slug}`);
      assert.equal(createDiscoveryRepository(index.entities, index.occurrences).list().filter(e => e.id === id).length, 1);
      assert.equal(e.claimed, false); assert.equal(e.ownerVerifiedAt, undefined);
    });
  }
  it('retains the requested Alliance homepage and only one Werklund/Arts Commons profile', () => {
    assert.equal(index.entities.find((e: DiscoveryEntity) => e.id === 'biz-alliance-francaise-calgary').website, 'https://www.afcalgary.ca/');
    assert.equal(index.entities.filter((e: DiscoveryEntity) => e.kind === 'business' && /^(Werklund Centre|Arts Commons)$/.test(e.title)).length, 1);
  });
  it('uses existing Theatre Calgary event ID and connects it to the organization', () => {
    const e = index.entities.filter((e: DiscoveryEntity) => e.title === 'Little Shop of Horrors'); assert.equal(e.length, 1);
    assert.equal(e[0].organizerEntityId, profile.id); assert.equal(organizerProfile(e[0], index.entities)?.id, profile.id);
  });
  it('several events link to one profile and are sorted without copies', () => {
    const events = [show({ id: 'b', start: '2026-10-21T19:00:00-06:00' }), show({ id: 'a' })];
    const all = associateOrganizers([profile, ...events]); assert.deepEqual(organizerEvents(profile.id, all, now).map(e => e.id), ['a', 'b']);
  });
  it('venue alone, similar names, reseller provenance and incoming forged IDs do not associate', () => {
    for (const e of [show({ organizer: 'Someone Else', venue: 'Theatre Calgary' }), show({ organizer: 'Theatre Calgary Friends' }), show({ sources: [{kind:'official', name:'Tickets', url:'https://ticketmaster.ca/x'}] })]) {
      const result = associateOrganizers([profile, e])[1] as Event; assert.equal(result.organizerEntityId, undefined); assert.equal(organizerProfile(result, [profile]), undefined);
    }
  });
  it('does not associate with a draft profile', () => { assert.equal((associateOrganizers([{...profile,status:'draft'}, show()])[1] as Event).organizerEntityId, undefined); });
  it('does not infer Werklund ownership of another organizer’s event at its venue', () => {
    const werklund = index.entities.find((e: DiscoveryEntity) => e.id === 'biz-werklund-centre');
    assert.equal((associateOrganizers([werklund, show({ venue:'Jack Singer Concert Hall, Werklund Centre' })])[1] as Event).organizerEntityId, undefined);
  });
  it('excludes ended, cancelled, drafts, archived and unrelated events', () => {
    const all = [show(), show({id:'ended',end:'2026-10-01T00:00:00Z'}), show({id:'cancelled',cancelled:true}), show({id:'draft',status:'draft'}), show({id:'archived',status:'archived'}),show({id:'unrelated',organizerEntityId:undefined})];
    assert.deepEqual(organizerEvents(profile.id, all, now).map(e=>e.id), ['test-event']);
  });
});

describe('claim approval and Mercantile account regression', () => {
  it('keeps the existing Mercantile event canonical and claimable', () => {
    const matches = index.entities.filter((e: DiscoveryEntity) => e.kind === 'event' && /Mercantile on 9th/i.test(e.title)); assert.equal(matches.length, 1);
    assert.equal(matches[0].id, claim().entityId); assert.equal(entityPath(matches[0]), claim().entityPath);
    assert.ok(createDiscoveryRepository(index.entities,index.occurrences).list().some(e=>e.id===claim().entityId));
  });
  it('lets the reviewed Mercantile correction replace its older stored source record', () => {
    const reviewed={id:'6972906c904ecd4acb9407299e22',sourceId:'inglewood-bia',sourceRecordId:'mercantile-on-9th-2026-11-28',verification:'source-checked'};
    assert.equal(isReviewedReplacement(reviewed,{...reviewed,verification:'source-feed'}),true);
    assert.equal(isReviewedReplacement({...reviewed,sourceRecordId:'different'},reviewed),false);
    assert.equal(isReviewedReplacement({...reviewed,verification:'source-feed'},reviewed),false);
  });
  for(const kind of ['event','market','business']) it(`${kind} uses one approval/claim model`, () => {
    const c={...claim(),entityId:`${kind}-id`}; const writes=claimApprovalWrites(c,{uid:c.uid},'admin',now);
    assert.equal(writes.claim.status,'approved');assert.equal(writes.mark.claimId,`${c.uid}_${c.entityId}`);
    assert.deepEqual(writes.account.businessListings,[c.entityId]);assert.equal(writes.account.accountType,'business');
  });
  it('uses the authenticated claimant rather than outreach email and preserves existing account fields', () => {
    const c=claim();const a=claimApprovalWrites(c,{uid:c.uid,accountType:'business',businessListings:['other'],businessSince:100},'admin',now);
    assert.deepEqual(a.account.businessListings,['other',c.entityId]);assert.equal(a.account.businessSince,100);
    const other={...c,uid:'another-legitimate-user',accountEmail:'someone-else@example.net'};
    assert.equal(claimApprovalWrites(other,{uid:other.uid},'admin',now).mark.claimId,`${other.uid}_${c.entityId}`);
  });
  it('missing/mismatched profiles fail before approval writes are constructed', () => {
    assert.throws(()=>claimApprovalWrites(claim(),undefined,'admin',now),/profile/);
    assert.throws(()=>claimApprovalWrites(claim(),{uid:'outreach-contact'},'admin',now),/profile/);
  });
  it('legacy approved claims stay approved without reclaim and keep original approval time', () => {
    const c={...claim('approved'),reviewedAt:100};const a=claimApprovalWrites(c,{uid:c.uid},'admin',now);assert.equal(a.claim.reviewedAt,100);
    assert.ok(ownerVerification([c]).has(c.entityId));assert.equal(approvedPublicMark(c.entityId,a.mark),true);
  });
  for(const status of ['pending','rejected'] as const) it(`${status} does not verify a listing`, () => {
    const c=claim(status);assert.equal(ownerVerification([c]).size,0);assert.equal(applyOwnerVerification([{id:c.entityId,kind:'event',ownerVerifiedAt:'forged'}],ownerVerification([c]))[0].ownerVerifiedAt,undefined);
  });
  it('old orphan marks cannot manufacture public verification', () => { assert.equal(approvedPublicMark('x',{entityId:'x',verifiedAt:1}),false); assert.equal(approvedPublicMark('x',{entityId:'different',claimId:'u_x'}),false); });
  it('restores the form after Google redirect, including consent, and rejects malformed storage', () => {
    const d={name:'New representative',role:'Staff',workEmail:'new@example.net',phone:'',note:'Confirm hours',agree:true};assert.deepEqual(restoreClaimDraft(JSON.stringify(d)),d);assert.equal(restoreClaimDraft('garbage').agree,false);
  });
});

describe('outreach factual guard',()=>{
  for(const phrase of ['already listed','your listing','your profile is live','we added you','claim your listing','listed on CalgaryWatch']) it(`blocks unsupported: ${phrase}`,()=>{assert.ok(claimLanguageProblems(phrase,NO_CLAIM).length);});
  it('an event cannot substantiate an organization profile claim',()=>{const f=claimFactsFor({entityId:'show',entityKind:'organizer',status:'new'},{id:'show',kind:'event',title:'Show',slug:'show',status:'published'});assert.ok(claimLanguageProblems('Your listing is already listed in our arts section.',f).length);assert.deepEqual(claimLanguageProblems('Your event is already listed on CalgaryWatch.',f),[]);});
  it('CRM claimed status is not approval authority',()=>{ const f=claimFactsFor({entityId:'x',entityKind:'business',status:'claimed'},{id:'x',kind:'business',title:'X',slug:'x',status:'published'});assert.equal(f.verified,false); });
});
