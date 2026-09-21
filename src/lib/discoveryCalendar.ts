import type { DiscoveryEntity, MarketOccurrence } from '../types/discovery';
import { calgaryDate, matchesPeriod } from './discovery';
/** Convert a wall clock time using the zone's actual offset (including DST). */
export function calgaryInstant(day: string, hour: number): number {
  const wall = Date.parse(`${day}T00:00:00Z`) + hour * 3600000;
  let instant = wall;
  for (let i = 0; i < 3; i++) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone:'America/Edmonton', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit', hourCycle:'h23' }).formatToParts(instant).map(p=>[p.type,p.value]));
    const localAsUtc = Date.parse(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`);
    instant += wall-localAsUtc;
  }
  return instant;
}
/** Tonight: starts 17:00–midnight, or at least half its duration overlaps that
 * window for at least an hour. A noon–20:00 event therefore is not Tonight. */
export function matchesTonight(start: string, end: string, now = new Date()): boolean {
  const a=Date.parse(start), b=Date.parse(end), day=calgaryDate(now);
  const from=calgaryInstant(day,17), to=calgaryInstant(day,24);
  if (!Number.isFinite(a+b) || b<=a || b<=now.getTime()) return false;
  const overlap=Math.max(0,Math.min(b,to)-Math.max(a,from));
  return (a>=from && a<to) || (overlap>=3600000 && overlap/(b-a)>=0.5);
}
export function upcomingOccurrences(occurrences: readonly MarketOccurrence[], marketId: string, now=new Date()) {
  return occurrences.filter(o=>o.marketId===marketId && Date.parse(o.end)>now.getTime()).sort((a,b)=>Date.parse(a.start)-Date.parse(b.start));
}
export function filterInventory(entities: readonly DiscoveryEntity[], occurrences: readonly MarketOccurrence[], period?: string, filter?: string, now=new Date()) {
  return entities.filter(e=> {
    if(e.kind==='event') {
      if(e.cancelled || Date.parse(e.end)<=now.getTime()) return false;
      if(period && !(period==='tonight' ? matchesTonight(e.start,e.end,now) : matchesPeriod(e.start,e.end,period,now))) return false;
      if(filter==='free') return e.pricing==='free';
    } else if(e.kind==='market') {
      if(!upcomingOccurrences(occurrences,e.id,now).some(o=>!o.cancelled && (!period || matchesPeriod(o.start,o.end,period,now)))) return false;
    }
    return !filter || [...e.categories,...e.tags].some(c=>c.toLowerCase().replace(/s$/,'')===filter.replace(/s$/,''));
  });
}
