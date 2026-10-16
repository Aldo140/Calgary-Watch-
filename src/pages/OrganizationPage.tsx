import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { collection, doc, getDoc, getDocs, limit, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../components/FirebaseProvider';
import { SiteLayout } from '../components/site/SiteLayout';
import { useMyClaims } from '../lib/claimsApi';
import { discoveryRepository } from '../data/discovery';
import { organizationLiveRows, useOrganizationLive } from '../lib/organizationLive';
import { approvedOrganization, organizationEvent, organizationNextAt, ORGANIZATION_CATALOG, ORGANIZATION_LIVE, prepareOrganizationBatch, mergeOrganizationContent, type OrganizationChange, type OrganizationProjection } from '../lib/organizationWorkspace';
import { OWNER_BUSINESS_LIMITS, ownerEditableFields, parseOwnerField } from '../lib/ownerListingEdits';
import { OwnerFieldEditor } from '../components/entity/OwnerFieldEditor';
import { entityPath } from '../lib/discovery';
import { calgaryDateTimeFormat } from '../lib/calgaryTz';
import { firestoreActionError } from '../lib/firestoreErrors';
import { mergeOrganizationRows, organizationListingState } from '../lib/organizationPresentation';
import type { Business } from '../types/discovery';
import '../styles/plans.css';
import '../styles/claim.css';
import '../styles/organization.css';
const text=(field:string,value:unknown)=>value===undefined?'':['hours','socials','coordinates','priceRange','occurrences'].includes(field)?JSON.stringify(value):Array.isArray(value)?value.join(', '):String(value);
const fmt=(at:number)=>calgaryDateTimeFormat('en-CA',{dateStyle:'medium',timeStyle:'short'}).format(new Date(at));
export default function OrganizationPage(){
 const {id=''}=useParams(),[params]=useSearchParams(),{user,isAdmin,signIn}=useAuth();
 const previewUid=isAdmin?params.get('as')||undefined:undefined,uid=previewUid??user?.uid;
 const claims=useMyClaims(uid),live=useOrganizationLive();
 const approved=claims?.find(c=>approvedOrganization(c,discoveryRepository.list())?.id===id);
 const org=discoveryRepository.list().find((e):e is Business=>e.id===id&&e.kind==='business');
 return <SiteLayout><main className="cw-wrap cl-page"><Link to={previewUid?`/plans?as=${encodeURIComponent(previewUid)}`:'/plans'}>← Back to dashboard</Link>
 {!user?<button className="pl-btn" onClick={()=>void signIn()}>Sign in to manage your organization</button>:!claims?<p role="status">Checking organization access…</p>:!org?<p>Organization profile unavailable. Contact aldo@calgarywatch.ca.</p>:!approved?<><h1>{org.title}</h1><p>Your account does not have confirmed organization management access. An event claim alone does not grant access to the entire organization. Ask CalgaryWatch to confirm your organization access.</p></>:<OrganizationWorkspace key={`${uid}:${id}`} org={org} uid={uid!} readOnly={Boolean(previewUid)} liveVersion={live.version}/>}
 </main></SiteLayout>;
}
export function OrganizationWorkspace({org,uid,readOnly,liveVersion}:{org:Business;uid:string;readOnly:boolean;liveVersion:number}){
 const key=`organization-draft:${uid}:${org.id}`;
 const [ops,setOps]=useState<OrganizationChange[]>(()=>{if(readOnly)return [];try{const v=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(v)?v:[];}catch{return [];}});
 const [loadingError,setLoadingError]=useState('');
 const [catalog,setCatalog]=useState<import('../types/discovery').DiscoveryEntity[]>([]);
 const [view,setView]=useState<'profile'|'events'|'editor'|'draft'>('profile');
 const [eventQuery,setEventQuery]=useState(''),[eventFilter,setEventFilter]=useState('upcoming'),[reload,setReload]=useState(0);
 const [targetId,setTargetId]=useState(org.id),[rows,setRows]=useState<OrganizationProjection[]>([]),[nextAt,setNextAt]=useState(0),[loaded,setLoaded]=useState(false),[busy,setBusy]=useState(false),[review,setReview]=useState(false),[confirmed,setConfirmed]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const request=useRef<string|undefined>((()=>{if(readOnly)return undefined;try{return localStorage.getItem(key+':request')||undefined;}catch{return undefined;}})());
 const dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{if(review)dialog.current?.showModal();else dialog.current?.close();},[review]);
 useEffect(()=>{if(!readOnly)try{localStorage.setItem(key,JSON.stringify(ops));if(request.current)localStorage.setItem(key+':request',request.current);else localStorage.removeItem(key+':request');}catch{setError('Draft storage is unavailable. Keep this page open until you submit.');}},[ops,key,readOnly]);
 useEffect(()=>{let active=true;if(!db)return;setLoaded(false);setLoadingError('');
  void Promise.all([getDoc(doc(db,OWNER_BUSINESS_LIMITS,org.id)),getDocs(query(collection(db,ORGANIZATION_LIVE),where('organizationId','==',org.id),limit(250))),getDocs(query(collection(db,ORGANIZATION_CATALOG),where('entity.organizerEntityId','==',org.id),limit(250))),getDoc(doc(db,ORGANIZATION_CATALOG,org.id))]).then(([rate,content,linked,profile])=>{if(active){setNextAt(current=>Math.max(current,organizationNextAt(rate.data()?.lastSubmittedAt??0)));setCatalog([...(profile.exists()?[profile.data().entity]:[]),...linked.docs.map(d=>({...d.data().entity,...(d.data().entity.kind==='market'?{occurrences:(d.data().occurrences??[]).map(({id,start,end,cancelled}:any)=>({id,start,end,cancelled}))}:{} )}))]);setRows(current=>mergeOrganizationRows(current,content.docs.map(d=>d.data() as OrganizationProjection)));setLoaded(true);if(linked.size===250||content.size===250)setError('Showing up to 250 saved events. Contact CalgaryWatch if an older event is missing.');}}).catch(e=>{if(active)setLoadingError(firestoreActionError(e));});return()=>{active=false;};
 },[org.id,reload]);
 useEffect(()=>{const incoming=organizationLiveRows(org.id);if(!incoming.length)return;setRows(current=>mergeOrganizationRows(current,incoming));setNextAt(current=>Math.max(current,...incoming.map(row=>organizationNextAt(row.updatedAt))));},[org.id,liveVersion]);
 const entities=useMemo(()=>mergeOrganizationContent([...new Map([...discoveryRepository.list(),...catalog].map(e=>[e.id,e])).values()],rows.map(r=>({...r,deleted:false}))),[rows,catalog,liveVersion]);
 const events=entities.filter(e=>(e.kind==='event'||e.kind==='market')&&e.organizerEntityId===org.id);
 const added=ops.filter(o=>o.action==='add').map(o=>({...organizationEvent(org,o.entityId,Date.now()),...o.changes}));
 const targets=[entities.find(e=>e.id===org.id)??org,...events,...added];
 const target=targets.find(e=>e.id===targetId),op=ops.find(o=>o.entityId===targetId);
 const locked=nextAt>Date.now(),disabled=readOnly||busy||review;
 function update(field:string,value:string){
  if(disabled||!target)return;request.current=undefined;setError('');
  try{const parsed=parseOwnerField(field,value);setOps(current=>{
    const existing=current.find(o=>o.entityId===targetId);const changes={...existing?.changes,[field]:parsed};
    if(existing?.action!=='add'&&text(field,parsed)===text(field,(target as unknown as Record<string,unknown>)[field]))delete changes[field];
    const rest=current.filter(o=>o.entityId!==targetId);return Object.keys(changes).length||existing?.action==='add'?[...rest,{entityId:targetId,action:existing?.action==='add'?'add':'edit',changes}]:rest;
   });}catch(e){setError((e as Error).message);}
 }
 function beginReview(){try{prepareOrganizationBatch(org,entities,ops,Date.now());setError('');setConfirmed(false);setReview(true);}catch(e){setError((e as Error).message);}}
 async function submit(){if(readOnly||!confirmed||busy||!db)return;setBusy(true);setError('');try{
  request.current??=crypto.randomUUID();
  try{localStorage.setItem(key+':request',request.current);}catch{/* Current-session retries still preserve the request identifier. */}
  const call=httpsCallable<{organizationId:string;requestId:string;operations:OrganizationChange[]},{nextAt:number}>(getFunctions(db.app,'northamerica-northeast1'),'submitOrganizationBatch');
  const result=await call({organizationId:org.id,requestId:request.current,operations:ops});
  setNextAt(result.data.nextAt);setOps([]);setReview(false);setNotice('Your complete submission is live. CalgaryWatch has been notified; no approval is needed.');request.current=undefined;
 }catch(e){const code=(e as {code?:string}).code;setError(code==='functions/not-found'||code==='functions/unavailable'?'Organization publishing is temporarily unavailable. Your draft is saved on this device. Please try again later or email aldo@calgarywatch.ca.':firestoreActionError(e,true));}finally{setBusy(false);}}
 const deleted=new Set(rows.filter(r=>r.deleted).map(r=>r.entityId));
 const upcoming=events.filter(e=>organizationListingState(e,deleted)==='upcoming');
 const filteredEvents=events.filter(e=>(eventFilter==='all'||organizationListingState(e,deleted)===eventFilter)&&`${e.title} ${'address' in e?e.address:''}`.toLowerCase().includes(eventQuery.toLowerCase().trim())).sort((a,b)=>a.kind==='event'&&b.kind==='event'?Date.parse(a.start)-Date.parse(b.start):a.title.localeCompare(b.title));
 return <section className="pl-form cl-form organization-workspace"><header className="organization-hero"><p className="pl-eyebrow">Your organization · CalgaryWatch</p><h1 className="cl-title">{org.title}</h1><p>One place for your profile, programme and weekly updates.</p><Link to={entityPath(org)}>View public organization profile ↗</Link></header>
 {readOnly?<p className="pl-adminview" role="status">Admin preview — read-only. This is this member’s organization workspace.</p>:null}
 <div className="organization-stats"><div><strong>{upcoming.length}</strong><span>Upcoming events</span></div><div><strong>{ops.length} / 25</strong><span>Listings in your draft</span></div><div><strong>{loaded?(locked?"Preparing next week":"Ready to publish"):"Checking allowance…"}</strong><span>One submission every seven days</span></div></div>
 <details className="organization-help"><summary>How publishing, images and urgent corrections work</summary><p>Bundle all your profile and event changes into one weekly submission. Changes publish together without approval. CalgaryWatch is notified. You cannot add, change or delete images. Removing an event retains its original images and history. Email <a href="mailto:aldo@calgarywatch.ca">aldo@calgarywatch.ca</a> for image requests or urgent corrections during your weekly wait.</p></details>

 {error?<p role="alert" className="pl-error">{error}</p>:null}{loadingError?<div role="alert" className="pl-error">{loadingError} <button className="pl-textbtn" disabled={busy} onClick={()=>{setError('');setReload(n=>n+1);}}>Retry loading saved information</button></div>:null}{notice?<p role="status">{notice}</p>:null}
 {!loaded?<p role="status">Loading your organization and allowance…</p>:locked?<p role="status">Next submission: {fmt(nextAt)} (Calgary time). You can prepare your next draft now.</p>:<p>Your weekly submission is available.</p>}
 <nav className="organization-actions" aria-label="Workspace sections"><button className="pl-btn" aria-pressed={view==='profile'} disabled={busy||review} onClick={()=>{setTargetId(org.id);setView('profile');}}>Edit organization profile</button><button className="pl-btn" aria-pressed={view==='events'||view==='editor'} disabled={busy||review} onClick={()=>setView('events')}>Events &amp; markets ({events.length})</button><button className="pl-btn" aria-pressed={view==='draft'} disabled={busy||review} onClick={()=>setView('draft')}>Weekly draft ({ops.length})</button></nav>
 {view==='events'?<section className="organization-programme" aria-labelledby="organization-programme"><h2 id="organization-programme">Your event programme</h2><p>Keep all dates together. Past, cancelled and removed listings stay available here.</p><div className="organization-filters"><label className="pl-field"><span>Search your programme</span><input type="search" placeholder="Event name or address" value={eventQuery} onChange={e=>setEventQuery(e.target.value)}/></label><label className="pl-field"><span>Show</span><select value={eventFilter} onChange={e=>setEventFilter(e.target.value)}>{['upcoming','past','cancelled','removed','market','all'].map(state=><option key={state} value={state}>{state==='market'?'Markets':state[0].toUpperCase()+state.slice(1)}</option>)}</select></label></div><ul className="organization-programme-list">{filteredEvents.map(e=><li key={e.id}><div><span className="organization-status">{organizationListingState(e,deleted)}</span><strong>{e.title}</strong><small>{e.kind==='event'?fmt(Date.parse(e.start)):'Recurring market'}{'address' in e?` · ${e.address}`:''}</small></div><button className="pl-btn" disabled={busy||review} onClick={()=>{setTargetId(e.id);setView('editor');}}>Manage event</button>{!deleted.has(e.id)?<Link to={entityPath(e)}>Public page ↗</Link>:null}</li>)}</ul>{!filteredEvents.length?<div className="organization-empty"><strong>{eventQuery?'No matching listings':'Nothing in this view yet'}</strong><p>{eventQuery?'Try another name or switch to All.':'Add a confirmed event, or switch the filter to see the rest of your programme.'}</p></div>:null}</section>:null}
 {view==='editor'?<button className="pl-textbtn" onClick={()=>setView('events')}>← Back to event programme</button>:null}
 {view==='editor'?<label className="pl-field"><span>Switch listing without losing your draft</span><select value={targetId} disabled={busy||review} onChange={e=>setTargetId(e.target.value)}>{targets.map(e=><option key={e.id} value={e.id}>{e.kind==='business'?'Organization profile':e.kind==='market'?'Market':deleted.has(e.id)?'Removed event':e.kind==='event'&&Date.parse(e.end)<Date.now()?'Past event':'Event'}: {e.title}</option>)}</select></label>:null}
 <button className="pl-btn organization-add" disabled={disabled||ops.length>=25} onClick={()=>{const entityId=`${org.id}-event-${crypto.randomUUID()}`;setOps(v=>[...v,{entityId,action:'add',changes:{title:'',address:org.address}}]);setTargetId(entityId);setView('editor');request.current=undefined;}}>Add another event to this draft</button>
 {(view==='profile'||view==='editor')&&target&&op?.action!=='delete'?<><h2>Editing {target.kind==='business'?'organization profile':target.title||'new event'}</h2>{[false,true].map(advanced=>{
   const essential=['title','summary','description','address','venue','website','phone','start','end','pricing','tickets','cancelled','occurrences'];
   const fields=ownerEditableFields(target.kind).filter(f=>f!=='organizer'&&essential.includes(f)!==advanced).map(field=><OwnerFieldEditor key={`${target.id}:${field}`} field={field} value={text(field,op?.changes[field]??(field==='occurrences'?(rows.find(r=>r.entityId===target.id)?.occurrences??discoveryRepository.occurrences().filter(o=>o.marketId===target.id)).map(({id,start,end,cancelled})=>({id,start,end,cancelled})):(target as unknown as Record<string,unknown>)[field]))} disabled={disabled} onChange={v=>update(field,v)}/>);
   return advanced?<details key="advanced" className="organization-events"><summary>More details · hours, social links, categories and location</summary><div className="organization-extra">{fields}</div></details>:<div key="essential" className="organization-extra">{fields}</div>;
 })}</>:null}
 {view==='editor'&&target?.kind==='event'?<button className="pl-textbtn" disabled={disabled} onClick={()=>{request.current=undefined;if(op?.action==='add'){setOps(v=>v.filter(o=>o.entityId!==targetId));setTargetId(org.id);}else setOps(v=>[...v.filter(o=>o.entityId!==targetId),{entityId:targetId,action:op?.action==='delete'?'edit':'delete',changes:op?.action==='delete'?{cancelled:false}:{}}]);}}>{op?.action==='delete'?'Undo removal':deleted.has(targetId)?'Restore event in this submission':'Remove event in this submission'}</button>:null}
 <section className="organization-draft" hidden={view!=='draft'}><h2 id="organization-draft">Your draft · {ops.length} listing{ops.length===1?'':'s'}</h2><p>Drafts save on this device while you work. They do not use your allowance. Switching events keeps your changes.</p>
 <ul>{ops.map(o=><li key={o.entityId}><strong>{o.action==='add'?'Add':o.action==='delete'?'Remove':'Update'}: {String(o.changes.title??targets.find(t=>t.id===o.entityId)?.title??o.entityId)||'Untitled event'}</strong> · {Object.keys(o.changes).join(', ')} <button className="pl-textbtn" disabled={disabled} onClick={()=>{setOps(v=>v.filter(x=>x.entityId!==o.entityId));request.current=undefined;if(o.action==='add'&&targetId===o.entityId)setTargetId(org.id);}}>Discard this change</button></li>)}</ul>
 </section><div className="organization-publishbar"><span><strong>{ops.length} listing{ops.length===1?"":"s"} in your draft</strong><small>{readOnly?"Read-only admin preview":locked?`Next submission: ${fmt(nextAt)}`:"Include all changes before using this week’s submission."}</small></span><button className="pl-btn" disabled={disabled||locked||!loaded||!ops.length} onClick={beginReview}>Review complete submission</button></div>
 {review?<dialog ref={dialog} aria-labelledby="organization-confirm" className="organization-confirm" onCancel={e=>{if(busy)e.preventDefault();else setReview(false);}}><h2 id="organization-confirm">Are you sure you want to submit?</h2><p>This publishes all {ops.length} listing changes for {org.title} immediately and uses your one submission for seven complete days. It is wise to include every event and all profile changes together. Your next submission will be available approximately {fmt(Date.now()+7*86400000)}.</p><ul>{ops.map(o=><li key={o.entityId}><strong>{o.action}: {String(o.changes.title??targets.find(t=>t.id===o.entityId)?.title??o.entityId)}</strong><dl>{Object.entries(o.changes).map(([field,value])=><div key={field}><dt>{field}</dt><dd>{typeof value==='string'?value:JSON.stringify(value)}</dd></div>)}</dl>{o.action==='delete'?<p>This event will be removed from public listings.</p>:null}</li>)}</ul><label><input type="checkbox" checked={confirmed} disabled={busy} onChange={e=>setConfirmed(e.target.checked)}/> I have reviewed every change and included all the events I want to publish this week.</label><button className="pl-btn" disabled={!confirmed||busy} onClick={()=>void submit()}>{busy?'Publishing…':'Confirm and publish all changes'}</button><button className="pl-textbtn" disabled={busy} onClick={()=>setReview(false)}>Keep editing this draft</button></dialog>:null}
 </section>;
}
