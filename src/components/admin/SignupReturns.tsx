import {useMemo,useState} from 'react';
import {Link} from 'react-router-dom';
import {calgaryDateTimeFormat} from '../../lib/calgaryTz';
import {providerLabel,type MemberAuthRecord} from '../../lib/memberAccountInsights';
import {signupReturns,type ObservedSignIn} from '../../lib/memberEngagement';
import {Chip,Panel,StatGrid,StatTile,T,mono} from './ui';
const DAY=86400000;
const short=(at:number|null)=>at?calgaryDateTimeFormat('en-CA',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(at):'Not recorded';
const dayLabel=(date:string)=>new Date(`${date}T12:00:00Z`).toLocaleDateString('en-CA',{month:'short',day:'numeric',timeZone:'UTC'});
const pct=(n:number,of:number)=>of?Math.round(100*n/of):0;
/** Sign-ups and the people who came back afterwards, kept apart so a busy sign-up day never reads as loyal readers. */
export function SignupReturns({accounts,events,now,observedSince,allDays}:{accounts:MemberAuthRecord[];events:ObservedSignIn[]|null;now:number;observedSince:number|null;allDays?:{date:string;accounts:number}[]}){
 const r=useMemo(()=>signupReturns(accounts,events??[],now),[accounts,events,now]);
 const [showAll,setShowAll]=useState(false);
 const byUid=useMemo(()=>new Map(accounts.map(a=>[a.uid,a])),[accounts]);
 const month=r.accounts.filter(a=>a.createdAt>=now-28*DAY),week=r.accounts.filter(a=>a.createdAt>=now-7*DAY);
 const settled=month.filter(a=>a.createdAt<now-DAY),back=settled.filter(a=>a.cameBack).length;
 const returning=r.accounts.filter(a=>a.cameBack&&a.lastSeenAt!==null&&a.lastSeenAt>=now-7*DAY).length;
 const total=r.days.reduce((n,d)=>n+d.signups,0),totalBack=r.days.reduce((n,d)=>n+d.returning,0);
 const max=Math.max(1,...r.days.map(d=>d.signups+d.returning));
 const all=new Map((allDays??[]).map(d=>[d.date,d.accounts]));
 const recent=r.accounts.slice(0,showAll?60:12);
 return <>
 <StatGrid>
  <StatTile label="New sign-ups · 7 days" value={week.length} tone="signal" hint={`${month.length} in the last 28 days`}/>
  <StatTile label="Came back after signing up" value={settled.length?`${pct(back,settled.length)}%`:'—'} tone="ok" hint={`${back} of ${settled.length} sign-ups from the last 28 days (excl. last 24h)`}/>
  <StatTile label="Returning members · 7 days" value={returning} hint="Accounts back on a later day than they joined"/>
  <StatTile label="Total accounts" value={accounts.length} hint="In the latest Auth snapshot"/>
 </StatGrid>
 <Panel title="Sign-ups vs return sign-ins" subtitle="Per Calgary day, last 28 days. Blue: new accounts created. Green: existing accounts that signed in again.">
  <div className="space-y-3">
   <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{color:T.muted}}>
    <span className="inline-flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-sm" style={{background:T.signal}}/>Sign-ups <b style={{color:T.ink,fontFamily:mono}}>{total}</b></span>
    <span className="inline-flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-sm" style={{background:T.ok}}/>Return sign-ins <b style={{color:T.ink,fontFamily:mono}}>{events?totalBack:'…'}</b></span>
   </div>
   <div className="flex h-36 items-end gap-[3px]" role="img" aria-label="Daily sign-ups and return sign-ins; exact values are in the table below">
    {r.days.map(d=><div key={d.date} className="flex-1 min-w-0 h-full flex flex-col justify-end" title={`${d.date}: ${d.signups} sign-ups, ${d.returning} return sign-ins`}>
     {d.returning?<div style={{height:`${d.returning/max*100}%`,background:T.ok}} className="rounded-t-sm"/>:null}
     {d.signups?<div style={{height:`${d.signups/max*100}%`,background:T.signal}} className={d.returning?'':'rounded-t-sm'}/>:null}
     {!d.signups&&!d.returning?<div style={{height:2,background:T.line}}/>:null}
    </div>)}
   </div>
   <div className="flex justify-between text-[0.65rem]" style={{color:T.muted,fontFamily:mono}}><span>{dayLabel(r.days[0].date)}</span><span>{dayLabel(r.days[r.days.length-1].date)}</span></div>
   <details><summary className="cursor-pointer text-sm font-semibold">Daily counts</summary>
    <table className="mt-3 w-full text-xs" style={{fontFamily:mono}}><thead><tr style={{color:T.muted}} className="text-left"><th className="py-1 font-semibold">Day</th><th className="py-1 font-semibold text-right">Sign-ups</th><th className="py-1 font-semibold text-right">Returns</th><th className="py-1 font-semibold text-right" title="Every observed login that day, including the one at sign-up">All logins</th></tr></thead>
     <tbody>{[...r.days].reverse().map(d=><tr key={d.date} className="border-t" style={{borderColor:T.line}}><td className="py-1">{d.date}</td><td className="py-1 text-right">{d.signups}</td><td className="py-1 text-right">{d.returning}</td><td className="py-1 text-right" style={{color:T.muted}}>{all.get(d.date)??'—'}</td></tr>)}</tbody></table>
   </details>
   <p className="text-xs" style={{color:T.muted}}>Sign-ups come from each account’s creation time, so they are complete. A return sign-in is an observed login by an account created on an earlier day; the login that happens during sign-up is not counted as a return. “All logins” is the older single count, which mixed both. {observedSince?`Logins have been observed since ${short(observedSince)}; earlier days only keep each account’s latest login.`:''}</p>
  </div>
 </Panel>
 <Panel title="Did new members come back?" subtitle="Each week’s sign-ups, and how many were active again on a later day.">
  <div className="space-y-3">
   <table className="w-full text-sm"><thead><tr className="text-left text-xs" style={{color:T.muted}}><th className="py-1.5 font-semibold">Week of</th><th className="py-1.5 font-semibold text-right">Sign-ups</th><th className="py-1.5 font-semibold text-right">Back in 7 days</th><th className="py-1.5 font-semibold text-right">Back ever</th></tr></thead>
    <tbody>{[...r.weeks].reverse().map(w=><tr key={w.week} className="border-t" style={{borderColor:T.line}}>
     <td className="py-2">{dayLabel(w.week)}</td>
     <td className="py-2 text-right font-bold" style={{fontFamily:mono}}>{w.signups}</td>
     <td className="py-2 text-right" style={{fontFamily:mono}}>{w.signups?<>{w.within7} <span style={{color:T.muted}}>({pct(w.within7,w.signups)}%)</span>{w.windowOpen?<span className="block text-[0.65rem]" style={{color:T.attention}}>{w.windowOpen} still inside 7 days</span>:null}</>:'—'}</td>
     <td className="py-2 text-right" style={{fontFamily:mono}}>{w.signups?<>{w.cameBack} <span style={{color:T.muted}}>({pct(w.cameBack,w.signups)}%)</span></>:'—'}</td>
    </tr>)}</tbody></table>
   <p className="text-xs" style={{color:T.muted}}>“Back” means Firebase saw the account sign in or refresh its session on a later Calgary day than it was created. Readers who stay signed in still count, because opening the site refreshes their session. A visit while signed out is not visible here.</p>
  </div>
 </Panel>
 <Panel title="Newest members" subtitle="Who signed up most recently, and whether they have been back." padded={false}>
  <ul className="divide-y" style={{borderColor:T.line}}>{recent.map(a=>{const m=byUid.get(a.uid);const fresh=!a.cameBack&&a.createdAt>=now-DAY;return <li key={a.uid} className="px-4 py-3 flex items-start gap-3" style={{borderColor:T.line}}>
   <div className="flex-1 min-w-0"><p className="font-semibold break-words text-sm">{m?.displayName||m?.email||'Unnamed account'}</p>
    <p className="text-xs break-all" style={{color:T.muted}}>{m?.displayName&&m.email?`${m.email} · `:''}{m?.providers.map(providerLabel).join(' + ')||'Method not recorded'}</p>
    <p className="text-xs mt-1" style={{fontFamily:mono}}>Joined {short(a.createdAt)}{a.cameBack?` · last seen ${short(a.lastSeenAt)}`:''}</p></div>
   <div className="shrink-0 flex flex-col items-end gap-1.5"><Chip tone={a.cameBack?'ok':fresh?'neutral':'attention'}>{a.cameBack?'Came back':fresh?'Joined today':'Not back yet'}</Chip><Link className="underline text-xs font-semibold" to={`/plans?as=${encodeURIComponent(a.uid)}`}>Dashboard</Link></div>
  </li>;})}</ul>
  {r.accounts.length>12?<div className="p-3 border-t" style={{borderColor:T.line}}><button className="text-sm font-semibold underline" onClick={()=>setShowAll(v=>!v)}>{showAll?'Show fewer':`Show ${Math.min(60,r.accounts.length)-12} more`}</button></div>:null}
 </Panel>
 </>;
}
