import type {Firestore} from 'firebase-admin/firestore';
import type {MemberAuthRecord} from '../../src/lib/memberAccountInsights';
import {retainObservedSignIns,correlateDigestSignIns,dailyObservedSignIns,acceptedEngagementSend,type ObservedSignIn,type EngagementSend} from '../../src/lib/memberEngagement';
/** Private read-only Auth/email analysis. Does not send email, change subscriptions or mutate authentication. */
export async function syncMemberEngagement(db:Firestore,accounts:MemberAuthRecord[],at:number){
 const ref=db.collection('ops_health').doc('member_engagement'),previous=(await ref.get()).data();
 const previousIds=Array.isArray(previous?.chunkIds)?previous.chunkIds.filter((id:unknown):id is string=>typeof id==='string'&&/^member_engagement_[0-9]+_[0-9]+$/.test(id)):[];
 const chunks=previousIds.length?await db.getAll(...previousIds.map(id=>db.collection('ops_health').doc(id))):[];
 if(chunks.some(d=>!d.exists||d.get('generation')!==previous?.generation))throw Error('Previous engagement history is incomplete; refusing to overwrite it.');
 const old=chunks.flatMap(d=>Array.isArray(d.get('events'))?d.get('events') as ObservedSignIn[]:[]);
 const events=retainObservedSignIns(old,accounts.filter(a=>a.lastSignInAt!==null).map(a=>({uid:a.uid,at:a.lastSignInAt!})),at);
 const since=typeof previous?.observedSince==='number'?previous.observedSince:at;
 const cutoff=at-90*86400000;
 const ledgers=await Promise.all(['digest_sends','events_digest_sends'].map(name=>db.collection(name).where('sentAt','>=',cutoff).orderBy('sentAt','desc').limit(5000).get()));
 const sends:EngagementSend[]=[];
 ledgers.forEach((snapshot,index)=>{for(const doc of snapshot.docs){const send=acceptedEngagementSend(doc.id,doc.data(),index===0?'monday':'thursday');if(send)sends.push(send);}});
 const generation=String(at),chunkIds:string[]=[];
 for(let offset=0;offset<events.length;offset+=1000){const id=`member_engagement_${generation}_${offset/1000}`;chunkIds.push(id);await db.collection('ops_health').doc(id).set({generation,events:events.slice(offset,offset+1000)});}
 await ref.set({generation,at,observedSince:since,retentionDays:90,chunkIds,previousChunkIds:previousIds,observations:events.length,days:dailyObservedSignIns(events,at),cohorts:correlateDigestSignIns(sends,events,at,since),sendRecords:sends.length,sendHistoryCapped:ledgers.some(s=>s.size===5000)});
 for(const id of previous?.previousChunkIds??[])if(typeof id==='string'&&/^member_engagement_[0-9]+_[0-9]+$/.test(id))await db.collection('ops_health').doc(id).delete();
 console.log(JSON.stringify({engagementSnapshotAt:new Date(at).toISOString(),observations:events.length,sendRecords:sends.length,cohorts:correlateDigestSignIns(sends,events,at,since).length,storage:'admin-only',emailsSent:0}));
}
