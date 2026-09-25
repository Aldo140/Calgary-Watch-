import { mkdir, rename, writeFile } from 'node:fs/promises';
import domain from '../../functions/discovery-domain.cjs';
import { collectSources, editorialEntities } from './feeds';

/**
 * Builds src/generated/discovery-index.json for the site, from three inputs:
 *  1. Curated neighbourhoods, guides and local places (src/content/editorial-inventory.json).
 *  2. Events and markets fetched live from trusted organizer feeds at build time.
 *  3. Firestore: anything an editor published, and any draft/archive/cancel decision,
 *     which always overrides the feed copy of the same listing.
 * Firestore is optional (local runs, outages); the build still ships 1 and 2.
 */
type Entity = Record<string, unknown> & { id: string; kind: string; status?: string };

const log = (m: string) => console.log(`[export] ${m}`);
const feed = await collectSources(log);

let stored: { entities: Entity[]; occurrences: Entity[] } = { entities: [], occurrences: [] };
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  try {
    const { inventoryDatabase } = await import('./firebase');
    const db = inventoryDatabase();
    stored = await db.runTransaction(async tx => {
      const [events, markets, occ] = await Promise.all(['events', 'markets', 'market_occurrences'].map(c => tx.get(db.collection(c))));
      return { entities: [...events.docs, ...markets.docs].map(d => d.data() as Entity), occurrences: occ.docs.map(d => d.data() as Entity) };
    });
    log(`Firestore: ${stored.entities.length} events and markets`);
  } catch (e) { log(`Firestore unavailable, building from feeds only: ${e instanceof Error ? e.message : String(e)}`); }
} else log('No Firestore credentials; building from feeds only.');

// An editor's decision in Firestore wins over the feed copy of the same listing.
const byId = new Map<string, Entity>(feed.entities.map(e => [e.id, e]));
for (const e of stored.entities) {
  if (e.status === 'published') byId.set(e.id, e);
  else if (e.status === 'draft' || e.status === 'archived') byId.delete(e.id);
}
// The same listing can arrive from two sources (e.g. an automatic market schedule and a
// hand-reviewed record). Keep the first: same kind, same title and, for events, same start.
const norm = (v: unknown) => String(v ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const seen = new Set<string>();
for (const [id, e] of byId) {
  const key = `${e.kind}|${norm(e.title)}|${e.kind === 'event' ? e.start : ''}`;
  if (seen.has(key)) byId.delete(id); else seen.add(key);
}
const occById = new Map<string, Entity>(feed.occurrences.map(o => [o.id, o]));
for (const o of stored.occurrences) if (!occById.has(o.id)) occById.set(o.id, o);

const snapshot = domain.publishSnapshot([...byId.values()], [...occById.values()]);
const editorial = await editorialEntities();
const index = { ...snapshot, entities: [...editorial, ...snapshot.entities] };

await mkdir('src/generated', { recursive: true });
await writeFile('src/generated/discovery-index.json.tmp', JSON.stringify(index, null, 2) + '\n');
await rename('src/generated/discovery-index.json.tmp', 'src/generated/discovery-index.json');
log(`Wrote ${editorial.length} editorial entries, ${snapshot.entities.length} events and markets, ${snapshot.occurrences.length} market dates.`);
