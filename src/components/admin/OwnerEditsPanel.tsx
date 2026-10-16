import { useEffect, useState } from 'react';
import { collection, doc, limit, onSnapshot, orderBy, query, updateDoc } from 'firebase/firestore';
import { Link } from 'react-router-dom';
import { db } from '../../firebase';
import { OWNER_EDITS, type OwnerEdit } from '../../lib/ownerListingEdits';
import { firestoreActionError } from '../../lib/firestoreErrors';
import { trackSubscription } from '../../lib/readEfficiency';
import { AdminButton, Chip, Panel } from './ui';
export function OwnerEditsPanel() {
  const [shown,setShown]=useState(30);
  const [rows,setRows]=useState<Array<OwnerEdit&{id:string}>>([]),[error,setError]=useState(''),[busy,setBusy]=useState('');
  useEffect(()=>db?trackSubscription('admin:owner_updates',()=>onSnapshot(query(collection(db!,OWNER_EDITS),orderBy('createdAt','desc'),limit(shown)),snapshot=>setRows(snapshot.docs.map(d=>({id:d.id,...d.data() as OwnerEdit}))),e=>setError(firestoreActionError(e)))):undefined,[shown]);
  return <Panel title="Business listing updates" subtitle="Owner changes publish automatically. These are notifications, not approval requests. Recent updates.">
    {error?<p role="alert">{error}</p>:null}
    {!rows.length?<p>No owner updates loaded.</p>:rows.map(row=><article key={row.id} className="border-t py-3 space-y-2">
      <div className="flex gap-2 items-center"><strong>{row.entityTitle}</strong><Chip tone={row.status==='failed'?'critical':row.status==='applied'?'ok':'attention'}>{row.status==='applied'?(row.publishedAt?'Published automatically':'Applied; awaiting release'):row.status==='failed'?'Could not apply':'Queued automatically'}</Chip>{row.notificationPending?<Chip tone="signal">New</Chip>:null}</div>
      <Link to={`/plans?as=${encodeURIComponent(row.uid)}`}>View owner’s dashboard</Link>
      <p>{row.status==='failed'?row.error:(row as OwnerEdit & {live?:boolean}).live?'Published immediately as one organization submission. No approval required.':'No admin approval is required. Public pages update when the automatic Hosting release succeeds.'}</p>
      <p>{row.publicationWarning}</p>
      <dl>{Object.keys(row.changes).map(field=><div key={field}><dt><strong>{field}</strong></dt><dd>{row.before?`${JSON.stringify(row.before[field])} → `:''}{JSON.stringify(row.after?.[field]??row.changes[field])}</dd></div>)}</dl>
      {row.notificationPending?<AdminButton disabled={Boolean(busy)} onClick={async()=>{if(!db)return;setBusy(row.id);try{await updateDoc(doc(db,OWNER_EDITS,row.id),{notificationPending:false});}catch(e){setError(firestoreActionError(e));}finally{setBusy('');}}}>Mark notification read</AdminButton>:null}
    </article>)}
    {rows.length===shown?<AdminButton onClick={()=>setShown(n=>n+30)}>Load older updates</AdminButton>:null}
  </Panel>;
}
