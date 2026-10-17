import assert from 'node:assert/strict';
import {test} from 'node:test';
import {emptyAdminWorkloadSources,readAdminWorkload} from '../src/lib/adminWorkload';
const healthy=()=>({suggestions:async()=>3,queue:async()=>[{status:'failed',createdAt:100}],claims:async()=>2,updates:async()=>1,service:async()=>4,ownerUpdates:async()=>5});
test('a denied notification collection preserves successful claim and publishing counts',async()=>{
 const reads=healthy();reads.ownerUpdates=async()=>{throw {code:'permission-denied'};};
 const {sources,error}=await readAdminWorkload(reads,emptyAdminWorkloadSources());
 assert.equal(sources.claims,2);assert.equal(sources.suggestions,3);assert.equal(sources.queue.length,1);assert.equal(sources.updates+sources.service,5);assert.match(error,/Business update notifications unavailable/);assert.match(error,/rules/);
});
test('failed counters retain their last good values and recovery clears the error',async()=>{
 const previous={...emptyAdminWorkloadSources(),ownerUpdates:8};const reads=healthy();reads.ownerUpdates=async()=>{throw Error('Offline');};
 const first=await readAdminWorkload(reads,previous);assert.equal(first.sources.ownerUpdates,8);
 const recovered=await readAdminWorkload(healthy(),first.sources);assert.equal(recovered.error,'');assert.equal(recovered.sources.ownerUpdates,5);
});
test('synchronous and asynchronous failures are both isolated and labelled',async()=>{
 const reads=healthy();reads.claims=()=>{throw Error('claim read failed');};reads.updates=async()=>{throw Error('legacy read failed');};
 const result=await readAdminWorkload(reads,emptyAdminWorkloadSources());assert.match(result.error,/Claims unavailable/);assert.match(result.error,/Legacy changes unavailable/);assert.equal(result.sources.ownerUpdates,5);
});
