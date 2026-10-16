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
