import type {DiscoveryEntity,Event} from '../../src/types/discovery';
const SOURCES=new Set(['atp-partner-season-2026-27','werklund-partner-season-2026-27','calgary-folk-festival-partner']);
const name=(s:string)=>s.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/^(classic albums live|alberta theatre projects)\s*[:—-]\s*/,'').replace(/[^a-z0-9]/g,'');
/** Reconcile user-supported updates after cached/live/Firestore inputs, preserving canonical IDs and artwork. */
export function mergePartnerUpdates(entities:readonly DiscoveryEntity[],confirmed?:readonly Event[]):DiscoveryEntity[]{
 const updates=confirmed??entities.filter((e):e is Event=>e.kind==='event'&&SOURCES.has(e.sourceId??''));
 const rest=entities.filter(e=>!updates.includes(e as Event));
 for(const incoming of updates){
  const match=rest.findIndex(e=>e.kind==='event'&&name(e.organizer)===name(incoming.organizer)&&name(e.title)===name(incoming.title)&&(e.id===incoming.id||e.start.slice(0,10)===incoming.start.slice(0,10)||incoming.sourceId==='calgary-folk-festival-partner'&&e.start.slice(0,4)===incoming.start.slice(0,4)));
  if(match<0){rest.push(incoming);continue;}
  const base=rest[match] as Event;
  if(base.status!=='published')continue;
  const folk=incoming.sourceId==='calgary-folk-festival-partner';
  const precise=base.schedulePrecision!=='date'&&!/T00:00:00/.test(base.start);
  const sources=[...base.sources];for(const s of incoming.sources)if(!sources.some(x=>x.url===s.url&&x.kind===s.kind))sources.push(s);
  const merged:Event={...incoming,...base,sources,...(!precise||folk?{start:incoming.start,end:incoming.end,schedulePrecision:'date' as const}:{}),...(folk?{summary:incoming.summary,description:incoming.description,ticketSaleStatus:'not-on-sale' as const}:{}),updatedAt:incoming.updatedAt};
  if(folk){delete merged.priceRange;for(const key of ['lineup','performer','performers','artists'])(merged as unknown as Record<string,unknown>)[key]&&delete (merged as unknown as Record<string,unknown>)[key];}
  rest[match]=merged;
 }
 return rest;
}
