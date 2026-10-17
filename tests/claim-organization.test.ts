import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {claimOrganization,standaloneOrganization,organizationClaimPath,approvedManagementOrganization} from '../src/lib/claimOrganization';
import type {DiscoveryEntity,Event} from '../src/types/discovery';
const all=JSON.parse(readFileSync('src/generated/discovery-index.json','utf8')).entities as DiscoveryEntity[];
const linked=all.find((e):e is Event=>e.kind==='event'&&Boolean(e.organizerEntityId))!;
const single={...linked,id:'one-off-event',organizer:'One-off arts collective',organizerEntityId:undefined};
test('linked events claim their actual organization, with original listing context',()=>{
 const target=claimOrganization(linked,all)!;assert.equal(target.claimEntity.id,linked.organizerEntityId);assert.equal(target.publicProfile,true);
 assert.equal(organizationClaimPath(linked,all),`/claim/${linked.organizerEntityId}?listing=${linked.id}`);
});
test('a one-off gets prefilled management details without inventing a public business or its address',()=>{
 const target=claimOrganization(single,all)!;assert.equal(target.claimEntity.id,single.id);assert.equal(target.publicProfile,false);assert.equal(target.profile.title,single.organizer);assert.equal(target.profile.managementOnly,true);assert.equal(target.profile.address,'');assert.equal(target.profile.sourceListingId,single.id);
 assert.equal(organizationClaimPath(single,all),'/claim/one-off-event');
});
test('matching organizer names or sources alone cannot grant organization access',()=>{
 const fake={...linked,organizerEntityId:'missing-profile'};
 assert.equal(claimOrganization(fake,all)?.publicProfile,false);
 const old=approvedManagementOrganization({entityId:linked.id,status:'approved'},all)!;
 assert.equal(old.managementOnly,true);assert.equal(old.sourceListingId,linked.id);assert.notEqual(old.id,linked.organizerEntityId);
 assert.equal(approvedManagementOrganization({entityId:linked.id,approvedOrganizationId:linked.organizerEntityId,status:'approved'},all)?.id,linked.organizerEntityId);
 assert.equal(approvedManagementOrganization({entityId:single.id,status:'pending'},[single]),undefined);
});
test('an unnamed organizer falls back to the listing name without guessing a venue owner',()=>{
 assert.equal(standaloneOrganization({...single,organizer:''}).title,single.title);
});
test('events added to a one-off workspace return to that same organization claim',()=>{
 const root=standaloneOrganization(single),added={...single,id:'another-event',organizerEntityId:root.id};
 const target=claimOrganization(added,[single,added])!;assert.equal(target.claimEntity.id,single.id);assert.equal(target.profile.id,root.id);assert.equal(target.publicProfile,false);
 assert.equal(organizationClaimPath(added,[single,added]),'/claim/one-off-event?listing=another-event');
});
