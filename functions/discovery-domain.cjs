// Shared by the trusted callable service, ingestion CLI and publication tests.
const crypto = require('node:crypto');
const TIMEZONE = 'America/Edmonton';
const hash = value => crypto.createHash('sha256').update(value).digest('hex').slice(0, 28);
const text = (v, max = 5000) => { if (typeof v !== 'string' || !v.trim() || v.length > max) throw Error('Invalid text field'); return v.trim(); };
const https = v => { const url = new URL(text(v, 2000)); if (url.protocol !== 'https:' || url.username || url.password) throw Error('HTTPS source without embedded credentials required'); return url.href; };
const date = v => { if (typeof v !== 'string' || !/(Z|[+-]\d\d:\d\d)$/.test(v) || !Number.isFinite(Date.parse(v))) throw Error('Use an ISO date with timezone offset'); return v; };
const range = v => { date(v.start); date(v.end); if (Date.parse(v.end) <= Date.parse(v.start)) throw Error('End must follow start'); };
const strings = v => { if (!Array.isArray(v) || v.length > 30) throw Error('Expected a short list'); return v.map(x => text(x, 80)); };
const slugify = v => v.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function validateSubmission(input) {
  if (!input || !['event', 'market'].includes(input.kind)) throw Error('Only events and markets are supported');
  const common = ['kind','title','summary','description','address','organizer','sourceUrl','categories','tags','neighbourhood'];
  const specific = input.kind === 'event' ? ['start','end','pricing'] : ['occurrences','amenities','parking','transit','petFriendly','familyFriendly'];
  if (Object.keys(input).some(k => ![...common,...specific].includes(k))) throw Error('Submission contains privileged or unknown fields');
  for (const key of ['title','summary','description','address','organizer']) text(input[key], key === 'description' ? 5000 : 500);
  https(input.sourceUrl); strings(input.categories); strings(input.tags);
  if (input.neighbourhood !== undefined) text(input.neighbourhood, 120);
  if (input.kind === 'event') { range(input); if (!['free','paid','unknown'].includes(input.pricing)) throw Error('Invalid pricing'); }
  else {
    strings(input.amenities);
    for (const key of ['parking','transit']) if (input[key] !== undefined) text(input[key], 1000);
    for (const key of ['petFriendly','familyFriendly']) if (input[key] !== undefined && typeof input[key] !== 'boolean') throw Error('Invalid amenity');
    if (!Array.isArray(input.occurrences) || !input.occurrences.length || input.occurrences.length > 100) throw Error('Supply 1–100 confirmed dates');
    const ids = new Set(); const slots = new Set();
    for (const o of input.occurrences) {
      if (Object.keys(o).some(k => !['sourceRecordId','start','end','cancelled'].includes(k))) throw Error('Invalid occurrence fields');
      text(o.sourceRecordId, 200); range(o); const slot = `${Date.parse(o.start)}:${Date.parse(o.end)}`;
      if (typeof o.cancelled !== 'boolean' || ids.has(o.sourceRecordId) || slots.has(slot)) throw Error('Invalid or duplicate occurrence'); ids.add(o.sourceRecordId); slots.add(slot);
    }
  }
  return input;
}

function normalizeRecord(input, source, recordId, now = new Date().toISOString()) {
  validateSubmission(input); text(source.id, 100); text(recordId, 200);
  if (!source.approved || !Array.isArray(source.hosts) || !source.hosts.includes(new URL(input.sourceUrl).hostname)) throw Error('Source is not approved for this URL');
  const id = hash(`${source.id}:${recordId}`);
  const provenance = { name: source.name, url: https(input.sourceUrl), kind: source.kind || 'official', retrievedAt: now };
  const base = { id, kind: input.kind, slug: `${slugify(input.title) || input.kind}-${id.slice(0,6)}`, title: input.title.trim(), summary: input.summary.trim(), description: input.description.trim(), categories: strings(input.categories), tags: strings(input.tags), address: input.address.trim(), organizer: input.organizer.trim(), sources: [provenance], sourceId: source.id, sourceRecordId: recordId, fetchedAt: now, updatedAt: now, status: 'pending', verification: 'unverified', ...(input.neighbourhood ? { neighbourhood: input.neighbourhood } : {}) };
  const entity = input.kind === 'event' ? { ...base, start: input.start, end: input.end, timezone: TIMEZONE, pricing: input.pricing, cancelled: false } : { ...base, amenities: input.amenities, vendorIds: [], images: [], ...Object.fromEntries(['parking','transit','petFriendly','familyFriendly'].filter(k => input[k] !== undefined).map(k => [k,input[k]])) };
  const occurrences = input.kind === 'market' ? input.occurrences.map(o => ({ id: hash(`${id}:${o.sourceRecordId}`), marketId: id, sourceRecordId: o.sourceRecordId, start: o.start, end: o.end, cancelled: o.cancelled, timezone: TIMEZONE, source: provenance })) : [];
  return { entity, occurrences };
}

function duplicateCandidates(entity, entities) {
  const key = e => `${slugify(e.title)}:${slugify(e.address || '')}`;
  return entities.filter(e => e.id !== entity.id && e.kind === entity.kind && e.status !== 'archived' && key(e) === key(entity) && (e.kind !== 'event' || Math.abs(Date.parse(e.start) - Date.parse(entity.start)) < 12 * 3600000)).map(e => e.id);
}
function isFresh(entity, now = new Date()) { const age = now.getTime() - Date.parse(entity.verifiedAt || ''); return Number.isFinite(age) && age >= -300000 && age <= 14 * 86400000; }
function eligible(entity, now = new Date()) { return entity.status === 'published' && entity.verification === 'source-checked' && !entity.developmentOnly && isFresh(entity, now) && entity.sources?.length > 0 && entity.sources.every(s => ['official','editorial'].includes(s.kind) && /^https:\/\//.test(s.url)); }
function publishSnapshot(entities, occurrences, now = new Date()) {
  const visible = entities.filter(e => ['event','market'].includes(e.kind) && eligible(e, now));
  const ids = new Set(visible.map(e => e.id));
  const paths = new Set();
  for (const e of visible) { const key = `${e.kind}/${e.slug}`; if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(e.slug) || paths.has(key)) throw Error('Invalid or conflicting published slug'); paths.add(key); }
  const fields = ['id','kind','slug','title','summary','description','categories','tags','sources','image','status','verification','verifiedAt','fetchedAt','updatedAt','sourceId','sourceRecordId','neighbourhood','address','coordinates','venue','start','end','timezone','pricing','priceRange','tickets','organizer','cancelled','amenities','parking','transit','petFriendly','familyFriendly','vendorIds','images'];
  const publicEntities = visible.map(e => Object.fromEntries(fields.filter(k=>e[k]!==undefined).map(k=>[k,e[k]])));
  return { version: 1, generatedAt: now.toISOString(), entities: publicEntities, occurrences: occurrences.filter(o => ids.has(o.marketId) && Date.parse(o.end) > Date.parse(o.start)).map(o=>Object.fromEntries(['id','marketId','sourceRecordId','start','end','timezone','cancelled','source'].filter(k=>o[k]!==undefined).map(k=>[k,o[k]]))) };
}
module.exports = { validateSubmission, normalizeRecord, duplicateCandidates, isFresh, eligible, publishSnapshot, hash };
