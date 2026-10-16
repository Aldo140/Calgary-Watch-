/** Run with Firebase emulators:exec; never connects to a production project. */
import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { initializeApp, deleteApp, type FirebaseApp } from 'firebase/app';
import { connectFirestoreEmulator, deleteDoc, doc, getDoc, getFirestore, serverTimestamp, setDoc, Timestamp, terminate, writeBatch } from 'firebase/firestore';
const host=process.env.FIRESTORE_EMULATOR_HOST;
if(!host||!/^127\.0\.0\.1:|^localhost:/.test(host))throw Error('Run inside the local Firestore emulator; remote projects are forbidden.');
const projectId='demo-calgary-owner-edits';
const base=`http://${host}/v1/projects/${projectId}/databases/(default)/documents`;
const apps:FirebaseApp[]=[];
let seq=0;
function client(uid:string,emailVerified=true) {
  const app=initializeApp({projectId,apiKey:'emulator-only'},`rules-${++seq}`);apps.push(app);
  const db=getFirestore(app);const [hostname,port]=host!.split(':');
  connectFirestoreEmulator(db,hostname,Number(port),{mockUserToken:{sub:uid,user_id:uid,email:`${uid}@example.org`,email_verified:emailVerified}});
  return db;
}
async function seed(path:string,data:Record<string,unknown>) {
  const fields=Object.fromEntries(Object.entries(data).map(([k,v])=>[k,v instanceof Date?{timestampValue:v.toISOString()}:typeof v==='boolean'?{booleanValue:v}:{stringValue:String(v)}]));
  const response=await fetch(`${base}/${path}`,{method:'PATCH',headers:{Authorization:'Bearer owner','Content-Type':'application/json'},body:JSON.stringify({fields})});
  assert.equal(response.ok,true,await response.text());
}
beforeEach(async()=>{
  const response=await fetch(`http://${host}/emulator/v1/projects/${projectId}/databases/(default)/documents`,{method:'DELETE'});assert.equal(response.ok,true);
  for(const uid of ['u1','u2'])await seed(`listing_claims/${uid}_biz-test`,{uid,entityId:'biz-test',status:'approved'});
});
after(async()=>{await Promise.all(apps.map(async app=>{await terminate(getFirestore(app));await deleteApp(app);}));});
function save(db:ReturnType<typeof getFirestore>,uid:string,id:string,changes:Record<string,unknown>={description:'New details'}) {
  const batch=writeBatch(db);
  batch.set(doc(db,'owner_listing_edits',id),{uid,rootId:'biz-test',entityId:'biz-test',entityTitle:'Test business',changes,status:'queued',createdAt:serverTimestamp(),notificationPending:false});
  batch.set(doc(db,'owner_listing_edit_limits','biz-test'),{uid,editId:id,lastSubmittedAt:serverTimestamp()});
  return batch.commit();
}
test('approved owner saves atomically and a second save within seven days is denied',async()=>{
  const db=client('u1');await save(db,'u1','first');
  await assert.rejects(save(db,'u1','second'),/permission/i);
  assert.equal((await getDoc(doc(db,'owner_listing_edits','second'))).exists(),false);
  assert.equal((await getDoc(doc(db,'owner_listing_edit_limits','biz-test'))).data()?.editId,'first');
});
test('multiple approved representatives share the business allowance concurrently',async()=>{
  const results=await Promise.allSettled([save(client('u1'),'u1','one'),save(client('u2'),'u2','two')]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
});
test('expired allowance permits a new save',async()=>{
  await seed('owner_listing_edit_limits/biz-test',{uid:'u1',editId:'old',lastSubmittedAt:new Date(Date.now()-8*86400000)});
  await save(client('u1'),'u1','new');
});
test('pending, rejected, unsigned and forged claimant writes are denied',async()=>{
  for(const status of ['pending','rejected']) {await seed('listing_claims/u1_biz-test',{uid:'u1',entityId:'biz-test',status});await assert.rejects(save(client('u1'),'u1',status),/permission/i);}
  await assert.rejects(save(client('u2',false),'u2','unverified'),/permission/i);
  await assert.rejects(save(client('u2'),'u1','forged'),/permission/i);
});
test('images, ownership changes and direct publication writes are denied',async()=>{
  const db=client('u1');
  for(const changes of [{images:[]},{image:{src:'https://example.org/x.png'}},{organizerEntityId:'other'},{ownerVerifiedAt:'forged'}])await assert.rejects(save(db,'u1',crypto.randomUUID(),changes),/permission/i);
  await assert.rejects(setDoc(doc(db,'owner_listing_content','biz-test'),{changes:{title:'Injected'}}),/permission/i);
});
test('allowance cannot be independently forged, backdated or deleted',async()=>{
  const db=client('u1');
  await assert.rejects(setDoc(doc(db,'owner_listing_edit_limits','biz-test'),{uid:'u1',editId:'missing',lastSubmittedAt:serverTimestamp()}),/permission/i);
  const batch=writeBatch(db);batch.set(doc(db,'owner_listing_edits','backdate'),{uid:'u1',rootId:'biz-test',entityId:'biz-test',entityTitle:'Test',changes:{title:'Changed'},status:'queued',createdAt:Timestamp.fromMillis(1),notificationPending:false});batch.set(doc(db,'owner_listing_edit_limits','biz-test'),{uid:'u1',editId:'backdate',lastSubmittedAt:Timestamp.fromMillis(1)});
  await assert.rejects(batch.commit(),/permission/i);
  await save(db,'u1','valid');await assert.rejects(deleteDoc(doc(db,'owner_listing_edit_limits','biz-test')),/permission/i);
});
test('queued edits and legacy manual requests cannot bypass the new atomic path',async()=>{
  const db=client('u1');
  await assert.rejects(setDoc(doc(db,'owner_listing_edits','alone'),{uid:'u1',rootId:'biz-test',entityId:'biz-test',entityTitle:'Test',changes:{description:'details'},status:'queued',createdAt:serverTimestamp(),notificationPending:false}),/permission/i);
  await assert.rejects(setDoc(doc(db,'listing_updates','legacy'),{uid:'u1',entityId:'biz-test',entityTitle:'Test',field:'description',details:'details',url:'',status:'pending',createdAt:Date.now()}),/permission/i);
});
