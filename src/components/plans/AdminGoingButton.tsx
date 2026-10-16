import {useState} from 'react';
import {adminMemberAction} from '../../lib/adminMemberApi';
import {refreshGoingFor} from '../../lib/plans';
export function AdminGoingButton({uid,eventId,start,on}:{uid:string;eventId:string;start:string;on:boolean}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 return <span><button type="button" className="cw-going-btn" aria-pressed={on} disabled={busy} onClick={async()=>{setBusy(true);setError('');try{await adminMemberAction({subjectUid:uid,action:'rsvp',eventId,start,on:!on});await refreshGoingFor(uid);}catch(e){setError(e instanceof Error?e.message:'Could not update RSVP.');}finally{setBusy(false);}}}>{busy?'Saving…':on?'Going · remove':'Mark member going'}</button>{error?<small role="alert">{error}</small>:null}</span>;
}
