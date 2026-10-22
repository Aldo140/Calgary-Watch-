import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {filterInventory} from '../src/lib/discoveryCalendar';
import {organizationDirectory} from '../src/lib/organizationDirectory';
import type {DiscoveryEntity} from '../src/types/discovery';
const now = Date.parse('2026-10-22T12:00:00Z');
const base = {status:'published',verification:'source-checked',verifiedAt:'2026-10-22T10:00:00Z',sources:[{kind:'official',url:'https://example.com'}]};
test('directory counts exact relationships, excluding expired, cancelled and unpublished events', () => {
 const entities = [
 {...base,kind:'business',id:'org',title:'Organization',claimed:true},
 {...base,kind:'event',id:'upcoming',organizerEntityId:'org',start:'2026-10-23',end:'2026-10-24'},
 {...base,kind:'event',id:'ongoing',organizerEntityId:'org',start:'2026-10-21',end:'2026-10-24'},
 {...base,kind:'event',id:'past',organizerEntityId:'org',start:'2026-10-20',end:'2026-10-21'},
 {...base,kind:'event',id:'cancelled',organizerEntityId:'org',start:'2026-10-23',end:'2026-10-24',cancelled:true},
 {...base,kind:'event',id:'unrelated',organizer:'Organization',start:'2026-10-23',end:'2026-10-24'},
 {...base,kind:'market',id:'market',title:'Market',organizerEntityId:'org'},
 {...base,kind:'business',id:'draft',title:'Draft',status:'draft'},
 ] as DiscoveryEntity[];
 const rows=organizationDirectory(entities,now);
 assert.equal(rows.length,1);assert.equal(rows[0].profile.claimed,true);
 assert.deepEqual(rows[0].events.map(e=>e.id),['ongoing','upcoming']);assert.equal(rows[0].markets.length,1);
});
test('Morpheus productions retain canonical identity, exclusive end dates and official ticket links',()=>{
 const index=JSON.parse(readFileSync(new URL('../src/generated/discovery-index.json',import.meta.url),'utf8'));
 const entities=(index.entities ?? index) as DiscoveryEntity[];
 for(const [id,title,start,end] of [['c81ae85d0715e5de336e6cee4457',"The Game’s Afoot",'2027-01-29','2027-02-14'],['3d16c98b46fe4950485679f0b1ab','The Grand Duke','2027-04-30','2027-05-09']]){
 const matches=entities.filter(e=>e.id===id);assert.equal(matches.length,1);
 const e=matches[0];assert.equal(e.kind,'event');if(e.kind!=='event')throw Error('not event');
 assert.equal(e.organizerEntityId,'biz-morpheus-theatre');assert.equal(e.start.slice(0,10),start);assert.equal(e.end.slice(0,10),end);assert.equal(e.schedulePrecision,'date');assert.match(e.tickets!,/^https:\/\/www.morpheustheatre.ca\/\?page_id=7805#/);assert.equal(e.image,undefined);assert.equal(filterInventory([e],[], 'today',undefined,new Date(`${start}T18:00:00Z`)).length,1);assert.equal(filterInventory([e],[],undefined,undefined,new Date(`${end}T18:00:00Z`)).length,0);
 }
});
