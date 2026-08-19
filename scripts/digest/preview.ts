/**
 * Renders a sample digest to disk so it can be looked at.
 *
 *   npx tsx scripts/digest/preview.ts        → dist-preview/digest.html + .txt
 *
 * Needs no Firebase, no Resend account and no network. The whole point is that
 * the email can be reviewed, and the copy argued about, before any of the
 * external setup exists — and afterwards, whenever the template changes,
 * without spending a send or waiting for Monday.
 *
 * The fixture is deliberately mixed: a neighbour's report and three official
 * feeds, a range of distances, and one long title, because those are the rows
 * that break an email layout.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { buildDigestSummary, unsubscribeUrl, type DigestRecipient } from '../../src/lib/digest.js';
import { renderDigestHtml, renderDigestText, renderWelcomeHtml, type DigestBranding } from './render.js';
import type { Incident } from '../../src/types/index.js';

// A representative send: Monday 09:00 Calgary, which is when the job fires.
// Previewing at "now" produced "Evening, …" and misrepresented the greeting.
const NOW = Date.UTC(2026, 7, 17, 15, 0, 0);
const HOUR = 3_600_000;
const HOME = { lat: 51.0447, lng: -114.0719 };

/** Nudges a point roughly `metres` north of home, for believable distances. */
function north(metres: number) {
  return { lat: HOME.lat + metres / 111_320, lng: HOME.lng };
}

const SAMPLE: Incident[] = [
  {
    id: 'p1', title: 'Break and enter reported on the 200 block',
    description: 'Garage entered overnight.', category: 'crime',
    neighborhood: 'Beltline', ...north(240), timestamp: NOW - 8 * HOUR,
    name: 'Calgary Police Service', verified_status: 'community_confirmed',
    report_count: 3, visibility: 'public', data_source: 'official',
    source_name: 'Calgary Police Service',
  },
  {
    id: 'p2', title: 'Water main break — expect low pressure until Thursday afternoon while crews excavate',
    description: 'Crews on site.', category: 'infrastructure',
    neighborhood: 'Beltline', ...north(620), timestamp: NOW - 30 * HOUR,
    name: 'Calgary 311', verified_status: 'community_confirmed',
    report_count: 1, visibility: 'public', data_source: 'official',
    source_name: 'Calgary 311',
  },
  {
    id: 'p3', title: 'Car window smashed in the alley',
    description: 'Nothing taken.', category: 'crime',
    neighborhood: 'Beltline', ...north(880), timestamp: NOW - 52 * HOUR,
    name: 'A neighbour', verified_status: 'unverified',
    report_count: 1, visibility: 'public', data_source: 'community',
  },
  {
    id: 'p4', title: 'Lane closure at 12 Ave and 4 St SW',
    description: 'Utility work.', category: 'traffic',
    neighborhood: 'Beltline', ...north(1_050), timestamp: NOW - 76 * HOUR,
    name: '511 Alberta', verified_status: 'community_confirmed',
    report_count: 1, visibility: 'public', data_source: 'official',
    source_name: '511 Alberta',
  },
  // Last week, so it only moves the week-over-week line.
  {
    id: 'p0', title: 'Bike stolen from a rack', description: 'Locked.',
    category: 'crime', neighborhood: 'Beltline', ...north(400),
    timestamp: NOW - 9 * 24 * HOUR, name: 'A neighbour',
    verified_status: 'unverified', report_count: 1, visibility: 'public',
    data_source: 'community',
  },
];

const PROFILE: DigestRecipient = {
  uid: 'preview-uid',
  email: 'preview@example.com',
  displayName: 'Vicky Penny',
  neighborhood: 'Beltline',
  weeklyDigestOptIn: true,
  weeklyDigestOptInAt: NOW - 30 * 24 * HOUR,
};

const BRANDING: DigestBranding = {
  senderName: process.env.DIGEST_SENDER_NAME || 'Calgary Watch',
  mailingAddress: process.env.DIGEST_MAILING_ADDRESS || '4825 Mount Royal Gate SW, Calgary, AB T3E 6K6',
  supportEmail: process.env.DIGEST_SUPPORT_EMAIL || 'hello@calgarywatch.ca',
  origin: process.env.DIGEST_ORIGIN || 'https://calgarywatch.ca',
};

const summary = buildDigestSummary({ incidents: SAMPLE, profile: PROFILE, home: HOME, now: NOW });
const unsub = unsubscribeUrl(BRANDING.origin, PROFILE.uid, 'a'.repeat(32));
const shared = { summary, displayName: PROFILE.displayName, unsubscribeUrl: unsub, branding: BRANDING };

/**
 * Swap the cid: references for data URIs.
 *
 * A browser cannot resolve `cid:` — that is a mail concept — so the preview
 * would show two broken boxes and misrepresent the thing it exists to check.
 * The real send attaches the identical bytes as inline parts.
 */
function inlineArt(html: string): string {
  const asData = (path: string) =>
    `data:image/png;base64,${readFileSync(path).toString('base64')}`;
  const map: Record<string, string> = {
    'cw-shield': 'shield', 'cw-skyline': 'skyline', 'cw-emblem': 'emblem',
    'cw-step-signal': 'step-signal', 'cw-step-community': 'step-community',
    'cw-step-megaphone': 'step-megaphone',
  };
  return html.replace(/cid:([a-z-]+)/g, (whole, cid: string) => {
    const file = map[cid];
    return file ? asData(`public/images/email/${file}.png`) : whole;
  });
}

mkdirSync('dist-preview', { recursive: true });
writeFileSync('dist-preview/digest.html', inlineArt(renderDigestHtml(shared)));
writeFileSync('dist-preview/digest.txt', renderDigestText(shared));
writeFileSync('dist-preview/welcome.html', inlineArt(renderWelcomeHtml(shared)));

console.log('Wrote dist-preview/digest.html, welcome.html and digest.txt');
console.log(`Subject: ${summary.total} report(s) — ring "${summary.ringLabel}", vs ${summary.previousTotal} last week`);
