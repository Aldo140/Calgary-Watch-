/** Narrow owner-approved recovery; never processes unrelated queue actions or sends email. */
import {inventoryDatabase} from './firebase';
import {approvedProgrammePlan,submissionFingerprint} from './approvedProgrammeRecovery';
import store from '../../functions/discovery-store.cjs';
import domain from '../../functions/discovery-domain.cjs';
import type {InventorySubmissionInput} from '../../src/types/discovery';
const APPROVED_FINGERPRINTS:readonly string[]=["7467f136216de15fc243ca01f917b8e630d735224055a2db08b3e23cad8b9ba4","ec2c5d2dd6b79796c2285d9189c124e85b30d6a3b580dc44a4c175ab0e600306", "5116771d4c5520ebb53963b51db2babccba2fb5eb7e5c316818f7494ec4324b0", "5a0183724f6029013ced27e2f8e40fff415adcc6368a93d79055bb418a9d7b6d", "eb8442c1a523a6780ad61570a3cb7b57ce71aa152bdcb52257ae3e7471b0d452"];
const RUN='approved-programmes-2026-10-22';
const urls=['https://funnyfest-comedy-workshop-weekend-calgary-yyc.eventbrite.ca/?discount=100off','https://funnyfest-comedy-halloween-show-calgary-yyc.eventbrite.ca','https://funnyfest-stand-up-comedy-workshop-tuesdays-calgary-yyc.eventbrite.ca','https://leightoncentre.org/event/festive-foothills-art-market-2026/'];
const db=inventoryDatabase(),apply=process.env.CONFIRM_APPROVED_PROGRAMMES==='APPLY';
const snapshot=await db.collection('entity_submissions').where('input.sourceUrl','in',urls).limit(50).get();
const selected=snapshot.docs.filter(doc=>APPROVED_FINGERPRINTS.includes(submissionFingerprint(doc.get('input'))));
if(selected.some(doc=>!['pending','approved'].includes(doc.get('status'))))throw Error('A reviewed submission changed status; audit again.');
if(selected.length!==5)throw Error('The five reviewed submissions could not be matched unchanged. Run a new private audit.');
const rows=selected.map(doc=>({id:doc.id,input:doc.get('input') as InventorySubmissionInput,createdAt:String(doc.get('createdAt'))}));
const groups=approvedProgrammePlan(rows);
for(const group of groups)for(const record of group.records)domain.validateSubmission(record.input);
console.log(JSON.stringify({mode:apply?'apply':'dry-run',submissions:selected.length,programmes:groups.length,listings:groups.reduce((n,g)=>n+g.records.length,0),marketOpenings:groups.flatMap(g=>g.records).reduce((n,r)=>n+(r.input.kind==='market'?r.input.occurrences.length:0),0)}));
if(!apply)process.exit(0);
for(const group of groups){
 const docs=group.submissionIds.map(id=>selected.find(doc=>doc.id===id)!);
 if(docs.every(doc=>doc.get('status')==='approved'&&doc.get('publicationRecovery')===RUN)){console.log('Already recovered: '+group.records[0].input.title);continue;}
 const published:string[]=[];
 for(const record of group.records){
  const url=new URL(record.input.sourceUrl);
  const source={id:`reviewed-${domain.hash(url.origin).slice(0,20)}`,name:record.input.organizer+' — reviewed official source',approved:true,kind:'official',hosts:[url.hostname]};
  await db.collection('discovery_sources').doc(source.id).set(source);
  const result=await store.ingestRecord(db,record.input,source,record.recordId);
  const collection=record.input.kind==='event'?'events':'markets';
  // Only exact official-source duplicates for this same performance may be consolidated.
  const duplicatesToArchive=[];
  for(const id of result.duplicateIds??[]){
   if(id===result.id)continue;
   const ref=db.collection(collection).doc(id),duplicate=(await ref.get()).data();
   if(!duplicate)throw Error('Duplicate record disappeared; review again.');
   const sameSource=duplicate.sources?.some((s:any)=>s.kind==='official'&&s.url===record.input.sourceUrl);
   const sameDate=record.input.kind==='market'||Date.parse(duplicate.start)===Date.parse(record.input.start);
   if(!sameSource||!sameDate)throw Error('An unreviewed duplicate needs a separate decision.');
   duplicatesToArchive.push(ref);
  }
  await store.moderate(db,{kind:record.input.kind,id:result.id,revision:result.revision,action:'publish',acknowledgeDuplicates:(result.duplicateIds?.length??0)>0},RUN);
  for(const ref of duplicatesToArchive)await ref.update({status:'archived',canonicalEntityId:result.id,updatedAt:new Date().toISOString(),archivedBy:RUN});
  await db.collection(collection).doc(result.id).update({organizerEntityId:group.organizationId});
  published.push(result.id);
 }
 // Mark suggestions reviewed only after every class or market opening was published.
 const batch=db.batch();
 for(const doc of docs)batch.update(doc.ref,{status:'approved',entityId:published[0],publishedEntityIds:published,reviewedBy:RUN,reviewedAt:Date.now(),publicationRecovery:RUN});
 await batch.commit();
 // Resolve only stale failures belonging to these exact reviewed suggestions.
 const failed=await db.collection('discovery_actions').where('status','==','failed').limit(100).get();
 for(const doc of failed.docs)if(group.submissionIds.includes(doc.get('action')?.id))await doc.ref.update({status:'applied',appliedAt:Date.now(),result:{stage:'verified',entityId:published[0],recoveredBy:RUN}});
 console.log(JSON.stringify({title:group.records[0].input.title,organizationId:group.organizationId,publishedEntityIds:published,submissionsResolved:docs.length}));
}
