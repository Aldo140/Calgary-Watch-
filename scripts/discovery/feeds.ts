import { readFile } from 'node:fs/promises';
import { EditorialFileProvider, IcsFeedProvider, RecurringMarketProvider, TicketmasterProvider, TribeEventsProvider, type InventoryProvider, type SourceConfig, type SourceRecord } from './providers';
import domain from '../../functions/discovery-domain.cjs';

type Entity = Record<string, unknown> & { id: string; kind: string };

/**
 * Fetches every trusted source straight from the organizers: auto-published feeds and the
 * hand-reviewed records in reviewed-sources.json. Used at build time so the site never
 * depends on the ingest job having run, and by the local preview. A failing source is
 * logged and skipped.
 */
export async function collectSources(log: (m: string) => void = console.log) {
  const now = new Date().toISOString();
  const entities: Entity[] = [];
  const occurrences: Entity[] = [];
  const files: [string, boolean][] = [['scripts/discovery/automatic-sources.json', false], ['scripts/discovery/reviewed-sources.json', true]];
  for (const [file, reviewed] of files) {
    const batches: { source: SourceConfig; records?: SourceRecord[] }[] = JSON.parse(await readFile(file, 'utf8'));
    for (const { source, records } of batches) {
      if (!reviewed && !source.autoPublish) continue;
      if (source.provider === 'ticketmaster' && !process.env.TICKETMASTER_API_KEY?.trim()) { log(`skip ${source.name}: no TICKETMASTER_API_KEY`); continue; }
      const provider: InventoryProvider = records ? new EditorialFileProvider(source, records)
        : source.provider === 'ics' ? new IcsFeedProvider(source)
        : source.provider === 'tribe' ? new TribeEventsProvider(source)
        : source.provider === 'recurring-market' ? new RecurringMarketProvider(source)
        : new TicketmasterProvider(source);
      try {
        let ok = 0;
        for (const r of await provider.fetch()) {
          try {
            const n = domain.normalizeRecord(r.input, source, r.id, now);
            entities.push({ ...n.entity, status: 'published', verification: reviewed ? 'source-checked' : 'source-feed', verifiedAt: now, ...(r.cancelled ? { cancelled: true } : {}) });
            occurrences.push(...n.occurrences);
            ok++;
          } catch { /* invalid record: skipped, as in the ingest */ }
        }
        log(`${source.name}: ${ok}`);
      } catch (e) { log(`${source.name} failed: ${e instanceof Error ? e.message : String(e)}`); }
    }
  }
  return { entities, occurrences };
}

export async function editorialEntities(): Promise<Entity[]> {
  return JSON.parse(await readFile('src/content/editorial-inventory.json', 'utf8')).entities;
}
