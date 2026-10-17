import type {Firestore} from 'firebase-admin/firestore';
import {isApprovedAdminEmail} from '../../src/constants/admin';
import {claimApprovalWrites} from '../../src/lib/claimApproval';
import {businessAccountPatch} from '../../src/lib/businessAccount';
import {claimId,type ListingClaim} from '../../src/lib/claims';
import {ORGANIZATION_CATALOG,ORGANIZATION_LIVE} from '../../src/lib/organizationWorkspace';
import {OWNER_BUSINESS_LIMITS,OWNER_LIMITS,OWNER_EDITS} from '../../src/lib/ownerListingEdits';
/**
 * Approval and expansion must not strand events in a former one-off workspace.
 * `options.system` is for trusted server scripts only (promote-organizer-claims.ts);
 * the callable never passes it.
 */
export async function approveOrganizationClaim(db:Firestore,actorUid:string,input:{uid:string;entityId:string;organizationId?:string;confirmSharedAccess?:boolean},identity:{email?:string;emailVerified?:boolean}={},now=Date.now(),options:{system?:boolean}={}){
 if(!input||typeof input.uid!=='string'||!input.uid||input.uid.includes('/')||input.uid.length>128||typeof input.entityId!=='string'||! /^[a-z0-9-]{1,120}$/.test(input.entityId)||input.organizationId!==undefined&&(typeof input.organizationId!=='string'||! /^[a-z0-9-]{1,120}$/.test(input.organizationId)))throw Error('Invalid approval.');
 return db.runTransaction(async tx=>{
  const claimRef=db.collection('listing_claims').doc(claimId(input.uid,input.entityId)),accountRef=db.collection('users').doc(input.uid);
  const [actor,claimSnapshot,account,source]=await Promise.all([tx.get(db.collection('users').doc(actorUid)),tx.get(claimRef),tx.get(accountRef),tx.get(db.collection(ORGANIZATION_CATALOG).doc(input.entityId))]);
  if(!(options.system===true||actor.get('role')==='admin'||identity.emailVerified===true&&isApprovedAdminEmail(identity.email)))throw Error('Administrator access required.');
  if(!claimSnapshot.exists)throw Error('The claim no longer exists.');
  const c=claimSnapshot.data() as ListingClaim;
  if(c.uid!==input.uid||c.entityId!==input.entityId)throw Error('Claim identity does not match.');
  const seed=source.data()?.entity;if(!seed||seed.id!==c.entityId||seed.status!=='published'||seed.developmentOnly||!['business','event','market'].includes(seed.kind))throw Error('Synchronize the published organization catalogue before approving.');
  const writes=claimApprovalWrites(c,account.data(),identity.email||actorUid,now);
  const organizationId=input.organizationId??c.approvedOrganizationId??(seed.kind==='business'?seed.id:undefined);
  if(seed.kind==='business'&&organizationId!==seed.id)throw Error('A business profile must manage its own organization.');
  const organization=organizationId?await tx.get(db.collection(ORGANIZATION_CATALOG).doc(organizationId)):undefined;
  if(organizationId&&(organization?.data()?.entity.kind!=='business'||organization.data()?.entity.id!==organizationId||organization.data()?.entity.status!=='published'||organization.data()?.entity.developmentOnly))throw Error('Select a published organization profile.');
  const privateId=`org-${c.entityId}`,expand=Boolean(organizationId&&seed.kind!=='business');
  const [privateRows,original,pending,representatives]=expand?await Promise.all([tx.get(db.collection(ORGANIZATION_LIVE).where('organizationId','==',privateId).limit(101)),tx.get(db.collection(ORGANIZATION_LIVE).doc(c.entityId)),tx.get(db.collection(OWNER_EDITS).where('status','==','queued').limit(101)),tx.get(db.collection('listing_claims').where('entityId','==',c.entityId).where('status','==','approved').limit(101))]):[undefined,undefined,undefined,undefined];
  if(privateRows?.size===101||pending?.size===101||representatives?.size===101)throw Error('This migration exceeds the safe transaction limit. Contact CalgaryWatch before changing access.');
  const peers=(representatives?.docs??[]).filter(d=>d.get('uid')!==c.uid);
  if(peers.length&&input.confirmSharedAccess!==true)throw Error('Confirm shared organization access for the existing approved representatives before moving this workspace.');
  if(peers.some(d=>d.get('approvedOrganizationId')&&d.get('approvedOrganizationId')!==organizationId))throw Error('Another representative has conflicting organization access. Resolve that approval before migrating.');
  const peerAccounts=await Promise.all(peers.map(async peer=>({claim:peer,profile:await tx.get(db.collection('users').doc(peer.get('uid')))})));
  for(const peer of peerAccounts)if(peer.profile.get('uid')!==peer.claim.get('uid'))throw Error('An existing representative has no matching account. Repair that account before migrating.');
  const moved=new Map((privateRows?.docs??[]).map(d=>[d.id,d.data()]));
  if(expand)moved.set(c.entityId,original?.exists?original.data()!:{entityId:c.entityId,entity:seed,changes:{},deleted:false});
  const rateIds=[...new Set([c.entityId,privateId,seed.organizerEntityId,organizationId].filter((id):id is string=>Boolean(id)))];
  const rates=expand?await Promise.all(rateIds.map(async id=>({id,rate:await tx.get(db.collection(OWNER_BUSINESS_LIMITS).doc(id)),reservation:await tx.get(db.collection(OWNER_LIMITS).doc(id))}))):[];
  const conflicts=(pending?.docs??[]).filter(d=>[c.entityId,privateId].includes(d.get('rootId'))||moved.has(d.get('entityId')));
  // All reads precede all writes, including reservations and historical workspace projections.
  if(organizationId){
   if(seed.kind!=='business')Object.assign(writes.claim,{approvedOrganizationId:organizationId});
   writes.account=businessAccountPatch({...account.data(),...writes.account},organizationId,writes.account.businessSince);
   tx.set(db.collection('organization_managers').doc(`${c.uid}_${organizationId}`),{uid:c.uid,organizationId,claimId:claimId(c.uid,c.entityId),grantedAt:now});
   if(organizationId!==c.entityId)tx.set(db.collection('verified_listings').doc(organizationId),{...writes.mark,entityId:organizationId,title:organization!.data()!.entity.title,organizationId});
  }
  const accounts=peerAccounts.map(({claim:peer,profile})=>{const original=claimApprovalWrites(peer.data() as ListingClaim,profile.data(),identity.email||actorUid,now).account;return {uid:peer.get('uid') as string,account:businessAccountPatch({...profile.data(),...original},organizationId!,original.businessSince)};});
  for(const peer of peers){tx.update(db.collection('listing_claims').doc(peer.id),{approvedOrganizationId:organizationId});tx.set(db.collection('organization_managers').doc(`${peer.get('uid')}_${organizationId}`),{uid:peer.get('uid'),organizationId,claimId:peer.id,grantedAt:now});}
  for(const peer of accounts)tx.update(db.collection('users').doc(peer.uid),peer.account);
  tx.update(claimRef,writes.claim);tx.update(accountRef,writes.account);tx.set(db.collection('verified_listings').doc(c.entityId),writes.mark);
  for(const [id,row] of moved){
   const entity={...row.entity,organizerEntityId:organizationId,ownerVerifiedAt:row.entity.ownerVerifiedAt||new Date(writes.mark.verifiedAt||now).toISOString(),updatedAt:new Date(now).toISOString()};
   tx.set(db.collection(ORGANIZATION_LIVE).doc(id),{...row,entity,organizationId,workspaceAssociationConfirmed:true,submittedByAdmin:true,updatedAt:now,batchId:`approval-${claimId(c.uid,c.entityId)}-${now}`});
  }
  if(expand){
   const latest=Math.max(0,...rates.map(({rate,reservation})=>Math.max(Number(rate.get('lastSubmittedAt')??0),reservation.get('lastSubmittedAt')?.toMillis?.()??0)));
   const canonical=rates.find(r=>r.id===organizationId);
   if(latest>Number(canonical?.rate.get('lastSubmittedAt')??0))tx.set(db.collection(OWNER_BUSINESS_LIMITS).doc(organizationId!),{lastSubmittedAt:latest,editId:canonical?.rate.get('editId')??`approval-${now}`});
   for(const queued of conflicts){tx.update(queued.ref??db.collection(OWNER_EDITS).doc(queued.id),{status:'failed',error:'Organization access was expanded. Include these changes in the organization workspace.',notificationPending:true,supersededBy:actorUid});const old=rates.find(r=>r.id===queued.get('rootId'));if(old?.reservation.get('editId')===queued.id)tx.delete(db.collection(OWNER_LIMITS).doc(old.id));}
   tx.set(db.collection('organization_access_changes').doc(),{actorUid,uid:c.uid,claimId:claimId(c.uid,c.entityId),from:privateId,to:organizationId,movedEntityIds:[...moved.keys()],representativeUids:[c.uid,...peers.map(p=>p.get('uid'))],createdAt:now});
  }
  return {account:writes.account,accounts,moved:moved.size};
 },{maxAttempts:1});
}
