import { calgaryDateTimeFormat } from '../../lib/calgaryTz';
import { OwnerFieldEditor } from './OwnerFieldEditor';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../FirebaseProvider';
import { discoveryRepository } from '../../data/discovery';
import { applyOwnerOccurrences, applyOwnerContent, OWNER_EDIT_POLICY, ownerEditableFields, ownerEditPatch, ownerEditTargets, parseOwnerField, type OwnerEdit } from '../../lib/ownerListingEdits';
import { loadOwnerEditor, saveOwnerEdit } from '../../lib/ownerListingEditsApi';
import { firestoreActionError } from '../../lib/firestoreErrors';
import { LISTING_CONTACT_EMAIL } from '../../config/contact';
import type { DiscoveryEntity } from '../../types/discovery';
const jsonFields=['hours','socials','coordinates','priceRange','occurrences'];
const listFields=['categories','tags','services','amenities'];
function fieldText(value:unknown,field:string):string {return value===undefined?'':jsonFields.includes(field)?JSON.stringify(value):listFields.includes(field)?(value as string[]).join(', '):String(value);}

/** Approved owners edit real fields. A server-validated publisher applies them without admin approval. */
export function ListingManagement({claim,previewUid,initialTargetId}: {claim:{entityId:string;entityTitle:string};previewUid?:string;initialTargetId?:string}) {
  const {user,isAdmin}=useAuth(); const readOnly=Boolean(previewUid);
  const subjectUid=previewUid?(isAdmin?previewUid:undefined):user?.uid;
  const [targetId,setTargetId]=useState(initialTargetId??claim.entityId);
  const [content,setContent]=useState<Array<{entityId:string;changes:Record<string,unknown>}>>([]);
  const [history,setHistory]=useState<Array<OwnerEdit&{id:string}>>([]);
  const [nextAt,setNextAt]=useState(0),[loaded,setLoaded]=useState(false),[busy,setBusy]=useState(false);
  const [error,setError]=useState(''),[notice,setNotice]=useState(''),[refreshing,setRefreshing]=useState(false);
  const [draft,setDraft]=useState<Record<string,string>>({}); const operation=useRef<string|undefined>(undefined);
  const base=discoveryRepository.list();
  const targets=useMemo(()=>{
    try {return ownerEditTargets(claim.entityId,applyOwnerContent(base,content.map(c=>({...c,rootId:claim.entityId}))));}catch{return ownerEditTargets(claim.entityId,base);}
  },[base,claim.entityId,content]);
  const target=targets.find(e=>e.id===targetId);
  async function load() {
    if(!subjectUid)return;
    const state=await loadOwnerEditor(claim.entityId,subjectUid);
    setNextAt(state.nextAt);setHistory(state.history);setContent(state.content);setLoaded(true);
  }
  useEffect(()=>{let active=true;setLoaded(false);setDraft({});setError('');operation.current=undefined;
    if(subjectUid)void loadOwnerEditor(claim.entityId,subjectUid).then(s=>{if(active){setNextAt(s.nextAt);setHistory(s.history);setContent(s.content);setLoaded(true);}}).catch(e=>{if(active)setError(firestoreActionError(e));});
    return()=>{active=false;};
  },[claim.entityId,subjectUid]);
  const fields=target?ownerEditableFields(target.kind):[];
  const locked=nextAt>Date.now();
  async function save() {
    if(!user||readOnly||busy||!target||!loaded)return;
    setBusy(true);setError('');setNotice('');
    try {
      const changes=Object.fromEntries(Object.entries(draft).map(([field,text])=>[field,parseOwnerField(field,text)]));
      ownerEditPatch(target,changes);
      operation.current??=crypto.randomUUID();
      await saveOwnerEdit(user.uid,claim.entityId,target,changes,operation.current);
      setNotice('Update saved for automatic publishing. No admin approval is needed. The public page updates after publishing succeeds; normally after the next scheduled run. CalgaryWatch will be notified.');
      setDraft({});operation.current=undefined;
      await load();
    }catch(e){setError(firestoreActionError(e));}finally{setBusy(false);}
  }
  return <section className="pl-form cl-form" aria-labelledby="cl-manage">
    <div className="cl-owner"><strong id="cl-manage">Manage your listing</strong></div>
    <p>{OWNER_EDIT_POLICY}</p>
    <p>Images are managed by CalgaryWatch. To request an image change or removal, email <a href={`mailto:${LISTING_CONTACT_EMAIL}`}>{LISTING_CONTACT_EMAIL}</a> with the listing name, exact files and artist credit. This editor does not upload image files.</p>
    {error?<p role="alert" className="pl-error">{error}</p>:null}
    {!loaded&&!error?<p role="status">Loading your saved fields and weekly allowance…</p>:null}
    {loaded&&locked?<p role="status">Your next update is available {calgaryDateTimeFormat('en-CA',{timeZone:'America/Edmonton',dateStyle:'medium',timeStyle:'short'}).format(new Date(nextAt))} (Calgary time).</p>:null}
    {readOnly?<p role="status">Admin view — read-only. These are this member’s fields and publishing history.</p>:null}
    <label className="pl-field"><span>Profile or linked event</span><select value={targetId} disabled={busy} onChange={e=>{setTargetId(e.target.value);setDraft({});operation.current=undefined;setError('');}}>{targets.map(e=><option key={e.id} value={e.id}>{e.title} ({e.kind})</option>)}</select></label>
    {!target?<p>This published listing is not available to edit.</p>:fields.map(field=>{
      const originalValue=field==='occurrences'?applyOwnerOccurrences(discoveryRepository.occurrences(),content).filter(d=>d.marketId===target.id).map(({id,start,end,cancelled})=>({id,start,end,cancelled})):(target as unknown as Record<string,unknown>)[field];
      const value=draft[field]??fieldText(originalValue,field);
      const update=(text:string)=>{operation.current=undefined;setDraft(d=>{
        const original=fieldText(originalValue,field);const next={...d};if(text===original)delete next[field];else next[field]=text;return next;
      });};
      const disabled=readOnly||locked||!loaded||busy;
      return <OwnerFieldEditor key={field} field={field} value={value} disabled={disabled} onChange={update} />;
    })}
    <button type="button" className="pl-btn" disabled={readOnly||locked||busy||refreshing||!loaded||!target||!Object.keys(draft).length} onClick={()=>void save()}>{readOnly?'Read-only preview':busy?'Saving…':'Save this week’s update'}</button>
    <button type="button" className="pl-textbtn" disabled={busy||refreshing} onClick={async()=>{setRefreshing(true);setError('');try{await load();}catch(e){setError(firestoreActionError(e));}finally{setRefreshing(false);}}}>{refreshing?'Refreshing…':'Refresh publishing status'}</button>
    {notice?<p role="status">{notice}</p>:null}
    {history.length?<div className="cl-history"><h3>Your updates</h3><ul>{history.sort((a,b)=>((b.createdAt as {seconds?:number})?.seconds??0)-((a.createdAt as {seconds?:number})?.seconds??0)).map(h=><li key={h.id}><strong>{h.entityTitle}</strong><span>{h.status==='applied'?(h.publishedAt?'Published':'Applied; publishing automatically'):h.status==='failed'?`Could not apply: ${h.error??'Try again.'}`:'Saved; awaiting automatic publishing'}</span><small>{h.publicationWarning??''}</small><small>{Object.keys(h.changes).join(', ')}</small></li>)}</ul></div>:null}
  </section>;
}
