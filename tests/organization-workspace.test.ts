import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { prepareOrganizationBatch, organizationEvent, approvedOrganization, mergeOrganizationContent, ORGANIZATION_CATALOG, ORGANIZATION_LIVE } from '../src/lib/organizationWorkspace';
import { submitOrganizationBatch } from '../scripts/claims/organization-submit';
import { publishedInventory } from '../src/lib/discoveryPublication';
import type { Business, DiscoveryEntity } from '../src/types/discovery';
const all=JSON.parse(readFileSync('src/generated/discovery-index.json','utf8')).entities as DiscoveryEntity[];
const org=all.find(e=>e.id==='biz-downstage') as Business;
const event=all.find(e=>e.kind==='event'&&e.organizerEntityId===org.id)!;
const uuid='12345678-1234-1234-1234-123456789abc',id=`${org.id}-event-${uuid}`,now=Date.parse('2026-10-16T18:00:00Z');
const add={entityId:id,action:'add' as const,changes:{title:'An organization confirmed event',start:'2026-11-20T19:00:00-06:00',end:'2026-11-20T21:00:00-06:00',address:'205 8 Avenue SE, Calgary'}};
function memory(){
 const data=new Map<string,any>();let failure=false;
 const ref=(path:string):any=>({path,id:path.split('/').at(-1)});
 const snap=(r:any):any=>({exists:data.has(r.path),id:r.id,data:()=>structuredClone(data.get(r.path)),get:(key:string)=>data.get(r.path)?.[key]});
 const collection=(name:string,filters:any[]=[],cap=1000):any=>({name,filters,cap,doc:(id:string)=>ref(name+'/'+id),where:(key:string,_op:string,value:any)=>collection(name,[...filters,[key,value]],cap),limit:(n:number)=>collection(name,filters,n)});
 const db:any={data,collection,failNext:()=>{failure=true;},runTransaction:async(fn:any)=>{const writes:any[]=[];const result=await fn({get:async(r:any)=>{if(r.path)return snap(r);const docs=[...data.keys()].filter(k=>k.startsWith(r.name+'/')&&r.filters.every(([key,v]:any)=>key.split('.').reduce((value:any,part:string)=>value?.[part],data.get(k))===v)).slice(0,r.cap).map(k=>snap(ref(k)));return{docs,size:docs.length};},set:(r:any,v:any)=>writes.push([r.path,v]),create:(r:any,v:any)=>{if(data.has(r.path))throw Error('Exists');writes.push([r.path,v]);}});if(failure){failure=false;throw Error('Quota exhausted');}writes.forEach(([k,v])=>data.set(k,structuredClone(v)));return result;}};
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
