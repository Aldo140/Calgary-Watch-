/**
 * Crime feed audit: what every crime source says right now, and what the map
 * would keep from it, with the reason for each item it drops.
 *
 *   npx tsx scripts/ingest/audit-feeds.ts
 *
 * Reads the feeds only; it never writes to Firestore and needs no secrets.
 * The news hosts and data.calgary.ca refuse cloud sandboxes, so this runs on
 * GitHub's runners (crime-feed-audit.yml) whenever the ingest rules change.
 */

import { appendFileSync } from 'node:fs';
import { fetchCalgary311Crime } from './sources/calgary-311.js';
import { normalizeCalgaryPoliceFeed, parseCalgaryPoliceFeed } from './sources/calgary-police-news.js';
import { loadCommunityPoints } from './sources/community-locator.js';
import { judgeNewsItem, placeWithPolice, readNewsFeeds } from './sources/rss.js';
import type { NormalizedIncident } from './types.js';

const lines: string[] = [];
const out = (line = '') => { console.log(line); lines.push(line); };

const unplaced = new Map<string, NormalizedIncident>();

async function auditNews(points: Awaited<ReturnType<typeof loadCommunityPoints>>): Promise<void> {
  out('## News feeds');
  out('');
  out('| Feed | Items | Kept | Top reasons dropped |');
  out('|---|---:|---:|---|');
  const kept: string[] = [];
  const dropped: string[] = [];
  const seen = new Set<string>();
  for (const read of await readNewsFeeds()) {
    if (read.error) { out(`| ${read.feed.name} (${read.feed.id}) | — | — | ${read.error} |`); continue; }
    const reasons = new Map<string, number>();
    let keptHere = 0;
    for (const item of read.items) {
      const d = judgeNewsItem(read.feed, item, points);
      if (d.keep) {
        keptHere++;
        if (!seen.has(d.incident.dedup_key)) {
          seen.add(d.incident.dedup_key);
          kept.push(`- **${d.incident.category}** · ${d.incident.neighborhood} · ${d.incident.title} _(${d.incident.source_name})_`);
        }
      } else {
        reasons.set(d.reason, (reasons.get(d.reason) ?? 0) + 1);
        if (d.unplaced) unplaced.set(d.unplaced.dedup_key, d.unplaced);
        if (d.reason !== 'not an incident' && d.reason !== 'older than a week') dropped.push(`- ${d.reason}: ${item.title}`);
      }
    }
    const top = [...reasons].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([r, n]) => `${r} ${n}`).join(', ');
    out(`| ${read.feed.name} (${read.feed.id}) | ${read.items.length} | ${keptHere} | ${top} |`);
  }
  out('');
  out(`### Kept (${kept.length} distinct stories)`);
  kept.forEach((k) => out(k));
  out('');
  out('### Dropped for place or outlet (worth a look)');
  dropped.slice(0, 40).forEach((d) => out(d));
  out('');
}

async function auditPolice(points: Awaited<ReturnType<typeof loadCommunityPoints>>): Promise<void> {
  out('## Calgary Police newsroom');
  try {
    const res = await fetch('https://newsroom.calgary.ca/tagfeed/en/tags/police', {
      headers: { 'User-Agent': 'CalgaryWatch/1.0 (community safety aggregator)', Accept: 'application/rss+xml, application/xml, text/xml' },
      signal: AbortSignal.timeout(20_000),
    });
    out(`HTTP ${res.status}`);
    const xml = await res.text();
    const items = parseCalgaryPoliceFeed(xml);
    const kept = normalizeCalgaryPoliceFeed(xml, Date.now(), points);
    const keptLinks = new Set(kept.map((k) => k.source_url));
    out(`${items.length} releases listed, ${kept.length} placed on the map.`);
    out('');
    kept.forEach((k) => out(`- **${k.category}** · ${k.neighborhood} · ${k.title}`));
    out('');
    out('Not placed:');
    items.filter((i) => !keptLinks.has(i.link)).forEach((i) => out(`- ${i.title}`));
    out('');
    const placed = placeWithPolice([...unplaced.values()], kept);
    out(`News stories placed by their police release: ${placed.length} of ${unplaced.size} unplaced`);
    placed.forEach((p) => out(`- ${p.neighborhood} · ${p.title} _(${p.source_name})_`));
  } catch (err) {
    out(`Failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  out('');
}

async function audit311(): Promise<void> {
  out('## City of Calgary 311');
  try {
    const rows = await fetchCalgary311Crime();
    const byLabel = new Map<string, number>();
    for (const r of rows) {
      const label = r.title.replace(/ reported in .*$/, '');
      byLabel.set(label, (byLabel.get(label) ?? 0) + 1);
    }
    out(`${rows.length} requests this run.`);
    [...byLabel].sort((a, b) => b[1] - a[1]).forEach(([label, n]) => out(`- ${label}: ${n}`));
  } catch (err) {
    out(`Failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  out('');
}

const points = await loadCommunityPoints();
out(`# Crime feed audit — ${new Date().toISOString()}`);
out(`Community names loaded: ${points.length}`);
out('');
await auditNews(points);
await auditPolice(points);
await audit311();
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
