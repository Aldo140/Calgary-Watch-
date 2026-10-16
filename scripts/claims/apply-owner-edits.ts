import { appendFileSync, readFileSync } from 'node:fs';
import { inventoryDatabase } from '../discovery/firebase';
import { ownerPublicationRetryDelay, applyOwnerOccurrences, OWNER_BUSINESS_LIMITS, ownerBusinessId, nextOwnerEditAt, OWNER_CONTENT, OWNER_EDITS, OWNER_LIMITS, ownerEditPatch, ownerEditTargets, type OwnerEdit } from '../../src/lib/ownerListingEdits';
import type { MarketOccurrence, DiscoveryEntity } from '../../src/types/discovery';
import { isQuotaExhausted } from '../lib/quota';

export class InvalidOwnerEdit extends Error {}
/** Callable by tests with an atomic in-memory adapter; never sends email. */
export async function applyOwnerEdit(db: any, id: string, entities: readonly DiscoveryEntity[], now=Date.now(),occurrences:readonly MarketOccurrence[]=[]) {
  const editRef=db.collection(OWNER_EDITS).doc(id);
  return db.runTransaction(async (tx:any)=>{
    const snapshot=await tx.get(editRef); const edit=snapshot.data() as OwnerEdit|undefined;
    if(!edit||edit.status!=='queued')return false;
    const claimRef=db.collection('listing_claims').doc(`${edit.uid}_${edit.rootId}`);
    const contentRef=db.collection(OWNER_CONTENT).doc(edit.entityId);
    const rateRef=db.collection(OWNER_LIMITS).doc(edit.rootId);
    const [claimDoc,content,rate]=await Promise.all([tx.get(claimRef),tx.get(contentRef),tx.get(rateRef)]);
    const claim=claimDoc.data();
    if(!claim||claim.status!=='approved'||claim.uid!==edit.uid||claim.entityId!==edit.rootId)throw new InvalidOwnerEdit('Your claim is no longer approved.');
    if(rate.data()?.editId!==id||rate.data()?.uid!==edit.uid)throw new InvalidOwnerEdit('This update has been superseded.');
    const target=ownerEditTargets(edit.rootId,entities).find(e=>e.id===edit.entityId);
    if(!target)throw new InvalidOwnerEdit('This published listing is not owned by the claimed business.');
    // Direct event claimants and organization representatives share one canonical business allowance.
    const businessRateRef=db.collection(OWNER_BUSINESS_LIMITS).doc(ownerBusinessId(target,edit.rootId));
    const businessRate=(await tx.get(businessRateRef)).data();
    const submitted=typeof edit.createdAt==='number'?edit.createdAt:(edit.createdAt as {toMillis?:()=>number;seconds?:number})?.toMillis?.()??((edit.createdAt as {seconds?:number})?.seconds??0)*1000;
    if(!submitted)throw new InvalidOwnerEdit('This update is missing a server submission time.');
    if(submitted<nextOwnerEditAt(businessRate?.lastSubmittedAt??0))throw new InvalidOwnerEdit(`This business has used its weekly update. The next save is available ${new Date(nextOwnerEditAt(businessRate.lastSubmittedAt)).toISOString()}.`);
    const previous=content.data();
    if(previous&&previous.rootId!==ownerBusinessId(target,edit.rootId))throw new InvalidOwnerEdit('This listing is managed through a different organization profile. Contact CalgaryWatch.');
    const base={...target,...previous?.changes} as DiscoveryEntity;
    let patch:Record<string,unknown>;
    try {patch=ownerEditPatch(base,edit.changes);if(patch.occurrences)applyOwnerOccurrences(occurrences,[{entityId:target.id,changes:patch}],true);}catch(error){throw new InvalidOwnerEdit(error instanceof Error?error.message:'Invalid changes.');}
    const before=Object.fromEntries(Object.keys(patch).map(key=>[key,(base as unknown as Record<string,unknown>)[key]??null]));
    tx.set(businessRateRef,{lastSubmittedAt:submitted});
    tx.set(contentRef,{rootId:ownerBusinessId(target,edit.rootId),entityId:edit.entityId,changes:{...previous?.changes,...patch},appliedAt:now});
    tx.update(editRef,{status:'applied',appliedAt:now,entityTitle:target.title,before,after:patch,notificationPending:true,publicationPending:true,publicationAttempts:1,nextPublicationAttemptAt:now+ownerPublicationRetryDelay(1)});
    return true;
  },{maxAttempts:1});
}
export async function failOwnerEdit(db:any,id:string,message:string) {
  const ref=db.collection(OWNER_EDITS).doc(id);
  await db.runTransaction(async(tx:any)=>{
    const edit=(await tx.get(ref)).data(); if(!edit||edit.status!=='queued')return;
    const rateRef=db.collection(OWNER_LIMITS).doc(edit.rootId);const rate=await tx.get(rateRef);
    tx.update(ref,{status:'failed',error:message.slice(0,500),notificationPending:true});
    // Invalid input must not consume the allowance; never unlock a newer operation.
    if(rate.data()?.editId===id)tx.delete(rateRef);
  },{maxAttempts:1});
}
async function run() {
  if(!process.env.FIREBASE_SERVICE_ACCOUNT)throw Error('FIREBASE_SERVICE_ACCOUNT is required; no owner edits applied.');
  const db=inventoryDatabase();
  const [pending,unpublished]=await Promise.all([db.collection(OWNER_EDITS).where('status','==','queued').limit(50).get(),db.collection(OWNER_EDITS).where('nextPublicationAttemptAt','<=',Date.now()).limit(100).get()]);
  let retryPublication=false;
  for(const snapshot of unpublished.docs) {
    const retry=await db.runTransaction(async tx=>{
      const fresh=(await tx.get(snapshot.ref)).data();
      if(!fresh?.publicationPending||(fresh.nextPublicationAttemptAt??0)>Date.now())return false;
      const attempt=(fresh.publicationAttempts??1)+1;
      const warning=attempt>=3?'Publishing has not been confirmed yet. Automatic retries are slowing down; inspect Hosting runs.':'';
      tx.update(snapshot.ref,{publicationAttempts:attempt,nextPublicationAttemptAt:Date.now()+ownerPublicationRetryDelay(attempt),...(warning?{publicationWarning:warning,notificationPending:true}:{})});
      return true;
    },{maxAttempts:1});
    retryPublication=retryPublication||retry;
  }
  let applied=0;
  if(pending.size) {
    // Export only when there is work: avoids a full snapshot read every idle quarter-hour.
    await import('../discovery/export');
    const {entities,occurrences}=JSON.parse(readFileSync('src/generated/discovery-index.json','utf8')) as {entities:DiscoveryEntity[];occurrences:MarketOccurrence[]};
    for(const doc of pending.docs) {
      try {if(await applyOwnerEdit(db,doc.id,entities,Date.now(),occurrences))applied++;}
      catch(error) {
        if(isQuotaExhausted(error))throw error;
        if(!(error instanceof InvalidOwnerEdit))throw error;
        await failOwnerEdit(db,doc.id,error.message);
        console.error(`[owner-edits] ${doc.id}: ${error.message}`);
      }
    }
  }
  console.log(`[owner-edits] ${applied} automatically applied; ${pending.size} examined. No email sent.`);
  if(process.env.GITHUB_OUTPUT)appendFileSync(process.env.GITHUB_OUTPUT,`applied=${applied}\npublish=${applied>0||retryPublication}\n`);
}
if(process.argv[1]?.endsWith('apply-owner-edits.ts'))run().catch(error=>{console.error('[owner-edits] stopped:',error instanceof Error?error.message:String(error));process.exitCode=1;});
