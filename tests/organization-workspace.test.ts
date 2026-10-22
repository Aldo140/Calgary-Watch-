import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { prepareOrganizationBatch, organizationEvent, approvedOrganization, mergeOrganizationContent, ORGANIZATION_CATALOG, ORGANIZATION_LIVE } from '../src/lib/organizationWorkspace';
import { submitOrganizationBatch } from '../scripts/claims/organization-submit';
import { publishedInventory } from '../src/lib/discoveryPublication';
import type { Business, DiscoveryEntity, Event } from '../src/types/discovery';
const all=JSON.parse(readFileSync('src/generated/discovery-index.json','utf8')).entities as DiscoveryEntity[];
const org=all.find(e=>e.id==='biz-downstage') as Business;
const event=all.find((e):e is Event=>e.kind==='event'&&e.organizerEntityId===org.id)!;
const uuid='12345678-1234-1234-1234-123456789abc',id=`${org.id}-event-${uuid}`,now=Date.parse('2026-10-16T18:00:00Z');
const add={entityId:id,action:'add' as const,changes:{title:'An organization confirmed event',start:'2026-11-20T19:00:00-06:00',end:'2026-11-20T21:00:00-06:00',address:'205 8 Avenue SE, Calgary'}};
function memory(){
 const data=new Map<string,any>();let failure=false;
 const ref=(path:string):any=>({path,id:path.split('/').at(-1)});
 const snap=(r:any):any=>({exists:data.has(r.path),id:r.id,data:()=>structuredClone(data.get(r.path)),get:(key:string)=>data.get(r.path)?.[key]});
 const collection=(name:string,filters:any[]=[],cap=1000):any=>({name,filters,cap,doc:(id:string='audit-'+data.size)=>ref(name+'/'+id),where:(key:string,_op:string,value:any)=>collection(name,[...filters,[key,value]],cap),limit:(n:number)=>collection(name,filters,n)});
 const db:any={data,collection,failNext:()=>{failure=true;},runTransaction:async(fn:any)=>{const writes:any[]=[];const result=await fn({get:async(r:any)=>{if(r.path)return snap(r);const docs=[...data.keys()].filter(k=>k.startsWith(r.name+'/')&&r.filters.every(([key,v]:any)=>key.split('.').reduce((value:any,part:string)=>value?.[part],data.get(k))===v)).slice(0,r.cap).map(k=>snap(ref(k)));return{docs,size:docs.length};},set:(r:any,v:any)=>writes.push([r.path,v]),update:(r:any,v:any)=>writes.push([r.path,{...data.get(r.path),...v}]),delete:(r:any)=>writes.push([r.path,undefined]),create:(r:any,v:any)=>{if(data.has(r.path))throw Error('Exists');writes.push([r.path,v]);}});if(failure){failure=false;throw Error('Quota exhausted');}writes.forEach(([k,v])=>v===undefined?data.delete(k):data.set(k,structuredClone(v)));return result;}};
 data.set(`${ORGANIZATION_CATALOG}/${org.id}`,{entity:org});data.set(`${ORGANIZATION_CATALOG}/${event.id}`,{entity:event});data.set(`listing_claims/u_${org.id}`,{uid:'u',entityId:org.id,status:'approved'});return db;
}
test('one batch edits a profile, adds an event and removes an existing event; images remain intact',()=>{
 const rows=prepareOrganizationBatch(org,all,[{entityId:org.id,action:'edit',changes:{phone:'403-555-0101'}},add,{entityId:event.id,action:'delete',changes:{}}],now);
 assert.equal(rows.length,3);assert.deepEqual(rows[0].entity.image,org.image);assert.equal(rows[2].deleted,true);assert.equal(rows[1].entity.verification,'organization-confirmed');assert.equal((rows[1].entity as any).organizerEntityId,org.id);
});
test('organization authority requires exact business approval or explicit admin scope; event ownership is not enough',()=>{
 assert.equal(approvedOrganization({entityId:event.id,status:'approved'},all),undefined);
 assert.equal(approvedOrganization({entityId:event.id,status:'approved',approvedOrganizationId:org.id},all)?.id,org.id);
 assert.equal(approvedOrganization({entityId:org.id,status:'pending'},all),undefined);
});
test('scope, images, identity, dates, organization deletion and duplicate changes are protected',()=>{
 for(const field of ['image','images','sources','slug','organizerEntityId'])assert.throws(()=>prepareOrganizationBatch(org,all,[{entityId:org.id,action:'edit',changes:{[field]:'bad'}}],now));
 assert.throws(()=>prepareOrganizationBatch(org,all,[{entityId:org.id,action:'delete',changes:{}}],now));
 assert.throws(()=>prepareOrganizationBatch(org,all,[{...add,changes:{...add.changes,end:'2000-01-01T00:00:00Z'}}],now));
 assert.throws(()=>prepareOrganizationBatch(org,all,[add,add],now));
 assert.throws(()=>prepareOrganizationBatch(org,all,[{entityId:'biz-theatre-calgary',action:'edit',changes:{title:'Bad'}}],now));
});
test('live projections and tombstones survive rebuilding and an event can be restored',()=>{
 const entity={...event,title:'Updated'};
 const row={entityId:event.id,organizationId:org.id,entity,deleted:true,updatedAt:now,batchId:uuid};
 assert.ok(!mergeOrganizationContent(all,[row]).some(e=>e.id===event.id));
 assert.equal(mergeOrganizationContent(all,[{...row,deleted:false}]).find(e=>e.id===event.id)?.title,'Updated');
});
test('organization confirmed upcoming events do not disappear after fourteen days',()=>{
 const entity={...organizationEvent(org,id,now),...add.changes};
 assert.equal(publishedInventory(entity,new Date(now+20*86400000)),true);
});
test('server commits publication, shared allowance and admin audit together; retries do not consume another week',async()=>{
 const db=memory(),input={organizationId:org.id,requestId:uuid,operations:[add,{entityId:org.id,action:'edit' as const,changes:{phone:'403-555-0101'}}]};
 const result=await submitOrganizationBatch(db,'u',input,now);assert.equal(result.nextAt,now+7*86400000);
 assert.ok(db.data.has(`${ORGANIZATION_LIVE}/${id}`));assert.equal(db.data.get(`owner_listing_edits/${uuid}`).notificationPending,true);
 assert.equal((await submitOrganizationBatch(db,'u',input,now+100)).nextAt,result.nextAt);
 await assert.rejects(submitOrganizationBatch(db,'u',{...input,operations:[{...add,changes:{...add.changes,title:'Different payload'}}]},now+100),/Invalid save identifier/);
 await assert.rejects(submitOrganizationBatch(db,'u',{...input,requestId:'22345678-1234-1234-1234-123456789abc'},now+100),/seven complete/);
});
test('failed atomic submission consumes no allowance and publishes nothing',async()=>{
 const db=memory(),before=structuredClone([...db.data]);db.failNext();
 await assert.rejects(submitOrganizationBatch(db,'u',{organizationId:org.id,requestId:uuid,operations:[add]},now),/Quota/);assert.deepEqual([...db.data],before);
});
test('a second representative shares the same organization allowance',async()=>{
 const db=memory();db.data.set(`listing_claims/v_event`,{uid:'v',entityId:event.id,status:'approved',approvedOrganizationId:org.id});
 await submitOrganizationBatch(db,'u',{organizationId:org.id,requestId:uuid,operations:[add]},now);
 await assert.rejects(submitOrganizationBatch(db,'v',{organizationId:org.id,requestId:'22345678-1234-1234-1234-123456789abc',operations:[{entityId:org.id,action:'edit',changes:{phone:'403'}}]},now+1000),/seven complete/);
 await submitOrganizationBatch(db,'v',{organizationId:org.id,requestId:'22345678-1234-1234-1234-123456789abc',operations:[{entityId:org.id,action:'edit',changes:{phone:'403'}}]},now+7*86400000);
});
test('server rejects event-only or revoked access and any pending legacy save before publishing',async()=>{
 const db=memory();db.data.clear();db.data.set(`${ORGANIZATION_CATALOG}/${org.id}`,{entity:org});db.data.set('listing_claims/u_event',{uid:'u',entityId:event.id,status:'approved'});
 const input={organizationId:org.id,requestId:uuid,operations:[add]};await assert.rejects(submitOrganizationBatch(db,'u',input,now),/not been confirmed/);
 db.data.set(`listing_claims/u_${org.id}`,{uid:'u',entityId:org.id,status:'approved'});db.data.set('owner_listing_edits/legacy',{uid:'v',rootId:org.id,status:'queued'});
 await assert.rejects(submitOrganizationBatch(db,'u',input,now),/previous save/);assert.equal(db.data.has(`${ORGANIZATION_LIVE}/${id}`),false);
});

test('linked market fields share organization authority and date edits remain protected',()=>{
 const market=all.find(e=>e.kind==='market'&&e.organizerEntityId==='biz-dalhousie-community-association')!;
 const association=all.find(e=>e.id==='biz-dalhousie-community-association') as Business;
 const batch=prepareOrganizationBatch(association,all,[{entityId:market.id,action:'edit',changes:{parking:'Use the public visitor parking.'}}],now);
 assert.equal((batch[0].entity as any).parking,'Use the public visitor parking.');assert.equal(batch[0].entity.verification,'organization-confirmed');
 assert.throws(()=>prepareOrganizationBatch(org,all,[{entityId:market.id,action:'edit',changes:{title:'Wrong organization'}}],now));
});
test('server validates market occurrence IDs before committing a bundle',async()=>{
 const market=all.find(e=>e.kind==='market'&&e.organizerEntityId==='biz-dalhousie-community-association')!;
 const association=all.find(e=>e.id==='biz-dalhousie-community-association') as Business;
 const db=memory();db.data.set(`${ORGANIZATION_CATALOG}/${association.id}`,{entity:association});db.data.set(`${ORGANIZATION_CATALOG}/${market.id}`,{entity:market,occurrences:[]});db.data.set(`listing_claims/u_${association.id}`,{uid:'u',entityId:association.id,status:'approved'});
 const dates=[{id:'another-market-date',start:'2026-11-20T10:00:00-06:00',end:'2026-11-20T14:00:00-06:00',cancelled:false}];
 const input={organizationId:association.id,requestId:uuid,operations:[{entityId:market.id,action:'edit' as const,changes:{occurrences:dates}}]};
 await assert.rejects(submitOrganizationBatch(db,'u',input,now),/another listing/);assert.equal(db.data.has(`owner_business_edit_limits/${association.id}`),false);
 delete (dates[0] as any).id;await submitOrganizationBatch(db,'u',input,now);assert.equal(db.data.get(`${ORGANIZATION_LIVE}/${market.id}`).occurrences.length,1);
});

test('later staff image and protected metadata changes survive an owner projection',()=>{
 const base={...event,image:{src:'/staff-new.jpg',alt:'New approved image'},scores:{featured:4}};
 const row={entityId:event.id,organizationId:org.id,entity:{...event,title:'Owner title'},changes:{title:'Owner title'},deleted:false,updatedAt:now,batchId:uuid};
 const merged=mergeOrganizationContent([base],[row])[0];assert.equal(merged.title,'Owner title');assert.deepEqual(merged.image,base.image);assert.deepEqual(merged.scores,base.scores);
});
test('pending event-only saves for another event in this organization block a new bundle',async()=>{
 const db=memory();db.data.set('owner_listing_edits/legacy',{uid:'v',rootId:event.id,entityId:event.id,status:'queued'});
 await assert.rejects(submitOrganizationBatch(db,'u',{organizationId:org.id,requestId:uuid,operations:[add]},now),/previous save/);
});

test('any role-assigned admin can edit without a claim or weekly allowance, with accurate attribution',async()=>{
 const db=memory();db.data.set('users/staff',{uid:'staff',role:'admin'});db.data.set(`owner_business_edit_limits/${org.id}`,{lastSubmittedAt:now-100,editId:'owner-save'});
 const before=structuredClone(db.data.get(`owner_business_edit_limits/${org.id}`));
 await submitOrganizationBatch(db,'staff',{organizationId:org.id,requestId:uuid,adminEdit:true,subjectUid:'u',operations:[{entityId:org.id,action:'edit',changes:{phone:'403-555-0199',image:{src:'https://example.org/approved.jpg',alt:'Approved art',credit:'Artist'}}}]},now);
 assert.deepEqual(db.data.get(`owner_business_edit_limits/${org.id}`),before);
 const receipt=db.data.get(`owner_listing_edits/${uuid}`);assert.equal(receipt.uid,'staff');assert.equal(receipt.subjectUid,'u');assert.equal(receipt.actorRole,'admin');
 const live=db.data.get(`${ORGANIZATION_LIVE}/${org.id}`);assert.equal(live.adminMedia.image.credit,'Artist');assert.equal(live.submittedByAdmin,true);
});
test('members cannot enable admin mode by forging the flag or selected member UID',async()=>{
 const db=memory();db.data.set('users/u',{uid:'u',role:'user'});
 await assert.rejects(submitOrganizationBatch(db,'u',{organizationId:org.id,requestId:uuid,adminEdit:true,subjectUid:'staff',operations:[add]},now),/Administrator access/);
 assert.equal(db.data.has(`${ORGANIZATION_LIVE}/${id}`),false);
});
test('ordinary owner edits preserve admin-managed images and keep normal seven-day limits',async()=>{
 const db=memory();db.data.set('users/staff',{role:'admin'});
 await submitOrganizationBatch(db,'staff',{organizationId:org.id,requestId:uuid,adminEdit:true,operations:[{entityId:org.id,action:'edit',changes:{image:{src:'/images/approved.jpg',alt:'Approved'}}}]},now);
 await submitOrganizationBatch(db,'u',{organizationId:org.id,requestId:'22345678-1234-1234-1234-123456789abc',operations:[{entityId:org.id,action:'edit',changes:{phone:'403-555-0111'}}]},now+1);
 const projection=db.data.get(`${ORGANIZATION_LIVE}/${org.id}`);assert.equal(mergeOrganizationContent(all,[projection]).find(e=>e.id===org.id)!.image!.src,'/images/approved.jpg');
 await assert.rejects(submitOrganizationBatch(db,'u',{organizationId:org.id,requestId:'32345678-1234-1234-1234-123456789abc',operations:[add]},now+2),/seven complete/);
});
test('admin updates supersede conflicting queued edits and release only their pending reservation',async()=>{
 const db=memory();db.data.set('users/staff',{role:'admin'});db.data.set('owner_listing_edits/queued',{uid:'u',rootId:org.id,entityId:org.id,status:'queued'});db.data.set(`owner_listing_edit_limits/${org.id}`,{editId:'queued',lastSubmittedAt:new Date(now-1)});
 await submitOrganizationBatch(db,'staff',{organizationId:org.id,requestId:uuid,adminEdit:true,operations:[{entityId:org.id,action:'edit',changes:{phone:'403'}}]},now);
 assert.equal(db.data.get('owner_listing_edits/queued').status,'failed');assert.equal(db.data.has(`owner_listing_edit_limits/${org.id}`),false);assert.equal(db.data.has(`owner_business_edit_limits/${org.id}`),false);
});
test('admin member edits preserve identity, audit the actor and make RSVP counts idempotent',async()=>{
 const {adminMemberAction}=await import('../scripts/claims/admin-member');const db=memory();db.data.set('users/staff',{role:'admin'});db.data.set('users/u',{uid:'u',email:'member@example.org',role:'user'});
 const draft={neighborhood:'Dalhousie',address:'',inferredNeighborhood:'',weeklyDigestOptIn:false,eventsDigestOptIn:false,interests:[]};
 await adminMemberAction(db,'staff',{subjectUid:'u',action:'profile',draft},{},now);
 assert.equal(db.data.get('users/u').email,'member@example.org');assert.equal(db.data.get('users/u').role,'user');assert.equal(db.data.get('users/u').preferencesUpdatedBy,'staff');
 const input={subjectUid:'u',action:'rsvp',eventId:event.id,start:(event as any).start,on:true};await adminMemberAction(db,'staff',input,{},now);await adminMemberAction(db,'staff',input,{},now+1);assert.equal(db.data.get(`event_rsvp_counts/${event.id}`).count,1);
 await assert.rejects(adminMemberAction(db,'u',{subjectUid:'staff',action:'profile',draft},{},now),/Administrator access/);
});

 test('admin-created events do not invent an ownership verification',()=>{
 const unclaimed={...org};delete unclaimed.ownerVerifiedAt;
 const result=prepareOrganizationBatch(unclaimed,all,[add],now,true)[0].entity;
 assert.equal(result.ownerVerifiedAt,undefined);assert.equal(result.verification,'source-checked');
 });

test('a one-off organizer saves a private profile and adds events in one atomic submission',async()=>{
 const {standaloneOrganization,MANAGEMENT_PROFILES}=await import('../src/lib/claimOrganization');
 const single={...event,id:'one-off-test',organizer:'Community collective',organizerEntityId:undefined};
 const profile=standaloneOrganization(single as any),newId=`${profile.id}-event-${uuid}`;
 const db=memory();db.data.set(`${ORGANIZATION_CATALOG}/${single.id}`,{entity:single});db.data.set(`listing_claims/u_${single.id}`,{uid:'u',entityId:single.id,status:'approved'});
 const operations=[{entityId:profile.id,action:'edit' as const,changes:{title:'Community collective',phone:'403-555-0100'}},{entityId:single.id,action:'edit' as const,changes:{summary:'Confirmed details.'}},{...add,entityId:newId}];
 await submitOrganizationBatch(db,'u',{organizationId:profile.id,requestId:uuid,operations},now);
 assert.equal(db.data.get(`${MANAGEMENT_PROFILES}/${profile.sourceListingId}`).entity.phone,'403-555-0100');
 assert.equal(db.data.has(`${ORGANIZATION_LIVE}/${profile.id}`),false,'Management profiles must never enter public discovery');
 assert.equal(db.data.get(`${ORGANIZATION_LIVE}/${newId}`).entity.organizerEntityId,profile.id);
 assert.equal(db.data.get(`owner_business_edit_limits/${single.id}`).lastSubmittedAt,now);
 assert.equal(db.data.has(`owner_business_edit_limits/${profile.id}`),false,'One allowance across old and new management URLs');
 assert.equal(db.data.get(`${ORGANIZATION_LIVE}/${single.id}`).changes.summary,'Confirmed details.');
 await assert.rejects(submitOrganizationBatch(db,'u',{organizationId:profile.id,requestId:'22345678-1234-1234-1234-123456789abc',operations:[{entityId:single.id,action:'edit',changes:{summary:'Too soon'}}]},now+1),/seven complete/);
});
test('one-off workspaces do not grant a similarly named event or broader organization access',async()=>{
 const {standaloneOrganization}=await import('../src/lib/claimOrganization');const profile=standaloneOrganization(event as any),db=memory();
 db.data.set(`listing_claims/u_${event.id}`,{uid:'u',entityId:event.id,status:'approved'});
 const another=all.find(e=>e.kind==='event'&&e.id!==event.id&&e.organizerEntityId===org.id)!;
 db.data.set(`${ORGANIZATION_CATALOG}/${another.id}`,{entity:another});
 await assert.rejects(submitOrganizationBatch(db,'u',{organizationId:profile.id,requestId:uuid,operations:[{entityId:another.id,action:'edit',changes:{title:'Unrelated'}}]},now),/outside your approved organization/);
 db.data.set(`listing_claims/u_${event.id}`,{uid:'u',entityId:event.id,status:'approved',approvedOrganizationId:org.id});
 await assert.rejects(submitOrganizationBatch(db,'u',{organizationId:profile.id,requestId:uuid,operations:[{entityId:event.id,action:'edit',changes:{title:'Old scope'}}]},now),/not been confirmed/);
});
test('private workspace events retain explicit server ownership after feed association changes',async()=>{
 const {standaloneOrganization}=await import('../src/lib/claimOrganization');const profile=standaloneOrganization(event as any),db=memory(),newId=`${profile.id}-event-${uuid}`;
 db.data.set(`listing_claims/u_${event.id}`,{uid:'u',entityId:event.id,status:'approved'});
 await submitOrganizationBatch(db,'u',{organizationId:profile.id,requestId:uuid,operations:[{...add,entityId:newId}]},now);
 const row=db.data.get(`${ORGANIZATION_LIVE}/${newId}`),associated={...row.entity,organizerEntityId:org.id};
 assert.equal((mergeOrganizationContent([associated],[row])[0] as any).organizerEntityId,profile.id);
 db.data.set(`${ORGANIZATION_CATALOG}/${newId}`,{entity:associated});
 await submitOrganizationBatch(db,'u',{organizationId:profile.id,requestId:'22345678-1234-1234-1234-123456789abc',operations:[{entityId:newId,action:'edit',changes:{title:'Updated after export'}}]},now+7*86400000+1);
 assert.equal(db.data.get(`${ORGANIZATION_LIVE}/${newId}`).entity.title,'Updated after export');
});
test('an ordinary listing projection cannot override a canonical organizer association',()=>{
 const row={entityId:event.id,organizationId:'org-pretend',entity:{...event,title:'Wrong title',organizerEntityId:'org-pretend'},changes:{title:'Wrong title'},deleted:false,updatedAt:now,batchId:uuid};
 assert.equal(mergeOrganizationContent([event],[row])[0].title,event.title);
 const stale={...row,workspaceAssociationConfirmed:true,submittedByAdmin:true};
 const repaired=mergeOrganizationContent([event],[stale])[0] as Event;
 assert.equal(repaired.title,'Wrong title');assert.equal(repaired.organizerEntityId,event.organizerEntityId);
});
test('legacy listing workspaces share the actual organization allowance rather than creating a second one',async()=>{
 const {standaloneOrganization}=await import('../src/lib/claimOrganization');const profile=standaloneOrganization(event as any),db=memory();
 db.data.set(`listing_claims/u_${event.id}`,{uid:'u',entityId:event.id,status:'approved'});db.data.set(`owner_business_edit_limits/${org.id}`,{lastSubmittedAt:now-100,editId:'other-representative'});
 await assert.rejects(submitOrganizationBatch(db,'u',{organizationId:profile.id,requestId:uuid,operations:[{entityId:event.id,action:'edit',changes:{title:'Attempted second submission'}}]},now),/seven complete/);
});
test('a one-off market keeps its dates in the existing public listing and can add an event',async()=>{
 const {standaloneOrganization,MANAGEMENT_PROFILES}=await import('../src/lib/claimOrganization');const market=all.find(e=>e.kind==='market'&&e.sources.some(s=>s.kind==='official'))! as any,profile=standaloneOrganization(market),db=memory();
 db.data.set(`${ORGANIZATION_CATALOG}/${market.id}`,{entity:market,occurrences:[]});db.data.set(`listing_claims/u_${market.id}`,{uid:'u',entityId:market.id,status:'approved'});
 const changes={occurrences:[{start:'2026-11-20T10:00:00-07:00',end:'2026-11-20T14:00:00-07:00',cancelled:false}]};
 await submitOrganizationBatch(db,'u',{organizationId:profile.id,requestId:uuid,operations:[{entityId:market.id,action:'edit',changes},{...add,entityId:`${profile.id}-event-${uuid}`}]},now);
 assert.equal(db.data.get(`${ORGANIZATION_LIVE}/${market.id}`).occurrences.length,1);assert.equal(db.data.has(`${ORGANIZATION_LIVE}/${profile.id}`),false);assert.equal(db.data.has(`${MANAGEMENT_PROFILES}/${profile.sourceListingId}`),true);
});

test('server approval atomically confirms account and verification, without sending email',async()=>{
 const {approveOrganizationClaim}=await import('../scripts/claims/approve-organization');const db=memory();db.data.set('users/staff',{uid:'staff',role:'admin'});db.data.set('users/u',{uid:'u',role:'user'});db.data.set(`listing_claims/u_${org.id}`,{uid:'u',entityId:org.id,entityTitle:org.title,status:'pending'});
 await approveOrganizationClaim(db,'staff',{uid:'u',entityId:org.id},{},now);
 assert.equal(db.data.get(`listing_claims/u_${org.id}`).status,'approved');assert.equal(db.data.get('users/u').accountType,'business');assert.equal(db.data.get(`verified_listings/${org.id}`).claimId,`u_${org.id}`);assert.equal(db.data.get(`organization_managers/u_${org.id}`).uid,'u');assert.equal(db.data.get(`listing_claims/u_${org.id}`).approvalEmailStatus,undefined);
});
test('approval repair moves the shared one-off workspace and allowance without losing representatives or history',async()=>{
 const {approveOrganizationClaim}=await import('../scripts/claims/approve-organization');const {standaloneOrganization}=await import('../src/lib/claimOrganization');const profile=standaloneOrganization(event as any),db=memory(),childId=`${profile.id}-event-${uuid}`;
 db.data.set('users/staff',{uid:'staff',role:'admin'});
 for(const uid of ['u','v']){db.data.set(`users/${uid}`,{uid,role:'user',accountType:'business',businessSince:20,businessListings:[event.id]});db.data.set(`listing_claims/${uid}_${event.id}`,{uid,entityId:event.id,entityTitle:event.title,status:'approved',reviewedAt:100,approvalEmailStatus:'sent'});}
 db.data.set(`${ORGANIZATION_LIVE}/${childId}`,{entityId:childId,organizationId:profile.id,entity:{...event,id:childId,organizerEntityId:profile.id},createdInWorkspace:true,changes:{},deleted:false,updatedAt:now-200,batchId:'original'});
 db.data.set(`owner_business_edit_limits/${event.id}`,{lastSubmittedAt:now-100,editId:'old-save'});
 await assert.rejects(approveOrganizationClaim(db,'staff',{uid:'u',entityId:event.id,organizationId:org.id},{},now),/Confirm shared/);
 assert.equal(db.data.get(`${ORGANIZATION_LIVE}/${childId}`).organizationId,profile.id);
 await approveOrganizationClaim(db,'staff',{uid:'u',entityId:event.id,organizationId:org.id,confirmSharedAccess:true},{},now);
 for(const uid of ['u','v']){const c=db.data.get(`listing_claims/${uid}_${event.id}`);assert.equal(c.approvedOrganizationId,org.id);assert.equal(c.reviewedAt,100);assert.equal(c.approvalEmailStatus,'sent');assert.ok(db.data.get(`users/${uid}`).businessListings.includes(org.id));assert.equal(db.data.get(`organization_managers/${uid}_${org.id}`).uid,uid);}
 const moved=db.data.get(`${ORGANIZATION_LIVE}/${childId}`);assert.equal(moved.organizationId,org.id);assert.equal(moved.entity.organizerEntityId,org.id);assert.deepEqual(moved.entity.image,event.image);assert.equal(db.data.get(`owner_business_edit_limits/${org.id}`).lastSubmittedAt,now-100);
 await assert.rejects(submitOrganizationBatch(db,'v',{organizationId:org.id,requestId:uuid,operations:[{entityId:childId,action:'edit',changes:{title:'Too soon'}}]},now),/seven complete/);
 await submitOrganizationBatch(db,'v',{organizationId:org.id,requestId:uuid,operations:[{entityId:childId,action:'edit',changes:{title:'Still manageable after migration'}}]},now+7*86400000);
 assert.equal(db.data.get(`${ORGANIZATION_LIVE}/${childId}`).entity.title,'Still manageable after migration');
});
test('failed approvals publish nothing and ordinary members cannot approve or expand claims',async()=>{
 const {approveOrganizationClaim}=await import('../scripts/claims/approve-organization');const db=memory();db.data.set('users/staff',{uid:'staff',role:'admin'});db.data.set('users/u',{uid:'u',role:'user'});db.data.set(`listing_claims/u_${org.id}`,{uid:'u',entityId:org.id,entityTitle:org.title,status:'pending'});
 await assert.rejects(approveOrganizationClaim(db,'u',{uid:'u',entityId:org.id},{},now),/Administrator access/);
 db.failNext();await assert.rejects(approveOrganizationClaim(db,'staff',{uid:'u',entityId:org.id},{},now),/Quota/);
 assert.equal(db.data.get(`listing_claims/u_${org.id}`).status,'pending');assert.equal(db.data.has(`verified_listings/${org.id}`),false);assert.equal(db.data.get('users/u').accountType,undefined);
});
test('approved event claims move to their linked organizer; unlinked events keep their own workspace',async()=>{
 const {planOrganizerPromotions,promotionTargets,defaultOrganizationScope,reviewClaimScope}=await import('../src/lib/organizerPromotion');
 const loose=all.find(e=>(e.kind==='event'||e.kind==='market')&&!e.organizerEntityId&&e.status==='published')!;
 const rows=planOrganizerPromotions([{uid:'u',entityId:event.id,status:'approved'},{uid:'v',entityId:event.id,status:'approved'},{uid:'w',entityId:loose.id,status:'approved'},{uid:'x',entityId:org.id,status:'approved'},{uid:'y',entityId:event.id,status:'pending'},{uid:'z',entityId:event.id,status:'approved',approvedOrganizationId:org.id}],all);
 assert.deepEqual(rows.map(r=>r.action),['promote','promote','no-organizer','organization','organization']);
 assert.equal(rows[0].organizationId,org.id);
 assert.deepEqual(promotionTargets(rows).map(r=>r.uid),['u']);
 assert.equal(defaultOrganizationScope(event.id,all),org.id);assert.equal(defaultOrganizationScope(loose.id,all),undefined);assert.equal(defaultOrganizationScope(org.id,all),undefined);
 const review=reviewClaimScope({uid:'u',entityId:event.id,status:'approved'},all);assert.equal(review.recommendation,'organization');assert.equal(review.organizationId,org.id);assert.equal(review.evidence.length,3);
 const unlinked=reviewClaimScope({uid:'w',entityId:loose.id,status:'approved'},all);assert.equal(unlinked.recommendation,'listing-only');assert.match(unlinked.evidence[0],/No exact organizer link/);
});

test('the two researched scopes resolve to their official organization profiles',async()=>{
 const {reviewClaimScope,planOrganizerPromotions}=await import('../src/lib/organizerPromotion');
 const dalhousie=all.find(e=>e.id==='b3bbb09ef98f18fa6f66383e98f1')!;
 const mercantile=all.find(e=>e.id==='6972906c904ecd4acb9407299e22')!;
 assert.equal(reviewClaimScope({uid:'dalhousie',entityId:dalhousie.id,status:'approved'},all).organizationId,'biz-dalhousie-community-association');
 assert.equal(reviewClaimScope({uid:'mercantile',entityId:mercantile.id,status:'approved'},all).organizationId,'biz-mercantile-on-9th');
 assert.notEqual((mercantile as any).organizerEntityId,'biz-inglewood-bia');
 const stale=planOrganizerPromotions([{uid:'mercantile',entityId:mercantile.id,status:'approved',approvedOrganizationId:'biz-inglewood-bia'}],all)[0];
 assert.equal(stale.action,'promote');assert.equal(stale.organizationId,'biz-mercantile-on-9th');
 const staleReview=reviewClaimScope({uid:'mercantile',entityId:mercantile.id,status:'approved',approvedOrganizationId:'biz-inglewood-bia'},all);
 assert.equal(staleReview.recommendation,'organization');assert.equal(staleReview.organizationId,'biz-mercantile-on-9th');assert.match(staleReview.evidence[0],/recorded scope/i);
});
test('promotion gives every representative organization access and the organizer the Verified mark, preserving history',async()=>{
 const {promoteOrganizerClaims}=await import('../scripts/claims/promote-organizer-claims');const db=memory();
 for(const uid of ['u','v']){db.data.set(`users/${uid}`,{uid,role:'user',accountType:'business',businessSince:20,businessListings:[event.id]});db.data.set(`listing_claims/${uid}_${event.id}`,{uid,entityId:event.id,entityTitle:event.title,status:'approved',reviewedAt:100,reviewedBy:'aldo',approvalEmailStatus:'sent'});}
 const claims=['u','v'].map(uid=>db.data.get(`listing_claims/${uid}_${event.id}`));
 const report=await promoteOrganizerClaims(db,all,claims,false,now);
 assert.deepEqual(report.results.map(r=>r.status),['planned']);assert.equal(db.data.get(`listing_claims/u_${event.id}`).approvedOrganizationId,undefined);
 const applied=await promoteOrganizerClaims(db,all,claims,true,now);
 assert.deepEqual(applied.results.map(r=>r.status),['promoted']);
 for(const uid of ['u','v']){const c=db.data.get(`listing_claims/${uid}_${event.id}`);assert.equal(c.approvedOrganizationId,org.id);assert.equal(c.reviewedAt,100);assert.equal(c.reviewedBy,'aldo');assert.equal(c.approvalEmailStatus,'sent');assert.ok(db.data.get(`users/${uid}`).businessListings.includes(org.id));assert.equal(db.data.get(`organization_managers/${uid}_${org.id}`).organizationId,org.id);}
 assert.equal(db.data.get(`verified_listings/${org.id}`).organizationId,org.id);
 const again=await promoteOrganizerClaims(db,all,['u','v'].map(uid=>db.data.get(`listing_claims/${uid}_${event.id}`)),true,now);
 assert.equal(again.results.length,0);
});
test('the system promotion bypass is not reachable as a member',async()=>{
 const {approveOrganizationClaim}=await import('../scripts/claims/approve-organization');const db=memory();db.data.set('users/u',{uid:'u',role:'user'});db.data.set(`listing_claims/u_${event.id}`,{uid:'u',entityId:event.id,entityTitle:event.title,status:'approved',reviewedAt:100});
 await assert.rejects(approveOrganizationClaim(db,'u',{uid:'u',entityId:event.id,organizationId:org.id,confirmSharedAccess:true},{},now),/Administrator access/);
});
test('organization profiles can set a contact email; slug, verification and images stay protected',()=>{
 const rows=prepareOrganizationBatch(org,all,[{entityId:org.id,action:'edit',changes:{email:'hello@downstage.ca',title:'Downstage',description:'Updated',website:'https://downstage.ca/',socials:{instagram:'https://instagram.com/downstage'}}}],now);
 assert.equal((rows[0].entity as Business).email,'hello@downstage.ca');
 assert.throws(()=>prepareOrganizationBatch(org,all,[{entityId:org.id,action:'edit',changes:{email:'not an email'}}],now),/contact email/);
 for(const field of ['ownerVerifiedAt','claimed','verification','partner'])assert.throws(()=>prepareOrganizationBatch(org,all,[{entityId:org.id,action:'edit',changes:{[field]:'x'}}],now));
});

test('a 100-show programme commits atomically under one weekly allowance',async()=>{
 const db=memory();const operations=Array.from({length:100},(_,i)=>({...add,entityId:`${org.id}-event-12345678-1234-4234-8234-${i.toString(16).padStart(12,'0')}`,changes:{...add.changes,title:`Confirmed show ${i}`}}));const result=await submitOrganizationBatch(db,'u',{organizationId:org.id,requestId:uuid,operations},now);assert.ok(result.nextAt>now);assert.equal([...db.data.keys()].filter(k=>k.startsWith(ORGANIZATION_LIVE+'/')).length,100);await assert.rejects(()=>submitOrganizationBatch(db,'u',{organizationId:org.id,requestId:'22345678-1234-1234-1234-123456789abc',operations:[{...operations[0],entityId:`${org.id}-event-22345678-1234-1234-1234-123456789abc`}]},now+1),/seven complete days/);
});

test('oversized 100-listing audit aborts the whole save and preserves the allowance',async()=>{
 const db=memory();const operations=Array.from({length:100},(_,i)=>{const entityId=`large-event-${i}`;db.data.set(`${ORGANIZATION_CATALOG}/${entityId}`,{entity:{...event,id:entityId,description:'a'.repeat(5000)}});return{entityId,action:'edit' as const,changes:{description:'b'.repeat(5000)}};});await assert.rejects(()=>submitOrganizationBatch(db,'u',{organizationId:org.id,requestId:uuid,operations},now),/too large to save safely/);assert.equal([...db.data.keys()].filter(k=>k.startsWith(ORGANIZATION_LIVE+'/')).length,0);assert.equal(db.data.has('owner_business_edit_limits/'+org.id),false);
});
