/** Authentication reads only. Private operational snapshot uses existing admin-only ops_health rules. */
import {syncMemberEngagement} from './sync-member-engagement';
import {getAuth} from 'firebase-admin/auth';
import {inventoryDatabase} from '../discovery/firebase';
import type {MemberAuthRecord} from '../../src/lib/memberAccountInsights';
const db=inventoryDatabase(),auth=getAuth(),at=Date.now(),generation=String(at);
const number=(value?:string)=>value&&Number.isFinite(Date.parse(value))?Date.parse(value):null;
const accounts:MemberAuthRecord[]=[];let next:string|undefined;
do{const page=await auth.listUsers(1000,next);for(const user of page.users)accounts.push({uid:user.uid,...(user.email?{email:user.email}:{}),...(user.displayName?{displayName:user.displayName}:{}),providers:[...new Set(user.providerData.map(p=>p.providerId))],emailVerified:user.emailVerified,disabled:user.disabled,createdAt:number(user.metadata.creationTime),lastSignInAt:number(user.metadata.lastSignInTime),lastRefreshAt:number(user.metadata.lastRefreshTime??undefined)});next=page.pageToken;}while(next);
const ref=db.collection('ops_health').doc('member_auth'),previous=(await ref.get()).data(),chunkIds:string[]=[];
for(let offset=0;offset<accounts.length;offset+=200){const id=`member_auth_${generation}_${offset/200}`;chunkIds.push(id);await db.collection('ops_health').doc(id).set({kind:'member-auth-chunk',generation,at,accounts:accounts.slice(offset,offset+200)});}
await ref.set({kind:'member-auth-index',generation,at,total:accounts.length,chunkIds,previousChunkIds:previous?.chunkIds??[]});
for(const id of previous?.previousChunkIds??[])if(typeof id==='string'&&/^member_auth_[0-9]+_[0-9]+$/.test(id))await db.collection('ops_health').doc(id).delete();
console.log(JSON.stringify({accounts:accounts.length,chunks:chunkIds.length,at:new Date(at).toISOString(),authChanges:0,storage:'admin-only operational snapshot'}));

await syncMemberEngagement(db,accounts,at);
