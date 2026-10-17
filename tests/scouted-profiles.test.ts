import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {associateOrganizers, organizerEvents, organizerMarkets} from '../src/lib/organizations';
import {nextOpen} from '../src/lib/marketDays';
import type {Business, DiscoveryEntity, Event, MarketOccurrence} from '../src/types/discovery';
const index=JSON.parse(readFileSync('src/generated/discovery-index.json','utf8'));
const all=index.entities as DiscoveryEntity[];
const report=JSON.parse(readFileSync('docs/research/2026-10-16-profile-expansion.json','utf8'));
const now=Date.parse(index.generatedAt);
test('eight source-supported profiles reuse existing listing identities without granting ownership',()=>{
 assert.equal(report.profiles.length,8);
 for(const row of report.profiles){
  const profiles=all.filter(e=>e.id===row.id) as Business[];
  assert.equal(profiles.length,1);const profile=profiles[0];
  assert.equal(profile.claimed,false);assert.equal(profile.partner,false);assert.equal(profile.ownerVerifiedAt,undefined);
  assert.ok(profile.sources.length);assert.ok(profile.sources.every(s=>s.kind==='official'));
  for(const id of row.stored_official_listing_ids){
   const listing=all.find(e=>e.id===id) as Event;
   assert.ok(listing,id);assert.equal(listing.organizerEntityId,profile.id,id);
  }
 }
});
test('two Farmers Market locations retain independent IDs, addresses and dated calendars',()=>{
 const markets=organizerMarkets('biz-calgary-farmers-market',all,now);
 assert.equal(markets.length,2);assert.equal(new Set(markets.map(m=>m.address)).size,2);
 for(const market of markets){
  const next=nextOpen(market,index.occurrences as MarketOccurrence[],new Date(now));
  assert.ok(next);assert.equal(next.marketId,market.id);assert.equal(next.cancelled,false);
 }
 assert.equal(organizerMarkets('biz-calgary-earth-market-society',all,now).length,1);
 assert.equal(organizerMarkets('biz-cspace-marda-loop',all,now).length,0);
});
test('an event merely hosted at a new profile venue does not acquire that organizer',()=>{
 const profile=all.find(e=>e.id==='biz-contemporary-calgary') as Business;
 const template=organizerEvents(profile.id,all,now)[0];assert.ok(template);
 const guest={...template,id:'guest-promoter',organizer:'Unrelated promoter',organizerEntityId:profile.id};
 const linked=associateOrganizers([profile,guest]).at(-1) as Event;
 assert.equal(linked.organizerEntityId,undefined);
 const editorial={...template,id:'editorial-only',sources:[{name:'Tourism Calgary',url:'https://www.visitcalgary.com/events/example',kind:'editorial' as const}]};
 assert.equal((associateOrganizers([profile,editorial]).at(-1) as Event).organizerEntityId,undefined);
});
test('unverified new prospects cannot be confused with publishable calendar records',()=>{
 const leads=JSON.parse(readFileSync('docs/research/2026-10-16-new-prospects.json','utf8')).leads;
 assert.equal(leads.length,16);
 for(const lead of leads){assert.equal(lead.publish,false);assert.equal(lead.source_url,null);assert.deepEqual(lead.confirmed_dates,[]);}
});
