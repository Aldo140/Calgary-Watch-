import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import domain from '../functions/discovery-domain.cjs';
import type {Business,DiscoveryEntity,Event as CalgaryEvent} from '../src/types/discovery';
import {createDiscoveryRepository,entityPath,validateEntity} from '../src/lib/discovery';
import {associateOrganizers,organizerEvents,organizationVisitAddress} from '../src/lib/organizations';
import {claimOrganization,organizationClaimPath} from '../src/lib/claimOrganization';
import {claimFactsFor} from '../scripts/ops/lib/claimFacts';
import {programmeOf,shelfOf} from '../src/lib/localShelves';
const read=(file:string)=>JSON.parse(readFileSync(file,'utf8'));
const editorial=read('src/content/editorial-inventory.json').entities as DiscoveryEntity[];
const generated=read('src/generated/discovery-index.json').entities as DiscoveryEntity[];
const review=read('docs/partners/calgary-international-bluesfest-review.json');
const id='biz-calgary-international-bluesfest';
const profile=editorial.find(e=>e.id===id) as Business;
const now=Date.parse('2026-10-21T21:19:04Z');
const activeProfile={...profile,status:'published',verification:'source-checked',verifiedAt:new Date(now).toISOString()} as Business;
const normalized=domain.normalizeRecord(review.candidateRecords[0].input,{...review.candidateSource,approved:true},review.candidateRecords[0].id,new Date(now).toISOString()).entity;
const candidate={...normalized,status:'published',verification:'source-checked',verifiedAt:new Date(now).toISOString()} as CalgaryEvent;
test('one permanent canonical profile is retained across authored and exported inventory',()=>{
 assert.equal(editorial.filter(e=>e.id===id).length,1);assert.equal(generated.filter(e=>e.id===id).length,1);assert.deepEqual(generated.find(e=>e.id===id),profile);assert.ok(validateEntity(profile));assert.equal(entityPath(profile),'/local/calgary-international-bluesfest');assert.equal(shelfOf(profile),'stages');
});
test('official contact, presenter and mailing location remain separate from visitor venues',()=>{
 assert.equal(profile.website,'https://www.calgarybluesfest.com/');assert.equal(profile.email,'info@calgarybluesfest.com');assert.equal(profile.phone,'403-668-7144');assert.ok(!organizationVisitAddress(profile.address));assert.match(profile.description,/Calgary Blues Music Association \(CBMA\)/);assert.match(profile.description,/incorporated in 2005/);assert.match(profile.description,/The Confluence, 750 9 Avenue SE/);assert.match(profile.description,/#188, 6433a Bowness Road NW/);assert.equal(profile.hours,undefined);assert.equal(profile.claimed,false);assert.equal(profile.partner,false);assert.equal(profile.ownerVerifiedAt,undefined);
});
test('blocked live verification cannot accidentally become a published or claimable listing',()=>{
 assert.equal(profile.status,'draft');assert.equal(profile.verification,'unverified');assert.equal(profile.verifiedAt,undefined);assert.ok(profile.sources.every(s=>!s.retrievedAt));assert.equal(review.candidateSource.approved,false);assert.throws(()=>domain.normalizeRecord(review.candidateRecords[0].input,review.candidateSource,review.candidateRecords[0].id));assert.equal(createDiscoveryRepository(generated).find('business',profile.slug),undefined);assert.equal(claimFactsFor({entityId:id,entityKind:'business',status:'new',businessName:profile.title},profile as any).claimable,false);
});
test('after real source review, the profile and its event lead to the same exact organization claim target',()=>{
 const all=associateOrganizers([activeProfile,candidate]);const event=all.find(e=>e.kind==='event')!;const repo=createDiscoveryRepository(all);
 assert.equal(repo.find('business',profile.slug)?.id,id);assert.equal(repo.find('event',candidate.slug)?.id,candidate.id);assert.equal(organizationClaimPath(activeProfile,all),'/claim/'+id);assert.equal(organizationClaimPath(event,all),'/claim/'+id+'?listing='+candidate.id);assert.equal(claimOrganization(event,all)?.claimEntity.id,id);assert.equal(review.claimUrl,'https://calgarywatch.ca/claim/'+id);
});
test('official organizer aliases associate only on official provenance, never on a venue',()=>{
 for(const organizer of ['Calgary International Bluesfest','Calgary Bluesfest','Calgary Blues Music Association','Calgary Blues Music Association (CBMA)']){
  const event=associateOrganizers([activeProfile,{...candidate,organizer}])[1] as CalgaryEvent;assert.equal(event.organizerEntityId,id);
 }
 for(const event of [{...candidate,organizer:'Another presenter',venue:'The Confluence'},{...candidate,organizer:'Calgary Bluesfest',sources:[{kind:'official' as const,name:'Other source',url:'https://example.org'}]}])assert.equal((associateOrganizers([activeProfile,event])[1] as CalgaryEvent).organizerEntityId,undefined);
});
test('February show preserves date-only uncertainty, the correct venue and unknown availability',()=>{
 assert.equal(candidate.title,'Mr. Blueberry Hill');assert.equal(candidate.start.slice(0,10),'2027-02-12');assert.equal(candidate.schedulePrecision,'date');assert.equal(candidate.endTimeEstimated,true);assert.equal(candidate.venue,'The GRAND');assert.equal(candidate.address,'608 1 Street SW, Calgary, AB');assert.equal(candidate.pricing,'unknown');assert.equal(candidate.ticketSaleStatus,'unknown');assert.equal(candidate.tickets,'https://calgarybluesfest.tickit.ca/');
});
test('historical July/August 2026 festival dates never enter the upcoming organization programme',()=>{
 const historical={...candidate,id:'historical-2026',title:'Historical 2026 festival',start:'2026-07-30T00:00:00-06:00',end:'2026-08-03T00:00:00-06:00'};
 const all=associateOrganizers([activeProfile,candidate,historical]);assert.deepEqual(organizerEvents(id,all,now).map(e=>e.id),[candidate.id]);assert.equal(programmeOf(id,all,[],now).count,1);assert.equal(programmeOf(id,all,[],now).next?.eventId,candidate.id);
});
