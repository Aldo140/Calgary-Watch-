import { readFile, writeFile } from 'node:fs/promises';
import { SPOTLIGHTS } from '../../src/content/spotlights';
import { createDiscoveryRepository } from '../../src/lib/discovery';
import type { DiscoveryEntity, MarketOccurrence } from '../../src/types/discovery';

const source = new URL('../../src/generated/discovery-index.json', import.meta.url);
const inventory = JSON.parse(await readFile(source, "utf8")) as { generatedAt: string; entities: DiscoveryEntity[]; occurrences: MarketOccurrence[] };
const repository = createDiscoveryRepository(inventory.entities, inventory.occurrences);
// Cover a week of browsing plus several days of tolerance for missed rebuilds.
const now = Date.now();
const through = now + 12 * 86_400_000;
const inWindow = (start: string, end: string) => Date.parse(end) > now && Date.parse(start) < through;
const occurrences = repository.occurrences().filter(item => !item.cancelled && inWindow(item.start, item.end));
const spotlightSources = new Set(SPOTLIGHTS.flatMap(spotlight => spotlight.relatedSourceIds));
const markets = new Set(occurrences.map(item => item.marketId));
const listed = repository.list();
const entities = [
  ...listed.filter(item => item.kind === "neighbourhood"
    || (item.kind === "event" && (inWindow(item.start, item.end)
      || (item.sourceId && spotlightSources.has(item.sourceId) && Date.parse(item.end) > now)))
    || (item.kind === "market" && markets.has(item.id))),
  ...listed.filter(item => item.kind === "guide").slice(0, 3),
  ...listed.filter(item => item.kind === "business").slice(0, 4),
];
await writeFile(new URL('../../src/generated/home-inventory.json', import.meta.url), JSON.stringify({ generatedAt: inventory.generatedAt, entities, occurrences }));
