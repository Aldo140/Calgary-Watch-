/** Read-only owner-request audit. Plaintext must only be piped into encryption, never logged. */
import {inventoryDatabase} from '../discovery/firebase';
const db=inventoryDatabase();
const [claims,submissions,pending,recent,sources]=await Promise.all([
 db.collection('listing_claims').where('status','==','approved').limit(100).get(),
 db.collection('entity_submissions').where('status','==','pending').limit(25).get(),
 db.collection('discovery_actions').where('status','==','pending').limit(50).get(),
 db.collection('discovery_actions').orderBy('createdAt','desc').limit(25).get(),
 db.collection('discovery_sources').where('approved','==',true).limit(200).get(),
]);
const output={at:new Date().toISOString(),claims:claims.docs.map(d=>{const c=d.data();return{organization:c.entityTitle,entityId:c.entityId,entityPath:c.entityPath,name:c.name,note:c.note||'',reviewedAt:c.reviewedAt,approvedOrganizationId:c.approvedOrganizationId};}),submissions:submissions.docs.map(d=>({id:d.id,input:d.get('input'),createdAt:d.get('createdAt')})),pending:pending.docs.map(d=>({id:d.id,action:d.get('action'),createdAt:d.get('createdAt')})),recent:recent.docs.map(d=>({id:d.id,action:d.get('action'),status:d.get('status'),error:d.get('error'),result:d.get('result'),createdAt:d.get('createdAt'),appliedAt:d.get('appliedAt')})),sources:sources.docs.map(d=>({id:d.id,...d.data()}))};
process.stdout.write(JSON.stringify(output));
