import assert from 'node:assert/strict';
import { describe,it } from 'node:test';
import { readFileSync } from 'node:fs';
import domain from '../functions/discovery-domain.cjs';
import store from '../functions/discovery-store.cjs';
import { matchesTonight, calgaryInstant, filterInventory } from '../src/lib/discoveryCalendar';
import { createDiscoveryRepository } from '../src/lib/discovery';
import { buildEntityJsonLd, buildSitemap } from '../src/lib/discoverySeo';
import { getSeoConfig, buildPageJsonLd } from '../src/lib/seo';
import type { DiscoveryEntity, EventSubmissionInput, MarketSubmissionInput } from '../src/types/discovery';

const source={id:'organizer',name:'Official organizer',approved:true,hosts:['example.org'],kind:'official'};
const event:EventSubmissionInput={kind:'event',title:'River Arts',summary:'Art workshop',description:'A workshop by the river.',address:'1 River Street, Calgary',organizer:'Arts group',sourceUrl:'https://example.org/event',categories:['arts','indoor'],tags:[],start:'2026-09-26T18:00:00-06:00',end:'2026-09-26T20:00:00-06:00',pricing:'free'};
const market:MarketSubmissionInput={...event,kind:'market',amenities:[],occurrences:[{sourceRecordId:'saturday-1',start:event.start,end:event.end,cancelled:false}]} as unknown as MarketSubmissionInput;
delete (market as unknown as Record<string,unknown>).start;delete (market as unknown as Record<string,unknown>).end;delete (market as unknown as Record<string,unknown>).pricing;
const now=new Date();
function published() {return {...domain.normalizeRecord(event,source,'e',now.toISOString()).entity,status:'published',verification:'source-checked',verifiedAt:now.toISOString()} as DiscoveryEntity;}

describe('Strict submission and source boundaries',()=>{
  for(const field of ['status','verification','scores','partner','editorialSelection','verifiedAt','developmentOnly','id']) it(`rejects client-controlled ${field}`,()=>assert.throws(()=>domain.validateSubmission({...event,[field]:true})));
  it('requires an approved host, offset dates and safe provenance',()=>{
    assert.throws(()=>domain.normalizeRecord(event,{...source,approved:false},'e'));
    assert.throws(()=>domain.normalizeRecord({...event,sourceUrl:'https://evil.example/'},source,'e'));
    assert.throws(()=>domain.validateSubmission({...event,start:'2026-09-26T18:00:00'}));
    assert.throws(()=>domain.validateSubmission({...event,end:event.start}));
    assert.throws(()=>domain.validateSubmission({...event,sourceUrl:'javascript:alert(1)'}));
  });
  it('produces pending unverified records and preserves IDs across changed dates',()=>{
    const a=domain.normalizeRecord(event,source,'stable-id');const b=domain.normalizeRecord({...event,start:'2026-09-26T19:00:00-06:00'},source,'stable-id');
    assert.equal(a.entity.id,b.entity.id);assert.equal(a.entity.status,'pending');assert.equal(a.entity.verification,'unverified');assert.equal(a.entity.sources[0].url,event.sourceUrl);
  });
  it('keeps repeated dates as occurrences of one market',()=>{
    const a=domain.normalizeRecord(market,source,'market');const b=domain.normalizeRecord({...market,occurrences:[{...market.occurrences[0],start:'2026-09-26T19:00:00-06:00',cancelled:true}]},source,'market');
    assert.equal(a.occurrences[0].id,b.occurrences[0].id);assert.equal(b.occurrences[0].cancelled,true);assert.equal(b.occurrences[0].marketId,a.entity.id);
  });
  it('warns about cross-provider duplicates without merging unrelated dates',()=>{
    const a=domain.normalizeRecord(event,source,'1').entity;const b=domain.normalizeRecord(event,{...source,id:'other'},'2').entity;
    assert.deepEqual(domain.duplicateCandidates(a,[b]),[b.id]);
    assert.deepEqual(domain.duplicateCandidates({...a,start:'2026-10-26T18:00:00-06:00'},[b]),[]);
  });
});

describe('Publication and SEO',()=>{
  it('uses the same approved repository for entity metadata and JSON-LD',()=>{
    const e=published();const repository=createDiscoveryRepository([e]);const path=`/events/${e.slug}`;
    assert.equal(getSeoConfig(path,repository).title,`${e.title} | CalgaryWatch`);
    assert.equal(getSeoConfig(path,repository).index,false); // launch gate remains closed
    assert.equal((buildPageJsonLd(path,'https://calgarywatch.ca',repository) as any).mainEntity.name,e.title);
    assert.equal(getSeoConfig('/events/not-published',repository).index,false);
  });
  it('excludes stale, unreviewed, archived and fixture inventory',()=>{
    const valid=published();
    const entities=[valid,{...valid,id:'pending',status:'pending'},{...valid,id:'old',verifiedAt:'2020-01-01T00:00:00Z'},{...valid,id:'fixture',developmentOnly:true},{...valid,id:'archived',status:'archived'}];
    assert.equal(domain.publishSnapshot(entities,[],now).entities.length,1);
    assert.equal(createDiscoveryRepository(entities as DiscoveryEntity[]).list().length,1);
    assert.equal(buildSitemap([],entities as DiscoveryEntity[],'https://calgarywatch.ca').match(/<url>/g)?.length,1);
  });
  it('retains cancellation metadata but removes cancellations from discovery filters',()=>{
    const e={...published(),cancelled:true} as DiscoveryEntity;
    assert.equal((buildEntityJsonLd(e,'https://calgarywatch.ca') as Record<string,unknown>).eventStatus,'https://schema.org/EventCancelled');
    assert.equal(filterInventory([e],[],undefined,undefined,new Date('2026-09-21T00:00:00Z')).length,0);
  });
  it('generates market Place and dated Event data',()=>{
    const m=domain.normalizeRecord(market,source,'m');const json=buildEntityJsonLd(m.entity as DiscoveryEntity,'https://calgarywatch.ca',m.occurrences) as Record<string,any>;
    assert.equal(json['@type'],'Place');assert.equal(json.event[0].startDate,event.start);
  });
  it('refuses conflicting published URLs and excludes orphan occurrences',()=>{
    const e=published();assert.throws(()=>domain.publishSnapshot([e,{...e,id:'other'}],[],now));
    assert.equal(domain.publishSnapshot([e],[{marketId:'missing',start:event.start,end:event.end}],now).occurrences.length,0);
  });
  it('exports public fields only, including for occurrence records',()=>{
    const e=published();const snapshot=domain.publishSnapshot([{...e,privateNotes:'private',verifiedBy:'admin-uid',duplicateIds:['other']}],[],now);
    assert.ok(!JSON.stringify(snapshot).includes('private'));assert.ok(!JSON.stringify(snapshot).includes('admin-uid'));
  });
  it('protects submissions and raw inventory with callable-only writes',()=>{
    const rules=readFileSync('firestore.rules','utf8');
    assert.match(rules,/match \/entity_submissions\/\{id\}[^}]*allow write: if false/s);
    assert.match(rules,/'discovery_source_records', 'discovery_audit'\] && isAdmin\(\)/);
    const callable=readFileSync('functions/discovery.cjs','utf8');
    assert.match(callable,/validateSubmission\(request.data\)/);assert.match(callable,/await assertAdmin\(db,request.auth\)/);
  });
});

describe('Calgary time windows',()=>{
  const clock=new Date('2026-09-26T12:00:00-06:00');
  it('does not call noon–8 pm Tonight',()=>assert.equal(matchesTonight('2026-09-26T12:00:00-06:00','2026-09-26T20:00:00-06:00',clock),false));
  it('includes an evening start, midnight end and substantial overlap',()=>{
    assert.ok(matchesTonight(event.start,'2026-09-27T00:00:00-06:00',clock));
    assert.ok(matchesTonight('2026-09-26T16:00:00-06:00','2026-09-26T20:00:00-06:00',clock));
    assert.equal(matchesTonight('2026-09-27T00:00:00-06:00','2026-09-27T02:00:00-06:00',clock),false);
  });
  it('uses the correct DST offset and local midnight',()=>{
    assert.equal(new Date(calgaryInstant('2026-03-08',17)).toISOString(),'2026-03-08T23:00:00.000Z');
    assert.equal(new Date(calgaryInstant('2026-11-01',17)).toISOString(),'2026-11-02T00:00:00.000Z');
    assert.ok(matchesTonight(event.start,event.end,new Date('2026-09-27T01:00:00Z')));
  });
  it('filters free and topic events independently',()=>{
    const e=published();assert.equal(filterInventory([e],[],undefined,'free',clock).length,1);assert.equal(filterInventory([e],[],undefined,'music',clock).length,0);
  });
});

// Transaction-level contract: writes are buffered and committed only on success.
function memoryStore() {
  const data=new Map<string,any>();let seq=0;
  const ref=(path:string):any=>({path,id:path.split('/').at(-1),get:async()=>snap(path)});
  const snap=(path:string)=>({exists:data.has(path),data:()=>data.get(path),ref:ref(path),id:path.split('/').at(-1)});
  const col=(name:string):any=>({name,doc:(id=String(++seq))=>ref(`${name}/${id}`),where:(field:string,_op:string,value:unknown)=>({name,field,value})});
  return {data,collection:col,runTransaction:async(fn:(tx:any)=>Promise<any>)=>{const writes:(()=>void)[]=[];const result=await fn({get:async(q:any)=>q.path?snap(q.path):{docs:[...data.keys()].filter(k=>k.startsWith(q.name+'/')&&(!q.field||data.get(k)[q.field]===q.value)).map(snap)},set:(r:any,v:any)=>writes.push(()=>data.set(r.path,v)),update:(r:any,v:any)=>writes.push(()=>data.set(r.path,{...data.get(r.path),...v}))});writes.forEach(f=>f());return result;}};
}
describe('Persistence lifecycle',()=>{
  it('repeated imports are idempotent; changes require another review',async()=>{
    const db=memoryStore();const a=await store.ingestRecord(db,event,source,'e');
    await store.moderate(db,{kind:'event',id:a.id,revision:a.revision,action:'publish'},'admin');
    await store.ingestRecord(db,event,source,'e');assert.equal(db.data.get(`events/${a.id}`).status,'published');
    const b=await store.ingestRecord(db,{...event,start:'2026-09-26T19:00:00-06:00'},source,'e');
    assert.equal(a.id,b.id);assert.equal(db.data.get(`events/${a.id}`).status,'pending');
    await assert.rejects(()=>store.moderate(db,{kind:'event',id:a.id,revision:1,action:'publish'},'admin'));
  });
  it('cancellation cannot bypass review, and omitted market dates become cancelled',async()=>{
    const db=memoryStore();const a=await store.ingestRecord(db,event,source,'e');await store.moderate(db,{kind:'event',id:a.id,revision:a.revision,action:'cancel'},'admin');
    assert.equal(db.data.get(`events/${a.id}`).status,'pending');assert.equal(db.data.get(`events/${a.id}`).verification,'unverified');
    const m=await store.ingestRecord(db,market,source,'m');
    await store.ingestRecord(db,{...market,occurrences:[{...market.occurrences[0],sourceRecordId:'saturday-2'}]},source,'m');
    const dates=[...db.data.entries()].filter(([k])=>k.startsWith('market_occurrences/')).map(([,v])=>v);
    assert.equal(dates.length,2);assert.equal(dates.filter(d=>d.cancelled).length,1);assert.ok(dates.every(d=>d.marketId===m.id));
  });
});
