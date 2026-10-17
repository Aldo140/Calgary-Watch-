import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {associateOrganizers,organizerEvents,organizerProfile} from '../src/lib/organizations';
import {entityPath} from '../src/lib/discovery';
import {claimFactsFor,claimLanguageProblems} from '../scripts/ops/lib/claimFacts';
import {profileIdentityProblems} from '../scripts/ops/lib/profileIdentity';
import {mergePartnerUpdates} from '../scripts/discovery/partnerUpdates';
import {icsFile,googleCalendarUrl} from '../src/lib/calendarFile';
import {buildEntityJsonLd} from '../src/lib/discoverySeo';
import type {Business,Event,DiscoveryEntity} from '../src/types/discovery';
const index=JSON.parse(readFileSync('src/generated/discovery-index.json','utf8'));const all=index.entities as DiscoveryEntity[];
const atp=all.find(e=>e.id==='biz-alberta-theatre-projects') as Business;
const werklund=all.find(e=>e.id==='biz-werklund-centre') as Business;
const now=Date.parse(index.generatedAt);
test('ATP has one canonical permanent claimable profile and five correctly linked productions',()=>{
 assert.equal(all.filter(e=>e.id===atp.id||e.kind==='business'&&e.title==='Alberta Theatre Projects').length,1);assert.equal(entityPath(atp),'/local/alberta-theatre-projects');
 const facts=claimFactsFor({entityId:atp.id,entityKind:'business',status:'new',businessName:atp.title},atp);
 assert.equal(facts.claimUrl,'https://calgarywatch.ca/claim/biz-alberta-theatre-projects');assert.equal(facts.claimable,true);assert.equal(atp.claimed,false);assert.equal(atp.ownerVerifiedAt,undefined);
 const events=organizerEvents(atp.id,all,now);assert.equal(events.length,5);
 assert.deepEqual(events.map(e=>e.title),['Evil Dead the Musical','The Hobbit','Fifteen Dogs','Burning Mom','Dream: A Canadian Musical']);
 for(const e of events){assert.equal(e.organizer,'Alberta Theatre Projects');assert.equal(e.venue,'Martha Cohen Theatre');assert.equal(organizerProfile(e,all)?.id,atp.id);assert.equal(e.schedulePrecision,'date');assert.equal(e.priceRange,undefined);}
 assert.equal(events[1].start.slice(0,10),'2026-12-01');assert.equal(events[1].end.slice(0,10),'2027-01-04');
 assert.equal(all.find(e=>e.id==='a7cd1dee0bc52c56bb40ebc84797')?.title,"Alberta Theatre Projects' 2026-27 Season: At The Edge of Being");
});
test('only the twelve explicit Werklund-presented events populate its profile',()=>{
 const events=organizerEvents(werklund.id,all,now);assert.equal(events.length,12);assert.equal(new Set(events.map(e=>e.id)).size,12);
 for(const e of events){assert.equal(e.organizer,'Werklund Centre');assert.equal(e.venue,'Jack Singer Concert Hall');assert.equal(organizerProfile(e,all)?.id,werklund.id);}
 assert.equal(events.find(e=>e.title==='An Evening with Fran Lebowitz')?.start.slice(0,10),'2027-02-05');
 assert.equal(events.find(e=>e.title==='Madonna: The Immaculate Collection')?.start.slice(0,10),'2026-10-23');
});
test('Werklund venue strings do not transfer ATP, Philharmonic, Theatre Calgary or Downstage ownership',()=>{
 const template=organizerEvents(werklund.id,all,now)[0];
 for(const organizer of ['Calgary Philharmonic Orchestra','Theatre Calgary','Alberta Theatre Projects','Downstage','Calgary Civic Symphony','One Yellow Rabbit','Live Nation','Outback Presents','New West Society','Tar Production']){
  const event={...template,id:'scope-test',organizer,organizerEntityId:werklund.id};const result=associateOrganizers([werklund,atp,event]).at(-1) as Event;
  assert.notEqual(result.organizerEntityId,werklund.id,organizer);if(organizer==='Alberta Theatre Projects')assert.equal(result.organizerEntityId,atp.id);
 }
 for(const title of ['Little Shop of Horrors','Dreaming Climate Consciousness'])for(const event of all.filter(e=>e.kind==='event'&&e.title===title))assert.notEqual((event as Event).organizerEntityId,werklund.id);
});
test('outreach fails closed for ATP recipients sent Theatre Calgary URLs, IDs or slugs',()=>{
 const wrong=all.find(e=>e.id==='biz-theatre-calgary') as Business;
 const correct={recipientOrganization:'Alberta Theatre Projects',entity:atp,profileUrl:'/local/alberta-theatre-projects',claimUrl:'/claim/biz-alberta-theatre-projects'};
 assert.deepEqual(profileIdentityProblems(correct),[]);
 assert.ok(profileIdentityProblems({...correct,profileUrl:'/local/theatre-calgary'}).length);
 assert.ok(profileIdentityProblems({...correct,entity:wrong,profileUrl:'/local/theatre-calgary'}).length);
 assert.ok(profileIdentityProblems({...correct,claimUrl:'/claim/biz-theatre-calgary'}).length);
 assert.ok(profileIdentityProblems({...correct,entity:{...atp,id:wrong.id}}).length);
 assert.ok(profileIdentityProblems({...correct,recipientOrganization:''}).length);
 const facts=claimFactsFor({entityId:atp.id,entityKind:'business',status:'new',businessName:atp.title},atp);
 assert.deepEqual(claimLanguageProblems('Your organization profile: https://calgarywatch.ca/local/alberta-theatre-projects',facts),[]);
 assert.ok(claimLanguageProblems('Your organization profile: https://calgarywatch.ca/local/theatre-calgary',facts).length);
 assert.equal(claimFactsFor({entityId:wrong.id,entityKind:'business',status:'new',businessName:atp.title},wrong).claimable,false);
 assert.equal(claimFactsFor({entityId:atp.id,entityKind:'business',status:'new'},atp).claimable,false);
});
test('Folk Festival stores the exact July 22–25 2027 dates without a lineup or open ticket sales',()=>{
 const matches=all.filter(e=>e.kind==='event'&&e.title==='Calgary Folk Music Festival 2027') as Event[];assert.equal(matches.length,1);const festival=matches[0];
 assert.equal(festival.start,'2027-07-22T00:00:00-06:00');assert.equal(festival.end,'2027-07-26T00:00:00-06:00');assert.equal(festival.ticketSaleStatus,'not-on-sale');assert.equal(festival.tickets,undefined);assert.equal(festival.priceRange,undefined);
 assert.match(festival.description,/lineup is still being built/);assert.match(festival.description,/Tickets are not currently on sale/);
 for(const key of ['lineup','performer','performers','artists'])assert.equal((festival as any)[key],undefined);
 assert.ok(all.some(e=>e.id==='8339540a14417ea7dd3492eb80d5'));assert.ok(all.some(e=>e.id==='c4230acf4f71890266e67f3c1228'));
 const schema=buildEntityJsonLd(festival,'https://calgarywatch.ca') as any;assert.equal(schema.startDate,'2027-07-22');assert.equal(schema.endDate,'2027-07-25');assert.equal(schema.offers,undefined);
 const calendar={...festival,dateOnly:true,url:'https://calgarywatch.ca'+entityPath(festival)};assert.match(icsFile(calendar),/DTSTART;VALUE=DATE:20270722/);assert.match(icsFile(calendar),/DTEND;VALUE=DATE:20270726/);assert.match(googleCalendarUrl(calendar),/dates=20270722%2F20270726/);
});
test('partner re-imports preserve canonical IDs, stronger text, times, artwork and official links',()=>{
 const incoming=organizerEvents(atp.id,all,now)[0];const base={...incoming,id:'existing-canonical',slug:'original-route',sourceId:'trusted-old-source',summary:'Richer reviewed summary',description:'Detailed official production notes',image:{src:'https://example.org/art.jpg',alt:'Production art'},start:'2026-10-13T19:30:00-06:00',end:'2026-10-13T22:00:00-06:00',schedulePrecision:undefined,tickets:'https://albertatheatreprojects.com/'};
 const result=mergePartnerUpdates([base,incoming,incoming]) as Event[];assert.equal(result.length,1);assert.equal(result[0].id,base.id);assert.equal(result[0].slug,base.slug);assert.deepEqual(result[0].image,base.image);assert.equal(result[0].description,base.description);assert.equal(result[0].start,base.start);assert.equal(result[0].schedulePrecision,undefined);
 const festival=all.find(e=>e.kind==='event'&&e.title==='Calgary Folk Music Festival 2027') as Event;const stale={...festival,id:'existing-festival',slug:'festival-original',sourceId:'old-source',description:'Previously announced lineup',tickets:'https://www.calgaryfolkfest.com/tickets',ticketSaleStatus:'on-sale' as const};
 const updated=mergePartnerUpdates([stale,festival])[0] as Event;assert.equal(updated.id,stale.id);assert.equal(updated.slug,stale.slug);assert.equal(updated.ticketSaleStatus,'not-on-sale');assert.equal(updated.tickets,stale.tickets);assert.match(updated.description,/lineup is still being built/);
});

test('fresh partner confirmations preserve stored identities even when old dates and sources are stale',()=>{
 const incoming=all.find(e=>e.kind==='event'&&e.title==='Calgary Folk Music Festival 2027') as Event;
 const stale={...incoming,id:'existing-festival-id',sourceId:'previous-review',start:'2027-07-20T00:00:00-06:00',end:'2027-07-24T00:00:00-06:00',image:{src:'https://example.org/official-art.jpg',alt:'Existing artwork'}};
 const updated=mergePartnerUpdates([stale],[incoming])[0] as Event;assert.equal(updated.id,stale.id);assert.equal(updated.start,incoming.start);assert.equal(updated.end,incoming.end);assert.deepEqual(updated.image,stale.image);
 const archived={...stale,status:'archived' as const};assert.equal(mergePartnerUpdates([archived],[incoming])[0].status,'archived');
});
