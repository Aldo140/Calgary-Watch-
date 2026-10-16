import {createHash} from 'node:crypto';
import { ORGANIZATION_CATALOG, ORGANIZATION_LIVE, mergeOrganizationContent, prepareOrganizationBatch, organizationNextAt, type OrganizationChange } from '../../src/lib/organizationWorkspace';
import { OWNER_EDITS, OWNER_LIMITS, OWNER_BUSINESS_LIMITS, OWNER_CONTENT, applyOwnerOccurrences } from '../../src/lib/ownerListingEdits';
import type { Firestore } from 'firebase-admin/firestore';
import type { Business, DiscoveryEntity } from '../../src/types/discovery';
/** Authenticated callable boundary. Every authority, allowance, projection and audit commits together. */
export async function submitOrganizationBatch(db:Firestore,uid:string,input:{organizationId:string;requestId:string;operations:OrganizationChange[]},now=Date.now()){
  if(!input||typeof input.organizationId!=='string'||!/^biz-[a-z0-9-]{1,100}$/.test(input.organizationId)||typeof input.requestId!=='string'||! /^[a-f0-9-]{36}$/.test(input.requestId)||!Array.isArray(input.operations)||!input.operations.length||input.operations.length>25)throw Error('Invalid organization submission.');
  const requestHash=createHash('sha256').update(JSON.stringify(input.operations)).digest('hex');
  const orgId=input.organizationId,receipt=db.collection(OWNER_EDITS).doc(input.requestId);
  return db.runTransaction(async tx=>{
    const [old,claims,catalog,rate,reservation,orgLive,orgLegacy]=await Promise.all([tx.get(receipt),tx.get(db.collection('listing_claims').where('uid','==',uid)),tx.get(db.collection(ORGANIZATION_CATALOG).doc(orgId)),tx.get(db.collection(OWNER_BUSINESS_LIMITS).doc(orgId)),tx.get(db.collection(OWNER_LIMITS).doc(orgId)),tx.get(db.collection(ORGANIZATION_LIVE).doc(orgId)),tx.get(db.collection(OWNER_CONTENT).doc(orgId))]);
    if(!claims.docs.some(d=>{const c=d.data();return c.status==='approved'&&(c.entityId===orgId||c.approvedOrganizationId===orgId);} ))throw Error('Your organization management access has not been confirmed.');
    if(old.exists){if(old.get('uid')!==uid||old.get('rootId')!==orgId||old.get('requestHash')!==requestHash)throw Error('Invalid save identifier.');return {publishedAt:old.get('publishedAt'),nextAt:organizationNextAt(old.get('appliedAt'))};}
    const org=(catalog.exists?(orgLive.exists?mergeOrganizationContent([catalog.data()?.entity],[{...orgLive.data(),deleted:false} as any])[0]:{...catalog.data()?.entity,...orgLegacy.data()?.changes}):undefined) as Business|undefined;if(org?.kind!=='business'||org.id!==orgId)throw Error('Organization catalogue is not ready. Contact CalgaryWatch.');
    const reserved=reservation.data()?.lastSubmittedAt?.toMillis?.()??0;
    if(Math.max(organizationNextAt(rate.data()?.lastSubmittedAt??0),organizationNextAt(reserved))>now)throw Error('This business has already used its submission. Wait seven complete days.');
    const entities:DiscoveryEntity[]=[org];
    const datesById=new Map<string,import('../../src/types/discovery').MarketOccurrence[]>();
    const liveById=new Map<string,any>();
    const snapshots=await Promise.all(input.operations.map(async op=>{
      if(!op||typeof op.entityId!=='string'||! /^[a-z0-9-]{1,150}$/.test(op.entityId))throw Error('Invalid listing identifier.');
      const [live,base,legacy]=await Promise.all([tx.get(db.collection(ORGANIZATION_LIVE).doc(op.entityId)),tx.get(db.collection(ORGANIZATION_CATALOG).doc(op.entityId)),tx.get(db.collection(OWNER_CONTENT).doc(op.entityId))]);
      liveById.set(op.entityId,live.data());
      const canonical=base.data()?.entity;
      if(canonical&&canonical.id!==orgId&&canonical.organizerEntityId!==orgId)throw Error('This listing is outside your approved organization.');
      datesById.set(op.entityId,live.data()?.occurrences??base.data()?.occurrences??[]);
      const entity=(live.exists&&canonical?mergeOrganizationContent([canonical],[{...live.data(),deleted:false} as any])[0]:live.data()?.entity??canonical) as DiscoveryEntity|undefined;
      return entity?{...entity,...(!live.exists?legacy.data()?.changes??{}:{})} as DiscoveryEntity:undefined;
    }));
    for(const entity of snapshots)if(entity&&entity.id!==orgId)entities.push(entity);else if(entity?.id===orgId)entities[0]=entity;
    const prepared=prepareOrganizationBatch(entities[0] as Business,entities,input.operations,now);
    // Block an old queued save for any touched target: never let the scheduled publisher overwrite a live submission.
    const pending=await tx.get(db.collection(OWNER_EDITS).where('status','==','queued').limit(100));
    const related=pending.size?await tx.get(db.collection(ORGANIZATION_CATALOG).where('entity.organizerEntityId','==',orgId).limit(1000)):undefined;
    const organizationIds=new Set([orgId,...(related?.docs.map(d=>d.id)??[])]);
    if(pending.size===100||related?.size===1000||pending.docs.some(d=>organizationIds.has(d.get('rootId'))||organizationIds.has(d.get('entityId'))||prepared.some(p=>p.entity.id===d.get('entityId'))))throw Error('A previous save is still publishing. Wait for it to finish before submitting again.');
    for(const p of prepared)tx.set(db.collection(ORGANIZATION_LIVE).doc(p.entity.id),{...(p.entity.kind==='market'?{occurrences:applyOwnerOccurrences(datesById.get(p.entity.id)??[],[{entityId:p.entity.id,changes:p.operation.changes}],true)}:{}),changes:{...liveById.get(p.entity.id)?.changes,...(p.deleted?{}:p.operation.changes)},entityId:p.entity.id,organizationId:orgId,entity:p.entity,deleted:p.deleted,updatedAt:now,batchId:input.requestId});
    tx.set(db.collection(OWNER_BUSINESS_LIMITS).doc(orgId),{lastSubmittedAt:now,editId:input.requestId});
    const audit=(p:typeof prepared[number],before:boolean)=>{const entity=before?p.before:p.deleted?null:p.entity;if(!entity)return null;return {entityId:entity.id,title:entity.title,fields:Object.fromEntries(Object.keys(p.operation.changes).map(field=>[field,field==='occurrences'?(before?datesById.get(entity.id)??[]:p.operation.changes.occurrences):(entity as unknown as Record<string,unknown>)[field]??null]))};};
    tx.create(receipt,{requestHash,uid,rootId:orgId,entityId:orgId,entityTitle:org.title,changes:{listings:input.operations.map(o=>({entityId:o.entityId,action:o.action}))},before:{listings:prepared.map(p=>audit(p,true))},after:{listings:prepared.map(p=>audit(p,false))},status:'applied',createdAt:new Date(now),appliedAt:now,publishedAt:now,notificationPending:true,publicationPending:false,live:true});
    return {publishedAt:now,nextAt:organizationNextAt(now)};
  },{maxAttempts:1});
}
