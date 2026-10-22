import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {organizationClaimPath} from '../src/lib/claimOrganization';
import {importOrganizationProgramme} from '../src/lib/organizationProgrammeImport';
import {MAX_ORGANIZATION_CHANGES,prepareOrganizationBatch} from '../src/lib/organizationWorkspace';
import type {Business,DiscoveryEntity} from '../src/types/discovery';
const inventory=JSON.parse(readFileSync('src/generated/discovery-index.json','utf8')).entities as DiscoveryEntity[];
const org=inventory.find(e=>e.id==='biz-funnyfest') as Business;
let seq=0;const uuid=()=>`12345678-1234-4234-8234-${(++seq).toString(16).padStart(12,'0')}`;
const header='title,start,end,address,venue,description,pricing,tickets\n';
const row=(i:number)=>`Show ${i},2026-11-20T19:00,2026-11-20T21:00,2820 Centre Street North,Offside Pub,"A show, with comedy",paid,https://funnyfest.com/\n`;
test('Alliance Francaise requested details are complete and separate appointment-only campus access',()=>{
 const af=inventory.find(e=>e.id==='biz-alliance-francaise-calgary') as Business;assert.match(af.address,/#350, 1721 29 Avenue SW/);assert.equal(af.hours?.Monday,'09:00–18:00');assert.equal(af.hours?.Saturday,'09:00–17:00');assert.equal(af.socials.adult_events,'https://www.afcalgary.ca/culture/activities/adults/');assert.match(af.description,/no public walk-in reception/);
});
test('Mercantile keeps its canonical identity while correcting hours, presenter and linking its pottery edition',()=>{
 const holiday=inventory.find(e=>e.id==='6972906c904ecd4acb9407299e22') as any;assert.equal(holiday.slug,'mercantile-on-9th-697290');assert.equal(holiday.start,'2026-11-28T10:00:00-06:00');assert.equal(holiday.end,'2026-11-28T17:00:00-06:00');assert.match(holiday.organizer,/The Apothecary In Inglewood/);assert.equal(holiday.organizerEntityId,'biz-mercantile-on-9th');assert.match(holiday.description,/The Alice Sanctuary/);assert.equal(holiday.pricing,'unknown');
 const pottery=inventory.find(e=>e.kind==='event'&&e.title==='The Mercantile on 9th — Pottery Market') as any;assert.ok(pottery);assert.equal(pottery.start,'2026-12-05T10:00:00-06:00');assert.equal(pottery.end,'2026-12-05T17:00:00-06:00');assert.equal(organizationClaimPath(pottery,inventory),'/claim/biz-mercantile-on-9th?listing='+pottery.id);
});
test('100 events import into one reviewable draft with Calgary times and organizer identity protected',()=>{
 const ops=importOrganizationProgramme(header+Array.from({length:100},(_,i)=>row(i)).join(''),org,inventory,[],uuid);assert.equal(MAX_ORGANIZATION_CHANGES,100);assert.equal(ops.length,100);assert.equal(ops[0].changes.start,'2026-11-21T01:00:00.000Z');assert.equal(ops[0].changes.description,'A show, with comedy');assert.equal(ops[0].changes.organizer,undefined);const prepared=prepareOrganizationBatch(org,inventory,ops,Date.now());assert.ok(prepared.every(p=>(p.entity as any).organizerEntityId===org.id));
});
test('bad CSV, protected fields, duplicate events and over-limit imports leave the existing draft untouched',()=>{
 const draft:any[]=[];for(const csv of[header+row(1)+row(1),header+Array.from({length:101},(_,i)=>row(i)).join(''),'title,start,end,address,image\nA,2026-11-20T19:00,2026-11-20T21:00,Calgary,https://example.org/a.jpg','title,start,end,address\n"unclosed',header+'A,2026-03-08T02:30,2026-03-08T04:00,Calgary,,,,\n'])assert.throws(()=>importOrganizationProgramme(csv,org,inventory,draft,uuid));assert.deepEqual(draft,[]);
});
test('CSV quoted multiline descriptions and escaped quotes survive, and existing programme duplicates are refused',()=>{
 const csv='title,start,end,address,description\n"A "+""quoted"" show",2026-11-20T19:00,2026-11-20T21:00,Calgary,"First line\nSecond line"\n'.replace('"A "+','"A ');
 const ops=importOrganizationProgramme(csv,org,inventory,[],uuid);assert.equal(ops[0].changes.title,'A "quoted" show');assert.equal(ops[0].changes.description,'First line\nSecond line');assert.throws(()=>importOrganizationProgramme(csv,org,inventory,ops,uuid),/already exist/);
});

test('FunnyFest official ticket aliases associate with its profile without granting access from unrelated sources',async()=>{
 const{associateOrganizers}=await import('../src/lib/organizations');const base:any={id:'synthetic-show',kind:'event',organizer:'FunnyFest',sources:[{kind:'official',url:'https://funnyfest-comedy-halloween-show-calgary-yyc.eventbrite.ca'}]};assert.equal((associateOrganizers([org,base])[1] as any).organizerEntityId,org.id);assert.equal((associateOrganizers([org,{...base,sources:[{kind:'official',url:'https://example.org'}]}])[1] as any).organizerEntityId,undefined);
});
