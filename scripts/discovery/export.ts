import {mergePartnerUpdates} from './partnerUpdates';
import { mergeOrganizationContent, mergeOrganizationOccurrences, ORGANIZATION_LIVE, type OrganizationProjection } from '../../src/lib/organizationWorkspace';
import { ownerEditTargets, applyOwnerOccurrences, applyOwnerContent, OWNER_CONTENT } from '../../src/lib/ownerListingEdits';
import { associateOrganizers } from '../../src/lib/organizations';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import domain from '../../functions/discovery-domain.cjs';
import { collectSources, editorialEntities } from './feeds';
import { isCampusOnly } from '../../src/lib/eventRank';
import { applyOwnerVerification, ownerVerification, type ClaimRecord, type VerifiedMarkRecord } from '../../src/lib/verified';

/**
 * Builds src/generated/discovery-index.json for the site, from three inputs:
 *  1. Curated neighbourhoods, guides and local places (src/content/editorial-inventory.json).
 *  2. Events and markets fetched live from trusted organizer feeds at build time.
 *  3. Firestore: anything an editor published, and any draft/archive/cancel decision,
 *     which always overrides the feed copy of the same listing.
 *  4. Firestore: approved listing claims, which mark a listing verified (src/lib/verified.ts).
 * Firestore is optional (local runs, outages); the build still ships 1 and 2.
 */
type Entity = Record<string, unknown> & { id: string; kind: string; status?: string };

const log = (m: string) => console.log(`[export] ${m}`);
let cachedOrder: Map<string, number> | undefined;
const feed = await collectSources(log);
if (process.env.DISCOVERY_OFFLINE === '1') {
  // Retain the checked-in snapshot when live feeds are deliberately unavailable.
  // Reviewed updates win by exact ID; do not delete unrelated production inventory.
  const cached = JSON.parse(await readFile('src/generated/discovery-index.json', 'utf8')) as { entities: Entity[]; occurrences: Entity[] };
  cachedOrder = new Map(cached.entities.map((e, i) => [e.id, i]));
  const ids = new Set(feed.entities.map(e => e.id));
  for (const e of cached.entities) if (['event', 'market'].includes(e.kind) && !ids.has(e.id)) feed.entities.push(e);
  const occurrences = new Set(feed.occurrences.map(o => o.id));
  for (const o of cached.occurrences) if (!occurrences.has(o.id)) feed.occurrences.push(o);
}

let stored: { entities: Entity[]; occurrences: Entity[] } = { entities: [], occurrences: [] };
let claims: { approved: ClaimRecord[]; marks: VerifiedMarkRecord[] } = { approved: [], marks: [] };
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  try {
    const { inventoryDatabase } = await import('./firebase');
    const db = inventoryDatabase();
    // Firestore retries an exhausted quota for as long as it is allowed to, which
    // used to hold the whole deploy until the job timed out. Cap it: past this,
    // build from the feeds, exactly as when Firestore is unreachable.
    const read = db.runTransaction(async tx => {
      const [events, markets, occ] = await Promise.all(['events', 'markets', 'market_occurrences'].map(c => tx.get(db.collection(c))));
      return { entities: [...events.docs, ...markets.docs].map(d => d.data() as Entity), occurrences: occ.docs.map(d => d.data() as Entity) };
    });
    stored = await Promise.race([
      read,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timed out after 90s (quota exhausted?)')), 90_000).unref()),
    ]);
    log(`Firestore: ${stored.entities.length} events and markets`);
  } catch (e) { log(`Firestore unavailable, building from feeds only: ${e instanceof Error ? e.message : String(e)}`); }
  // Verified listings: only an approved claim counts. The public mark supplies the date.
  try {
    const { inventoryDatabase } = await import('./firebase');
    const db = inventoryDatabase();
    const [approved, marks] = await Promise.race([
      Promise.all([
        db.collection('listing_claims').where('status', '==', 'approved').select('entityId', 'status', 'reviewedAt', 'approvedOrganizationId').get(),
        db.collection('verified_listings').select('entityId', 'verifiedAt').get(),
      ]),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timed out after 30s')), 30_000).unref()),
    ]);
    claims = {
      approved: approved.docs.map(d => ({ entityId: String(d.get('entityId') ?? ''), ...(d.get('approvedOrganizationId')?{approvedOrganizationId:String(d.get('approvedOrganizationId'))}:{}), status: String(d.get('status') ?? ''), reviewedAt: d.get('reviewedAt') ?? null })),
      marks: marks.docs.map(d => ({ entityId: d.id, verifiedAt: d.get('verifiedAt') ?? null })),
    };
    log(`Verified listings: ${claims.approved.length} approved claims`);
  } catch (e) { log(`Claims unavailable, no listing marked verified this build: ${e instanceof Error ? e.message : String(e)}`); }
} else log('No Firestore credentials; building from feeds only.');

// An editor's decision in Firestore wins over the feed copy of the same listing.
const byId = new Map<string, Entity>(feed.entities.map(e => [e.id, e]));
for (const e of stored.entities) {
  if (e.status === 'published') byId.set(e.id, e);
  else if (e.status === 'draft' || e.status === 'archived') byId.delete(e.id);
}
// Reconcile partner confirmations before generic title/date deduplication can discard an older canonical ID.
const partnerSourceIds=new Set(['atp-partner-season-2026-27','werklund-partner-season-2026-27','calgary-folk-festival-partner']);
const blocked=new Set(stored.entities.filter(e=>e.status==='draft'||e.status==='archived').map(e=>e.id));
const confirmations=feed.entities.filter(e=>e.kind==='event'&&partnerSourceIds.has(String(e.sourceId))&&!blocked.has(e.id));
const reconciled=mergePartnerUpdates([...byId.values()] as unknown as import('../../src/types/discovery').DiscoveryEntity[],confirmations as unknown as import('../../src/types/discovery').Event[]);
byId.clear();for(const entity of reconciled)byId.set(entity.id,entity as unknown as Entity);
// The same listing can arrive from two sources (e.g. an automatic market schedule and a
// hand-reviewed record). Keep the first: same kind, same title and, for events, same start.
const norm = (v: unknown) => String(v ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const seen = new Set<string>();
for (const [id, e] of byId) {
  const key = `${e.kind}|${norm(e.title)}|${e.kind === 'event' ? e.start : ''}`;
  if (seen.has(key)) byId.delete(id); else seen.add(key);
}
// Tourism Calgary relists many organizers' events under slightly different titles. The
// organizer's own listing wins: drop a Tourism Calgary copy whose title contains, or is
// contained in, another source's title for the same kind of thing on the same day (any
// day for markets, which carry their dates separately).
const others = [...byId.values()].filter(e => e.sourceId !== 'visit-calgary');
for (const [id, e] of byId) {
  if (e.sourceId !== 'visit-calgary') continue;
  const t = norm(e.title), day = String(e.start ?? '').slice(0, 10);
  if (t.length < 8) continue;
  if (others.some(o => { const u = norm(o.title); return u.length >= 8 && (u.includes(t) || t.includes(u)) && (o.kind === 'market' || String(o.start ?? '').slice(0, 10) === day); })) byId.delete(id);
}
// University calendars also publish things meant only for their own students and staff
// (study-break crafts in a numbered room, info sessions). They aren't city events.
let campus = 0;
for (const [id, e] of byId) if (e.kind === 'event' && isCampusOnly(e as never)) { byId.delete(id); campus++; }
if (campus) log(`Left out ${campus} campus-only listings`);
const occById = new Map<string, Entity>(feed.occurrences.map(o => [o.id, o]));
for (const o of stored.occurrences) if (!occById.has(o.id)) occById.set(o.id, o);

const snapshot = domain.publishSnapshot([...byId.values()], [...occById.values()]);
const editorial = await editorialEntities();
// Stamped last, over every source, so nothing a feed or entity document says about itself survives.
const verified = ownerVerification(claims.approved, claims.marks);
let entities:Entity[] = applyOwnerVerification(associateOrganizers(mergePartnerUpdates([...editorial,...snapshot.entities] as unknown as import('../../src/types/discovery').DiscoveryEntity[])), verified) as unknown as Entity[];
// Applied owner edits win over feeds on every subsequent rebuild. Protected metadata is untouched.
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  const { inventoryDatabase } = await import('./firebase');
  // Fail closed: never deploy a feed-only rebuild which silently erases accepted owner content.
  const content = await inventoryDatabase().collection(OWNER_CONTENT).get();
  const ownerRecords=content.docs.map(d => d.data() as {rootId:string;entityId:string;changes:Record<string,unknown>;appliedAt?:number}).filter(record=>ownerEditTargets(record.rootId,entities as unknown as import('../../src/types/discovery').DiscoveryEntity[]).some(e=>e.id===record.entityId));
  snapshot.occurrences=applyOwnerOccurrences(snapshot.occurrences,ownerRecords);
  entities = applyOwnerContent(entities as unknown as import('../../src/types/discovery').DiscoveryEntity[], ownerRecords) as unknown as Entity[];
  log(`Owner content: ${content.size} applied listing overrides`);
}
if (cachedOrder) entities.sort((a, b) => (cachedOrder!.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (cachedOrder!.get(b.id) ?? Number.MAX_SAFE_INTEGER));
if(process.env.FIREBASE_SERVICE_ACCOUNT){
  const {inventoryDatabase}=await import('./firebase');
  const live=await inventoryDatabase().collection(ORGANIZATION_LIVE).get();
  entities=mergeOrganizationContent(entities as unknown as import('../../src/types/discovery').DiscoveryEntity[],live.docs.map(d=>d.data() as OrganizationProjection)) as unknown as Entity[];
  snapshot.occurrences=mergeOrganizationOccurrences(snapshot.occurrences,live.docs.map(d=>d.data() as OrganizationProjection));
  entities=applyOwnerVerification(entities,verified);
  log(`Organization submissions: ${live.size} live records merged, including removals`);
}
const index = { ...snapshot, entities };
const stamped = entities.filter(e => e.ownerVerifiedAt).length;
if (stamped) log(`Marked ${stamped} listings verified`);

await mkdir('src/generated', { recursive: true });
await writeFile('src/generated/discovery-index.json.tmp', JSON.stringify(index, null, 2) + '\n');
await rename('src/generated/discovery-index.json.tmp', 'src/generated/discovery-index.json');
log(`Wrote ${editorial.length} editorial entries, ${snapshot.entities.length} events and markets, ${snapshot.occurrences.length} market dates.`);
