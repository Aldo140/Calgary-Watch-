import { readFile } from 'node:fs/promises';
import { inventoryDatabase } from './firebase';
import { JsonFeedProvider, EditorialFileProvider, type InventoryProvider, type SourceConfig, type SourceRecord } from './providers';
import store from '../../functions/discovery-store.cjs';
import domain from '../../functions/discovery-domain.cjs';

// Review locally first. Only --write uses Firestore; no ingestion path publishes.
const file = process.argv.find(a => a.startsWith('--file='))?.slice(7);
const write = process.argv.includes('--write');
if (!file) throw Error('Use --file=path/to/provider-batch.json [--write]');
const batches: { source: SourceConfig; records?: SourceRecord[] }[] = JSON.parse(await readFile(file,'utf8'));
for (const batch of batches) {
  const provider: InventoryProvider = batch.records ? new EditorialFileProvider(batch.source,batch.records) : new JsonFeedProvider(batch.source);
  const records = await provider.fetch();
  // Validate the entire provider batch before starting mutations.
  records.forEach(r => domain.normalizeRecord(r.input,provider.source,r.id));
  if (!write) { console.log(`${provider.source.name}: ${records.length} valid records (dry run)`); continue; }
  const db = inventoryDatabase();
  await db.collection('discovery_sources').doc(provider.source.id).set(provider.source);
  for (const record of records) console.log(await store.ingestRecord(db,record.input,provider.source,record.id,{ cancelled:record.cancelled }));
}
