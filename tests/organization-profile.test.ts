import assert from 'node:assert/strict';
import {test} from 'node:test';
import {organizationVisitAddress, publicOrganizationEvents} from '../src/lib/organizations';
import {organizationSchedule} from '../src/lib/organizationPresentation';
import type {Event} from '../src/types/discovery';
const now=Date.parse('2026-10-16T18:00:00Z');
const event={id:'run',kind:'event',title:'Autumn exhibition',venue:'Gallery',address:'701 11 Street SW',start:'2026-10-01T00:00:00-06:00',end:'2026-11-01T00:00:00-06:00',schedulePrecision:'date'} as Event;
test('public profiles distinguish actual visitor addresses from a city-only organization base',()=>{
 for(const address of ['', 'Calgary', 'Calgary, AB','Calgary, Alberta','Calgary, AB, Canada'])assert.equal(organizationVisitAddress(address),false,address);
 for(const address of ['Martha Cohen Theatre, Calgary, Alberta','701 11 Street SW, Calgary, AB'])assert.equal(organizationVisitAddress(address),true,address);
});
test('visitor event filters include ongoing runs, match venue/address and exclude expired or later events',()=>{
 const soon={...event,id:'soon',start:'2026-10-18T00:00:00-06:00',end:'2026-10-19T00:00:00-06:00'};
 const later={...event,id:'later',start:'2027-01-01T00:00:00-06:00',end:'2027-01-02T00:00:00-06:00'};
 const past={...event,id:'past',end:'2026-10-15T00:00:00-06:00'};
 assert.deepEqual(publicOrganizationEvents([event,soon,later,past],'',7,now).map(e=>e.id),['run','soon']);
 assert.equal(publicOrganizationEvents([event],'GALLERY',0,now).length,1);
 assert.equal(publicOrganizationEvents([event],'701',0,now).length,1);
 assert.equal(publicOrganizationEvents([event],'unrelated',0,now).length,0);
});
test('owner programme keeps date-only schedules free of invented midnight showtimes',()=>{
 const text=organizationSchedule(event);assert.match(text,/2026-10-01/);assert.match(text,/Check official showtimes/);assert.doesNotMatch(text,/12:00|00:00/);
 assert.match(organizationSchedule({...event,schedulePrecision:undefined,start:'2026-10-18T19:30:00-06:00'}),/7:30/);
});
