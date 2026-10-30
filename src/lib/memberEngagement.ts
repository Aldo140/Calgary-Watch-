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

/** Use the same earliest accepted send as the cohort denominator; preserve optional send-time address only when it was actually recorded. */
export function emailCohortRecipients<T extends EngagementSend>(sends:readonly T[],key:string,now:number):T[]{
 const byUid=new Map<string,T>();for(const send of sends)if(`${send.series}:${send.week}`===key&&Number.isFinite(send.at)&&send.at<=now&&send.uid&&(!byUid.has(send.uid)||byUid.get(send.uid)!.at>send.at))byUid.set(send.uid,send);
 return [...byUid.values()].sort((a,b)=>a.at-b.at||a.uid.localeCompare(b.uid));
}

export type SignupDay={date:string;signups:number;returning:number};
export type SignupWeek={week:string;signups:number;cameBack:number;within7:number;windowOpen:number};
export type SignupAccount={uid:string;createdAt:number;lastSeenAt:number|null;cameBack:boolean;returnSignIns:number};
type SignupSource={uid:string;createdAt:number|null;lastSignInAt:number|null;lastRefreshAt:number|null};
/**
 * Split new accounts from returning ones. A sign-up is an account's Firebase creation time, which is complete history.
 * A return is activity on a later Calgary day than the sign-up: observed sign-ins, plus Firebase's latest sign-in and
 * token refresh (a refresh means a signed-in reader opened the site again, so stay-signed-in readers still count).
 */
export function signupReturns(accounts:readonly SignupSource[],events:readonly ObservedSignIn[],now:number,days=28,weeks=8){
 const fmt=calgaryDateTimeFormat('en-CA',{year:'numeric',month:'2-digit',day:'2-digit'}),key=(at:number)=>fmt.format(at);
 const monday=(date:string)=>{const d=new Date(`${date}T12:00:00Z`);d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);return d.toISOString().slice(0,10);};
 const created=new Map<string,number>();for(const a of accounts)if(a.createdAt&&a.createdAt<=now)created.set(a.uid,a.createdAt);
 const byUid=new Map<string,number[]>();for(const e of events)if(e.at<=now)byUid.set(e.uid,[...(byUid.get(e.uid)??[]),e.at]);
 const daily=new Map<string,{signups:number;returning:Set<string>}>();for(let i=days-1;i>=0;i--)daily.set(key(now-i*DAY),{signups:0,returning:new Set()});
 for(const at of created.values()){const d=daily.get(key(at));if(d)d.signups++;}
 for(const e of events){if(e.at>now)continue;const c=created.get(e.uid),day=key(e.at);if(c===undefined||key(c)<day)daily.get(day)?.returning.add(e.uid);}
 const list:SignupAccount[]=[];
 for(const a of accounts){const c=created.get(a.uid);if(c===undefined)continue;
  const seen=[...(byUid.get(a.uid)??[]),a.lastSignInAt??0,a.lastRefreshAt??0].filter(t=>t>0&&t<=now),later=seen.filter(t=>key(t)>key(c));
  list.push({uid:a.uid,createdAt:c,lastSeenAt:seen.length?Math.max(...seen):null,cameBack:later.length>0,returnSignIns:new Set((byUid.get(a.uid)??[]).filter(t=>key(t)>key(c)).map(key)).size});}
 list.sort((a,b)=>b.createdAt-a.createdAt);
 const weekly=new Map<string,SignupWeek>();for(let i=weeks-1;i>=0;i--){const w=monday(key(now-i*7*DAY));weekly.set(w,{week:w,signups:0,cameBack:0,within7:0,windowOpen:0});}
 for(const a of list){const row=weekly.get(monday(key(a.createdAt)));if(!row)continue;row.signups++;if(a.cameBack)row.cameBack++;
  const seen=[...(byUid.get(a.uid)??[]),a.lastSeenAt??0].some(t=>key(t)>key(a.createdAt)&&t<=a.createdAt+7*DAY);if(seen)row.within7++;else if(a.createdAt+7*DAY>now)row.windowOpen++;}
 return {days:[...daily].map(([date,d])=>({date,signups:d.signups,returning:d.returning.size})) as SignupDay[],weeks:[...weekly.values()],accounts:list};
}
