/**
 * Build step: "Popular right now" for the search boxes and /search
 * (src/generated/search-trends.json), from the last 30 days of anonymous
 * search_demand rows. Rules (what may be shown, and under whose name) live in
 * src/lib/searchTrendsBuild.ts.
 *
 *   npm run search:trends          # needs FIREBASE_SERVICE_ACCOUNT, or gcloud ADC
 *
 * Never fails the deploy: when Firestore can't be read, the copy the live
 * site published last stays, else the committed one. In CI it logs counts
 * only, since raw search terms don't belong in build logs; run it locally to
 * see the terms that landed nowhere (the list for docs/search-gap-profiles.md).
 */
import { readFile, rename, writeFile } from 'node:fs/promises';
import { discoveryRepository } from '../../src/data/discovery';
import { readDemandRecords, SEARCH_DEMAND } from '../../src/lib/searchDemand';
import { readTrends, type SearchTrendsFile } from '../../src/lib/searchTrends';
import { buildSearchTrends, TREND_WINDOW_DAYS } from '../../src/lib/searchTrendsBuild';

const OUT = 'src/generated/search-trends.json';
const PUBLISHED = 'https://calgarywatch.ca/search-trends.json';
/** Reads per deploy are capped: Firestore's free tier is 50,000 reads a day and every deploy runs this. */
const MAX_ROWS = 1500;
const log = (m: string) => console.log(`[search:trends] ${m}`);

async function write(file: SearchTrendsFile) {
  await writeFile(`${OUT}.tmp`, `${JSON.stringify(file, null, 2)}\n`);
  await rename(`${OUT}.tmp`, OUT);
}

async function keepPrevious(reason: string) {
  log(`${reason}; keeping the last published list`);
  try {
    const res = await fetch(PUBLISHED, { signal: AbortSignal.timeout(15_000) });
    const file = res.ok ? await res.json() as SearchTrendsFile : null;
    if (file && readTrends(file).length) { await write({ ...file, items: readTrends(file) }); log(`kept ${file.items.length} from ${PUBLISHED}`); return; }
  } catch { /* offline: the committed copy stays */ }
  log(`kept the committed ${OUT} (${readTrends(JSON.parse(await readFile(OUT, 'utf8'))).length} items)`);
}

async function main() {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT && !process.env.GOOGLE_APPLICATION_CREDENTIALS && process.env.CI) return keepPrevious('no Firestore credentials');
  let values: unknown[];
  try {
    const { inventoryDatabase } = await import('./firebase');
    const since = Date.now() - TREND_WINDOW_DAYS * 86_400_000;
    const snap = await inventoryDatabase().collection(SEARCH_DEMAND).where('ts', '>=', since).orderBy('ts', 'desc').limit(MAX_ROWS).get();
    values = snap.docs.map(d => d.data());
  } catch (err) {
    return keepPrevious(`search_demand unreadable (${err instanceof Error ? err.message.split('\n')[0] : String(err)})`);
  }
  const { rows, ignored } = readDemandRecords(values);
  const { file, searches, unresolved } = buildSearchTrends(rows, discoveryRepository.list(), discoveryRepository.occurrences());
  await write(file);
  log(`${rows.length} searches (${ignored} ignored) → ${file.items.length} popular destinations`);
  const empty = unresolved.filter(u => u.lastResults === 0);
  log(`${unresolved.length} terms land on no single page; ${empty.length} of them still find nothing`);
  if (process.env.CI) {
    log('terms are not printed in CI. Run `npm run search:trends` locally, or see Admin → Search demand.');
  } else {
    for (const t of file.items) log(`popular   ${searches.get(t.to)}×  ${t.label}  →  ${t.to}`);
    for (const u of empty.slice(0, 30)) log(`no answer ${u.searches}×  ${u.q}   (npm run search:gaps -- "${u.q}")`);
  }
}

await main();
