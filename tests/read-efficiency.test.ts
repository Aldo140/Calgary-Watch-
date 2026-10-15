import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSharedLiveValue, createReadCache, trackSubscription, subscriptionDiagnostics } from '../src/lib/readEfficiency';
import { adminDataNeeds } from '../src/lib/adminDataNeeds';
import { firestoreActionError, isFirestoreQuotaError } from '../src/lib/firestoreErrors';
import { businessAccountPatch } from '../src/lib/businessAccount';

test('shared live consumers open one listener and stop after last unsubscribe', () => {
  let opened=0, stopped=0; let publish!: (v:number)=>void;
  const shared=createSharedLiveValue(0,p=>{ opened++; publish=p; return ()=>{stopped++;}; });
  let notifications=0; const a=shared.subscribe(()=>notifications++), b=shared.subscribe(()=>notifications++);
  assert.equal(opened,1); publish(3); assert.equal(shared.getSnapshot(),3); assert.equal(notifications,2);
  a(); a(); assert.equal(stopped,0); b(); assert.equal(stopped,1);
  const c=shared.subscribe(()=>{}); assert.equal(opened,2); c(); assert.equal(stopped,2);
});
test('read cache coalesces concurrent loads, expires, and retries failures', async()=>{
  let now=0, reads=0; const cache=createReadCache(()=>now); const load=async()=>++reads;
  assert.deepEqual(await Promise.all([cache.read('u',load,10),cache.read('u',load,10)]),[1,1]);
  assert.equal(await cache.read('u',load,10),1); now=10; assert.equal(await cache.read('u',load,10),2);
  await assert.rejects(cache.read('bad',async()=>{throw Error('fail');})); assert.equal(await cache.read('bad',load),3);
});
test('hidden admin workspaces do not request unrelated resources',()=>{
  for(const tab of ['partners','ops','content','demand']) assert.ok(Object.values(adminDataNeeds(tab)).every(v=>!v));
  assert.equal(adminDataNeeds('planner').subscribers,true); assert.equal(adminDataNeeds('visitors').visits,true);
  assert.equal(adminDataNeeds('partners').incidents,false);
});
test('development subscription counters clean up exactly once',()=>{
  const stop=trackSubscription('test-cleanup',()=>()=>{},true); assert.equal(subscriptionDiagnostics()['test-cleanup'].active,1);
  stop(); stop(); assert.equal(subscriptionDiagnostics()['test-cleanup'].active,0);
});
test('quota errors distinguish atomic failure from multi-step partial completion',()=>{
  for(const error of [{code:8},{code:'firestore/resource-exhausted'},{cause:{message:'Quota exceeded.'}}]) {
    assert.ok(isFirestoreQuotaError(error)); assert.match(firestoreActionError(error,true),/No changes were applied/);
    assert.match(firestoreActionError(error),/earlier steps/);
  }
});
test('business repairs preserve memberships and earliest business date',()=>{
  const patch=businessAccountPatch({accountType:'business',businessSince:200,businessListings:['old','new']},'new',100);
  assert.equal(patch.businessSince,100); assert.deepEqual(patch.businessListings,['old','new']);
});

test('transient provider retries are bounded and permanent errors return immediately',async()=>{
  const { providerFetch }=await import('../scripts/lib/providerFetch');
  let calls=0; const delays:number[]=[];
  const result=await providerFetch('https://example.org',{}, {fetch:async()=>new Response('',{status:++calls<3?429:200}),pause:async ms=>{delays.push(ms);}});
  assert.equal(result.status,200); assert.equal(calls,3); assert.deepEqual(delays,[500,1000]);
  calls=0;
  const denied=await providerFetch('https://example.org',{}, {fetch:async()=>{calls++;return new Response('',{status:401});}});
  assert.equal(denied.status,401); assert.equal(calls,1);
});
