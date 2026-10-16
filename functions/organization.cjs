const {onCall,HttpsError}=require('firebase-functions/v2/https');
const {getFirestore}=require('firebase-admin/firestore');
exports.submitOrganizationBatch=onCall({region:'northamerica-northeast1',maxInstances:3},async request=>{
  if(!request.auth?.token.email_verified)throw new HttpsError('unauthenticated','Sign in with a verified email.');
  try{return await require('./organization-submit.cjs').submitOrganizationBatch(getFirestore(process.env.DISCOVERY_DATABASE_ID||'(default)'),request.auth.uid,request.data,Date.now(),{email:request.auth.token.email,emailVerified:request.auth.token.email_verified===true});}
  catch(error){throw new HttpsError('failed-precondition',error.message||'Your submission could not be saved. Your draft is preserved.');}
});
exports.adminMemberAction=onCall({region:'northamerica-northeast1',maxInstances:3},async request=>{
 if(!request.auth?.token.email_verified)throw new HttpsError('unauthenticated','Sign in with a verified email.');
 try{return await require('./admin-member.cjs').adminMemberAction(getFirestore(process.env.DISCOVERY_DATABASE_ID||'(default)'),request.auth.uid,request.data,{email:request.auth.token.email,emailVerified:true});}
 catch(error){throw new HttpsError('failed-precondition',error.message||'Member changes could not be saved.');}
});
