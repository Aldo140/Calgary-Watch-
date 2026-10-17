import { calgaryInstant } from './discoveryCalendar';
import { calgaryDateTimeFormat } from './calgaryTz';
import type { MarketOccurrence, DiscoveryEntity } from '../types/discovery';
export const OWNER_EDITS = 'owner_listing_edits';
export const OWNER_LIMITS = 'owner_listing_edit_limits';
export const OWNER_BUSINESS_LIMITS = 'owner_business_edit_limits';
export const OWNER_CONTENT = 'owner_listing_content';
export const OWNER_EDIT_INTERVAL = 7 * 86400000;
export const OWNER_EDIT_POLICY = 'Save one update every seven days per business, shared across your profile and linked events. Change several fields in one save. Updates publish automatically without admin approval, normally after the next publishing run. CalgaryWatch is notified. You cannot add, change or delete images here; email us about images.';
export type OwnerEdit = { uid: string; rootId: string; entityId: string; entityTitle: string; changes: Record<string, unknown>; status: 'queued' | 'applied' | 'failed'; createdAt: unknown; notificationPending: boolean; publicationPending?: boolean; publicationWarning?: string; nextPublicationAttemptAt?: number; publicationAttempts?: number; publishedAt?: number; error?: string; appliedAt?: number; before?: Record<string, unknown>; after?: Record<string, unknown> };
const common = ['title','summary','description','address','venue','neighbourhood','categories','tags','coordinates'];
const byKind = { business: ['website','phone','hours','socials','services','offer','priceLevel'], event: ['start','end','pricing','priceRange','tickets','cancelled','organizer'], market: ['occurrences','amenities','parking','transit','petFriendly','familyFriendly','organizer'] };
export function ownerEditableFields(kind: string): string[] { return kind in byKind ? [...common,...byKind[kind as keyof typeof byKind]] : []; }
export function ownerEditTargets(rootId: string, entities: readonly DiscoveryEntity[]): DiscoveryEntity[] {
  const root = entities.find(e=>e.id===rootId && ['business','event','market'].includes(e.kind) && e.status==='published');
  if (!root) return [];
  return [root,...entities.filter(e=>e.id!==rootId && root.kind==='business' && (e.kind==='event'||e.kind==='market') && e.organizerEntityId===rootId && e.status==='published')];
}
function https(value: string) { if(!value) return true; try {const url=new URL(value);return url.protocol==='https:' && !url.username && !url.password;}catch{return false;} }
/** Shared browser/worker validation. Protected identity, images and verification never enter an override. */
export function ownerEditPatch(entity: DiscoveryEntity, changes: Record<string, unknown>): Record<string, unknown> {
  const allowed = ownerEditableFields(entity.kind), entries=Object.entries(changes);
  if(!entries.length || entries.length>30) throw Error('Change at least one field before saving.');
  const out: Record<string,unknown>={};
  for(const [key,value] of entries) {
    if(!allowed.includes(key)) throw Error(`You cannot edit ${key}. Images, ownership and verification are protected.`);
    if(key==='occurrences') {
      if(!Array.isArray(value)||value.length>100||value.some(d=>!d||typeof d!=='object'||Object.keys(d).some(k=>!['id','start','end','cancelled'].includes(k))||('id'in d&&(typeof d.id!=='string'||!d.id||d.id.length>150))||typeof d.cancelled!=='boolean'||!['start','end'].every(k=>typeof d[k]==='string'&&/(Z|[+-]\d\d:\d\d)$/.test(d[k])&&Number.isFinite(Date.parse(d[k])))||Date.parse(d.end)<=Date.parse(d.start))) throw Error('Check market dates: each date needs a valid start, end and cancellation status.');
      if(new Set(value.map(d=>Date.parse(d.start))).size!==value.length)throw Error('Market dates must not have duplicate starts.');
      out[key]=value;
    } else if(['categories','tags','services','amenities'].includes(key)) {
      if(!Array.isArray(value)||value.length>30||value.some(v=>typeof v!=='string'||!v.trim()||v.length>100)) throw Error(`Use a short list for ${key}.`);
      out[key]=[...new Set(value.map(v=>v.trim()))];
    } else if(['hours','socials'].includes(key)) {
      if(!value||Array.isArray(value)||typeof value!=='object'||Object.keys(value).length>30||Object.entries(value).some(([k,v])=>!k||k.length>50||['__proto__','constructor','prototype'].includes(k)||typeof v!=='string'||v.length>500||(key==='socials'&&!https(v)))) throw Error(`Use a valid ${key} object${key==='socials'?' with HTTPS links':''}.`);
      out[key]=value;
    } else if(key==='coordinates') {
      const p=value as {lat?:number;lng?:number}|null;
      if(!p||typeof p.lat!=='number'||typeof p.lng!=='number'||!Number.isFinite(p.lat)||!Number.isFinite(p.lng)||Math.abs(p.lat)>90||Math.abs(p.lng)>180||Object.keys(p).some(k=>!['lat','lng'].includes(k))) throw Error('Use valid latitude and longitude.'); out[key]=p;
    } else if(['cancelled','petFriendly','familyFriendly'].includes(key)) {if(typeof value!=='boolean')throw Error(`Use true or false for ${key}.`);out[key]=value;
    } else if(key==='priceLevel') { if(!Number.isInteger(value)||Number(value)<1||Number(value)>4)throw Error('Price level must be 1 to 4.');out[key]=value;
    } else if(key==='priceRange') {if(!Array.isArray(value)||value.length!==2||value.some(v=>typeof v!=='number'||!Number.isFinite(v)||v<0)||value[0]>value[1])throw Error('Use a valid minimum and maximum price.');out[key]=value;
    } else {
      const max=key==='title'?200:key==='description'?12000:key==='summary'?500:['website','tickets'].includes(key)?2000:500;
      if(typeof value!=='string'||value.length>max||(['title','address'].includes(key)&&!value.trim()))throw Error(`Check ${key} (maximum ${max} characters).`);
      if(['website','tickets'].includes(key)&&!https(value.trim()))throw Error('Use a valid HTTPS link.');
      if(key==='pricing'&&!['free','paid','unknown'].includes(value))throw Error('Choose free, paid or unknown.');
      if(['start','end'].includes(key)&&(!/(Z|[+-]\d\d:\d\d)$/.test(value)||!Number.isFinite(Date.parse(value))))throw Error('Event dates need a timezone offset, for example 2026-10-23T19:00:00-06:00.');
      out[key]=value.trim();
    }
  }
  const next={...entity,...out};
  if(next.kind==='event'&&Date.parse(next.end)<=Date.parse(next.start))throw Error('The event must end after it starts.');
  if(entity.kind==='business'&&typeof out.title==='string')out.name=out.title;
  return out;
}
export function ownerBusinessId(entity: DiscoveryEntity, rootId: string): string { return (entity.kind === 'event'||entity.kind==='market') && entity.organizerEntityId ? entity.organizerEntityId : rootId; }
export function nextOwnerEditAt(last: number): number { return last ? last + OWNER_EDIT_INTERVAL : 0; }
export function parseOwnerField(field: string, text: string): unknown {
  if(['hours','socials','coordinates','priceRange','occurrences'].includes(field))return JSON.parse(text);
  if(['categories','tags','services','amenities'].includes(field))return text.split(',').map(s=>s.trim()).filter(Boolean);
  if(['cancelled','petFriendly','familyFriendly'].includes(field)) {if(!['true','false'].includes(text))throw Error('Choose true or false.');return text==='true';}
  if(field==='priceLevel')return Number(text);
  return text;
}
/** Export revalidates server-written overrides and retains immutable metadata/images. */
export function applyOwnerContent(entities: readonly DiscoveryEntity[], records: readonly {rootId:string;entityId:string;changes:Record<string,unknown>;appliedAt?:number}[]): DiscoveryEntity[] {
  const byId=new Map(entities.map(e=>[e.id,e]));
  for(const record of records) {
    const entity=byId.get(record.entityId); if(!entity||!ownerEditTargets(record.rootId,entities).some(e=>e.id===entity.id))continue;
    const {name: _derived,...changes}=record.changes;
    const patch=ownerEditPatch(entity,changes);
    byId.set(entity.id,{...entity,...patch,...(record.appliedAt?{updatedAt:new Date(record.appliedAt).toISOString(),ownerContentAppliedAt:record.appliedAt}:{} )} as DiscoveryEntity);
  }
  return [...byId.values()];
}

/** Date controls always represent Calgary time regardless of the browser's timezone. */
export function ownerLocalDate(iso:string):string {
  if(!iso||!Number.isFinite(Date.parse(iso)))return '';
  const p=Object.fromEntries(calgaryDateTimeFormat('en-CA',{timeZone:'America/Edmonton',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(iso)).map(p=>[p.type,p.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
export function ownerInstant(value:string):string {
  if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(value))return value;
  const [day,time]=value.split('T'),[h,m]=time.split(':').map(Number);
  const iso=new Date(calgaryInstant(day,h+m/60)).toISOString();
  if(ownerLocalDate(iso)!==value)throw Error('That Calgary time does not exist because the clocks change. Choose another time.');
  return iso;
}
export function applyOwnerOccurrences(original:readonly MarketOccurrence[], records:readonly {entityId:string;changes:Record<string,unknown>}[],strict=false): MarketOccurrence[] {
  let result=[...original];
  for(const record of records) {
    const dates=record.changes.occurrences as Array<{id?:string;start:string;end:string;cancelled:boolean}>|undefined;
    if(!dates)continue;
    const previous=result.filter(d=>d.marketId===record.entityId),byId=new Map(previous.map(d=>[d.id,d]));
    if(dates.some(d=>d.id&&((strict&&!byId.has(d.id))||original.some(o=>o.id===d.id&&o.marketId!==record.entityId))))throw Error('A market date belongs to another listing or is no longer available.');
    const next=dates.map(d=>{
      const old=d.id?byId.get(d.id):previous.find(p=>Date.parse(p.start)===Date.parse(d.start));
      return {...(old??{}),id:old?.id??d.id??`owner-${record.entityId}-${Date.parse(d.start)}`,marketId:record.entityId,start:d.start,end:d.end,cancelled:d.cancelled,timezone:'America/Edmonton' as const,source:old?.source??{kind:'official' as const,name:'Confirmed by the organization',url:`https://calgarywatch.ca/claim/${encodeURIComponent(record.entityId)}`}};
    });
    const kept=new Set(next.map(d=>d.id));
    result=[...result.filter(d=>d.marketId!==record.entityId),...previous.filter(d=>!kept.has(d.id)).map(d=>({...d,cancelled:true})),...next];
  }
  return result;
}

/** Avoid a failed Hosting release causing a full rebuild every quarter-hour indefinitely. */
export function ownerPublicationRetryDelay(attempt: number): number { return Math.min(12 * 3600000, 15 * 60000 * 2 ** Math.min(10,Math.max(0,attempt - 1))); }
