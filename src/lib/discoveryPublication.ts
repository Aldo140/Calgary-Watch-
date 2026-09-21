import type { DiscoveryEntity } from '../types/discovery';
export function freshInventory(entity: DiscoveryEntity, now=new Date()): boolean {
  if(entity.kind!=='event' && entity.kind!=='market') return true;
  const age=now.getTime()-Date.parse(entity.verifiedAt || '');
  return Number.isFinite(age) && age>=-300000 && age<=14*86400000;
}
export function publishedInventory(entity: DiscoveryEntity, now=new Date()): boolean {
  return entity.status==='published' && entity.verification==='source-checked' && !entity.developmentOnly && freshInventory(entity,now) && entity.sources.length>0 && entity.sources.every(s=>s.kind==='official'||s.kind==='editorial');
}

// Enable only together with reviewed Hosting header changes and a verified export.
export const discoveryIndexingEnabled = false;
