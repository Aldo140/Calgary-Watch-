import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {associateOrganizers} from '../src/lib/organizations';
import {validateEntity} from '../src/lib/discovery';
const authored=JSON.parse(readFileSync('src/content/editorial-inventory.json','utf8')).entities;
const index=JSON.parse(readFileSync('src/generated/discovery-index.json','utf8')).entities;
test('CUFF profile foregrounds upcoming documentaries and uses officially confirmed April 2027 dates',()=>{
 const profiles=authored.filter((e:any)=>e.id==='biz-calgary-underground-film-festival');assert.equal(profiles.length,1);
 const p=profiles[0];assert.match(p.summary,/CUFF.Docs/);assert.match(p.summary,/November 18–22, 2026/);assert.match(p.description,/April 15–25, 2027/);assert.doesNotMatch(p.description,/November 15–25, 2027/);
});
test('CUFF.Docs is a single date-only festival, associated with its permanent organization on export',()=>{
 const events=index.filter((e:any)=>e.organizerEntityId==='biz-calgary-underground-film-festival'&&e.kind==='event');assert.equal(events.length,1);
 const e=events[0];assert.ok(validateEntity(e));assert.equal(e.start,'2026-11-18T00:00:00-06:00');assert.equal(e.end,'2026-11-23T00:00:00-06:00');assert.equal(e.schedulePrecision,'date');assert.equal(e.venue,'Globe Cinema');assert.equal(e.image,undefined);assert.match(e.tickets,/calgaryundergroundfilm.org\/cuff-docs\/pass-sale/);
 assert.equal(associateOrganizers([authored.find((e:any)=>e.id==='biz-calgary-underground-film-festival'),e])[1].organizerEntityId,'biz-calgary-underground-film-festival');
});
