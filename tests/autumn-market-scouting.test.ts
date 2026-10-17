import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {buildEntityJsonLd} from '../src/lib/discoverySeo';
const manifest=JSON.parse(readFileSync('docs/research/2026-10-16-autumn-scouting.json','utf8'));
const index=JSON.parse(readFileSync('src/generated/discovery-index.json','utf8'));
const entity=(id:string)=>index.entities.find((e:any)=>e.id===id);
test('scouted profiles are unique, unclaimed and linked to their published programme',()=>{
 assert.equal(manifest.profiles.length,10);
 for(const p of manifest.profiles){const e=entity(p.id);assert.ok(e,p.id);assert.equal(e.claimed,false);assert.equal(e.partner,false);assert.equal(e.ownerVerifiedAt,undefined);assert.equal(index.entities.filter((e:any)=>e.id===p.id).length,1);assert.ok(index.entities.some((e:any)=>e.organizerEntityId===p.id));}
 for(const listing of manifest.listings)assert.equal(entity(listing.id).organizerEntityId,listing.organization_id);
 assert.equal(manifest.profiles.filter((p:any)=>p.evidence_basis==='official website fetched live').length,9);
});
test('four new market calendars retain exact official dates and admission distinctions',()=>{
 const markets=manifest.listings.filter((l:any)=>l.kind==='market');assert.equal(markets.length,4);
 for(const m of markets){const dates=index.occurrences.filter((o:any)=>o.marketId===m.id);assert.deepEqual(dates.map((o:any)=>o.start.slice(0,10)).sort(),m.dates);assert.ok(dates.every((o:any)=>Date.parse(o.end)>Date.parse(o.start)));}
 const granary=markets.find((m:any)=>m.organization_id==='biz-granary-road');assert.equal(granary.dates.length,6);assert.match(entity(granary.id).description,/Admission is required/);assert.equal(entity(granary.id).petFriendly,false);
 const silver=markets.find((m:any)=>m.organization_id==='biz-silver-springs-community-association');assert.match(index.occurrences.find((o:any)=>o.marketId===silver.id).end,/T15:00:00/);
});
test('unknown market hours stay date-only and the Millarville closed gap is preserved',()=>{
 const runs=manifest.listings.filter((l:any)=>l.organization_id==='biz-millarville-racing-and-agricultural-society').map((l:any)=>entity(l.id));assert.equal(runs.length,2);
 assert.deepEqual(runs.map((e:any)=>[e.start.slice(0,10),e.end.slice(0,10)]),[['2026-11-05','2026-11-09'],['2026-11-12','2026-11-16']]);
 const fest=entity(manifest.listings.find((l:any)=>l.organization_id==='biz-signatures-shows').id);
 for(const e of [...runs,fest]){assert.equal(e.schedulePrecision,'date');assert.equal(e.priceRange,undefined);assert.match((buildEntityJsonLd(e,'https://calgarywatch.ca') as any).startDate,/^\d{4}-\d{2}-\d{2}$/);}
});
test('ambiguous schedules and last year’s markets do not become fabricated upcoming dates',()=>{
 const farm=manifest.listings.filter((l:any)=>l.organization_id==='biz-the-saskatoon-farm');assert.equal(farm.length,2);assert.ok(farm.every((l:any)=>!l.title.includes('Christmas')));
 const dia=entity(farm.find((l:any)=>l.title.includes('Muertos')).id);assert.match(dia.start,/T18:30:00/);assert.match(dia.description,/calendar lists 6–11 p.m./);
 const boo=entity(manifest.listings.find((l:any)=>l.organization_id==='biz-deerfoot-city').id);assert.match(boo.start,/T18:00:00/);assert.match(boo.end,/T20:00:00/);
 const triwood=manifest.listings.filter((l:any)=>l.organization_id==='biz-triwood-community-association');assert.equal(triwood.length,1);assert.match(triwood[0].title,/Skate/);
 assert.equal(index.entities.filter((e:any)=>e.organizerEntityId==='biz-screamfest').length,11);assert.equal(manifest.listings.filter((l:any)=>l.organization_id==='biz-screamfest').length,0);
});
test('published contacts distinguish the authentic Bowness fair and correct Deerfoot event team',()=>{
 assert.equal(entity('biz-bowness-community-association').email,'craftfair@mybowness.com');assert.equal(entity('biz-deerfoot-city').email,'gs@deerfootcity.ca');assert.equal(entity('biz-screamfest').email,undefined);
 for(const p of manifest.profiles.filter((p:any)=>p.id!=='biz-screamfest'))assert.match(entity(p.id).email,/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
});
