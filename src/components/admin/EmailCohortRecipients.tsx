import {useEffect,useMemo,useState} from 'react';
import {doc,getDoc} from 'firebase/firestore';
import {Link} from 'react-router-dom';
import {db} from '../../firebase';
import {calgaryDateTimeFormat} from '../../lib/calgaryTz';
import type {MemberAuthRecord} from '../../lib/memberAccountInsights';
import {AdminButton,T} from './ui';
type Recipient={uid:string;sentAt:number;emailAtSend?:string};
type Props={chunkIds?:string[];generation:string;cohortKey:string;count:number;accounts:MemberAuthRecord[]};
function RecipientList({chunkIds,generation,cohortKey,count,accounts}:Props){
 const [rows,setRows]=useState<Recipient[]|null>(null),[error,setError]=useState(''),[attempt,setAttempt]=useState(0),[search,setSearch]=useState(''),[shown,setShown]=useState(25);
 const accountByUid=useMemo(()=>new Map(accounts.map(a=>[a.uid,a])),[accounts]);
 useEffect(()=>{let active=true;setError('');setRows(null);void(async()=>{
  if(!db)throw Error('The database is not configured.');
  const database=db;
  if(!chunkIds?.length)throw Error('Recipient details are awaiting the next private snapshot.');
  if(chunkIds.some(id=>!/^member_email_recipients_[0-9]+_[0-9]+_[0-9]+$/.test(id)))throw Error('Invalid recipient snapshot reference. Refresh the activity page.');
  const chunks=await Promise.all(chunkIds.map(id=>getDoc(doc(database,'ops_health',id))));
  if(chunks.some(c=>!c.exists()||c.data()?.generation!==generation||c.data()?.cohortKey!==cohortKey))throw Error('Recipient snapshot changed or is incomplete. Refresh the activity page.');
  const records=chunks.flatMap(c=>c.data()?.recipients??[]) as Recipient[];
  if(records.length!==count||new Set(records.map(r=>r.uid)).size!==count)throw Error('Recipient count does not match the cohort. Refresh the activity page.');
  if(active)setRows(records);
 })().catch(e=>{if(active)setError(e instanceof Error?e.message:'Recipients could not load.');});return()=>{active=false;};},[chunkIds,generation,cohortKey,count,attempt]);
 const filtered=(rows??[]).filter(r=>{const a=accountByUid.get(r.uid);return `${a?.displayName??''} ${a?.email??''} ${r.emailAtSend??''} ${r.uid}`.toLowerCase().includes(search.toLowerCase());});
 const date=(at:number)=>calgaryDateTimeFormat('en-CA',{dateStyle:'medium',timeStyle:'short'}).format(at);
 return <div className="mt-3 space-y-3"><p className="text-xs" style={{color:T.muted}}>One account per cohort, matching the recipient total. Older sends did not store the delivery address; those rows show the current account email, which may have changed.</p>{error?<div role="alert" className="text-sm space-y-2"><p>{error}</p><AdminButton size="sm" onClick={()=>setAttempt(n=>n+1)}>Retry recipient list</AdminButton></div>:rows===null?<p className="text-sm">Loading recipients…</p>:<><label className="block text-xs font-semibold">Find a recipient<input className="block w-full rounded-lg border p-3 mt-1" placeholder="Name or email" value={search} onChange={e=>{setSearch(e.target.value);setShown(25);}}/></label><p className="text-xs">{filtered.length} matching recipient{filtered.length===1?'':'s'}</p><ul className="divide-y">{filtered.slice(0,shown).map(r=>{const a=accountByUid.get(r.uid);return <li key={r.uid} className="py-3 flex flex-col sm:flex-row gap-2 sm:items-center"><div className="min-w-0 flex-1"><p className="text-sm font-semibold break-words">{a?.displayName||a?.email||'Account no longer in current snapshot'}</p><p className="text-sm break-all">{r.emailAtSend||a?.email||'Email address unavailable'}</p><p className="text-xs" style={{color:T.muted}}>{r.emailAtSend?'Address recorded at send time':a?.email?'Current account email · send-time address not recorded':'Send-time address not recorded'} · Sent {date(r.sentAt)}</p>{!a?<p className="text-xs break-all">Account ID: {r.uid}</p>:null}</div>{a?<Link className="text-xs underline font-semibold shrink-0" to={`/plans?as=${encodeURIComponent(r.uid)}`}>View account dashboard</Link>:null}</li>;})}</ul>{filtered.length>shown?<AdminButton size="sm" variant="outline" onClick={()=>setShown(n=>n+25)}>Show more recipients</AdminButton>:null}</>}</div>;
}
export function EmailCohortRecipients(props:Props){const [open,setOpen]=useState(false);return <details onToggle={e=>setOpen(e.currentTarget.open)}><summary className="cursor-pointer text-sm font-semibold underline">View recipients ({props.count})</summary>{open?<RecipientList {...props}/>:null}</details>;}
