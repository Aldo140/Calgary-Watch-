// Build step: Calgary crime and safety headlines for the /safety pages and
// search (src/generated/crime-news.json). Reads each newsroom's public RSS
// feed (src/content/newsFeeds.ts, no API keys), keeps Calgary stories that
// match a safety topic, and merges them into what the live site already
// published, so the pages keep months of headlines although feeds only carry
// the last day or two. Never fails the deploy: a feed that's down is noted in
// the file and the previous headlines stay.

import { readFile, rename, writeFile } from 'node:fs/promises';
import { NEWS_FEEDS, type NewsFeed } from '../../src/content/newsFeeds';
import { mergeHeadlines, parseFeed, toHeadline, type CrimeNewsFile, type FeedStatus, type SafetyHeadline } from '../../src/lib/safetyNews';

const OUT = 'src/generated/crime-news.json';
const PUBLISHED = 'https://calgarywatch.ca/crime-news.json';
const log = (m: string) => console.log(`[news:crime] ${m}`);

async function readJson(source: string): Promise<CrimeNewsFile | null> {
  try {
    const text = source.startsWith('http')
      ? await fetch(source, { signal: AbortSignal.timeout(15_000) }).then(r => (r.ok ? r.text() : ''))
      : await readFile(source, 'utf8');
    const file = JSON.parse(text) as CrimeNewsFile;
    return Array.isArray(file.items) ? file : null;
  } catch {
    return null;
  }
}

async function readFeed(feed: NewsFeed): Promise<{ status: FeedStatus; items: SafetyHeadline[] }> {
  const errors: string[] = [];
  for (const url of feed.urls) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'CalgaryWatch/1.0 (+https://calgarywatch.ca/safety; headlines link to the original)', Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) { errors.push(`HTTP ${res.status}`); continue; }
      const parsed = parseFeed(await res.text());
      if (!parsed.length) { errors.push('no items'); continue; }
      const items = parsed.map(i => toHeadline(i, feed)).filter((h): h is SafetyHeadline => !!h);
      log(`${feed.name}: ${parsed.length} stories, ${items.length} Calgary safety headlines (${url})`);
      return { status: { id: feed.id, name: feed.name, ok: true, items: items.length, url }, items };
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  log(`${feed.name}: unavailable (${errors.join('; ')})`);
  return { status: { id: feed.id, name: feed.name, ok: false, items: 0, error: errors.join('; ').slice(0, 200) }, items: [] };
}

const committed = await readJson(OUT);
const published = await readJson(PUBLISHED);
const results = await Promise.all(NEWS_FEEDS.map(readFeed));
const fresh = results.flatMap(r => r.items);
const items = mergeHeadlines([...(published?.items ?? []), ...(committed?.items ?? [])], fresh);
const anyOk = results.some(r => r.status.ok);
const file: CrimeNewsFile = {
  updatedAt: anyOk ? new Date().toISOString() : (published?.updatedAt ?? committed?.updatedAt ?? null),
  feeds: results.map(r => r.status),
  items,
};
await writeFile(`${OUT}.tmp`, JSON.stringify(file, null, 1) + '\n');
await rename(`${OUT}.tmp`, OUT);
log(`Wrote ${items.length} headlines (${fresh.length} from this run, ${results.filter(r => r.status.ok).length}/${NEWS_FEEDS.length} feeds answered).`);
