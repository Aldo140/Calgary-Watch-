import { trackSubscription } from './readEfficiency';
import { useEffect, useSyncExternalStore } from 'react';
import { collection, limit, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { setOrganizationContent } from '../data/discovery';
import { ORGANIZATION_LIVE, type OrganizationProjection } from './organizationWorkspace';
import inventory from '../generated/discovery-index.json';
let version=0,ready=!db,error='',users=0,stop:(()=>void)|undefined;
let latestRows:OrganizationProjection[]=[];
export function organizationLiveRows(id:string){return latestRows.filter(row=>row.organizationId===id);}
const listeners=new Set<()=>void>();
const emit=()=>{version++;listeners.forEach(fn=>fn());};
const subscribe=(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};};
const snapshot=()=>version;
/** One bounded public subscription shared by every mounted discovery consumer. */
export function useOrganizationLive(){
  useSyncExternalStore(subscribe,snapshot,()=>0);
  useEffect(()=>{
    users++;
    const start=()=>{
      if(stop||!db||document.hidden)return;
      stop=trackSubscription('discovery:organization_live',()=>onSnapshot(query(collection(db!,ORGANIZATION_LIVE),where('updatedAt','>',Date.parse(inventory.generatedAt)||0),limit(500)),s=>{
        latestRows=s.docs.map(d=>d.data() as OrganizationProjection);setOrganizationContent(latestRows);ready=true;error=s.size===500?'Live updates reached the display limit. Reload after the next site release.':'';emit();
      },()=>{ready=true;error='Live organization updates are temporarily unavailable. Displaying the last published information.';emit();}));
    };
    const visibility=()=>{if(document.hidden){stop?.();stop=undefined;}else start();};
    start();document.addEventListener('visibilitychange',visibility);
    return()=>{document.removeEventListener('visibilitychange',visibility);if(--users===0){stop?.();stop=undefined;}};
  },[]);
  return {ready,error,version};
}
