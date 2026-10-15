/** Read-only consistency audit. Never sends mail or repairs records. */
import { inventoryDatabase } from '../discovery/firebase';
import { getAuth } from 'firebase-admin/auth';
import { businessAccountPatch } from '../../src/lib/businessAccount';
import { claimId } from '../../src/lib/claims';
const entityId = process.argv[2] || '6972906c904ecd4acb9407299e22';
if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
  console.error('Read-only audit requires FIREBASE_SERVICE_ACCOUNT in a secure runtime; no records were read or changed.');
  process.exitCode = 1;
} else {
  const db = inventoryDatabase();
  const [claims, mark] = await Promise.all([db.collection('listing_claims').where('entityId','==',entityId).get(),db.collection('verified_listings').doc(entityId).get()]);
  const rows=[];
  for(const doc of claims.docs){
    const c=doc.data();const profile=await db.collection('users').doc(c.uid).get();
    let auth: {exists:boolean; emailVerified?:boolean; disabled?:boolean; providers?:string[]};
    try {const user=await getAuth().getUser(c.uid);auth={exists:true,emailVerified:user.emailVerified,disabled:user.disabled,providers:user.providerData.map(p=>p.providerId)};}
    catch(e){if((e as {code?:string}).code!=='auth/user-not-found')throw e;auth={exists:false};}
    rows.push({claimId:doc.id,expectedClaimId:claimId(c.uid,entityId),uid:c.uid,status:c.status,reviewedAt:c.reviewedAt??null,
      approvalEmailStatus:c.approvalEmailStatus??null,approvalEmailError:c.approvalEmailError??null,auth,
      profileExists:profile.exists,currentAccount:profile.exists?{accountType:profile.get('accountType')??null,businessListings:profile.get('businessListings')??[]}:null,
      proposedAccountPatch:c.status==='approved'&&profile.exists?businessAccountPatch(profile.data(),entityId,c.reviewedAt||Date.now()):null});
  }
  console.log(JSON.stringify({entityId,publicMark:mark.exists?mark.data():null,claims:rows,mode:'read-only; proposed patches have NOT been applied'},null,2));
}
