import {createHash} from 'node:crypto';
import {ownerInstant} from '../../src/lib/ownerListingEdits';
import {marketOpeningDates} from '../../src/lib/marketOpeningDates';
import type {InventorySubmissionInput} from '../../src/types/discovery';
export const APPROVED_PROGRAMME_TITLES = ['FunnyFest Halloween Comedy and Dance Party','Halloween Comedy Extravaganza by FunnyFest - Saturday, October 31 @ 7 PM','Stand Up Comedy Workshop - Weekly Course - Tuesdays Calgary - YYC','Festive Foothills Art Market'] as const;
const stable=(value:unknown):unknown=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,stable(v)])):value;
export const submissionFingerprint=(input:unknown)=>createHash('sha256').update(JSON.stringify(stable(input))).digest('hex');
export type RecoverySubmission={id:string;input:InventorySubmissionInput;createdAt:string};
export function approvedProgrammePlan(submissions:readonly RecoverySubmission[]) {
 const selected=submissions.filter(s=>(APPROVED_PROGRAMME_TITLES as readonly string[]).includes(s.input.title));
 const halloween=selected.filter(s=>s.input.sourceUrl==='https://funnyfest-comedy-halloween-show-calgary-yyc.eventbrite.ca').sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
 const workshop=selected.find(s=>s.input.title===APPROVED_PROGRAMME_TITLES[2]);
 const market=selected.find(s=>s.input.title===APPROVED_PROGRAMME_TITLES[3]);
 const groups:Array<{submissionIds:string[];organizationId:string;records:Array<{recordId:string;input:InventorySubmissionInput}>}>=[];
 if(halloween.length){
  const newest=halloween.at(-1)!.input;
  if(newest.kind!=='event'||newest.start!=='2026-11-01T01:00:00.000Z')throw Error('Halloween submission dates changed; review again.');
  groups.push({submissionIds:halloween.map(s=>s.id),organizationId:'biz-funnyfest',records:[{recordId:`submission-${halloween[0].id}`,input:{...newest,title:'FunnyFest Halloween Comedy and Dance Party',organizer:'FunnyFest Calgary Comedy Festival',venue:'Offside Pub',address:'2820 Centre Street North, Calgary, AB T2E 2V8',summary:'Three comedians, a DJ dance party and costume prizes at Offside Pub on Halloween.',description:'FunnyFest presents a Halloween comedy and dance party at Offside Pub on October 31, 2026. The comedy show starts at 7 p.m., followed by a DJ dance party at 9 p.m. The organizer advertises three comedians and costume prizes.\n\nThe latest organizer submission lists the evening ending at 11:30 p.m. Check the official Eventbrite page for current ticket prices, entry details and any schedule changes.',start:ownerInstant('2026-10-31T19:00'),end:ownerInstant('2026-10-31T23:30'),tickets:newest.sourceUrl,categories:['arts','comedy'],tags:['Halloween','comedy','dance'],pricing:'paid'}}]});
 }
 if(workshop){
  if(workshop.input.kind!=='event'||workshop.input.sourceUrl!=='https://funnyfest-stand-up-comedy-workshop-tuesdays-calgary-yyc.eventbrite.ca')throw Error('Workshop source changed; review again.');
  groups.push({submissionIds:[workshop.id],organizationId:'biz-funnyfest',records:Array.from({length:6},(_,i)=>{
   const day=new Date(Date.parse('2026-10-27T12:00:00Z')+i*7*86400000).toISOString().slice(0,10);
   return {recordId:`submission-${workshop.id}${i?`-${day}`:''}`,input:{...workshop.input,kind:'event' as const,title:`FunnyFest Stand Up Comedy Workshop — class ${i+1} of 6`,organizer:'FunnyFest Calgary Comedy Festival',venue:'Capitol Hill Community Association',address:'1531 21 Avenue NW, Calgary, AB T2M 1L9',summary:`Class ${i+1} of FunnyFest’s six-week Tuesday evening stand-up and comedy-writing course.`,description:`FunnyFest’s six-class stand-up comedy and writing course meets Tuesdays, 7–9 p.m., from October 27 through December 1, 2026 at Capitol Hill Community Association. This listing is class ${i+1}, on ${day}, rather than a continuously running six-week event.\n\nThe course covers joke writing, performance and applying comedy techniques in a supportive group setting. Registration is for the course; check the official Eventbrite page for availability, current fees and attendance requirements. A graduation showcase is mentioned by the organizer, but no separate showcase date is published here.`,start:ownerInstant(day+'T19:00'),end:ownerInstant(day+'T21:00'),tickets:workshop.input.sourceUrl,categories:['arts','comedy','learning'],tags:['workshop','stand-up comedy','comedy writing'],pricing:'paid' as const}};
  })});
 }
 if(market){
  if(market.input.kind!=='market'||market.input.sourceUrl!=='https://leightoncentre.org/event/festive-foothills-art-market-2026/')throw Error('Market source changed; review again.');
  groups.push({submissionIds:[market.id],organizationId:'biz-leighton-art-centre',records:[{recordId:`submission-${market.id}`,input:{...market.input,organizer:'Leighton Art Centre',venue:'Leighton Art Centre',categories:['markets','arts','shopping','day-trip'],tags:['outside-calgary','holiday market','local art'],occurrences:[{sourceRecordId:'preview-2026-11-06',start:ownerInstant('2026-11-06T15:00'),end:ownerInstant('2026-11-06T18:00'),cancelled:false},...marketOpeningDates('2026-11-07','2026-12-20','10:00','16:00',[0,1,2,3,4,5,6])]}}]});
 }
 return groups;
}
