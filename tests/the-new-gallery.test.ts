import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import domain from '../functions/discovery-domain.cjs';
import {associateOrganizers} from '../src/lib/organizations';
import {organizationClaimPath} from '../src/lib/claimOrganization';
import {approvedOrganization,prepareOrganizationBatch} from '../src/lib/organizationWorkspace';
import {adminSubmissionInput} from '../src/lib/adminContentRecords';
import {entityPath,validateEntity} from '../src/lib/discovery';
import type {Business,DiscoveryEntity} from '../src/types/discovery';
const read=(p:string)=>JSON.parse(readFileSync(p,'utf8'));
const all=read('src/generated/discovery-index.json').entities as DiscoveryEntity[];
const authored=read('src/content/editorial-inventory.json').entities as DiscoveryEntity[];
const org=all.find(e=>e.id==='biz-the-new-gallery') as Business;
const batch=read('scripts/discovery/reviewed-sources.json').find((b:any)=>b.source.id==='the-new-gallery');
test('New Gallery has one published permanent profile without granting account ownership',()=>{
 assert.equal(all.filter(e=>e.id===org.id).length,1);assert.equal(authored.filter(e=>e.id===org.id).length,1);assert.ok(validateEntity(org));assert.equal(entityPath(org),'/local/the-new-gallery');assert.equal(organizationClaimPath(org,all),'/claim/biz-the-new-gallery');assert.equal(org.status,'published');assert.equal(org.claimed,false);assert.equal(org.ownerVerifiedAt,undefined);assert.equal(org.email,'info@thenewgallery.org');assert.equal(org.phone,'403-233-2399');assert.match(org.address,/208 Centre Street S/);assert.match(org.description,/closed to the public during August/);assert.equal(org.image,undefined);
});
test('exhibition and timed reception stay distinct and share the exact organization claim',()=>{
 const records=batch.records.map((r:any)=>domain.normalizeRecord(r.input,batch.source,r.id,org.updatedAt).entity);
 assert.equal(records.length,2);assert.notEqual(records[0].id,records[1].id);
 for(const r of records){const event=all.find(e=>e.id===r.id)!;assert.ok(validateEntity(event));assert.equal((event as any).organizerEntityId,org.id);assert.equal(organizationClaimPath(event,all),'/claim/'+org.id+'?listing='+event.id);}
 assert.equal(records[0].schedulePrecision,'date');assert.equal(records[0].end,'2026-12-13T00:00:00-06:00');assert.equal(records[1].start,'2026-10-23T18:30:00-06:00');assert.equal(records[1].end,'2026-10-23T21:00:00-06:00');assert.equal(records[1].schedulePrecision,undefined);
 assert.ok(!all.some(e=>e.kind==='event'&&(e as any).organizerEntityId===org.id&&/Lo Bak Go|Solving a Problem/.test(e.title)));
});
test('exact organization authority is required; pending claims and unrelated event edits fail',()=>{
 assert.equal(approvedOrganization({entityId:org.id,status:'pending'},all),undefined);assert.equal(approvedOrganization({entityId:org.id,status:'approved'},all)?.id,org.id);
 const unrelated=all.find(e=>e.kind==='event'&&(e as any).organizerEntityId!==org.id)!;
 assert.throws(()=>prepareOrganizationBatch(org,all,[{entityId:unrelated.id,action:'edit',changes:{title:'Forbidden'}}],Date.parse(org.updatedAt)));
 const event=all.find(e=>e.kind==='event'&&(e as any).organizerEntityId===org.id)!;
 assert.equal((associateOrganizers([org,event])[1] as any).organizerEntityId,org.id);
});
test('public submission ticket and venue details survive admin review and domain validation',()=>{
 const input={...batch.records[1].input,tickets:'https://www.thenewgallery.org/Events'};
 const normalized=adminSubmissionInput(input)!;assert.equal(normalized.venue,input.venue);assert.equal((normalized as any).tickets,input.tickets);assert.doesNotThrow(()=>domain.validateSubmission(normalized));
 assert.equal((adminSubmissionInput({...input,tickets:{invalid:true}}) as any).tickets,undefined);
});
