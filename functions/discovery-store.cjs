const { normalizeRecord, duplicateCandidates, hash } = require('./discovery-domain.cjs');
const collectionFor = kind => kind === 'event' ? 'events' : 'markets';

async function ingestRecord(db, input, source, recordId, options = {}) {
  const now = new Date().toISOString();
  const normalized = normalizeRecord(input, source, recordId, now);
  if (options.cancelled === true && normalized.entity.kind === 'event') normalized.entity.cancelled = true;
  const entityRef = db.collection(collectionFor(input.kind)).doc(normalized.entity.id);
  const rawRef = db.collection('discovery_source_records').doc(hash(`${source.id}:${recordId}`));
  return db.runTransaction(async tx => {
    const [previous, all, oldDates, previousRaw] = await Promise.all([tx.get(entityRef), tx.get(db.collection(collectionFor(input.kind))), tx.get(db.collection('market_occurrences').where('marketId','==',entityRef.id)), tx.get(rawRef)]);
    const duplicates = duplicateCandidates(normalized.entity, all.docs.map(d => d.data()));
    const old = previous.data();
    if (old && JSON.stringify(previousRaw.data()?.input) === JSON.stringify(input) && previousRaw.data()?.cancelled === (options.cancelled === true)) {
      tx.update(entityRef, { fetchedAt: now });
      tx.update(rawRef, { fetchedAt: now });
      return { id: old.id, revision: old.revision, duplicateIds: duplicates };
    }
    // Re-fetches never silently republish changed content or resurrect archives.
    // Keep a stable canonical URL through title and schedule corrections.
    const entity = { ...normalized.entity, ...(old ? { slug: old.slug, status: old.status === 'archived' ? 'archived' : 'pending', revision: (old.revision || 0) + 1 } : { revision: 1 }), duplicateIds: duplicates };
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
module.exports = { ingestRecord, moderate, collectionFor };
