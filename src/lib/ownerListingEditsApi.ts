import {ORGANIZATION_LIVE,type OrganizationProjection} from './organizationWorkspace';
import { calgaryDateTimeFormat } from './calgaryTz';
import { collection, doc, getDoc, getDocs, limit, query, runTransaction, serverTimestamp, where } from 'firebase/firestore';
import { db } from '../firebase';
import { discoveryRepository } from '../data/discovery';
import type { DiscoveryEntity } from '../types/discovery';
import { OWNER_BUSINESS_LIMITS, ownerBusinessId, OWNER_CONTENT, OWNER_EDITS, OWNER_LIMITS, nextOwnerEditAt, ownerEditPatch, type OwnerEdit } from './ownerListingEdits';
export async function loadOwnerEditor(rootId: string, uid: string) {
  if(!db)throw Error('Sign-in is unavailable.');
  const root=discoveryRepository.list().find(e=>e.id===rootId);
  const businessId=root?ownerBusinessId(root,rootId):rootId;
  const [rate,history,content,businessRate,live]=await Promise.all([
    getDoc(doc(db,OWNER_LIMITS,rootId)),
    getDocs(query(collection(db,OWNER_EDITS),where('uid','==',uid),limit(50))),
    getDocs(query(collection(db,OWNER_CONTENT),where('rootId','==',businessId),limit(100))),
    getDoc(doc(db,OWNER_BUSINESS_LIMITS,businessId)),
    getDoc(doc(db,ORGANIZATION_LIVE,rootId)),
  ]);
  return {nextAt:Math.max(nextOwnerEditAt(rate.data()?.lastSubmittedAt?.toMillis?.()??0),nextOwnerEditAt(businessRate.data()?.lastSubmittedAt??0)),
    live:live.exists()?[live.data() as OrganizationProjection]:[],
    history:history.docs.map(d=>({id:d.id,...d.data() as OwnerEdit})).filter(e=>e.rootId===rootId),
    content:content.docs.map(d=>d.data() as {entityId:string;changes:Record<string,unknown>})};
}
/** Server timestamps and rules enforce one atomic allowance across every claimant and target of a business. */
export async function saveOwnerEdit(uid:string,rootId:string,entity:DiscoveryEntity,changes:Record<string,unknown>,requestId:string) {
  if(!db)throw Error('Sign-in is unavailable.');
  const patch=ownerEditPatch(entity,changes); const {name:_derived,...safe}=patch;
  const database=db, edit=doc(database,OWNER_EDITS,requestId), rate=doc(database,OWNER_LIMITS,rootId);
  return runTransaction(database,async tx=>{
    const [existing,last,businessRate]=await Promise.all([tx.get(edit),tx.get(rate),tx.get(doc(database,OWNER_BUSINESS_LIMITS,ownerBusinessId(entity,rootId)))]);
    if(existing.exists()) { if(existing.data().uid!==uid||existing.data().rootId!==rootId)throw Error('Invalid save identifier.');return; }
    const next=Math.max(nextOwnerEditAt(last.data()?.lastSubmittedAt?.toMillis?.()??0),nextOwnerEditAt(businessRate.data()?.lastSubmittedAt??0));
    if(next>Date.now())throw Error(`Your next update is available ${calgaryDateTimeFormat('en-CA',{dateStyle:'medium',timeStyle:'short'}).format(new Date(next))}.`);
    tx.set(edit,{uid,rootId,entityId:entity.id,entityTitle:entity.title,changes:safe,status:'queued',createdAt:serverTimestamp(),notificationPending:false});
    tx.set(rate,{uid,editId:requestId,lastSubmittedAt:serverTimestamp()});
  },{maxAttempts:1});
}
