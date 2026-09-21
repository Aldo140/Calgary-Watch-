import { useState, type FormEvent } from 'react';
import type { InventorySubmissionInput } from '../../types/discovery';
import { calgaryInstant } from '../../lib/discoveryCalendar';

const local = (iso: string) => {
  const parts=Object.fromEntries(new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Edmonton',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(iso)).map(p=>[p.type,p.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
};
const instant = (value: string) => { const [day,time]=value.split('T'); const [h,m]=time.split(':').map(Number); return new Date(calgaryInstant(day,h+m/60)).toISOString(); };
export function InventoryForm({ initial, onSave, busy, label='Send for review' }: { initial?: InventorySubmissionInput; onSave: (input:InventorySubmissionInput)=>Promise<void>; busy:boolean; label?:string }) {
  const [kind,setKind]=useState<'event'|'market'>(initial?.kind || 'event');
  const [dates,setDates]=useState(initial?.kind==='market' ? initial.occurrences.map(o=>({...o,start:local(o.start),end:local(o.end)})) : [{sourceRecordId:crypto.randomUUID(),start:initial?.kind==='event'?local(initial.start):'',end:initial?.kind==='event'?local(initial.end):'',cancelled:false}]);
  const [error,setError]=useState('');
  async function submit(e:FormEvent<HTMLFormElement>) {
    e.preventDefault();setError('');const form=new FormData(e.currentTarget);const get=(k:string)=>String(form.get(k)||'').trim();
    const list=(k:string)=>get(k).split(',').map(s=>s.trim()).filter(Boolean);
    try {
      const base={title:get('title'),summary:get('summary'),description:get('description'),address:get('address'),organizer:get('organizer'),sourceUrl:get('sourceUrl'),categories:list('categories'),tags:list('tags'),...(get('neighbourhood')?{neighbourhood:get('neighbourhood')}:{})};
      const converted=dates.map(d=>({...d,start:instant(d.start),end:instant(d.end)}));
      if(converted.some(d=>Date.parse(d.end)<=Date.parse(d.start))) throw Error('Each end time must follow its start time.');
      await onSave(kind==='event'?{...base,kind,start:converted[0].start,end:converted[0].end,pricing:get('pricing') as 'free'|'paid'|'unknown'}:{...base,kind,occurrences:converted,amenities:list('amenities'),...(get('parking')?{parking:get('parking')}:{}),...(get('transit')?{transit:get('transit')}:{}),...Object.fromEntries(['petFriendly','familyFriendly'].filter(k=>get(k)!=='unknown').map(k=>[k,get(k)==='yes']))});
    } catch(e) { setError(e instanceof Error?e.message:'Could not save.'); }
  }
  return <form className="cw-inventory-form" onSubmit={submit}>
    <label>Listing type<select value={kind} disabled={!!initial} onChange={e=>setKind(e.target.value as 'event'|'market')}><option value="event">Event</option><option value="market">Recurring market</option></select></label>
    {(['title','summary','address','organizer','sourceUrl','neighbourhood','categories','tags'] as const).map(field=><label key={field}>{({sourceUrl:'Official source URL',categories:'Categories (comma separated)',tags:'Tags (comma separated)',neighbourhood:'Neighbourhood',title:'Title',summary:'Short description',address:'Address',organizer:'Organizer'})[field]}<input name={field} type={field==='sourceUrl'?'url':'text'} required={!['categories','tags','neighbourhood'].includes(field)} maxLength={500} defaultValue={Array.isArray(initial?.[field])?(initial[field] as string[]).join(', '):initial?.[field] as string || ''}/></label>)}
    <label>Description<textarea name="description" required maxLength={5000} rows={4} defaultValue={initial?.description}/></label>
    <fieldset><legend>Confirmed dates · Calgary time</legend>{dates.map((d,i)=><div className="cw-date-row" key={d.sourceRecordId}><label>Starts<input type="datetime-local" required value={d.start} onChange={e=>setDates(dates.map((x,n)=>n===i?{...x,start:e.target.value}:x))}/></label><label>Ends<input type="datetime-local" required value={d.end} onChange={e=>setDates(dates.map((x,n)=>n===i?{...x,end:e.target.value}:x))}/></label>{kind==='market'&&<><label><input type="checkbox" checked={d.cancelled} onChange={e=>setDates(dates.map((x,n)=>n===i?{...x,cancelled:e.target.checked}:x))}/>Cancelled</label>{dates.length>1&&<button type="button" onClick={()=>setDates(dates.filter((_,n)=>n!==i))}>Remove date</button>}</>}</div>)}{kind==='market'&&dates.length<100&&<button type="button" onClick={()=>setDates([...dates,{sourceRecordId:crypto.randomUUID(),start:'',end:'',cancelled:false}])}>Add occurrence</button>}</fieldset>
    {kind==='event'?<label>Admission<select name="pricing" defaultValue={initial?.kind==='event'?initial.pricing:'unknown'}><option value="unknown">Confirm with organizer</option><option value="free">Free</option><option value="paid">Paid</option></select></label>:<>{['amenities','parking','transit'].map(k=><label key={k}>{k}<input name={k} defaultValue={initial?.kind==='market'?(k==='amenities'?initial.amenities.join(', '):initial[k as 'parking'|'transit']):''}/></label>)}</>}
    {kind==='market'&&['petFriendly','familyFriendly'].map(key=><label key={key}>{key==='petFriendly'?'Pet friendly':'Family friendly'}<select name={key} defaultValue={initial?.kind==='market'&&initial[key as 'petFriendly'|'familyFriendly']!==undefined?(initial[key as 'petFriendly'|'familyFriendly']?'yes':'no'):'unknown'}><option value="unknown">Not confirmed</option><option value="yes">Yes</option><option value="no">No</option></select></label>)}
    {error&&<p role="alert">{error}</p>}<button className="cw-button" disabled={busy}>{busy?'Saving…':label}</button>
  </form>;
}
