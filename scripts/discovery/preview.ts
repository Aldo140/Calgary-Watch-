/**
 * Local preview only: fetches every auto-published feed and writes the result into
 * src/generated/discovery-index.json, exactly as the site would show it after an ingest
 * and deploy. No Firestore. Don't commit the regenerated file; the deploy exports the
 * real one (`git checkout src/generated/discovery-index.json` restores it).
 *
 *   npm run discovery:preview
 */
import { readFile, writeFile } from 'node:fs/promises';
import { IcsFeedProvider, RecurringMarketProvider, TicketmasterProvider, TribeEventsProvider, type InventoryProvider, type SourceConfig } from './providers';
import domain from '../../functions/discovery-domain.cjs';

const INDEX = 'src/generated/discovery-index.json';
const batches: { source: SourceConfig }[] = JSON.parse(await readFile('scripts/discovery/automatic-sources.json', 'utf8'));
const current = JSON.parse(await readFile(INDEX, 'utf8'));
const now = new Date().toISOString();

const entities: Record<string, unknown>[] = [];
const occurrences: Record<string, unknown>[] = [];
for (const { source } of batches) {
  if (!source.autoPublish) continue;
  if (source.provider === 'ticketmaster' && !process.env.TICKETMASTER_API_KEY) { console.log(`skip ${source.name} (no TICKETMASTER_API_KEY)`); continue; }
  const provider: InventoryProvider = source.provider === 'ics' ? new IcsFeedProvider(source)
    : source.provider === 'tribe' ? new TribeEventsProvider(source)
    : source.provider === 'recurring-market' ? new RecurringMarketProvider(source)
    : new TicketmasterProvider(source);
  try {
    let ok = 0;
    for (const r of await provider.fetch()) {
      try {
        const n = domain.normalizeRecord(r.input, source, r.id, now);
        entities.push({ ...n.entity, status: 'published', verification: 'source-feed', verifiedAt: now, ...(r.cancelled ? { cancelled: true } : {}) });
        occurrences.push(...n.occurrences);
        ok++;
      } catch { /* invalid record: the real ingest skips it too */ }
    }
    console.log(`${source.name}: ${ok}`);
  } catch (e) { console.log(`${source.name} failed: ${e instanceof Error ? e.message : e}`); }
}

const snapshot = domain.publishSnapshot(entities, occurrences);
const keep = (current.entities as { kind: string }[]).filter(e => e.kind !== 'event' && e.kind !== 'market');
await writeFile(INDEX, JSON.stringify({ ...snapshot, entities: [...keep, ...snapshot.entities] }, null, 2) + '\n');
console.log(`Wrote ${snapshot.entities.length} events and markets (${snapshot.occurrences.length} market dates) to ${INDEX}.`);
