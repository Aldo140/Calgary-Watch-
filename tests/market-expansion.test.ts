import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {associateOrganizers} from '../src/lib/organizations';
import {buildEntityJsonLd} from '../src/lib/discoverySeo';
const index=JSON.parse(readFileSync('src/generated/discovery-index.json','utf8'));
const all=index.entities;
const manifest=JSON.parse(readFileSync('docs/research/2026-10-16-market-expansion.json','utf8'));
const linked=(id:string)=>all.filter((e:any)=>e.organizerEntityId===id);
const dates=(id:string)=>index.occurrences.filter((o:any)=>o.marketId===id);
test('all eight new organization profiles are unique and claimable without granting ownership',()=>{
 assert.equal(manifest.profiles.length,8);
 for(const p of manifest.profiles){const matches=all.filter((e:any)=>e.id===p.id);assert.equal(matches.length,1,p.id);assert.equal(matches[0].claimed,false);assert.equal(matches[0].partner,false);assert.equal(matches[0].ownerVerifiedAt,undefined);assert.ok(linked(p.id).length);}
 for(const id of manifest.existing_master_ids_preserved)assert.equal(all.filter((e:any)=>e.id===id).length,1);
 assert.equal(new Set(all.map((e:any)=>e.id)).size,all.length);
});
test('Vibrant City guest markets do not acquire Crossroads organization ownership',()=>{
 const guest=all.filter((e:any)=>e.organizer==='Vibrant City Events');assert.equal(guest.length,2);
 assert.equal(guest.reduce((sum:number,e:any)=>sum+dates(e.id).length,0),9);
 for(const e of guest){assert.match(e.venue,/Crossroads/);assert.equal(e.organizerEntityId,undefined);}
 assert.ok(linked('biz-crossroads-market').every((e:any)=>e.organizer==='Crossroads Market'));
 const forged=associateOrganizers([...all,...guest.map((e:any)=>({...e,id:'scope-'+e.id,organizerEntityId:'biz-crossroads-market'}))]);
 assert.ok(forged.filter((e:any)=>e.id.startsWith('scope-')).every((e:any)=>!e.organizerEntityId));
});
test('YMCA has four branch market records and five dates under one organization',()=>{
 const markets=linked('biz-ymca-calgary');assert.equal(markets.length,4);assert.equal(new Set(markets.map((m:any)=>m.address)).size,4);
 assert.equal(markets.reduce((sum:number,m:any)=>sum+dates(m.id).length,0),5);
 const rocky=markets.find((m:any)=>m.title.includes('Rocky Ridge'));assert.deepEqual(dates(rocky.id).map((o:any)=>o.start.slice(0,10)).sort(),['2026-12-05','2026-12-06']);
});
test('MAKERS has three Calgary retail locations, independent calendars and no CrossIron listing',()=>{
 const markets=linked('biz-makers');assert.equal(markets.length,3);
 for(const m of markets){assert.ok(dates(m.id).length);assert.match(m.description,/permanent|Permanent/);assert.match(m.description,/@shopmakers.ca/);}
 assert.ok(markets.every((m:any)=>!m.title.includes('CrossIron')));
});
test('Winter Market preserves its ID, corrects organizer/price and publishes only supplied hours',()=>{
 const winter=all.find((e:any)=>e.id==='ef9a9e8453e7dfa21099a0dab63c');assert.equal(winter.organizerEntityId,'biz-calgary-yuletide-festival-society');assert.match(winter.description,/\$8/);assert.doesNotMatch(winter.description,/\$10/);
 assert.equal(manifest.winter_operating_dates.length,26);assert.equal(dates(winter.id).length,21);
 assert.deepEqual(manifest.winter_dates_needing_hours,['2026-12-15','2026-12-16','2026-12-21','2026-12-22','2026-12-23']);
 const eve=dates(winter.id).find((o:any)=>o.start.startsWith('2026-12-24'));assert.match(eve.end,/T15:00:00-06:00$/);
 for(const day of manifest.winter_dates_needing_hours)assert.ok(!dates(winter.id).some((o:any)=>o.start.startsWith(day)));
});
test('Barn uses the explicit November 29 exception and Santa dates avoid invented times',()=>{
 const barn=linked('biz-the-barn-artisan-market')[0];assert.deepEqual(dates(barn.id).map((o:any)=>o.start.slice(0,10)),['2026-10-25','2026-11-29']);
 const santa=linked('biz-crossroads-market').filter((e:any)=>e.kind==='event');assert.equal(santa.length,3);assert.ok(santa.every((e:any)=>e.schedulePrecision==='date'&&e.pricing==='unknown'));
});
test('Little Modern distinguishes official date/venue from editorial hours evidence, and market organizations use business schema',()=>{
 const little=linked('biz-little-modern-market')[0];assert.ok(little.sources.some((s:any)=>s.kind==='official'&&s.url.includes('littlemodernmarket')));assert.ok(little.sources.some((s:any)=>s.kind==='editorial'&&s.url.includes('yyc.buzz')));
 const cross=all.find((e:any)=>e.id==='biz-crossroads-market');assert.equal((buildEntityJsonLd(cross,'https://calgarywatch.ca') as any)['@type'],'LocalBusiness');
});
