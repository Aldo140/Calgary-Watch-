import {isDeepStrictEqual} from 'node:util';
import { readFile } from 'node:fs/promises';
import { inventoryDatabase } from '../discovery/firebase';
import { ORGANIZATION_CATALOG } from '../../src/lib/organizationWorkspace';
import type { DiscoveryEntity } from '../../src/types/discovery';
if(!process.env.FIREBASE_SERVICE_ACCOUNT)throw Error('FIREBASE_SERVICE_ACCOUNT is required; organization catalogue was not synchronized.');
const index=JSON.parse(await readFile('src/generated/discovery-index.json','utf8'));
const db=inventoryDatabase(),existing=await db.collection(ORGANIZATION_CATALOG).get();
const byId=new Map(existing.docs.map(d=>[d.id,d.data()]));
let writes=0,batch=db.batch(),pending=0;
for(const entity of index.entities as DiscoveryEntity[]){
  if(!['business','event','market'].includes(entity.kind))continue;
  const record={entity,...(entity.kind==='market'?{occurrences:index.occurrences.filter((o:{marketId:string})=>o.marketId===entity.id)}:{})};
  if(isDeepStrictEqual(byId.get(entity.id),record))continue;
  batch.set(db.collection(ORGANIZATION_CATALOG).doc(entity.id),record);pending++;writes++;
  if(pending===400){await batch.commit();batch=db.batch();pending=0;}
}
if(pending)await batch.commit();
console.log(`Organization catalogue: ${writes} changed records; ${existing.size} read once.`);
