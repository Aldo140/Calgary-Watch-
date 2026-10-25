import {isDeepStrictEqual} from 'node:util';
import {createHash} from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { inventoryDatabase } from '../discovery/firebase';
import { ORGANIZATION_CATALOG } from '../../src/lib/organizationWorkspace';
import type { DiscoveryEntity } from '../../src/types/discovery';
if(!process.env.FIREBASE_SERVICE_ACCOUNT)throw Error('FIREBASE_SERVICE_ACCOUNT is required; organization catalogue was not synchronized.');
const index=JSON.parse(await readFile('src/generated/discovery-index.json','utf8'));
// This runs after every deploy. Reading the whole catalogue to find what changed cost
// one read per record (~830) each time, so a digest document keeps a short hash of what
// was last written for every record: one read, then only changed records are written.
// This script is the catalogue's only writer. Without a digest it compares the stored records, as before.
const db=inventoryDatabase(),DIGEST=db.collection('meta').doc('organization_catalog_digest');
const digestOf=(record:unknown)=>createHash('sha1').update(JSON.stringify(record)).digest('base64url').slice(0,16);
const saved=(await DIGEST.get()).data()?.hashes as Record<string,string>|undefined;
const existing=saved?null:await db.collection(ORGANIZATION_CATALOG).get();
const byId=new Map(existing?.docs.map(d=>[d.id,d.data()]));
const hashes:Record<string,string>={...saved};
let writes=0,batch=db.batch(),pending=0;
for(const entity of index.entities as DiscoveryEntity[]){
  if(!['business','event','market'].includes(entity.kind))continue;
  const record={entity,...(entity.kind==='market'?{occurrences:index.occurrences.filter((o:{marketId:string})=>o.marketId===entity.id)}:{})};
  const hash=digestOf(record);
  if(saved?saved[entity.id]===hash:isDeepStrictEqual(byId.get(entity.id),record)){hashes[entity.id]=hash;continue;}
  batch.set(db.collection(ORGANIZATION_CATALOG).doc(entity.id),record);pending++;writes++;hashes[entity.id]=hash;
  if(pending===400){await batch.commit();batch=db.batch();pending=0;}
}
if(pending)await batch.commit();
// Written only after every batch landed, so a failed run re-checks next time.
if(writes||!saved)await DIGEST.set({hashes,updatedAt:Date.now()});
console.log(`Organization catalogue: ${writes} changed records; ${saved?'1 digest read':`${existing!.size} read once`}.`);
