import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ListingArtwork } from '../src/components/entity/ListingArtwork';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { createDiscoveryRepository, entityPath } from '../src/lib/discovery';
import { associateOrganizers, eventArtwork, listingImageSrc, organizerEvents, organizerProfile } from '../src/lib/organizations';
import { claimApprovalWrites } from '../src/lib/claimApproval';
import { ownerVerification } from '../src/lib/verified';
import { listingUpdateProblem, listingUpdateRequest } from '../src/lib/listingUpdates';
import { needsApprovalEmail, APPROVAL_EMAILS_SINCE } from '../src/lib/claimApprovalEmail';
import { LISTING_CONTACT_EMAIL } from '../src/config/contact';
import type { DiscoveryEntity, Event } from '../src/types/discovery';
import type { ListingClaim, UpdateField } from '../src/lib/claims';
const read=(p:string)=>readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const index=JSON.parse(read('src/generated/discovery-index.json'));
const entities=index.entities as DiscoveryEntity[];
const downstage=entities.find(e=>e.id==='biz-downstage')!;
const events=entities.filter((e):e is Event=>e.kind==='event'&&e.sourceId==='downstage');
const now=Date.parse(index.generatedAt)+60_000;
const pending:ListingClaim={uid:'actual-claimant-not-outreach-contact',entityId:downstage.id,entityTitle:downstage.title,entityPath:entityPath(downstage),name:'Representative',role:'Staff',workEmail:'office@example.org',accountEmail:'representative@example.net',phone:'',note:'',status:'pending',createdAt:now};

describe('Downstage canonical listing and events',()=>{
  it('reuses exactly one published organization and the existing public and claim routes',()=>{
    assert.equal(entities.filter(e=>e.kind==='business'&&/downstage/i.test(e.title)).length,1);
    assert.equal(downstage.kind,'business');assert.equal(downstage.status,'published');assert.equal(entityPath(downstage),'/local/downstage');
    assert.ok(createDiscoveryRepository(entities,index.occurrences).find('business','downstage'));
    assert.equal(`/claim/${pending.entityId}`,'/claim/biz-downstage');
  });
  it('keeps homepage, season source and existing performance location',()=>{
    assert.ok(downstage.sources.some(s=>s.kind==='official'&&s.url==='https://downstage.ca/'));
    assert.ok(downstage.sources.some(s=>s.url==='https://downstage.ca/currentseason/'));
    assert.ok(downstage.kind==='business'&&downstage.address.includes('205 8 Avenue SE'));
  });
  it('preserves all four existing performance records and unique IDs',()=>{
    assert.equal(events.length,4);assert.equal(new Set(entities.map(e=>e.id)).size,entities.length);
    assert.deepEqual(new Set(events.map(e=>e.sourceRecordId)),new Set(['dreaming-climate-consciousness-2026-10-23','dreaming-climate-consciousness-2026-10-24','creative-stretch-2026-27','a-study-of-choices-2027']));
    assert.ok(events.every(e=>e.organizerEntityId==='biz-downstage'));
    assert.equal(events.find(e=>e.sourceRecordId==='creative-stretch-2026-27')?.pricing,'free');
  });
  it('shows upcoming associated performances and links them back to Downstage',()=>{
    assert.equal(organizerEvents(downstage.id,entities,now).length,4);
    for(const event of events)assert.equal(organizerProfile(event,entities)?.id,downstage.id);
  });
  it('uses production artwork first and the credited season poster only as a fallback',()=>{
    assert.equal(downstage.image?.presentation,'poster');
    assert.equal(downstage.image?.credit,'Season artwork by Leetia Lyons');
    assert.ok(events.every(e=>e.image?.presentation==='poster'&&e.image.credit==='Artwork by Leetia Lyons'));
    assert.equal(eventArtwork(events[0],entities)?.src,events[0].image?.src);
    assert.equal(eventArtwork({...events[0],image:undefined},entities)?.src,downstage.image?.src);
    assert.equal(listingImageSrc(events[0].image!),'/images/downstage/dreaming-climate-consciousness.jpg');
  });
  it('does not attribute venue-only events or cancelled/ended/unpublished shows',()=>{
    const unrelated={...events[0],id:'other',organizer:'A different company',organizerEntityId:'biz-downstage'};
    assert.equal((associateOrganizers([downstage,unrelated])[1] as Event).organizerEntityId,undefined);
    for(const patch of [{cancelled:true},{status:'draft' as const},{status:'archived' as const},{end:'2026-01-01T00:00:00Z'}])assert.equal(organizerEvents(downstage.id,[{...events[0],...patch}],now).length,0);
  });
});

describe('Downstage claim and account state',()=>{
  it('a pending/rejected claim does not verify or mutate the organization',()=>{
    assert.equal(ownerVerification([pending,{...pending,status:'rejected'}]).size,0);assert.equal(pending.status,'pending');assert.equal(downstage.ownerVerifiedAt,undefined);
  });
  it('approval designates the actual claimant, includes Downstage and preserves existing memberships',()=>{
    const writes=claimApprovalWrites(pending,{uid:pending.uid,accountType:'business',businessListings:['other'],businessSince:1},'admin',now);
    assert.equal(writes.account.accountType,'business');assert.deepEqual(writes.account.businessListings,['other','biz-downstage']);assert.equal(writes.account.businessSince,1);
    assert.equal(writes.mark.claimId,`${pending.uid}_biz-downstage`);assert.equal(ownerVerification([{...pending,...writes.claim}]).has(downstage.id),true);
    assert.equal(pending.status,'pending','constructing proposed writes never approves a stored claim');
  });
  it('uses the existing hourly approval-email eligibility and never emails pending claims',()=>{
    assert.equal(needsApprovalEmail(pending),false);
    assert.equal(needsApprovalEmail({...pending,status:'approved',reviewedAt:APPROVAL_EMAILS_SINCE+1}),true);
  });
  it('keeps the approved management page and dashboard on the same stable claim URL',()=>{
    const page=read('src/pages/ClaimListingPage.tsx');assert.match(page,/claim\?\.status === 'approved'/);assert.match(page,/<ListingManagement claim=\{claim\}/);
    const dashboard=read('src/components/plans/BusinessListings.tsx');assert.match(dashboard,/listingManagementPath\(c.entityId, previewUid\)/);assert.match(dashboard,/Manage listing/);
  });
});

describe('controlled organizer change requests',()=>{
  for(const field of ['dates','location','link','photo','description','other'] as UpdateField[])it(`${field} submits a pending request for this exact claimant and listing`,()=>{
    const payload=listingUpdateRequest(pending.uid,pending,field,'  Please correct these details  ',field==='link'?'https://downstage.ca/currentseason/':'',now);
    assert.equal(payload.status,'pending');assert.equal(payload.entityId,'biz-downstage');assert.equal(payload.uid,pending.uid);assert.equal(payload.details,'Please correct these details');
    assert.equal('organizerEntityId' in payload,false);
  });
  it('rejects empty details and unsafe/invalid links, while photos do not require an upload or URL',()=>{
    assert.ok(listingUpdateProblem('dates','',''));
    for(const url of ['javascript:alert(1)','not a url','http://example.com'])assert.ok(listingUpdateProblem('photo','Use a photo',url));
    assert.ok(listingUpdateProblem('link','New homepage',''));
    assert.equal(listingUpdateProblem('photo','I will email the original files',''),'');
  });
  it('sends through listing_updates and never writes public discovery records',()=>{
    const api=read('src/lib/claimsApi.ts');const fn=api.slice(api.indexOf('export async function submitUpdate'),api.indexOf('export async function readMyUpdates'));
    assert.match(fn,/addDoc\(collection\(db, UPDATES\), listingUpdateRequest/);assert.doesNotMatch(fn,/setDoc|updateDoc/);
  });
  it('explains automatic publishing and image restrictions with no file upload control',()=>{
    const ui=read('src/components/entity/ListingManagement.tsx');assert.match(ui,/OWNER_EDIT_POLICY/);assert.match(ui,/exact files/);
    assert.match(ui,/does not upload image files/);assert.match(ui,/LISTING_CONTACT_EMAIL/);assert.equal(LISTING_CONTACT_EMAIL,'aldo@calgarywatch.ca');assert.doesNotMatch(ui,/type="file"/);
  });
});

 it('renders original season posters with attribution and an uncropped layout',()=>{
   const html=renderToStaticMarkup(createElement(ListingArtwork,{image:{src:'/supplied-original.png',alt:'Downstage 2026–2027 season poster',credit:'Season artwork by Leetia Lyons'}}));
   assert.match(html,/Season artwork by Leetia Lyons/);assert.match(html,/Downstage 2026–2027 season poster/);
   const css=read('src/styles/local.css');assert.match(css,/\.cw-listing-poster img[^}]*height: auto[^}]*object-fit: contain/);
 });
