const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore } = require('firebase-admin/firestore');
const { validateSubmission, hash } = require('./discovery-domain.cjs');
const { ingestRecord, moderate } = require('./discovery-store.cjs');
const options = { region: 'northamerica-northeast1', maxInstances: 5 };
function database() { return getFirestore(process.env.DISCOVERY_DATABASE_ID || '(default)'); }
async function assertAdmin(db, auth) {
  if (!auth) throw new HttpsError('unauthenticated','Sign in first.');
  const approved = auth.token.email_verified === true && ['jorti104@mtroyal.ca','ophillah1863@gmail.com'].includes(auth.token.email);
  if (!approved && (await db.collection('users').doc(auth.uid).get()).data()?.role !== 'admin') throw new HttpsError('permission-denied','Administrator access required.');
}
exports.submitDiscovery = onCall(options, async request => {
  if (!request.auth?.token.email_verified) throw new HttpsError('unauthenticated','Sign in with a verified email to submit.');
  const db = database(); let input;
  try { input = validateSubmission(request.data); } catch (e) { throw new HttpsError('invalid-argument',e.message); }
  const now = new Date(); const uid = request.auth.uid;
  const id = hash(`${uid}:${JSON.stringify(input)}`);
  await db.runTransaction(async tx => {
    const limitRef = db.collection('discovery_submission_limits').doc(uid);
    const limit = (await tx.get(limitRef)).data();
    const ref = db.collection('entity_submissions').doc(id);
    if ((await tx.get(ref)).exists) return;
    const day = now.toISOString().slice(0,10); const count = limit?.day === day ? limit.count : 0;
    if (count >= 5) throw new HttpsError('resource-exhausted','Daily submission limit reached.');
    tx.set(limitRef,{ day, count: count + 1 });
    tx.create(ref,{ id, input, submittedBy: uid, status: 'pending', createdAt: now.toISOString() });
  });
  return { id, status: 'pending' };
});
exports.manageDiscovery = onCall(options, async request => {
  const db = database(); await assertAdmin(db,request.auth);
  try {
    const data = request.data;
    if (data.action === 'save') {
      const source = (await db.collection('discovery_sources').doc(data.sourceId).get()).data();
      if (!source) throw Error('Choose an approved source');
      const result = await ingestRecord(db,data.input,source,data.recordId,{ cancelled: data.cancelled });
      return result;
    }
    if (data.action === 'review-submission') {
      const ref = db.collection('entity_submissions').doc(data.id);
      const submission = (await ref.get()).data();
      if (!submission) throw Error('Submission missing');
      if (data.reject) { await ref.update({ status:'rejected', reviewedBy:request.auth.uid }); return { id:data.id }; }
      const source = (await db.collection('discovery_sources').doc(data.sourceId).get()).data();
      // The administrator supplies a checked, editable DTO; the original suggestion stays private.
      const result = await ingestRecord(db,data.input,source,`submission-${data.id}`);
      await ref.update({ status:'approved', entityId:result.id, reviewedBy:request.auth.uid });
      return result;
    }
    return await moderate(db,data,request.auth.uid);
  } catch(e) { throw new HttpsError('failed-precondition',e.message); }
});
