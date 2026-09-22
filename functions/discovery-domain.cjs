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
// Optional and provider-supplied, never required: a public submitter with no photo or an
// editorial entry with no coordinates is still a valid listing. Image credit is retained
// so displayed photography always carries visible provenance, never anonymous imagery.
const image = v => {
  if (!v || typeof v !== 'object' || Object.keys(v).some(k => !['src','alt','credit'].includes(k))) throw Error('Invalid image fields');
  const out = { src: https(v.src), alt: text(v.alt, 300) };
  if (v.credit !== undefined) out.credit = text(v.credit, 200);
  return out;
};
const coordinates = v => {
  if (!v || typeof v !== 'object' || Object.keys(v).some(k => !['lat','lng'].includes(k)) || typeof v.lat !== 'number' || typeof v.lng !== 'number' || !Number.isFinite(v.lat) || !Number.isFinite(v.lng) || Math.abs(v.lat) > 90 || Math.abs(v.lng) > 180) throw Error('Invalid coordinates');
  return { lat: v.lat, lng: v.lng };
};

function validateSubmission(input) {
  if (!input || !['event', 'market'].includes(input.kind)) throw Error('Only events and markets are supported');
  const common = ['kind','title','summary','description','address','venue','organizer','sourceUrl','categories','tags','neighbourhood','image','coordinates'];
  const specific = input.kind === 'event' ? ['start','end','endTimeEstimated','pricing','priceRange','tickets'] : ['occurrences','amenities','parking','transit','petFriendly','familyFriendly'];
  if (Object.keys(input).some(k => ![...common,...specific].includes(k))) throw Error('Submission contains privileged or unknown fields');
  for (const key of ['title','summary','description','address','organizer']) text(input[key], key === 'description' ? 5000 : 500);
  if (input.venue !== undefined) text(input.venue, 300);
  https(input.sourceUrl); strings(input.categories); strings(input.tags);
  if (input.neighbourhood !== undefined) text(input.neighbourhood, 120);
  if (input.image !== undefined) image(input.image);
  if (input.coordinates !== undefined) coordinates(input.coordinates);
  if (input.kind === 'event') {
    range(input); if (input.endTimeEstimated !== undefined && typeof input.endTimeEstimated !== 'boolean') throw Error('Invalid estimated end time flag'); if (!['free','paid','unknown'].includes(input.pricing)) throw Error('Invalid pricing');
    if (input.tickets !== undefined) https(input.tickets);
    if (input.priceRange !== undefined && (!Array.isArray(input.priceRange) || input.priceRange.length !== 2 || input.priceRange.some(value => typeof value !== 'number' || !Number.isFinite(value) || value < 0) || input.priceRange[1] < input.priceRange[0])) throw Error('Invalid price range');
  }
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
  const base = { id, kind: input.kind, slug: `${slugify(input.title) || input.kind}-${id.slice(0,6)}`, title: input.title.trim(), summary: input.summary.trim(), description: input.description.trim(), categories: strings(input.categories), tags: strings(input.tags), address: input.address.trim(), organizer: input.organizer.trim(), sources: [provenance], sourceId: source.id, sourceRecordId: recordId, fetchedAt: now, updatedAt: now, status: 'pending', verification: 'unverified', ...(input.venue ? { venue: input.venue.trim() } : {}), ...(input.neighbourhood ? { neighbourhood: input.neighbourhood } : {}), ...(input.image ? { image: image(input.image) } : {}), ...(input.coordinates ? { coordinates: coordinates(input.coordinates) } : {}) };
  const entity = input.kind === 'event' ? { ...base, start: input.start, end: input.end, timezone: TIMEZONE, ...(input.endTimeEstimated ? { endTimeEstimated: true } : {}), pricing: input.pricing, ...(input.priceRange ? { priceRange: input.priceRange } : {}), ...(input.tickets ? { tickets: input.tickets } : {}), cancelled: false } : { ...base, amenities: input.amenities, vendorIds: [], images: [], ...Object.fromEntries(['parking','transit','petFriendly','familyFriendly'].filter(k => input[k] !== undefined).map(k => [k,input[k]])) };
  const occurrences = input.kind === 'market' ? input.occurrences.map(o => ({ id: hash(`${id}:${o.sourceRecordId}`), marketId: id, sourceRecordId: o.sourceRecordId, start: o.start, end: o.end, cancelled: o.cancelled, timezone: TIMEZONE, source: provenance })) : [];
  return { entity, occurrences };
}

// A recurring market's occurrence window rolls forward every ingest run (this week's
// date drops off, next week's is appended) even when nothing about the market itself
// changed. That's not new content and shouldn't re-open review. It only counts as a
// rolling window when every occurrence that was still upcoming in the OLD input is
// present, unchanged, in the NEW input — an actual schedule/venue/detail edit, or a
// newly cancelled upcoming date, fails that check and correctly falls back to review.
function isRecurringWindowRoll(oldInput, newInput, now = new Date()) {
  if (!oldInput || oldInput.kind !== 'market' || newInput.kind !== 'market') return false;
  const { occurrences: oldOcc, ...oldMaster } = oldInput;
  const { occurrences: newOcc, ...newMaster } = newInput;
  if (JSON.stringify(oldMaster) !== JSON.stringify(newMaster)) return false;
  const stillUpcoming = oldOcc.filter(o => Date.parse(o.end) > now.getTime());
  return stillUpcoming.every(o => newOcc.some(n => n.sourceRecordId === o.sourceRecordId && n.start === o.start && n.end === o.end && n.cancelled === o.cancelled));
}

// Two sources rarely spell the same event/venue identically ("Scotiabank Saddledome"
// vs "555 Saddledome Rise SE"), so duplicate detection compares token overlap rather
// than exact-normalized strings. Street numbers and generic address words (types,
// directions, city/province) are noise for this purpose and are dropped before
// comparing; the venue name field is preferred over the raw address when both exist.
const LOCATION_STOPWORDS = new Set(['street','st','avenue','ave','avenu','drive','dr','road','rd','way','boulevard','blvd','trail','tr','crescent','cres','close','cl','court','ct','place','pl','lane','ln','park','pk','gate','gt','row','rise','bay','manor','mount','mt','se','sw','ne','nw','n','s','e','w','ab','alberta','calgary','canada']);
function tokens(text, stopwords) {
  const words = (text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w && !/^\d+$/.test(w) && !stopwords?.has(w));
  return new Set(words);
}
function jaccard(a, b) {
  if (!a.size && !b.size) return 0;
  const intersection = [...a].filter(x => b.has(x)).length;
  return intersection / new Set([...a, ...b]).size;
}
function duplicateCandidates(entity, entities) {
  const titleTokens = e => tokens(e.title);
  const locationTokens = e => tokens(e.venue || e.address, LOCATION_STOPWORDS);
  const entityTitle = titleTokens(entity); const entityLocation = locationTokens(entity);
  return entities.filter(e =>
    e.id !== entity.id && e.kind === entity.kind && e.status !== 'archived'
    && jaccard(titleTokens(e), entityTitle) >= 0.5
    && jaccard(locationTokens(e), entityLocation) >= 0.4
    && (e.kind !== 'event' || Math.abs(Date.parse(e.start) - Date.parse(entity.start)) < 12 * 3600000)
  ).map(e => e.id);
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
module.exports = { validateSubmission, normalizeRecord, duplicateCandidates, isRecurringWindowRoll, isFresh, eligible, publishSnapshot, hash };
