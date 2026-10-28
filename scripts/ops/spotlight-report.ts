// Exposure report for a CalgaryWatch Spotlight, in Markdown, ready to share with
// the organizer:
//
//   npx tsx scripts/ops/spotlight-report.ts hex-after-dark [--since 2026-10-27]
//
// Reads only what the site already records: page_views for the feature's path
// (with referrer host, UTM tags and per-tab session id) and the spotlight_*
// product_events (card seen/click, outbound link clicks, read depth). Counts
// only. It cannot see ticket sales or attendance, so it never claims either.
// Cost: one read per matching document (a few hundred at most).

import { appendFile } from 'node:fs/promises';
import { opsDb } from './lib/firebase';
import { spotlightBySlug, spotlightPath } from '../../src/lib/spotlights';

const slug = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'hex-after-dark';
const sinceArg = (() => { const i = process.argv.indexOf('--since'); return i > -1 ? process.argv[i + 1] : undefined; })();
const found = spotlightBySlug(slug);
if (!found) throw new Error(`No spotlight called "${slug}"`);
const spotlight = found;
const path = spotlightPath(spotlight);
const since = Date.parse(sinceArg ?? `${spotlight.published}T00:00:00-06:00`);

const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton', month: 'short', day: 'numeric' });
const count = <T,>(rows: T[], key: (r: T) => string) => {
  const m = new Map<string, number>();
  for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};
const table = (head: [string, string], rows: [string, number][]) =>
  rows.length ? [`| ${head[0]} | ${head[1]} |`, '| --- | ---: |', ...rows.map(([k, v]) => `| ${k || '(none)'} | ${v} |`)].join('\n') : '_None yet._';
const uniq = (xs: (string | undefined)[]) => new Set(xs.filter(Boolean)).size;

interface View { timestamp: number; referrer?: string; utm_source?: string; utm_campaign?: string; traffic_source?: string; sessionId?: string }
interface Ev { name: string; ts: number; at?: string; link?: string; depth?: string; sid?: string }

async function main() {
  const db = opsDb();
  const [viewSnap, evSnap] = await Promise.all([
    db.collection('page_views').where('path', '==', path).get(),
    db.collection('product_events').where('spot', '==', slug).get(),
  ]);
  const views = viewSnap.docs.map(d => d.data() as View).filter(v => v.timestamp >= since);
  const events = evSnap.docs.map(d => d.data() as Ev).filter(e => e.ts >= since);
  const of = (name: string) => events.filter(e => e.name === name);
  const linkClicks = of('spotlight_link_click');
  const cardClicks = of('spotlight_card_click');
  const cardSeen = of('spotlight_card_seen');
  const reads = of('spotlight_read');
  const outbound = linkClicks.filter(e => e.link !== 'filmmaker-email');

  const lines = [
    `# ${spotlight.name}: CalgaryWatch Spotlight report`,
    '',
    `Feature: https://calgarywatch.ca${path}  `,
    `Period: ${day.format(new Date(since))} to ${day.format(new Date())} (Calgary time)`,
    '',
    '## At a glance',
    '',
    `- **${views.length}** views of the feature from **${uniq(views.map(v => v.sessionId))}** browser sessions`,
    `- **${outbound.length}** taps on links to the festival, ScreamFest and tickets, from **${uniq(outbound.map(e => e.sid))}** sessions`,
    `- **${cardSeen.length}** times the spotlight card was shown on CalgaryWatch, and **${cardClicks.length}** taps on it`,
    `- **${reads.filter(r => r.depth === 'middle').length}** sessions read as far as the films, **${reads.filter(r => r.depth === 'end').length}** to the end`,
    '',
    '## Outbound taps by link',
    '',
    table(['Link', 'Taps'], count(linkClicks, e => e.link ?? '')),
    '',
    '## Where readers came from',
    '',
    table(['Source', 'Views'], count(views, v => v.traffic_source ?? 'direct')),
    '',
    table(['Campaign tag', 'Views'], count(views.filter(v => v.utm_campaign || v.utm_source), v => [v.utm_source, v.utm_campaign].filter(Boolean).join(' / '))),
    '',
    table(['Referring site', 'Views'], count(views.filter(v => v.referrer), v => v.referrer!)),
    '',
    '## Card placements',
    '',
    table(['Placement (seen)', 'Times'], count(cardSeen, e => e.at ?? '')),
    '',
    table(['Placement (tapped)', 'Taps'], count(cardClicks, e => e.at ?? '')),
    '',
    '## Views by day',
    '',
    table(['Day', 'Views'], count(views, v => day.format(new Date(v.timestamp))).sort((a, b) => Date.parse(`${a[0]} 2026`) - Date.parse(`${b[0]} 2026`))),
    '',
    '---',
    'What this measures: page views, card impressions and link taps recorded by CalgaryWatch itself. A session is one browser tab. It does not measure ticket sales or attendance, and people who tapped through may have bought tickets elsewhere or not at all. Visitors who block storage or scripts are not counted.',
  ];
  const md = lines.join('\n');
  console.log(md);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `${md}\n`);
}

main().catch(error => { console.error(error); process.exit(1); });
