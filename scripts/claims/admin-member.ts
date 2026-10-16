import type {Firestore} from 'firebase-admin/firestore';
import {isApprovedAdminEmail} from '../../src/constants/admin';
import {normalizeInterests} from '../../src/lib/eventPicks';
import {emailConsentPatch} from '../../src/lib/plansProfile';
export async function adminMemberAction(db:Firestore,actorUid:string,input:{subjectUid:string;action:string;draft?:any;eventId?:string;start?:string;on?:boolean},identity:{email?:string;emailVerified?:boolean}={},now=Date.now()){
 if(!input||typeof input.subjectUid!=='string'||!input.subjectUid||input.subjectUid.includes('/')||input.subjectUid.length>128||!['profile','rsvp'].includes(input.action))throw Error('Invalid member edit.');
 return db.runTransaction(async tx=>{
  const actor=await tx.get(db.collection('users').doc(actorUid));
  if(!(actor.get('role')==='admin'||identity.emailVerified===true&&isApprovedAdminEmail(identity.email)))throw Error('Administrator access required.');
  const account=db.collection('users').doc(input.subjectUid),member=await tx.get(account);
  if(!member.exists)throw Error('Member account no longer exists.');
  const before=member.data()!;
  let audit:Record<string,unknown>;
  if(input.action==='profile'){
   const draft=input.draft;if(!draft||typeof draft.neighborhood!=='string'||typeof draft.address!=='string'||typeof draft.inferredNeighborhood!=='string'||typeof draft.weeklyDigestOptIn!=='boolean'||typeof draft.eventsDigestOptIn!=='boolean'||!Array.isArray(draft.interests))throw Error('Check member preferences.');
   const interests=normalizeInterests(draft.interests);
   if(draft.eventsDigestOptIn&&!interests.length)throw Error('Choose an interest for event picks.');
   const patch={neighborhood:draft.neighborhood.trim().slice(0,80),address:draft.address.trim().slice(0,160),inferredNeighborhood:draft.inferredNeighborhood.trim().slice(0,80),locationPreferenceType:draft.address.trim()?'address':'neighborhood',eventInterests:interests,...emailConsentPatch(before as any,{weekly:draft.weeklyDigestOptIn,events:draft.eventsDigestOptIn},now,'admin-member-edit'),preferencesUpdatedBy:actorUid,preferencesUpdateSource:'admin',plansUpdatedAt:now,profileUpdatedAt:now};
   tx.update(account,patch);audit={before:Object.fromEntries(Object.keys(patch).map(key=>[key,before[key]??null])),after:patch};
  }else{
   if(typeof input.eventId!=='string'||! /^[a-z0-9-]{1,200}$/.test(input.eventId)||typeof input.on!=='boolean'||typeof input.start!=='string'||!Number.isFinite(Date.parse(input.start)))throw Error('Check the event RSVP.');
   const ref=db.collection('event_rsvps').doc(`${input.subjectUid}_${input.eventId}`),countRef=db.collection('event_rsvp_counts').doc(input.eventId);
   const [rsvp,count]=await Promise.all([tx.get(ref),tx.get(countRef)]);
   if(rsvp.exists!==input.on){if(input.on)tx.set(ref,{uid:input.subjectUid,eventId:input.eventId,start:input.start,createdAt:now});else tx.delete(ref);tx.set(countRef,{count:Math.max(0,Number(count.get('count')??0)+(input.on?1:-1)),updatedAt:now},{merge:true});}
   audit={eventId:input.eventId,before:rsvp.exists,after:input.on};
  }
  tx.set(db.collection('admin_member_edits').doc(),{actorUid,subjectUid:input.subjectUid,action:input.action,createdAt:now,...audit});
  return {saved:true};
 },{maxAttempts:1});
}
