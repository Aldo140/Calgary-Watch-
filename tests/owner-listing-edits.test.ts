import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { applyOwnerContent, ownerEditableFields, ownerEditPatch, ownerEditTargets, nextOwnerEditAt, OWNER_EDIT_INTERVAL, OWNER_EDITS, OWNER_CONTENT, OWNER_LIMITS } from '../src/lib/ownerListingEdits';
import { applyOwnerEdit, failOwnerEdit } from '../scripts/claims/apply-owner-edits';
import { acknowledgeOwnerPublication } from '../scripts/claims/ack-owner-publication';
import type { DiscoveryEntity } from '../src/types/discovery';
const all=JSON.parse(readFileSync(new URL('../src/generated/discovery-index.json',import.meta.url),'utf8')).entities as DiscoveryEntity[];
const root=all.find(e=>e.id==='biz-downstage')!;
const event=all.find(e=>e.kind==='event'&&e.organizerEntityId===root.id)!;
function memory() {
  const data=new Map<string,any>();let failCommit=false;
  const ref=(path:string):any=>({path,id:path.split('/').at(-1)});
  const snap=(r:any)=>({id:r.id,ref:r,exists:data.has(r.path),data:()=>structuredClone(data.get(r.path))});
  const collection=(name:string,filters:any[]=[],cap=1000):any=>({doc:(id:string)=>ref(name+'/'+id),where:(key:string,op:string,val:unknown)=>collection(name,[...filters,[key,val]],cap),limit:(n:number)=>collection(name,filters,n),get:async()=>{const docs=[...data.keys()].filter(k=>k.startsWith(name+'/')&&filters.every(([key,val])=>data.get(k)[key]===val)).slice(0,cap).map(k=>snap(ref(k)));return{docs,size:docs.length};}});
  return {data,collection,failNext(){failCommit=true;},runTransaction:async(fn:(tx:any)=>Promise<any>)=>{
    const writes:(()=>void)[]=[];
    const result=await fn({get:async(r:any)=>snap(r),set:(r:any,v:any)=>writes.push(()=>data.set(r.path,structuredClone(v))),update:(r:any,v:any)=>writes.push(()=>data.set(r.path,{...data.get(r.path),...structuredClone(v)})),delete:(r:any)=>writes.push(()=>data.delete(r.path))});
    if(failCommit){failCommit=false;throw Object.assign(Error('Quota exceeded'),{code:8});}
    writes.forEach(w=>w());return result;
  }};
}
function queued(db:ReturnType<typeof memory>,changes:Record<string,unknown>={description:'Updated by the organization'},target=root) {
  db.data.set(`listing_claims/u_${root.id}`,{uid:'u',entityId:root.id,status:'approved'});
  db.data.set(`${OWNER_EDITS}/save`,{uid:'u',rootId:root.id,entityId:target.id,entityTitle:target.title,changes,status:'queued',createdAt:10,notificationPending:false});
  db.data.set(`${OWNER_LIMITS}/${root.id}`,{uid:'u',editId:'save',lastSubmittedAt:10});
}
test('only canonical root and explicit linked events are editable, never venue/name matches',()=>{
  assert.ok(ownerEditTargets(root.id,all).some(e=>e.id===event.id));
  assert.deepEqual(ownerEditTargets(root.id,[root,{...event,id:'unrelated',organizerEntityId:undefined} as DiscoveryEntity]).map(e=>e.id),[root.id]);
});
test('image, ownership, source, URL identity and verification edits are rejected',()=>{
  for(const field of ['image','images','id','slug','organizerEntityId','status','ownerVerifiedAt','sources','claimed','partner'])assert.throws(()=>ownerEditPatch(root,{[field]:'injected'}));
  for(const kind of ['business','event','market'])assert.ok(!ownerEditableFields(kind).includes('images'));
});
test('dates, HTTPS links, numeric and structured fields are validated before publication',()=>{
  assert.throws(()=>ownerEditPatch(event,{start:'2026-10-23T19:00:00'}));
  assert.throws(()=>ownerEditPatch(event,{end:'2000-01-01T00:00:00Z'}));
  assert.throws(()=>ownerEditPatch(root,{website:'javascript:alert(1)'}));
  assert.throws(()=>ownerEditPatch(root,{coordinates:{lat:NaN,lng:0}}));
  assert.equal(ownerEditPatch(root,{title:'New name'}).name,'New name');
});
test('automatic application notifies admin atomically and requires no review',async()=>{
  const db=memory();queued(db);
  assert.equal(await applyOwnerEdit(db,'save',all,100),true);
  const edit=db.data.get(`${OWNER_EDITS}/save`);
  assert.equal(edit.status,'applied');assert.equal(edit.notificationPending,true);assert.equal(edit.publicationPending,true);
  assert.equal(db.data.get(`${OWNER_CONTENT}/${root.id}`).changes.description,'Updated by the organization');
  assert.equal(await applyOwnerEdit(db,'save',all,200),false);
});
test('quota failure leaves queued edit, content and allowance unchanged',async()=>{
  const db=memory();queued(db);const before=structuredClone([...db.data]);db.failNext();
  await assert.rejects(applyOwnerEdit(db,'save',all),/Quota/);assert.deepEqual([...db.data],before);
});
test('revoked/pending claim and unrelated target cannot publish',async()=>{
  for(const status of ['pending','rejected']) {const db=memory();queued(db);db.data.get(`listing_claims/u_${root.id}`).status=status;await assert.rejects(applyOwnerEdit(db,'save',all),/approved/);assert.equal(db.data.has(`${OWNER_CONTENT}/${root.id}`),false);}
  const db=memory();queued(db,{}, {...event,id:'unrelated',organizerEntityId:undefined} as DiscoveryEntity);await assert.rejects(applyOwnerEdit(db,'save',all),/not owned/);
});
test('linked event uses its parent allowance and cannot alter image metadata',async()=>{
  const db=memory();queued(db,{summary:'A new event summary'},event);await applyOwnerEdit(db,'save',all,100);
  const record=db.data.get(`${OWNER_CONTENT}/${event.id}`),updated=applyOwnerContent(all,[record]).find(e=>e.id===event.id)!;
  assert.equal(updated.summary,'A new event summary');assert.deepEqual(updated.image,event.image);assert.equal(updated.slug,event.slug);
  assert.equal(updated.ownerContentAppliedAt,100);
});
test('owner overrides persist through later feed exports without replacing other fields',()=>{
  const record={rootId:root.id,entityId:root.id,changes:{phone:'403-555-0100'},appliedAt:100};
  const updated=applyOwnerContent([{...root,summary:'Fresh feed summary'} as DiscoveryEntity],[record])[0] as any;
  assert.equal(updated.phone,'403-555-0100');assert.equal(updated.summary,'Fresh feed summary');assert.deepEqual(updated.image,root.image);
});
test('failed validation releases only its own allowance and never a newer save',async()=>{
  for(const newer of [false,true]) {const db=memory();queued(db);if(newer)db.data.get(`${OWNER_LIMITS}/${root.id}`).editId='newer';await failOwnerEdit(db,'save','Bad fields');assert.equal(db.data.get(`${OWNER_EDITS}/save`).status,'failed');assert.equal(db.data.has(`${OWNER_LIMITS}/${root.id}`),newer);}
});
test('successful Hosting release acknowledges only the content version actually built',async()=>{
  const db=memory();queued(db);await applyOwnerEdit(db,'save',all,100);
  assert.equal(await acknowledgeOwnerPublication(db,all,200),0);
  assert.equal(await acknowledgeOwnerPublication(db,applyOwnerContent(all,[db.data.get(`${OWNER_CONTENT}/${root.id}`)]),200),1);
  assert.equal(db.data.get(`${OWNER_EDITS}/save`).publishedAt,200);
  assert.equal(db.data.get(`${OWNER_EDITS}/save`).nextPublicationAttemptAt,Number.MAX_SAFE_INTEGER);
});
test('weekly allowance is shared per business for seven complete days',()=>{
  assert.equal(nextOwnerEditAt(1000),1000+OWNER_EDIT_INTERVAL);assert.equal(nextOwnerEditAt(0),0);
  const rules=readFileSync(new URL('../firestore.rules',import.meta.url),'utf8');
  assert.match(rules,/resource.data.lastSubmittedAt \+ duration.value\(7, 'd'\) <= request.time/);
  assert.match(rules,/getAfter\(\/databases\/\$\(database\)\/documents\/owner_listing_edits/);
  assert.match(rules,/match \/owner_listing_content\/\{entityId\} \{\s+allow read: if true;\s+allow write: if false;/);
});

test('direct event representatives cannot bypass the shared parent-business weekly allowance',async()=>{
  const db=memory();queued(db);await applyOwnerEdit(db,'save',all,100);
  const {OWNER_BUSINESS_LIMITS}=await import('../src/lib/ownerListingEdits');
  assert.equal(db.data.get(`${OWNER_BUSINESS_LIMITS}/${root.id}`).lastSubmittedAt,10);
  db.data.set(`listing_claims/other_${event.id}`,{uid:'other',entityId:event.id,status:'approved'});
  db.data.set(`${OWNER_EDITS}/other-save`,{uid:'other',rootId:event.id,entityId:event.id,changes:{summary:'Other representative'},createdAt:20,status:'queued'});
  db.data.set(`${OWNER_LIMITS}/${event.id}`,{uid:'other',editId:'other-save'});
  await assert.rejects(applyOwnerEdit(db,'other-save',all,200),/weekly update/);
  assert.equal(db.data.has(`${OWNER_CONTENT}/${event.id}`),false);
});
test('a direct event claimant can publish after seven days without a second profile claim',async()=>{
  const db=memory();queued(db);await applyOwnerEdit(db,'save',all,100);
  db.data.set(`listing_claims/other_${event.id}`,{uid:'other',entityId:event.id,status:'approved'});
  db.data.set(`${OWNER_EDITS}/other-save`,{uid:'other',rootId:event.id,entityId:event.id,changes:{summary:'Updated event'},createdAt:10+OWNER_EDIT_INTERVAL,status:'queued'});
  db.data.set(`${OWNER_LIMITS}/${event.id}`,{uid:'other',editId:'other-save'});
  assert.equal(await applyOwnerEdit(db,'other-save',all,200),true);
  assert.equal(db.data.get(`${OWNER_CONTENT}/${event.id}`).rootId,root.id);
});
test('Calgary date controls follow repository timezone rules and reject missing transition times',async()=>{
  const {ownerLocalDate,ownerInstant}=await import('../src/lib/ownerListingEdits');
  assert.equal(ownerInstant('2026-10-23T19:00'),'2026-10-24T01:00:00.000Z');
  assert.equal(ownerInstant('2026-12-23T19:00'),'2026-12-24T01:00:00.000Z');
  assert.equal(ownerLocalDate('2026-10-24T01:00:00Z'),'2026-10-23T19:00');
  assert.throws(()=>ownerInstant('2026-03-08T02:30'),/does not exist/);
});
test('market schedules preserve owned occurrence IDs and reject cross-market IDs',async()=>{
  const {applyOwnerOccurrences}=await import('../src/lib/ownerListingEdits');
  const market=all.find(e=>e.kind==='market')!;
  const dates=[{id:'owned-date',marketId:market.id,start:'2026-10-23T16:00:00Z',end:'2026-10-23T20:00:00Z',cancelled:false,timezone:'America/Edmonton' as const,source:{name:'Official',kind:'official' as const,url:'https://example.org'}}];
  const changes={occurrences:[{id:'owned-date',start:'2026-10-24T16:00:00Z',end:'2026-10-24T20:00:00Z',cancelled:false}]};
  ownerEditPatch(market,changes);
  const updated=applyOwnerOccurrences(dates,[{entityId:market.id,changes}],true);
  assert.equal(updated[0].id,'owned-date');assert.equal(updated[0].start,'2026-10-24T16:00:00Z');
  assert.throws(()=>applyOwnerOccurrences(dates,[{entityId:market.id,changes:{occurrences:[{...changes.occurrences[0],id:'other-market-date'}]}}],true),/another listing/);
  assert.equal(applyOwnerOccurrences([],[{entityId:market.id,changes}])[0].id,'owned-date','trusted published schedules survive feed-window rolls');
});

test('unconfirmed publication retries back off instead of repeatedly rebuilding every quarter-hour',async()=>{
  const {ownerPublicationRetryDelay}=await import('../src/lib/ownerListingEdits');
  assert.equal(ownerPublicationRetryDelay(1),15*60000);
  assert.equal(ownerPublicationRetryDelay(2),30*60000);
  assert.equal(ownerPublicationRetryDelay(100),12*3600000);
});
