import { useEffect, useState } from 'react';
import { collection, doc, limit, onSnapshot, orderBy, query, updateDoc } from 'firebase/firestore';
import { Link } from 'react-router-dom';
import { db } from '../../firebase';
import { OWNER_EDITS, type OwnerEdit } from '../../lib/ownerListingEdits';
import { adminFirestoreActionError as firestoreActionError, isFirestorePermissionError } from '../../lib/firestoreErrors';
import { trackSubscription } from '../../lib/readEfficiency';
import { AdminButton, Chip, Panel, T } from './ui';
export function OwnerEditsPanel() {
  const [shown,setShown]=useState(30);
  const [rows,setRows]=useState<Array<OwnerEdit&{id:string}>|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState('');
  const [permissionDenied,setPermissionDenied]=useState(false),[attempt,setAttempt]=useState(0),[loading,setLoading]=useState(true),[actionError,setActionError]=useState('');
  useEffect(()=>{
    if(!db){setLoading(false);setError('Firebase is not configured. Business updates cannot be loaded.');return;}
    setLoading(true);setError('');setPermissionDenied(false);
    return trackSubscription('admin:owner_updates',()=>onSnapshot(query(collection(db!,OWNER_EDITS),orderBy('createdAt','desc'),limit(shown)),snapshot=>{
      setRows(snapshot.docs.map(d=>({id:d.id,...d.data() as OwnerEdit})));setError('');setPermissionDenied(false);setLoading(false);
    },e=>{setError(firestoreActionError(e));setPermissionDenied(isFirestorePermissionError(e));setLoading(false);}));
  },[shown,attempt]);
  return <Panel title="Business listing updates" subtitle="Owner changes publish automatically. These are notifications, not approval requests. Recent updates.">
    {error?<div role="alert" className="rounded-lg border p-3 text-sm space-y-2" style={{borderColor:T.line,color:T.critical}}>
      <strong>Business update notifications are unavailable.</strong><p>{error}</p>
      {permissionDenied?<p><a className="underline" href="https://github.com/Aldo140/Calgary-Watch-/actions/workflows/deploy-firebase-backend.yml" target="_blank" rel="noreferrer">Open Firebase backend deployment</a> — deploy the rules target, then retry. This does not approve any claims.</p>:null}
      <AdminButton onClick={()=>setAttempt(n=>n+1)}>Retry loading updates</AdminButton>
      {rows?.length?<p>Previously loaded updates are shown below and may be out of date.</p>:null}
    </div>:null}
    {actionError?<p role="alert" style={{color:T.critical}}>{actionError}</p>:null}
    {loading?<p role="status">Loading business updates…</p>:null}
    {!loading&&!error&&rows?.length===0?<p>No business updates yet.</p>:null}
    {rows?.map(row=><article key={row.id} className="border-t py-3 space-y-2">
      <div className="flex gap-2 items-center"><strong>{row.entityTitle}</strong><Chip tone={row.status==='failed'?'critical':row.status==='applied'?'ok':'attention'}>{row.status==='applied'?(row.publishedAt?'Published automatically':'Applied; awaiting release'):row.status==='failed'?'Could not apply':'Queued automatically'}</Chip>{row.notificationPending?<Chip tone="signal">New</Chip>:null}</div>
      {(row as OwnerEdit & {actorRole?:string}).actorRole==='admin'?<p>Administrator edit · actor {row.uid}. Business weekly allowance unchanged.</p>:null}
      <Link to={`/plans?as=${encodeURIComponent((row as OwnerEdit & {subjectUid?:string}).subjectUid||row.uid)}`}>View member’s dashboard</Link>
      <p>{row.status==='failed'?row.error:(row as OwnerEdit & {live?:boolean}).live?'Published immediately as one organization submission. No approval required.':'No admin approval is required. Public pages update when the automatic Hosting release succeeds.'}</p>
      <p>{row.publicationWarning}</p>
      <dl>{Object.keys(row.changes).map(field=><div key={field}><dt><strong>{field}</strong></dt><dd>{row.before?`${JSON.stringify(row.before[field])} → `:''}{JSON.stringify(row.after?.[field]??row.changes[field])}</dd></div>)}</dl>
      {row.notificationPending?<AdminButton disabled={Boolean(busy)} onClick={async()=>{if(!db)return;setBusy(row.id);setActionError('');try{await updateDoc(doc(db,OWNER_EDITS,row.id),{notificationPending:false});}catch(e){setActionError(firestoreActionError(e));}finally{setBusy('');}}}>Mark notification read</AdminButton>:null}
    </article>)}
    {!error&&rows?.length===shown?<AdminButton disabled={loading} onClick={()=>setShown(n=>n+30)}>Load older updates</AdminButton>:null}
  </Panel>;
}
