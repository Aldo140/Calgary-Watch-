import { readFileSync } from 'node:fs';
import { inventoryDatabase } from '../discovery/firebase';
import { OWNER_EDITS } from '../../src/lib/ownerListingEdits';
import type { DiscoveryEntity } from '../../src/types/discovery';
/** Run only AFTER successful Hosting deployment, against that build's exported index. */
export async function acknowledgeOwnerPublication(db:any, entities:readonly DiscoveryEntity[], now=Date.now()) {
  const pending=await db.collection(OWNER_EDITS).where('publicationPending','==',true).limit(100).get();
  const versions=new Map(entities.filter(e=>e.ownerContentAppliedAt).map(e=>[e.id,e.ownerContentAppliedAt!]));
  let acknowledged=0;
  for(const snapshot of pending.docs) {
    await db.runTransaction(async(tx:any)=>{
      const current=await tx.get(snapshot.ref), edit=current.data();
      if(edit?.status!=='applied'||!edit.publicationPending||(versions.get(edit.entityId)??0)<edit.appliedAt)return;
      tx.update(snapshot.ref,{publicationPending:false,publishedAt:now,publicationWarning:'',nextPublicationAttemptAt:Number.MAX_SAFE_INTEGER});acknowledged++;
    },{maxAttempts:1});
  }
  return acknowledged;
}
if(process.argv[1]?.endsWith('ack-owner-publication.ts')) {
  if(!process.env.FIREBASE_SERVICE_ACCOUNT)throw Error('Firebase credentials required to acknowledge owner publication.');
  const {entities}=JSON.parse(readFileSync('src/generated/discovery-index.json','utf8'));
  acknowledgeOwnerPublication(inventoryDatabase(),entities).then(n=>console.log(`[owner-edits] ${n} updates confirmed published.`)).catch(error=>{console.error('[owner-edits] Publication acknowledgement failed; next publisher will retry:',error instanceof Error?error.message:String(error));process.exitCode=1;});
}
