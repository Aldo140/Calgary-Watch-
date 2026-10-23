import {calgaryDateTimeFormat} from './calgaryTz';
export type ObservedSignIn={uid:string;at:number};
export type EngagementSend={uid:string;at:number;week:string;series:string};
export type SendCorrelation={key:string;week:string;series:string;firstSentAt:number;lastSentAt:number;recipients:number;before:number;after:number;afterPercent:number;changePoints:number;windowClosed:boolean;predatesObservation:boolean};
const DAY=86400000;
export function retainObservedSignIns(previous:readonly ObservedSignIn[],latest:readonly ObservedSignIn[],now:number){
 const unique=new Map<string,ObservedSignIn>();
 for(const event of [...previous,...latest])if(typeof event.uid==='string'&&event.uid&&Number.isFinite(event.at)&&event.at>=now-90*DAY&&event.at<=now)unique.set(`${event.uid}:${event.at}`,{uid:event.uid,at:event.at});
 return [...unique.values()].sort((a,b)=>a.at-b.at);
}
/** Count accounts, not sessions, using each recipient's own send time. Never treat snapshots as a complete login audit. */
export function correlateDigestSignIns(sends:readonly EngagementSend[],events:readonly ObservedSignIn[],now:number,observedSince:number):SendCorrelation[]{
 const byUid=new Map<string,number[]>();for(const e of events)if(e.at<=now)byUid.set(e.uid,[...(byUid.get(e.uid)??[]),e.at]);
 const groups=new Map<string,EngagementSend[]>();for(const s of sends){if(!Number.isFinite(s.at)||s.at>now||!s.uid)continue;const key=`${s.series}:${s.week}`;groups.set(key,[...(groups.get(key)??[]),s]);}
 return [...groups].map(([key,rows])=>{
  // Retries must not inflate the denominator. Use the earliest accepted send for an account in this cohort.
  const recipients=new Map<string,EngagementSend>();for(const s of rows)if(!recipients.has(s.uid)||recipients.get(s.uid)!.at>s.at)recipients.set(s.uid,s);
  let before=0,after=0;for(const s of recipients.values()){const times=byUid.get(s.uid)??[];if(times.some(t=>t>=s.at-DAY&&t<s.at))before++;if(times.some(t=>t>=s.at&&t<s.at+DAY))after++;}
  const firstSentAt=Math.min(...rows.map(s=>s.at)),lastSentAt=Math.max(...rows.map(s=>s.at)),n=recipients.size;
  return {key,week:rows[0].week,series:rows[0].series,firstSentAt,lastSentAt,recipients:n,before,after,afterPercent:Math.round(100*after/n),changePoints:Math.round(100*(after-before)/n),windowClosed:lastSentAt+DAY<=now,predatesObservation:firstSentAt-DAY<observedSince};
 }).sort((a,b)=>b.lastSentAt-a.lastSentAt);
}
/** Calgary calendar days, with zero days retained so a quiet day cannot disappear from the chart. */
export function dailyObservedSignIns(events:readonly ObservedSignIn[],now:number,days=28){
 const fmt=calgaryDateTimeFormat('en-CA',{year:'numeric',month:'2-digit',day:'2-digit'}),key=(at:number)=>fmt.format(at);
 const buckets=new Map<string,Set<string>>();for(let i=days-1;i>=0;i--)buckets.set(key(now-i*DAY),new Set());
 for(const e of events)if(e.at<=now)buckets.get(key(e.at))?.add(e.uid);
 return [...buckets].map(([date,uids])=>({date,accounts:uids.size}));
}

/** Only accepted production sends enter the comparison; proof and welcome traffic must not masquerade as weekly digests. */
export function acceptedEngagementSend(id:string,row:Record<string,unknown>,ledger:'monday'|'thursday'):EngagementSend|null{
 if(row.status!=='sent'||typeof row.uid!=='string'||!row.uid||typeof row.sentAt!=='number'||!Number.isFinite(row.sentAt)||row.test===true||row.testRecipient||row.dryRun===true||/_test_|_proof_/.test(id))return null;
 const series=ledger==='thursday'?(row.first===true?'Thursday welcome':row.first===false?'Thursday event picks':'Thursday email (type not recorded)'):row.kind==='combined'?'Monday combined':row.kind==='welcome'?'Monday welcome':row.kind==='digest'?'Monday weekly digest':'Monday email (type not recorded)';
 return {uid:row.uid,at:row.sentAt,week:typeof row.weekKey==='string'&&row.weekKey?row.weekKey:new Date(row.sentAt).toISOString().slice(0,10),series};
}
