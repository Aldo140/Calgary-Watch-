import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { mergeOrganizationRows, organizationListingState } from '../src/lib/organizationPresentation';
import type { DiscoveryEntity } from '../src/types/discovery';
import type { OrganizationProjection } from '../src/lib/organizationWorkspace';
const inventory=JSON.parse(readFileSync('src/generated/discovery-index.json','utf8')).entities as DiscoveryEntity[];
const event=inventory.find(e=>e.kind==='event')!;
test('a slow initial response cannot resurrect an event removed by a newer live update',()=>{
 const newer:OrganizationProjection={entityId:event.id,organizationId:'biz-test',entity:event,updatedAt:200,deleted:true,batchId:'new'};
 const stale={...newer,updatedAt:100,deleted:false,batchId:'old'};
 assert.deepEqual(mergeOrganizationRows([newer],[stale]),[newer]);
 assert.deepEqual(mergeOrganizationRows([stale],[newer]),[newer]);
});
test('programme filters distinguish past, cancelled, removed and market listings',()=>{
 const now=Date.parse('2026-10-16T12:00:00Z');
 assert.equal(organizationListingState({...event,kind:'event',cancelled:false,end:'2026-11-01T20:00:00Z'} as DiscoveryEntity,new Set(),now),'upcoming');
 assert.equal(organizationListingState({...event,kind:'event',cancelled:false,end:'2026-01-01T20:00:00Z'} as DiscoveryEntity,new Set(),now),'past');
 assert.equal(organizationListingState({...event,kind:'event',cancelled:true} as DiscoveryEntity,new Set(),now),'cancelled');
 assert.equal(organizationListingState(event,new Set([event.id]),now),'removed');
 assert.equal(organizationListingState(inventory.find(e=>e.kind==='market')!,new Set(),now),'market');
});

test('unchanged live revisions retain the same collection and avoid rebuilding forms',()=>{
 const row:OrganizationProjection={entityId:event.id,organizationId:'biz-test',entity:event,updatedAt:200,deleted:false,batchId:'same'};
 const rows=[row];assert.equal(mergeOrganizationRows(rows,[{...row}]),rows);assert.equal(mergeOrganizationRows(rows,[{...row,updatedAt:100}]),rows);
});
test('programme search returns chronological events before markets without changing source order',async()=>{
 const {filterOrganizationProgramme}=await import('../src/lib/organizationPresentation');
 const market=inventory.find(e=>e.kind==='market')!;
 const a={...event,title:'First test listing',kind:'event',start:'2026-11-01T18:00:00Z',end:'2026-11-01T20:00:00Z',cancelled:false} as DiscoveryEntity;
 const b={...a,id:'later',title:'Later test listing',start:'2026-11-02T18:00:00Z',end:'2026-11-02T20:00:00Z'} as DiscoveryEntity;
 const original=[market,b,a];const result=filterOrganizationProgramme(original,new Set(),'all','',0);
 assert.deepEqual(result.map(e=>e.id),[a.id,b.id,market.id]);assert.equal(original[0],market);
 assert.deepEqual(filterOrganizationProgramme(original,new Set(),'all','  FIRST TEST ',0).map(e=>e.id),[a.id]);
});
