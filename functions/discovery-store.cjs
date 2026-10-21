const { normalizeRecord, duplicateCandidates, isRecurringWindowRoll, hash } = require('./discovery-domain.cjs');
const collectionFor = kind => kind === 'event' ? 'events' : 'markets';

async function ingestRecord(db, input, source, recordId, options = {}) {
  const now = new Date().toISOString();
  const normalized = normalizeRecord(input, source, recordId, now);
  if (options.cancelled === true && normalized.entity.kind === 'event') normalized.entity.cancelled = true;
  const entityRef = db.collection(collectionFor(input.kind)).doc(normalized.entity.id);
  const rawRef = db.collection('discovery_source_records').doc(hash(`${source.id}:${recordId}`));
  // Duplicate matching only considers event starts within 12 hours. A conservative
  // five-calendar-day envelope includes timezone-offset boundaries while avoiding an archive scan.
  const scope = db.collection(collectionFor(input.kind));
  const day = Date.parse(normalized.entity.start);
  const candidates = input.kind === 'event'
    ? scope.where('start', '>=', new Date(day - 2 * 86400000).toISOString().slice(0,10))
      .where('start', '<', new Date(day + 3 * 86400000).toISOString().slice(0,10))
    : scope;
  return db.runTransaction(async tx => {
    const [previous, all, oldDates, previousRaw] = await Promise.all([tx.get(entityRef), tx.get(candidates), input.kind === 'market' ? tx.get(db.collection('market_occurrences').where('marketId','==',entityRef.id)) : Promise.resolve({ docs: [] }), tx.get(rawRef)]);
    const duplicates = duplicateCandidates(normalized.entity, all.docs.map(d => d.data()));
    const old = previous.data();
    const oldRaw = previousRaw.data();
    const sameCancelledFlag = oldRaw?.cancelled === (options.cancelled === true);
    // Approved official feeds (see automatic-sources.json) publish without an editor, labelled
    // 'source-feed' rather than 'source-checked'. An editor's draft or archive always wins, and a
    // possible duplicate still waits for review.
    const autoPublish = source.autoPublish === true && source.kind === 'official' && duplicates.length === 0;
    const feedPublished = { status: 'published', verification: 'source-feed', verifiedAt: now };
    if (old && JSON.stringify(oldRaw?.input) === JSON.stringify(input) && sameCancelledFlag) {
      // A trusted feed still listing it re-confirms it, so it doesn't age out of the 14-day freshness window.
      const reconfirmed = autoPublish && old.status === 'pending' ? feedPublished : autoPublish && old.verification === 'source-feed' ? { verifiedAt: now } : {};
      tx.update(entityRef, { fetchedAt: now, ...reconfirmed });
      tx.update(rawRef, { fetchedAt: now });
      return { id: old.id, revision: old.revision, duplicateIds: duplicates };
    }
    // A recurring market's occurrence window rolling forward is not new content — the
    // market itself is unchanged, so preserve its existing publication/verification
    // rather than sending an already-reviewed, unchanged market back into the queue.
    if (old && old.status === 'published' && sameCancelledFlag && isRecurringWindowRoll(oldRaw?.input, input, new Date(now))) {
      tx.update(entityRef, { fetchedAt: now, updatedAt: now, ...(autoPublish && old.verification === 'source-feed' ? { verifiedAt: now } : {}) });
      const rolledIds = new Set(normalized.occurrences.map(o => o.id));
      for (const oldDate of oldDates.docs) if (!rolledIds.has(oldDate.id)) tx.set(oldDate.ref, { ...oldDate.data(), cancelled: true, updatedAt: now });
      for (const o of normalized.occurrences) tx.set(db.collection('market_occurrences').doc(o.id), o);
      tx.set(rawRef, { input, sourceId: source.id, sourceRecordId: recordId, fetchedAt: now, entityId: old.id, cancelled: options.cancelled === true });
      return { id: old.id, revision: old.revision, duplicateIds: duplicates };
    }
    // Re-fetches never silently republish changed content or resurrect archives.
    // Keep a stable canonical URL through title and schedule corrections.
    const heldByEditor = old && (old.status === 'archived' || (autoPublish && old.status === 'draft'));
    const status = heldByEditor ? old.status : autoPublish ? 'published' : 'pending';
    const entity = { ...normalized.entity, ...(old ? { slug: old.slug, revision: (old.revision || 0) + 1 } : { revision: 1 }), status, ...(status === 'published' ? feedPublished : {}), duplicateIds: duplicates };
    tx.set(entityRef, entity);
    const newIds = new Set(normalized.occurrences.map(o => o.id));
    for (const oldDate of oldDates.docs) if (!newIds.has(oldDate.id)) tx.set(oldDate.ref, { ...oldDate.data(), cancelled: true, updatedAt: now });
    for (const o of normalized.occurrences) tx.set(db.collection('market_occurrences').doc(o.id), o);
    tx.set(rawRef, { input, sourceId: source.id, sourceRecordId: recordId, fetchedAt: now, entityId: entity.id, cancelled: options.cancelled === true });
    return { id: entity.id, revision: entity.revision, duplicateIds: duplicates };
  });
}

async function moderate(db, { kind, id, action, revision, acknowledgeDuplicates = false }, uid) {
  if (!['event','market'].includes(kind) || !['publish','draft','archive','cancel'].includes(action) || typeof id !== 'string' || id.includes('/')) throw Error('Invalid moderation action');
  const ref = db.collection(collectionFor(kind)).doc(id);
  return db.runTransaction(async tx => {
    const snap = await tx.get(ref); const entity = snap.data();
    if (!entity || entity.revision !== revision) throw Error('This record changed. Reload before reviewing.');
    const dates = kind === 'market' ? await tx.get(db.collection('market_occurrences').where('marketId','==',id)) : null;
    if (action === 'publish' && entity.duplicateIds?.length && !acknowledgeDuplicates) throw Error('Review duplicate warnings before publishing');
    if (action === 'publish' && kind === 'market' && !dates.docs.length) throw Error('A market needs confirmed occurrences');
    if (action === 'publish' && !entity.sources.every(s => ['official','editorial'].includes(s.kind))) throw Error('Verify against an official or editorial source before publishing');
    const now = new Date().toISOString();
    const patch = { updatedAt: now, revision: revision + 1, status: action === 'archive' ? 'archived' : action === 'draft' ? 'draft' : action === 'cancel' ? entity.status : 'published' };
    if (action === 'publish') Object.assign(patch, { verification: 'source-checked', verifiedAt: now, verifiedBy: uid });
    if (action === 'cancel') {
      if (kind === 'event') patch.cancelled = true;
      else for (const o of dates.docs) tx.update(o.ref, { cancelled: true });
    }
    tx.update(ref, patch);
    tx.set(db.collection('discovery_audit').doc(), { entityId: id, kind, action, uid, at: now, revision });
    return { id, ...patch };
  });
}

/** Administrator-only adapter shared by the callable and queued moderation worker. */
async function reviewSubmission(db, data, uid) {
  if (typeof data.id !== 'string' || !data.id || data.id.includes('/') || data.id.length > 240) throw Error('Invalid submission identity');
  const ref = db.collection('entity_submissions').doc(data.id);
  const submission = (await ref.get()).data();
  if (!submission) throw Error('Submission missing');
  if (data.reject) {
    if (submission.status !== 'pending') throw Error('This submission was already reviewed. Refresh before changing it.');
    await ref.update({ status: 'rejected', reviewedBy: uid });
    return { submissionId: data.id, stage: 'rejected' };
  }
  let source;
  if (data.confirmOfficialSource === true) {
    // Only an authenticated administrator reaches this adapter. Never accept arbitrary
    // source objects or privileged fields from the public event submission path.
    const url = new URL(data.input.sourceUrl);
    if (url.protocol !== 'https:' || url.username || url.password) throw Error('Use the official HTTPS organizer page');
    source = { id: `reviewed-${hash(url.origin).slice(0,20)}`, name: `${String(data.input.organizer).slice(0,150)} — reviewed official source`, approved: true, kind: 'official', hosts: [url.hostname] };
    // Validate everything before recording the administrator's source decision.
    normalizeRecord(data.input, source, `submission-${data.id}`);
    await db.collection('discovery_sources').doc(source.id).set(source);
  } else {
    if (typeof data.sourceId !== 'string' || !data.sourceId || data.sourceId.includes('/')) throw Error('Choose a matching approved source or confirm the official organizer page');
    source = (await db.collection('discovery_sources').doc(data.sourceId).get()).data();
    if (!source) throw Error('Approved source missing');
  }
  const out = await ingestRecord(db, data.input, source, `submission-${data.id}`);
  if (data.action === 'publish-submission') {
    // Publication is a separate checked transaction. If it fails (duplicates,
    // revision conflict, source), the suggestion stays pending and nothing is
    // incorrectly reported as approved. A retry reuses the canonical event ID.
    await moderate(db, { kind: data.input.kind, id: out.id, revision: out.revision, action: 'publish', acknowledgeDuplicates: data.acknowledgeDuplicates === true }, uid);
  }
  await ref.update({ status: 'approved', entityId: out.id, reviewedBy: uid });
  return { ...out, submissionId: data.id, kind: data.input.kind, stage: data.action === 'publish-submission' ? 'verified' : 'needs-review' };
}

module.exports = { ingestRecord, moderate, reviewSubmission, collectionFor };
