import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {associateOrganizers} from '../src/lib/organizations';
import {claimOrganization} from '../src/lib/claimOrganization';
import {validateEntity} from '../src/lib/discovery';
import type {DiscoveryEntity,Event} from '../src/types/discovery';
import domain from '../functions/discovery-domain.cjs';
const load=(p:string)=>JSON.parse(readFileSync(p,'utf8'));
const entities=load('src/generated/discovery-index.json').entities as DiscoveryEntity[];
const authored=load('src/content/editorial-inventory.json').entities as DiscoveryEntity[];
const batches=load('scripts/discovery/reviewed-sources.json');
for(const [slug,count] of [['herringer-kiss-gallery',2],['calgary-pro-musica',13]] as const){
 test(`${slug} has one permanent unclaimed profile and independently associated reviewed events`,()=>{
  const id='biz-'+slug, profiles=authored.filter(e=>e.id===id);assert.equal(profiles.length,1);const profile=profiles[0];assert.ok(profile.kind==='business');assert.equal(profile.slug,slug);assert.equal(profile.claimed,false);assert.equal(profile.partner,false);assert.equal(profile.image,undefined);assert.ok(validateEntity(profile));
  const batch=batches.find((b:any)=>b.source.id===slug);assert.equal(batch.records.length,count);
  const normalized=batch.records.map((r:any)=>({...domain.normalizeRecord(r.input,batch.source,r.id).entity,status:'published'}));
  const linked=associateOrganizers([...authored,...normalized]).filter(e=>e.kind==='event'&&e.organizerEntityId===id) as Event[];assert.equal(linked.length,count);
  for(const e of linked){assert.ok(validateEntity(e));assert.ok(Date.parse(e.end)>Date.parse('2026-10-23T00:00:00Z'));assert.equal(e.image,undefined);assert.ok(entities.some(s=>s.id===e.id&&s.kind==='event'&&s.organizerEntityId===id));}
  assert.equal(claimOrganization(profile,entities)?.claimEntity.id,id);
  assert.equal(new Set(linked.map(e=>[e.title,e.start].join('|'))).size,count);
 });
}
test('gallery runs retain inclusive closing dates without inventing admission or reception times',()=>{const events=entities.filter(e=>e.kind==='event'&&e.organizerEntityId==='biz-herringer-kiss-gallery') as Event[];assert.deepEqual(events.map(e=>e.end),['2026-11-22T00:00:00-06:00','2027-01-17T00:00:00-06:00']);for(const e of events){assert.equal(e.schedulePrecision,'date');assert.equal(e.pricing,'unknown');assert.equal(e.tickets,undefined);assert.match(e.sources[0].url,/upcoming-exhibitions$/);assert.match(e.description,/closed long weekends/);}});
test('Pro Musica preserves both performances, exact start times and official event-specific ticket links',()=>{const events=entities.filter(e=>e.kind==='event'&&e.organizerEntityId==='biz-calgary-pro-musica') as Event[];assert.equal(new Set(events.map(e=>e.tickets)).size,8);assert.ok(events.find(e=>e.title.startsWith('Dick Matthews'))?.tickets?.endsWith('a0SOJ0000088w5R2AQ'));for(const e of events){assert.match(e.tickets!,/^https:\/\/calgarypromusica.my.salesforce-sites.com\/ticket#\/events\/a0S/);assert.equal(e.venue,'Eckhardt-Gramatté Hall, Rozsa Centre, University of Calgary');assert.equal(e.endTimeEstimated,true);assert.equal(e.priceRange,undefined);assert.match(e.description,/not a confirmed running time/);}const family=events.filter(e=>e.title.includes('Jack and the Beanstalk'));assert.deepEqual(family.map(e=>e.start),['2027-04-11T13:00:00-06:00','2027-04-11T15:30:00-06:00']);assert.equal(events.filter(e=>e.start.includes('T19:30')).length,5);});
