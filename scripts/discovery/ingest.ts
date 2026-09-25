import { readFile } from 'node:fs/promises';
import { inventoryDatabase } from './firebase';
import { JsonFeedProvider, EditorialFileProvider, TicketmasterProvider, RecurringMarketProvider, IcsFeedProvider, TribeEventsProvider, type InventoryProvider, type SourceConfig, type SourceRecord } from './providers';
import store from '../../functions/discovery-store.cjs';
import domain from '../../functions/discovery-domain.cjs';

// Review locally first. Only --write uses Firestore. Sources marked autoPublish in their
// config publish on ingest (see functions/discovery-store.cjs); everything else waits for review.
const file = process.argv.find(a => a.startsWith('--file='))?.slice(7);
const write = process.argv.includes('--write');
if (!file) throw Error('Use --file=path/to/provider-batch.json [--write]');
const batches: { source: SourceConfig; records?: SourceRecord[] }[] = JSON.parse(await readFile(file, 'utf8'));

/** GitHub renders these as public run annotations, so failures are readable without the log. */
const inCi = !!process.env.GITHUB_ACTIONS;
const annotate = (level: 'error' | 'warning' | 'notice', title: string, message: string) => {
  if (inCi) console.log(`::${level} title=${title.replace(/[\r\n:,]/g, ' ')}::${message.replace(/\r?\n/g, ' ')}`);
  else console[level === 'error' ? 'error' : 'log'](`[${level}] ${title}: ${message}`);
};

function providerFor(batch: { source: SourceConfig; records?: SourceRecord[] }): InventoryProvider {
  if (batch.records) return new EditorialFileProvider(batch.source, batch.records);
  switch (batch.source.provider) {
    case 'ticketmaster': return new TicketmasterProvider(batch.source);
    case 'recurring-market': return new RecurringMarketProvider(batch.source);
    case 'ics': return new IcsFeedProvider(batch.source);
    case 'tribe': return new TribeEventsProvider(batch.source);
    default: return new JsonFeedProvider(batch.source);
  }
}

let failed = 0;
for (const batch of batches) {
  const name = batch.source.name;
  try {
    if (batch.source.provider === 'ticketmaster' && !process.env.TICKETMASTER_API_KEY?.trim()) {
      annotate('warning', name, 'Skipped: the TICKETMASTER_API_KEY secret is not set in this repository.');
      continue;
    }
    const provider = providerFor(batch);
    const fetched = await provider.fetch();
    // One malformed listing shouldn't sink a whole feed: skip it and say why.
    const records = fetched.filter(r => {
      try { domain.normalizeRecord(r.input, provider.source, r.id); return true; }
      catch (error) {
        const host = (() => { try { return new URL(r.input.sourceUrl).hostname; } catch { return 'invalid-url'; } })();
        annotate('warning', name, `Skipped record ${r.id} (${host}): ${error instanceof Error ? error.message : String(error)}`);
        return false;
      }
    });
    if (!write) { console.log(`${name}: ${records.length} valid of ${fetched.length} (dry run)`); continue; }

    const db = inventoryDatabase();
    await db.collection('discovery_sources').doc(provider.source.id).set(provider.source);

    // Fast path: an unchanged record from a trusted feed only needs its freshness bumped,
    // which avoids ingestRecord's full-collection duplicate scan for every listing.
    const raw = await db.collection('discovery_source_records').where('sourceId', '==', provider.source.id).get();
    const previous = new Map(raw.docs.map(d => [d.data().sourceRecordId as string, d.data()]));
    const now = new Date().toISOString();
    let refreshed = 0, written = 0;
    let bulk = db.batch(); let pending = 0;
    for (const record of records) {
      const old = previous.get(record.id);
      const unchanged = old && JSON.stringify(old.input) === JSON.stringify(record.input) && (old.cancelled === true) === (record.cancelled === true);
      if (unchanged && old.entityId) {
        const ref = db.collection(record.input.kind === 'event' ? 'events' : 'markets').doc(old.entityId);
        const entity = (await ref.get()).data();
        if (entity && (entity.status !== 'pending' || !provider.source.autoPublish)) {
          const reconfirm = provider.source.autoPublish && entity.verification === 'source-feed' ? { verifiedAt: now } : {};
          bulk.update(ref, { fetchedAt: now, ...reconfirm });
          if (++pending === 400) { await bulk.commit(); bulk = db.batch(); pending = 0; }
          refreshed++;
          continue;
        }
      }
      await store.ingestRecord(db, record.input, provider.source, record.id, { cancelled: record.cancelled });
      written++;
    }
    if (pending) await bulk.commit();
    annotate('notice', name, `${records.length} listings: ${written} new or changed, ${refreshed} refreshed.`);
  } catch (error) {
    failed++;
    annotate('error', name, error instanceof Error ? error.message : String(error));
  }
}
// Fail the job only when nothing worked, so one broken feed can't block the rebuild.
if (failed && failed === batches.length) process.exit(1);
