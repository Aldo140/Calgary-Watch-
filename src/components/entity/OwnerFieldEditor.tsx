import { useState } from 'react';
import { ownerInstant, ownerLocalDate } from '../../lib/ownerListingEdits';
const labels:Record<string,string>={title:'Name / title',summary:'Short description',description:'Full description',address:'Street address',venue:'Venue',neighbourhood:'Neighbourhood',categories:'Categories',tags:'Tags',website:'Official website',phone:'Phone',services:'Services',offer:'Current offer',priceLevel:'Price level (1–4)',start:'Event starts (include timezone)',end:'Event ends (include timezone)',pricing:'Pricing',tickets:'Ticket link',cancelled:'Event cancelled',organizer:'Organizer name',amenities:'Amenities',parking:'Parking',transit:'Transit',petFriendly:'Pet friendly',familyFriendly:'Family friendly',hours:'Opening hours',socials:'Social links',coordinates:'Map location',priceRange:'Ticket price range'};
const lists=['categories','tags','services','amenities'];
export function OwnerFieldEditor({field,value,disabled,onChange}:{field:string;value:string;disabled:boolean;onChange:(value:string)=>void}) {
  const [dateError,setDateError]=useState('');
  const changeDate=(text:string,apply:(iso:string)=>void)=>{try{apply(ownerInstant(text));setDateError('');}catch(e){setDateError(e instanceof Error?e.message:'Choose another time.');}};
  const label=labels[field]??field;
  if(field==='start'||field==='end')return <label className="pl-field"><span>{field==='start'?'Starts':'Ends'} (Calgary time)</span><input type="datetime-local" value={ownerLocalDate(value)} readOnly={disabled} onChange={e=>changeDate(e.target.value,onChange)} />{dateError?<small role="alert">{dateError}</small>:null}</label>;
  let data:any;try{data=JSON.parse(value||(['priceRange'].includes(field)?'[0,0]':'{}'));}catch{data={};}
  if(field==='occurrences') {
    const dates=Array.isArray(data)?data:[];
    const update=(index:number,patch:Record<string,unknown>)=>onChange(JSON.stringify(dates.map((d,i)=>i===index?{...d,...patch}:d)));
    return <fieldset className="pl-step"><legend>Market dates · Calgary time</legend>{dates.map((date,i)=><div key={date.id??i} className="pl-step">
      <label className="pl-field"><span>Starts</span><input type="datetime-local" readOnly={disabled} value={ownerLocalDate(date.start)} onChange={e=>changeDate(e.target.value,start=>update(i,{start}))} /></label>
      <label className="pl-field"><span>Ends</span><input type="datetime-local" readOnly={disabled} value={ownerLocalDate(date.end)} onChange={e=>changeDate(e.target.value,end=>update(i,{end}))} /></label>
      <label><input type="checkbox" disabled={disabled} checked={date.cancelled} onChange={e=>update(i,{cancelled:e.target.checked})} /> Cancelled</label>
    </div>)}<button type="button" disabled={disabled||dates.length>=100} onClick={()=>onChange(JSON.stringify([...dates,{start:'',end:'',cancelled:false}]))}>Add market date</button>{dateError?<p role="alert">{dateError}</p>:null}</fieldset>;
  }
  if(field==='hours'||field==='socials') {
    const keys=[...new Set([...Object.keys(data),...(field==='hours'?['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']:['instagram','facebook','tiktok','youtube'])])];
    return <fieldset className="pl-step"><legend>{label}</legend>{keys.map(key=><label key={key} className="pl-field"><span>{key}</span><input type={field==='socials'?'url':'text'} value={data[key]??''} readOnly={disabled} placeholder={field==='socials'?'https://':'9 a.m.–5 p.m. or Closed'} onChange={e=>{const next={...data};if(e.target.value)next[key]=e.target.value;else delete next[key];onChange(JSON.stringify(next));}} /></label>)}</fieldset>;
  }
  if(field==='coordinates'||field==='priceRange') {
    const keys=field==='coordinates'?['lat','lng']:['0','1'];
    return <fieldset className="pl-step"><legend>{label}</legend>{keys.map((key,i)=><label key={key} className="pl-field"><span>{field==='coordinates'?(i?'Longitude':'Latitude'):(i?'Maximum ($)':'Minimum ($)')}</span><input type="number" step="any" value={data[key]??''} readOnly={disabled} onChange={e=>{const next=field==='coordinates'?{...data}:[...(Array.isArray(data)?data:[0,0])];next[key]=e.target.value===''?null:Number(e.target.value);onChange(JSON.stringify(next));}} /></label>)}</fieldset>;
  }
  const change=(text:string)=>onChange(text);
  return <label className="pl-field"><span>{label}{lists.includes(field)?' (separate with commas)':''}</span>
    {['cancelled','petFriendly','familyFriendly'].includes(field)?<select value={value||'false'} disabled={disabled} onChange={e=>change(e.target.value)}><option value="false">No</option><option value="true">Yes</option></select>:
      field==='pricing'?<select value={value||'unknown'} disabled={disabled} onChange={e=>change(e.target.value)}><option value="unknown">See official source</option><option value="free">Free</option><option value="paid">Paid</option></select>:
      ['description','summary'].includes(field)?<textarea rows={field==='description'?6:3} value={value} readOnly={disabled} onChange={e=>change(e.target.value)} />:
      <input type={field==='phone'?'tel':['website','tickets'].includes(field)?'url':field==='priceLevel'?'number':'text'} autoComplete={field==='phone'?'tel':field==='website'?'url':field==='address'?'street-address':'off'} min={field==='priceLevel'?1:undefined} max={field==='priceLevel'?4:undefined} step={field==='priceLevel'?1:undefined} value={value} readOnly={disabled} onChange={e=>change(e.target.value)} placeholder={['start','end'].includes(field)?'2026-10-23T19:00:00-06:00':undefined} />}
  </label>;
}
