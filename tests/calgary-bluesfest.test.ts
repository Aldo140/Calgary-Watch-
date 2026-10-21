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
const now=Date.parse(profile.verifiedAt!);
const batch=read('scripts/discovery/reviewed-sources.json').find((b:any)=>b.source.id==='calgary-bluesfest');
const activeProfile={...profile,status:'published',verification:'source-checked',verifiedAt:new Date(now).toISOString()} as Business;
const normalized=domain.normalizeRecord(batch.records[0].input,batch.source,batch.records[0].id,new Date(now).toISOString()).entity;
const candidate=generated.find(e=>e.id===normalized.id) as CalgaryEvent;
test('one permanent canonical profile is retained across authored and exported inventory',()=>{
 assert.equal(editorial.filter(e=>e.id===id).length,1);assert.equal(generated.filter(e=>e.id===id).length,1);assert.deepEqual(generated.find(e=>e.id===id),profile);assert.ok(validateEntity(profile));assert.equal(entityPath(profile),'/local/calgary-international-bluesfest');assert.equal(shelfOf(profile),'stages');
});
test('official contact, presenter and mailing location remain separate from visitor venues',()=>{
 assert.equal(profile.website,'https://www.calgarybluesfest.com/');assert.equal(profile.email,'info@calgarybluesfest.com');assert.equal(profile.phone,'403-668-7144');assert.ok(!organizationVisitAddress(profile.address));assert.match(profile.description,/Calgary Blues Music Association \(CBMA\)/);assert.match(profile.description,/incorporated in 2005/);assert.match(profile.description,/The Confluence, 750 9 Avenue SE/);assert.match(profile.description,/#188, 6433a Bowness Road NW/);assert.equal(profile.hours,undefined);assert.equal(profile.claimed,false);assert.equal(profile.partner,false);assert.equal(profile.ownerVerifiedAt,undefined);
});
test('source-checked profile is published and claimable without granting ownership or sponsorship',()=>{
 assert.equal(profile.status,'published');assert.equal(profile.verification,'source-checked');assert.ok(Number.isFinite(Date.parse(profile.verifiedAt!)));assert.ok(profile.sources.every(s=>!!s.retrievedAt));assert.equal(batch.source.approved,true);assert.equal(createDiscoveryRepository(generated).find('business',profile.slug)?.id,id);assert.equal(claimFactsFor({entityId:id,entityKind:'business',status:'new',businessName:profile.title},profile as any).claimUrl,review.claimUrl);
 const draft={...profile,status:'draft'} as Business;assert.equal(createDiscoveryRepository([draft]).find('business',profile.slug),undefined);assert.equal(claimFactsFor({entityId:id,entityKind:'business',status:'new',businessName:profile.title},draft as any).claimable,false);
});
test('the published profile and its event lead to the same exact organization claim target',()=>{
 const all=associateOrganizers([activeProfile,candidate]);const event=all.find(e=>e.kind==='event')!;const repo=createDiscoveryRepository(all);
 assert.equal(repo.find('business',profile.slug)?.id,id);assert.equal(repo.find('event',candidate.slug)?.id,candidate.id);assert.equal(organizationClaimPath(activeProfile,all),'/claim/'+id);assert.equal(organizationClaimPath(event,all),'/claim/'+id+'?listing='+candidate.id);assert.equal(claimOrganization(event,all)?.claimEntity.id,id);assert.equal(review.claimUrl,'https://calgarywatch.ca/claim/'+id);
});
test('official organizer aliases associate only on official provenance, never on a venue',()=>{
 for(const organizer of ['Calgary International Bluesfest','Calgary Bluesfest','Calgary Blues Music Association','Calgary Blues Music Association (CBMA)']){
  const event=associateOrganizers([activeProfile,{...candidate,organizer}])[1] as CalgaryEvent;assert.equal(event.organizerEntityId,id);
 }
 for(const event of [{...candidate,organizer:'Another presenter',venue:'The Confluence'},{...candidate,organizer:'Calgary Bluesfest',sources:[{kind:'official' as const,name:'Other source',url:'https://example.org'}]}])assert.equal((associateOrganizers([activeProfile,event])[1] as CalgaryEvent).organizerEntityId,undefined);
});
test('February show preserves confirmed official ticket times, venue, availability and stable identity',()=>{
 assert.equal(candidate.title,'Mr. Blueberry Hill');assert.equal(candidate.start.slice(0,10),'2027-02-12');assert.equal(candidate.start,'2027-02-12T19:30:00-06:00');assert.equal(candidate.end,'2027-02-12T22:30:00-06:00');assert.equal(candidate.schedulePrecision,undefined);assert.equal(candidate.endTimeEstimated,undefined);assert.equal(candidate.id,normalized.id);assert.equal(candidate.venue,'The GRAND');assert.equal(candidate.address,'608 1 Street SW, Calgary, AB');assert.equal(candidate.pricing,'paid');assert.equal(candidate.ticketSaleStatus,'on-sale');assert.equal(candidate.tickets,'https://calgarybluesfest.tickit.ca/events/36665-mr-blueberry-hill');assert.equal(candidate.sources[0].url,'https://www.calgarybluesfest.com/event/mr-blueberry-hill');assert.equal(candidate.organizerEntityId,id);assert.equal(candidate.image?.presentation,'poster');
});
test('historical July/August 2026 festival dates never enter the upcoming organization programme',()=>{
 const historical={...candidate,id:'historical-2026',title:'Historical 2026 festival',start:'2026-07-30T00:00:00-06:00',end:'2026-08-03T00:00:00-06:00'};
 const all=associateOrganizers([activeProfile,candidate,historical]);assert.deepEqual(organizerEvents(id,all,now).map(e=>e.id),[candidate.id]);assert.equal(programmeOf(id,all,[],now).count,1);assert.equal(programmeOf(id,all,[],now).next?.eventId,candidate.id);
});
