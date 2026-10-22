import {ownerInstant} from './ownerListingEdits';
import {MAX_ORGANIZATION_CHANGES,prepareOrganizationBatch,type OrganizationChange} from './organizationWorkspace';
import type {ManagementOrganization} from './claimOrganization';
import type {DiscoveryEntity} from '../types/discovery';
export const ORGANIZATION_CSV_TEMPLATE='title,start,end,address,venue,summary,description,pricing,tickets\n';
const columns=new Set(['title','start','end','address','venue','summary','description','pricing','tickets']);
/** Small RFC4180 reader: quoted commas, escaped quotes and multiline descriptions are retained. */
function rows(text:string):string[][]{
 const out:string[][]=[];let row:string[]=[],value='',quoted=false,closed=false;
 const field=()=>{row.push(value.trim());value='';closed=false;};const line=()=>{field();if(row.some(Boolean))out.push(row);row=[];};
 for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'&&text[i+1]==='"'){value+='"';i++;}else if(c==='"'){quoted=false;closed=true;}else value+=c;continue;}
  if(c===','||c==='\n'||c==='\r'){if(c===',')field();else{line();if(c==='\r'&&text[i+1]==='\n')i++;}continue;}
  if(c==='"'){if(value||closed)throw Error('Invalid CSV quoting. Export the spreadsheet as CSV and try again.');quoted=true;}else{if(closed&&c.trim())throw Error('Unexpected text after a quoted CSV field.');if(!closed)value+=c;}
 }
 if(quoted)throw Error('A quoted CSV field is not closed.');if(value||row.length||closed)line();return out;
}
/** Imports never write, publish or change identity; all rows join the existing confirmation flow. */
export function importOrganizationProgramme(text:string,org:ManagementOrganization,entities:readonly DiscoveryEntity[],draft:readonly OrganizationChange[],newId:()=>string=()=>crypto.randomUUID()):OrganizationChange[]{
 if(new TextEncoder().encode(text).length>500000)throw Error('Keep the CSV below 500 KB.');
 const parsed=rows(text.replace(/^\uFEFF/,'')),headers=parsed.shift()?.map(h=>h.toLowerCase());
 if(!headers||new Set(headers).size!==headers.length||headers.some(h=>!columns.has(h))||['title','start','end','address'].some(h=>!headers.includes(h)))throw Error('Use unique CSV columns title, start, end and address; optional columns are venue, summary, description, pricing and tickets. Images and identity fields cannot be imported.');
 if(!parsed.length||parsed.length+draft.length>MAX_ORGANIZATION_CHANGES)throw Error(`Include 1–${MAX_ORGANIZATION_CHANGES-draft.length} events in this draft.`);
 const existing=new Set(entities.filter(e=>e.kind==='event'&&e.organizerEntityId===org.id).map(e=>`${e.title.trim().toLowerCase()}|${Date.parse((e as any).start)}`));
 for(const op of draft.filter(op=>op.action==='add'))existing.add(`${String(op.changes.title??'').trim().toLowerCase()}|${Date.parse(String(op.changes.start))}`);
 const operations=parsed.map((row,i)=>{
  if(row.length!==headers.length)throw Error(`CSV row ${i+2}: the number of fields does not match the header.`);
  const fields=Object.fromEntries(headers.map((h,n)=>[h,row[n]]));
  if(['title','start','end','address'].some(h=>!fields[h]))throw Error(`CSV row ${i+2}: title, start, end and address are required.`);
  const start=ownerInstant(fields.start),end=ownerInstant(fields.end),key=`${fields.title.toLowerCase()}|${Date.parse(start)}`;
  if(existing.has(key))throw Error(`CSV row ${i+2}: this title and start time already exist in your programme or draft.`);existing.add(key);
  const changes={...Object.fromEntries(Object.entries(fields).filter(([,v])=>Boolean(v))),start,end,pricing:fields.pricing||'unknown'};
  return {entityId:`${org.id}-event-${newId()}`,action:'add' as const,changes};
 });
 prepareOrganizationBatch(org,entities,operations,Date.now());return operations;
}
