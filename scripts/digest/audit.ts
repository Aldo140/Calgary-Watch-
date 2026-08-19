/**
 * Audits the real emails for legibility and prints a table.
 *
 *   npm run digest:contrast
 *
 * Exits non-zero on any WCAG AA failure, so it can gate a build rather than
 * being something somebody remembers to look at.
 */

import {
  buildDigestSummary, unsubscribeUrl, type DigestRecipient,
} from '../../src/lib/digest.js';
import { renderDigestHtml, renderWelcomeHtml, type DigestBranding } from './render.js';
import { auditContrast } from './contrast.js';
import type { Incident } from '../../src/types/index.js';

const NOW = Date.UTC(2026, 7, 17, 15);
const HOME = { lat: 51.0447, lng: -114.0719 };
const H = 3_600_000;
const near = (m: number) => ({ lat: HOME.lat + m / 111_320, lng: HOME.lng });

const mk = (o: Partial<Incident> & { id: string }): Incident => ({
  title: 'A report', description: 'x', category: 'crime', neighborhood: 'Beltline',
  ...near(300), timestamp: NOW - H, name: 'A neighbour', verified_status: 'unverified',
  report_count: 1, visibility: 'public', data_source: 'community', ...o,
} as Incident);

const INCIDENTS = [
  mk({ id: 'a', title: 'Break and enter reported on the 200 block', ...near(240), data_source: 'official', source_name: 'Calgary Police Service' }),
  mk({ id: 'b', title: 'Water main break', ...near(620), timestamp: NOW - 30 * H, category: 'infrastructure', data_source: 'official', source_name: 'Calgary 311' }),
  mk({ id: 'c', title: 'Car window smashed in the alley', ...near(880), timestamp: NOW - 52 * H }),
  mk({ id: 'd', title: 'Lane closure at 12 Ave and 4 St SW', ...near(1050), timestamp: NOW - 76 * H, category: 'traffic', data_source: 'official', source_name: '511 Alberta' }),
];

const BRANDING: DigestBranding = {
  senderName: 'Calgary Watch',
  mailingAddress: '2011 Ulster Road NW, Calgary, AB T2N 4G6',
  supportEmail: 'jorti104@mtroyal.ca',
  origin: 'https://calgarywatch.ca',
};

/**
 * Every situation a real subscriber can be in.
 *
 * Auditing only the happy path would miss the copy that exists precisely for
 * the awkward cases — the city-wide fallback, the location prompt, the quiet
 * week — which is where an unchecked colour is most likely to be hiding.
 */
const CASES: Array<{ name: string; profile: DigestRecipient; home: typeof HOME | null }> = [
  {
    name: 'address saved',
    profile: { uid: 'a', email: 'a@b.co', displayName: 'Aldo', neighborhood: 'Beltline', weeklyDigestOptIn: true, weeklyDigestOptInAt: 1 },
    home: HOME,
  },
  {
    name: 'neighbourhood only',
    profile: { uid: 'b', email: 'a@b.co', displayName: 'Aldo', neighborhood: 'Beltline', weeklyDigestOptIn: true, weeklyDigestOptInAt: 1 },
    home: null,
  },
  {
    name: 'no location at all',
    profile: { uid: 'c', email: 'a@b.co', displayName: 'Aldo', weeklyDigestOptIn: true, weeklyDigestOptInAt: 1 },
    home: null,
  },
  {
    name: 'outside our coverage',
    profile: { uid: 'd', email: 'a@b.co', displayName: 'Aldo', neighborhood: 'Saskatoon', weeklyDigestOptIn: true, weeklyDigestOptInAt: 1 },
    home: null,
  },
];

let failures = 0;
let checked = 0;

for (const testCase of CASES) {
  const summary = buildDigestSummary({
    incidents: INCIDENTS, profile: testCase.profile, home: testCase.home, now: NOW,
  });
  const shared = {
    summary, displayName: 'Aldo',
    unsubscribeUrl: unsubscribeUrl(BRANDING.origin, testCase.profile.uid, 'a'.repeat(32)),
    branding: BRANDING,
  };
  for (const [kind, html] of [
    ['digest', renderDigestHtml(shared)], ['welcome', renderWelcomeHtml(shared)],
  ] as const) {
    const findings = auditContrast(html);
    checked += findings.length;
    const bad = findings.filter((f) => !f.passes);
    const label = `${testCase.name} / ${kind}`;
    if (bad.length === 0) {
      console.log(`  PASS  ${label.padEnd(34)} ${findings.length} text nodes, scope=${summary.scope}`);
    } else {
      failures += bad.length;
      console.log(`  FAIL  ${label.padEnd(34)} ${bad.length} of ${findings.length} below AA`);
      for (const f of bad.sort((x, y) => x.ratio - y.ratio)) {
        console.log(`          ${f.ratio.toFixed(2)}:1 (needs ${f.required}) `
          + `${f.colour} on ${f.background} @${f.fontPx}px${f.bold ? ' bold' : ''}`);
        console.log(`          "${f.text}"`);
      }
    }
  }
}

console.log(`\n  ${checked} text nodes checked across ${CASES.length} subscriber situations.`);
if (failures > 0) {
  console.error(`  ${failures} below WCAG AA.\n`);
  process.exit(1);
}
console.log('  All legible.\n');
