import { readFile } from 'node:fs/promises';
import { approvedOrganization } from '../../src/lib/organizationWorkspace';
import type { DiscoveryEntity } from '../../src/types/discovery';
const {entities}=JSON.parse(await readFile('src/generated/discovery-index.json','utf8')) as {entities:DiscoveryEntity[]};
const production=process.argv.includes('--production');
let accounts:Record<string,unknown>[]|undefined,claims:any[]=[];
if(production){
 if(!process.env.FIREBASE_SERVICE_ACCOUNT)throw Error('Production audit requires FIREBASE_SERVICE_ACCOUNT. No production accounts were read.');
 const {inventoryDatabase}=await import('../discovery/firebase');const db=inventoryDatabase();
 const [users,approved]=await Promise.all([db.collection('users').where('accountType','==','business').get(),db.collection('listing_claims').where('status','==','approved').get()]);
 accounts=users.docs.map(d=>({uid:d.id,...d.data()}));claims=approved.docs.map(d=>d.data());
}
const organizations=entities.filter(e=>e.kind==='business').map(org=>{
 const events=entities.filter(e=>(e.kind==='event'||e.kind==='market')&&e.organizerEntityId===org.id);
 return {id:org.id,organization:org.title,officialSources:org.sources.filter(s=>s.kind==='official').map(s=>s.url),events:events.map(e=>({id:e.id,title:e.title,...(e.kind==='event'?{start:e.start,end:e.end}:{} )})),coverage:events.length?'Existing reviewed coverage; live completeness is unconfirmed':'No linked dates in reviewed inventory; official source needs review'};
});
const result={mode:production?'production approvals, repository event snapshot':'repository inventory only; production approvals unavailable',organizations,...(accounts?{accounts:accounts.map(account=>({uid:account.uid,organizations:claims.filter(c=>c.uid===account.uid).map(c=>({sourceListing:c.entityTitle,organization:approvedOrganization(c,entities)?.title??null,scope:approvedOrganization(c,entities)?'organization':'specific listing only'}))}))}:{}),limitations:['No dates inferred from a business name, venue or outreach email.','Undated From Scratch performances are not schedulable events.','Official live pages must be checked before asserting that coverage is complete.']};
console.log(JSON.stringify(result,null,2));
