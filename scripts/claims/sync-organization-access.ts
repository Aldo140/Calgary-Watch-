/** Explicit deployment repair: index existing approvals; never infer a grant from a matching name. */
import {inventoryDatabase} from '../discovery/firebase';
import {readFile} from 'node:fs/promises';
if(!process.env.FIREBASE_SERVICE_ACCOUNT)throw Error('FIREBASE_SERVICE_ACCOUNT is required; organization access was not synchronized.');
const index=JSON.parse(await readFile('src/generated/discovery-index.json','utf8'));
const businesses=new Set(index.entities.filter((e:any)=>e.kind==='business'&&e.status==='published'&&!e.developmentOnly).map((e:any)=>e.id));
const db=inventoryDatabase(),claims=await db.collection('listing_claims').where('status','==','approved').limit(2001).get();
if(claims.size===2001)throw Error('More than 2,000 approvals require a paginated access migration. Nothing was written.');
const grants=new Map<string,{uid:string;organizationId:string;claimId:string;grantedAt:number}>();
for(const snapshot of claims.docs){const c=snapshot.data(),id=c.approvedOrganizationId??c.entityId;if(!c.uid||!businesses.has(id))continue;grants.set(`${c.uid}_${id}`,{uid:c.uid,organizationId:id,claimId:snapshot.id,grantedAt:c.reviewedAt??c.createdAt??Date.now()});}
const existing=grants.size?await db.getAll(...[...grants.keys()].map(id=>db.collection('organization_managers').doc(id))):[];
const byId=new Map(existing.map(d=>[d.id,d.data()]));let batch=db.batch(),pending=0,total=0;
for(const [id,grant] of grants){const old=byId.get(id);if(old?.uid===grant.uid&&old?.organizationId===grant.organizationId&&old?.claimId===grant.claimId)continue;batch.set(db.collection('organization_managers').doc(id),grant);pending++;total++;if(pending===400){await batch.commit();batch=db.batch();pending=0;}}
if(pending)await batch.commit();
console.log(`Indexed ${total} approved organization memberships. Approval, account, verification and email history were preserved.`);
