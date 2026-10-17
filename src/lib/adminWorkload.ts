import {adminFirestoreActionError as firestoreActionError} from './firestoreErrors';
export type AdminQueueRow={status:string;createdAt?:number};
export type AdminWorkloadSources={suggestions:number;queue:AdminQueueRow[];claims:number;updates:number;service:number;ownerUpdates:number};
export const emptyAdminWorkloadSources=():AdminWorkloadSources=>({suggestions:0,queue:[],claims:0,updates:0,service:0,ownerUpdates:0});
/** A denied notification collection must not hide claims or other healthy queues. */
export async function readAdminWorkload(reads:{[K in keyof AdminWorkloadSources]:()=>Promise<AdminWorkloadSources[K]>},previous:AdminWorkloadSources){
 const keys=Object.keys(reads) as Array<keyof AdminWorkloadSources>;
 const results=await Promise.allSettled(keys.map(async key=>reads[key]()));
 const sources={...previous};const errors:string[]=[];
 const labels:Record<keyof AdminWorkloadSources,string>={suggestions:'Suggestions',queue:'Publishing queue',claims:'Claims',updates:'Legacy changes',service:'Market requests',ownerUpdates:'Business update notifications'};
 results.forEach((result,i)=>{
  const key=keys[i];
  if(result.status==='fulfilled')Object.assign(sources,{[key]:result.value});
  else errors.push(`${labels[key]} unavailable: ${firestoreActionError(result.reason)}`);
 });
 return {sources,error:errors.join(' ')};
}
