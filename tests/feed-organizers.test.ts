import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {associateOrganizers, organizerEvents, organizerProfile} from '../src/lib/organizations';
import {feedOrganizerProfiles, FEED_PROFILE_MIN} from '../src/lib/feedOrganizers';
import type {Business, DiscoveryEntity, Event} from '../src/types/discovery';
const index=JSON.parse(readFileSync('src/generated/discovery-index.json','utf8'));
const all=index.entities as DiscoveryEntity[];
const now=Date.parse(index.generatedAt);
const base=all.find(e=>e.kind==='event'&&e.organizer==='Mount Royal University') as Event;
const show=(id:string,o:Partial<Event>={})=>({...base,id,organizerEntityId:undefined,start:'2026-11-20T19:00:00-07:00',end:'2026-11-20T21:00:00-07:00',...o}) as Event;

test('busy calendars get a public organizer profile and every one of their events links to it',()=>{
 for(const [id,name] of [['biz-mount-royal-university','Mount Royal University'],['biz-university-of-calgary','University of Calgary']]){
  const profile=all.find(e=>e.id===id) as Business;
  assert.ok(profile,id);assert.equal(profile.title,name);assert.equal(profile.claimed,false);assert.equal(profile.ownerVerifiedAt,undefined);
  assert.ok(profile.sources.every(s=>s.kind==='official'));
  const events=all.filter((e):e is Event=>e.kind==='event'&&e.organizer===name);
  assert.ok(events.length>=FEED_PROFILE_MIN);
  for(const e of events){assert.equal(e.organizerEntityId,id,e.id);assert.equal(organizerProfile(e,all)?.id,id);}
  assert.ok(organizerEvents(id,all,now).length>=FEED_PROFILE_MIN);
 }
 const baroque=all.find(e=>e.slug==='the-calgary-philharmonic-orchestra-presents-baroque-at-bella-with-nicholas-mcgegan-93025b') as Event;
 assert.equal(baroque.organizerEntityId,'biz-mount-royal-university');
});

test('regenerating from the index adds nothing new and is stable',()=>{
 assert.deepEqual(feedOrganizerProfiles(all,now),[]);
 const without=all.filter(e=>!(e.kind==='business'&&e.tags.includes('feed-profile')));
 assert.deepEqual(feedOrganizerProfiles(without,now).map(p=>p.id),['biz-mount-royal-university','biz-university-of-calgary']);
});

test('one-off organizers, relists and existing profiles get no generated profile',()=>{
 const two=[show('a',{organizer:'Tiny Choir'}),show('b',{organizer:'Tiny Choir'})];
 assert.deepEqual(feedOrganizerProfiles(two,now),[]);
 const relist=[1,2,3].map(n=>show(`r${n}`,{organizer:'StoryBook Theatre',sources:[{name:'Tourism Calgary events calendar',url:'https://www.visitcalgary.com/x',kind:'editorial'}]}));
 assert.deepEqual(feedOrganizerProfiles(relist,now),[]);
 const past=[1,2,3].map(n=>show(`p${n}`,{organizer:'Old Hall',end:'2020-01-01T00:00:00-07:00'}));
 assert.deepEqual(feedOrganizerProfiles(past,now),[]);
 const placeholder=[1,2,3].map(n=>show(`x${n}`,{organizer:'Organizer not listed'}));
 assert.deepEqual(feedOrganizerProfiles(placeholder,now),[]);
 const werklund=all.find(e=>e.id==='biz-werklund-centre')!;
 assert.deepEqual(feedOrganizerProfiles([werklund,...[1,2,3].map(n=>show(`w${n}`,{organizer:'Werklund Centre'}))],now),[]);
});

test('a claimed profile survives a thin month, and a forged host never links',()=>{
 const one=[show('k1',{organizer:'Tiny Choir'})];
 assert.deepEqual(feedOrganizerProfiles(one,now,new Set(['biz-tiny-choir'])).map(p=>p.id),['biz-tiny-choir']);
 const events=[1,2,3].map(n=>show(`m${n}`));
 const [profile]=feedOrganizerProfiles(events,now);
 const forged=show('forged',{sources:[{name:'Somewhere',url:'https://example.com/e',kind:'official'}]});
 const linked=associateOrganizers([...events,profile,forged]) as Event[];
 assert.equal(linked.find(e=>e.id==='m1')!.organizerEntityId,profile.id);
 assert.equal(linked.find(e=>e.id==='forged')!.organizerEntityId,undefined);
});
