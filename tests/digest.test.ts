/**
 * Guardrails for the weekly digest.
 *
 * The failure modes this protects against are not the usual ones. A bug in a
 * map component shows up on screen; a bug here shows up as a duplicate email to
 * several hundred people, or a deleted report resurfacing in an inbox, or a
 * message that is unlawful to have sent. None of those can be taken back, so
 * they are checked here rather than caught in production.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import {
  buildDigestSummary,
  consentRefusal,
  consentTimestamp,
  consentTimestampIsInferred,
  deltaSentence,
  digestSendId,
  digestSubject,
  digestWeekKey,
  isMailable,
  isValidUnsubToken,
  mayEmail,
  neighborhoodMatches,
  unsubscribeUrl,
  type DigestRecipient,
} from '../src/lib/digest.js';
import {
  assertBrandingComplete,
  escapeHtml,
  renderDigestHtml,
  renderDigestText,
  renderWelcomeHtml,
  renderWelcomeText,
  type DigestBranding,
} from '../scripts/digest/render.js';
import { WELCOME, leadParagraph, listHeading, locationPrompt, spell, spellCap } from '../scripts/digest/copy.js';
import { contrastFailures, contrastRatio, requiredRatio } from '../scripts/digest/contrast.js';
import { pngSize, validateImages } from '../scripts/digest/images.js';
import { letterheadImages, welcomeImages } from '../scripts/digest/art.js';
import { loadSenderConfig, unsubscribeHeaders } from '../scripts/digest/send.js';
import type { Incident } from '../src/types/index.js';
import {
  normalizeDigestContribution,
  upcomingDigestWeeks,
  type DigestContribution,
} from '../src/lib/digestPlanner.js';

const NOW = Date.UTC(2026, 7, 19, 15, 0, 0); // 19 Aug 2026, 09:00 MDT
const HOUR = 3_600_000;
const HOME = { lat: 51.0447, lng: -114.0719 };

function at(metres: number) {
  return { lat: HOME.lat + metres / 111_320, lng: HOME.lng };
}

function incident(over: Partial<Incident> & { id: string }): Incident {
  return {
    title: 'A report', description: 'Body text', category: 'crime',
    neighborhood: 'Beltline', lat: HOME.lat, lng: HOME.lng, timestamp: NOW - HOUR,
    name: 'A neighbour', verified_status: 'unverified', report_count: 1,
    visibility: 'public', data_source: 'community',
    ...over,
  } as Incident;
}

const PROFILE: DigestRecipient = {
  uid: 'u1', email: 'resident@example.com', displayName: 'Vicky Penny',
  neighborhood: 'Beltline', weeklyDigestOptIn: true, weeklyDigestOptInAt: NOW - 10 * 86_400_000,
};

const BRANDING: DigestBranding = {
  senderName: 'Calgary Watch',
  mailingAddress: '4825 Mount Royal Gate SW, Calgary, AB T3E 6K6',
  supportEmail: 'hello@calgarywatch.ca',
  origin: 'https://calgarywatch.ca',
};

// ── Consent ─────────────────────────────────────────────────────────────────

describe('consent', () => {
  it('requires an explicit opt-in, not merely the absence of a refusal', () => {
    assert.equal(consentRefusal({ ...PROFILE, weeklyDigestOptIn: undefined }), 'not-opted-in');
    assert.equal(consentRefusal({ ...PROFILE, weeklyDigestOptIn: false }), 'not-opted-in');
  });

  it('does not accept a truthy non-boolean as consent', () => {
    // An old document carrying a string must not become permission to email.
    const sloppy = { ...PROFILE, weeklyDigestOptIn: 'yes' as unknown as boolean };
    assert.equal(mayEmail(sloppy), false);
  });

  it('requires the consent timestamp CASL expects us to be able to produce', () => {
    assert.equal(consentRefusal({ ...PROFILE, weeklyDigestOptInAt: null }), 'no-consent-timestamp');
    assert.equal(consentRefusal({ ...PROFILE, weeklyDigestOptInAt: 0 }), 'no-consent-timestamp');
  });

  it('rejects missing and malformed addresses', () => {
    assert.equal(consentRefusal({ ...PROFILE, email: '   ' }), 'no-email');
    assert.equal(consentRefusal({ ...PROFILE, email: 'not-an-address' }), 'invalid-email');
    assert.equal(consentRefusal(PROFILE), null);
  });
});

// ── Idempotency ─────────────────────────────────────────────────────────────

describe('week identity', () => {
  it('is stable across the whole Calgary week', () => {
    const monday = Date.UTC(2026, 7, 17, 15);
    const sunday = Date.UTC(2026, 7, 23, 15);
    assert.equal(digestWeekKey(monday), digestWeekKey(sunday));
  });

  it('rolls over between consecutive Mondays, so two sends never share a key', () => {
    const a = digestWeekKey(Date.UTC(2026, 7, 17, 15));
    const b = digestWeekKey(Date.UTC(2026, 7, 24, 15));
    assert.notEqual(a, b);
  });

  it('uses the Calgary calendar day, not the UTC one', () => {
    // 06:00 UTC Monday is still Sunday evening in Calgary, so it belongs to the
    // previous ISO week. A UTC-based key would file it under the new one and
    // let Monday's real run send a second copy.
    const sundayEveningCalgary = Date.UTC(2026, 7, 17, 4);
    assert.equal(digestWeekKey(sundayEveningCalgary), digestWeekKey(Date.UTC(2026, 7, 13, 15)));
  });

  it('matches the ISO-8601 format the ledger id is built from', () => {
    assert.match(digestWeekKey(NOW), /^\d{4}-W\d{2}$/);
    assert.equal(digestSendId('abc', '2026-W34'), 'abc_2026-W34');
  });
});

describe('weekly email planner', () => {
  it('offers the next Monday first and keeps every option in ISO week order', () => {
    const weeks = upcomingDigestWeeks(NOW, 3);
    assert.equal(weeks.length, 3);
    assert.equal(weeks[0].weekKey, '2026-W35');
    assert.equal(weeks[1].weekStart - weeks[0].weekStart, 7 * 86_400_000);
  });

  it('rejects empty or unknown contribution formats', () => {
    assert.equal(normalizeDigestContribution({ weekKey: '2026-W35', body: '', style: 'news-brief' }), null);
    assert.equal(normalizeDigestContribution({ weekKey: '2026-W35', body: 'Useful update', style: 'loud' }), null);
  });

  it('renders the planned note before the standard greeting and escapes admin input', () => {
    const summary = buildDigestSummary({ incidents: [], profile: PROFILE, home: HOME, now: NOW });
    const contribution: DigestContribution = {
      weekKey: summary.weekKey,
      weekStart: NOW,
      headline: '<This week>',
      body: 'A personal note & update.',
      style: 'personal-story',
      status: 'published',
    };
    const html = renderDigestHtml({
      summary,
      contribution,
      unsubscribeUrl: unsubscribeUrl(BRANDING.origin, 'u1', 'a'.repeat(32)),
      branding: BRANDING,
    });
    assert.ok(html.indexOf('&lt;This week&gt;') < html.indexOf('Morning,'));
    assert.ok(!html.includes('<This week>'));

    const text = renderDigestText({
      summary,
      contribution,
      unsubscribeUrl: unsubscribeUrl(BRANDING.origin, 'u1', 'a'.repeat(32)),
      branding: BRANDING,
    });
    assert.ok(text.indexOf('<This week>') < text.indexOf('Morning,'));
  });
});

// ── Selection ───────────────────────────────────────────────────────────────

describe('what may be mailed', () => {
  it('never mails a report a moderator has hidden or deleted', () => {
    // An email cannot be recalled when a takedown lands an hour later, so
    // visibility has to be honoured at selection time.
    assert.equal(isMailable(incident({ id: 'a', visibility: 'flagged' }), NOW), false);
    assert.equal(isMailable(incident({ id: 'b', visibility: 'deleted' }), NOW), false);
    assert.equal(isMailable(incident({ id: 'c', deleted: true, visibility: undefined }), NOW), false);
  });

  it('never mails a staged example as if it were a real event', () => {
    assert.equal(isMailable(incident({ id: 'd', data_source: 'demo' }), NOW), false);
  });

  it('never mails an ingested record that has already expired off the map', () => {
    assert.equal(isMailable(incident({ id: 'e', expires_at: NOW - 1 }), NOW), false);
    assert.equal(isMailable(incident({ id: 'f', expires_at: NOW + HOUR }), NOW), true);
  });

  it('drops records with unusable coordinates', () => {
    assert.equal(isMailable(incident({ id: 'g', lat: NaN }), NOW), false);
  });
});

describe('summary', () => {
  it('counts only the last seven days', () => {
    const s = buildDigestSummary({
      incidents: [
        incident({ id: 'in', ...at(300), timestamp: NOW - 2 * 86_400_000 }),
        incident({ id: 'out', ...at(300), timestamp: NOW - 9 * 86_400_000 }),
      ],
      profile: PROFILE, home: HOME, now: NOW,
    });
    assert.equal(s.total, 1);
    assert.equal(s.items[0].incident.id, 'in');
  });

  it('widens the ring rather than reporting an empty walk', () => {
    // A genuinely quiet block would otherwise open with "0 reports within a
    // 15-minute walk", which describes the radius we chose, not their area.
    const s = buildDigestSummary({
      incidents: [incident({ id: 'far', ...at(2_400) })],
      profile: PROFILE, home: HOME, now: NOW,
    });
    assert.equal(s.total, 1);
    assert.equal(s.ringLabel, 'within 3 km');
  });

  it('compares last week over the same ring it reported this week', () => {
    const s = buildDigestSummary({
      incidents: [
        incident({ id: 'now1', ...at(2_400) }),
        incident({ id: 'prev-near', ...at(2_400), timestamp: NOW - 9 * 86_400_000 }),
        // Outside the 3 km ring that was chosen: must not inflate the baseline.
        incident({ id: 'prev-far', ...at(8_000), timestamp: NOW - 9 * 86_400_000 }),
      ],
      profile: PROFILE, home: HOME, now: NOW,
    });
    assert.equal(s.ringLabel, 'within 3 km');
    assert.equal(s.previousTotal, 1);
    assert.equal(s.delta, 0);
    assert.equal(deltaSentence(s), 'The same as last week.');
  });

  it('gives no fake precision to someone who only gave a community name', () => {
    const s = buildDigestSummary({
      incidents: [incident({ id: 'x', neighborhood: 'Beltline' })],
      profile: PROFILE, home: null, now: NOW,
    });
    assert.equal(s.total, 1);
    assert.equal(s.items[0].distanceM, null);
    assert.equal(s.ringLabel, 'in Beltline');
  });

  it('says a quiet week is quiet instead of dressing it up', () => {
    const s = buildDigestSummary({ incidents: [], profile: PROFILE, home: HOME, now: NOW });
    assert.equal(s.quiet, true);
    assert.equal(digestSubject(s), 'A quiet week in Beltline');
    assert.equal(deltaSentence(s), null);
  });

  it('names the count and the place in the subject line', () => {
    const s = buildDigestSummary({
      incidents: [incident({ id: 'a', ...at(100) }), incident({ id: 'b', ...at(200) })],
      profile: PROFILE, home: HOME, now: NOW,
    });
    assert.equal(digestSubject(s), '2 reports near you this week — Beltline');
  });
});

describe('neighbourhood matching', () => {
  it('survives the four house styles the registries use', () => {
    assert.equal(neighborhoodMatches('SADDLE RIDGE', 'Saddleridge'), true);
    assert.equal(neighborhoodMatches('Saddleridge Industrial', 'Saddle Ridge'), true);
  });

  it('does not match across unrelated communities', () => {
    assert.equal(neighborhoodMatches('Beltline', 'Bowness'), false);
  });

  it('refuses to match on a fragment too short to mean anything', () => {
    assert.equal(neighborhoodMatches('NW', 'Bowness'), false);
  });
});

// ── The email itself ────────────────────────────────────────────────────────

describe('CASL compliance', () => {
  const summary = buildDigestSummary({
    incidents: [incident({ id: 'a', ...at(150) })], profile: PROFILE, home: HOME, now: NOW,
  });
  const unsub = unsubscribeUrl(BRANDING.origin, 'u1', 'a'.repeat(32));

  it('refuses to render without a physical mailing address', () => {
    assert.throws(
      () => assertBrandingComplete({ ...BRANDING, mailingAddress: '' }),
      /DIGEST_MAILING_ADDRESS/,
    );
  });

  it('refuses to render with a placeholder address', () => {
    assert.throws(
      () => assertBrandingComplete({ ...BRANDING, mailingAddress: 'YOUR_ADDRESS_HERE' }),
      /placeholder/,
    );
  });

  it('puts sender, address and unsubscribe in the HTML part', () => {
    const html = renderDigestHtml({ summary, unsubscribeUrl: unsub, branding: BRANDING });
    assert.ok(html.includes(BRANDING.mailingAddress));
    assert.ok(html.includes(BRANDING.senderName));
    // The href is HTML-escaped, so the `&` between the query parameters is
    // `&amp;` in the markup. That is the correct encoding — mail clients decode
    // it — but it means the raw URL will not appear verbatim.
    assert.ok(html.includes(escapeHtml(unsub)));
    assert.ok(!html.includes(`href="${unsub}"`), 'the raw ampersand must not survive into the markup');
    assert.match(html, />Unsubscribe</);
  });

  it('puts them in the plain-text part too', () => {
    const text = renderDigestText({ summary, unsubscribeUrl: unsub, branding: BRANDING });
    assert.ok(text.includes(BRANDING.mailingAddress));
    assert.ok(text.includes(unsub));
  });

  it('offers the native unsubscribe control mail clients look for', () => {
    const config = loadSenderConfig({ DIGEST_DRY_RUN: '1', DIGEST_SUPPORT_EMAIL: 'hello@calgarywatch.ca' } as NodeJS.ProcessEnv);
    const headers = unsubscribeHeaders(
      { to: 'a@b.co', subject: 's', html: '', text: '', unsubscribeUrl: unsub }, config,
    );
    assert.ok(headers['List-Unsubscribe'].includes(unsub));
    assert.ok(headers['List-Unsubscribe'].includes('mailto:hello@calgarywatch.ca'));
    // One-click needs a POST endpoint that static hosting cannot provide.
    // Advertising it without honouring it is worse than not advertising it.
    assert.equal(headers['List-Unsubscribe-Post'], undefined);
  });
});

describe('rendering', () => {
  it('escapes report titles, which are user input', () => {
    const s = buildDigestSummary({
      incidents: [incident({ id: 'x', ...at(100), title: '<img src=x onerror=alert(1)>' })],
      profile: PROFILE, home: HOME, now: NOW,
    });
    const html = renderDigestHtml({
      summary: s, unsubscribeUrl: unsubscribeUrl(BRANDING.origin, 'u1', 'a'.repeat(32)), branding: BRANDING,
    });
    assert.ok(!html.includes('<img src=x'));
    assert.ok(html.includes('&lt;img src=x'));
  });

  it('escapes every HTML-significant character', () => {
    assert.equal(escapeHtml(`<&>"'`), '&lt;&amp;&gt;&quot;&#39;');
  });

  it('carries its artwork inline, never from a URL', () => {
    const s = buildDigestSummary({
      incidents: [incident({ id: 'a', ...at(100) })], profile: PROFILE, home: HOME, now: NOW,
    });
    const shared = {
      summary: s, unsubscribeUrl: unsubscribeUrl(BRANDING.origin, 'u1', 'a'.repeat(32)),
      branding: BRANDING,
    };
    for (const [label, html] of [
      ['digest', renderDigestHtml(shared)], ['welcome', renderWelcomeHtml(shared)],
    ] as const) {
      const imgs = html.match(/<img\s[^>]*>/gi) ?? [];
      assert.ok(imgs.length > 0, `${label} should carry the letterhead`);
      for (const img of imgs) {
        // Every image is a cid: reference. A hosted URL is one missed deploy
        // from a broken rectangle in mail that has already gone out, which is
        // exactly how this broke the first time.
        assert.match(img, /src="cid:/, `${label}: images must be inline parts`);
        assert.ok(!/src="https?:/.test(img), `${label}: no remote image`);
        // Decorative, because the wordmark beside it is live text — a reader
        // with images off must still get a masthead, not an empty box.
        assert.match(img, /alt=""/, `${label}: letterhead art is decorative`);
        assert.match(img, /width="\d+"/, `${label}: images need explicit width`);
      }
      assert.ok(html.includes('CALGARY&nbsp;WATCH'), `${label} needs a live-text wordmark`);
      assert.ok(!/<script/i.test(html), `${label} must have no script`);
      assert.ok(!/<link\s/i.test(html), `${label} must have no external stylesheet`);
    }
  });
  });

// ── Wiring ──────────────────────────────────────────────────────────────────

describe('unsubscribe link', () => {
  it('carries the account and its token', () => {
    const url = new URL(unsubscribeUrl('https://calgarywatch.ca', 'u1', 'b'.repeat(32)));
    assert.equal(url.pathname, '/unsubscribe');
    assert.equal(url.searchParams.get('uid'), 'u1');
    assert.equal(url.searchParams.get('t'), 'b'.repeat(32));
  });

  it('only accepts a token of the shape the sender mints', () => {
    assert.equal(isValidUnsubToken('a'.repeat(32)), true);
    assert.equal(isValidUnsubToken(''), false);
    assert.equal(isValidUnsubToken('short'), false);
    assert.equal(isValidUnsubToken('A'.repeat(32)), false); // lowercase hex only
  });
});

describe('sender safety valves', () => {
  it('will not run without an API key unless it is a dry run', () => {
    assert.throws(() => loadSenderConfig({} as NodeJS.ProcessEnv), /RESEND_API_KEY/);
    assert.doesNotThrow(() => loadSenderConfig({ DIGEST_DRY_RUN: '1' } as NodeJS.ProcessEnv));
  });

  it('caps a single run, so a bad recipient query cannot mail the database', () => {
    const config = loadSenderConfig({ DIGEST_DRY_RUN: '1' } as NodeJS.ProcessEnv);
    assert.ok(config.limit > 0 && config.limit <= 100);
  });
});

describe('pipeline wiring', () => {
  const rules = readFileSync('firestore.rules', 'utf8');
  const page = readFileSync('src/pages/UnsubscribePage.tsx', 'utf8');
  const app = readFileSync('src/App.tsx', 'utf8');
  const workflow = readFileSync('.github/workflows/weekly-digest.yml', 'utf8');

  it('routes the path the emails link to', () => {
    assert.match(app, /path="\/unsubscribe"/);
  });

  it('keeps the send ledger unreadable by clients', () => {
    const block = rules.slice(rules.indexOf('match /digest_sends/'));
    assert.match(block.slice(0, 200), /allow read, write: if false;/);
  });

  it('gates unsubscribe writes on the account token, not on being signed in', () => {
    const block = rules.slice(rules.indexOf('match /digest_unsubscribes/'));
    assert.ok(block.includes('digestUnsubToken'));
    assert.ok(block.includes('request.resource.data.token.size() == 32'));
  });

  it('files a request the sender can find', () => {
    // The sender queries processedAt == null; Firestore cannot match a field
    // that is absent, so the page has to write it explicitly.
    assert.match(page, /processedAt: null/);
    assert.match(page, /digest_unsubscribes/);
  });

  it('defaults a manual run to sending nothing', () => {
    assert.match(workflow, /dry_run[\s\S]{0,200}default: true/);
  });

  it('releases the ledger claim whenever nothing was actually sent', () => {
    const weekly = readFileSync('scripts/digest/weekly.ts', 'utf8');
    // A rehearsal that keeps its claim marks the week spent, and the real
    // Monday run then skips everybody as already sent — which made the safest
    // way to test the single most destructive thing you could do.
    const block = weekly.slice(weekly.indexOf('if (result.skipped)'));
    assert.match(block.slice(0, 300), /claim\.delete\(\)/);
    assert.ok(!weekly.includes("'dry-run'"), 'a dry run must leave no ledger row at all');
  });

  it('keeps the allowlist wired into the workflow', () => {
    // The one guard standing between a scheduled run and everybody's inbox.
    assert.match(workflow, /DIGEST_ALLOWLIST/);
  });
});


// ── The welcome email ───────────────────────────────────────────────────────

describe('the first email', () => {
  const summary = buildDigestSummary({
    incidents: [incident({ id: 'a', ...at(150) })], profile: PROFILE, home: HOME, now: NOW,
  });
  const shared = {
    summary, displayName: 'Aldo',
    unsubscribeUrl: unsubscribeUrl(BRANDING.origin, 'u1', 'a'.repeat(32)),
    branding: BRANDING,
  };

  it('says why it landed in their inbox, up top rather than in the footer', () => {
    const html = renderWelcomeHtml(shared);
    assert.ok(html.includes(escapeHtml(WELCOME.reason)), 'welcome must state the reason');
    // Before the sign-off, not buried at the bottom with the legal text.
    assert.ok(html.indexOf(escapeHtml(WELCOME.reason)) < html.indexOf(WELCOME.signOff),
      'the reason must come before the sign-off');
  });

  it('is signed by the team, not by one person', () => {
    const html = renderWelcomeHtml(shared);
    assert.ok(html.includes('The Calgary Watch team'));
    // A single name promises one pair of hands answering every reply.
    assert.ok(!/—\s*Aldo/.test(html), 'must not be signed with an individual name');
  });

  it('explains who this is and what will arrive', () => {
    const html = renderWelcomeHtml(shared);
    assert.ok(html.includes('Every Monday'), 'must say how often it comes');
    assert.ok(/Calgary Police/.test(html), 'must say where the data comes from');
  });

  it('asks for a reply, and is signed by a person', () => {
    const html = renderWelcomeHtml(shared);
    assert.ok(html.includes('Reply to this one'), 'must invite a reply');
    assert.ok(html.includes(WELCOME.signOff), 'must be signed');
  });

  it('still carries the week it was sent in, so the format explains itself', () => {
    const html = renderWelcomeHtml(shared);
    // Compared against the escaped form: the copy is full of apostrophes, and
    // the renderer escapes them, so the raw string is never in the output.
    assert.ok(html.includes(escapeHtml(WELCOME.sampleIntro)), 'welcome must introduce the sample digest');
    assert.ok(html.includes('A report'), 'welcome must contain the week\'s reports');
  });

  it('carries the same CASL footer as every other message', () => {
    for (const out of [renderWelcomeHtml(shared), renderWelcomeText(shared)]) {
      assert.ok(out.includes(BRANDING.mailingAddress), 'CASL: mailing address');
      assert.ok(out.includes(BRANDING.senderName), 'CASL: sender identity');
      assert.ok(out.includes('nsubscribe'), 'CASL: unsubscribe');
    }
  });

  it('says the same thing in the text part as in the HTML', () => {
    // Both read from copy.ts, so a wording change lands in both or neither.
    const text = renderWelcomeText(shared);
    for (const para of WELCOME.paragraphs) {
      const firstWords = para.split(/\s+/).slice(0, 4).join(' ');
      assert.ok(text.includes(firstWords), `text part is missing: ${firstWords}`);
    }
  });
});

describe('voice', () => {
  it('spells small numbers the way a person writes them', () => {
    assert.equal(spell(4), 'four');
    assert.equal(spell(10), 'ten');
    assert.equal(spell(23), '23');
    assert.equal(spellCap(3), 'Three');
  });

  it('puts the count in a sentence rather than leaving it as a metric', () => {
    const s = buildDigestSummary({
      incidents: [incident({ id: 'a', ...at(100) }), incident({ id: 'b', ...at(200) })],
      profile: PROFILE, home: HOME, now: NOW,
    });
    assert.match(leadParagraph(s), /^Two things were reported/);
  });

  it('states a quiet week plainly instead of dressing it up', () => {
    const s = buildDigestSummary({ incidents: [], profile: PROFILE, home: HOME, now: NOW });
    const lead = leadParagraph(s);
    assert.match(lead, /Nothing was reported/);
    assert.ok(!/unfortunately|sorry|no news is good news/i.test(lead));
  });

  it('never apologises for the email or thanks you for your attention', () => {
    const s = buildDigestSummary({
      incidents: [incident({ id: 'a', ...at(100) })], profile: PROFILE, home: HOME, now: NOW,
    });
    const html = renderDigestHtml({
      summary: s, unsubscribeUrl: unsubscribeUrl(BRANDING.origin, 'u1', 'a'.repeat(32)),
      branding: BRANDING,
    });
    assert.ok(!/sorry|apolog|thank you for your (time|attention)|we're thrilled/i.test(html));
  });
});

// ── Every subscriber, not just the ideal one ────────────────────────────────

describe('who gets a useful email', () => {
  const city = [
    incident({ id: 'far1', neighborhood: 'Bowness', lat: 51.0880, lng: -114.1950 }),
    incident({ id: 'far2', neighborhood: 'Forest Lawn', lat: 51.0400, lng: -113.9700 }),
    incident({ id: 'near', ...at(300), neighborhood: 'Beltline' }),
  ];

  it('gives a resolved address real distances', () => {
    const s = buildDigestSummary({ incidents: city, profile: PROFILE, home: HOME, now: NOW });
    assert.equal(s.scope, 'home');
    assert.equal(s.needsLocation, false);
    assert.ok(s.items.every((i) => i.distanceM !== null));
  });

  it('gives a neighbourhood name its community, without inventing distances', () => {
    const s = buildDigestSummary({ incidents: city, profile: PROFILE, home: null, now: NOW });
    assert.equal(s.scope, 'community');
    assert.equal(s.ringLabel, 'in Beltline');
    assert.ok(s.items.every((i) => i.distanceM === null));
  });

  it('never tells somebody with no location that their area was quiet', () => {
    // The bug this prevents: an empty list because we do not know where they
    // live, reported as "nothing happened near you" — a claim they have no way
    // to check and which is simply false.
    const noLocation: DigestRecipient = {
      uid: 'n', email: 'n@e.com', weeklyDigestOptIn: true, weeklyDigestOptInAt: 1,
    };
    const s = buildDigestSummary({ incidents: city, profile: noLocation, home: null, now: NOW });
    assert.equal(s.scope, 'city');
    assert.equal(s.needsLocation, true);
    assert.equal(s.quiet, false, 'a city-wide digest still has content');
    assert.equal(s.total, city.length);
    // Assert the intent, not the wording: it must name the city as the scope
    // and must never imply we know how close any of it was to them.
    const lead = leadParagraph(s);
    assert.match(lead, /Calgary/);
    assert.ok(!/near you|around you|your block/i.test(lead),
      'must not claim proximity we cannot know');
    assert.ok(!/nothing|quiet/i.test(lead), 'must not report our ignorance as their quiet week');
  });

  it('still serves somebody outside the areas we cover', () => {
    const elsewhere: DigestRecipient = {
      uid: 'e', email: 'e@e.com', neighborhood: 'Saskatoon',
      weeklyDigestOptIn: true, weeklyDigestOptInAt: 1,
    };
    const s = buildDigestSummary({ incidents: city, profile: elsewhere, home: null, now: NOW });
    assert.equal(s.scope, 'city');
    assert.equal(s.widenedToCity, true);
    assert.ok(s.total > 0, 'they get the city rather than an empty page');
  });

  it('widens to the city when their own area had a genuinely quiet week', () => {
    const quietArea: DigestRecipient = {
      uid: 'q', email: 'q@e.com', neighborhood: 'Tuxedo Park',
      weeklyDigestOptIn: true, weeklyDigestOptInAt: 1,
    };
    const s = buildDigestSummary({ incidents: city, profile: quietArea, home: null, now: NOW });
    assert.equal(s.scope, 'city');
    assert.equal(s.widenedToCity, true);
    // ...and says so, rather than passing the city off as their neighbourhood.
    const lead = leadParagraph(s);
    assert.match(lead, /own area was quiet/i);
    assert.match(lead, /whole city/i);
  });

  it('asks for a location only from people who have not given one', () => {
    const noLocation: DigestRecipient = {
      uid: 'n', email: 'n@e.com', weeklyDigestOptIn: true, weeklyDigestOptInAt: 1,
    };
    const anonymous = buildDigestSummary({ incidents: city, profile: noLocation, home: null, now: NOW });
    assert.ok(locationPrompt(anonymous), 'somebody unplaceable should be asked');

    const quietArea: DigestRecipient = {
      uid: 'q', email: 'q@e.com', neighborhood: 'Tuxedo Park',
      weeklyDigestOptIn: true, weeklyDigestOptInAt: 1,
    };
    const placed = buildDigestSummary({ incidents: city, profile: quietArea, home: null, now: NOW });
    assert.equal(locationPrompt(placed), null,
      'somebody whose area was merely quiet must not be told to fix their settings');
  });

  it('only claims the list is closest-first when it actually is', () => {
    // Needs two nearby reports: a single-item list is headed "What happened"
    // whatever the scope, because "closest first" says nothing about one row.
    const twoNearby = [
      incident({ id: 'n1', ...at(200), neighborhood: 'Beltline' }),
      incident({ id: 'n2', ...at(500), neighborhood: 'Beltline' }),
    ];
    const withHome = buildDigestSummary({ incidents: twoNearby, profile: PROFILE, home: HOME, now: NOW });
    assert.equal(withHome.scope, 'home');
    assert.match(listHeading(withHome), /closest first/);

    // Same two reports, no address: matched by name, so there are no distances
    // and the ordering the heading would claim does not exist.
    const withoutHome = buildDigestSummary({ incidents: twoNearby, profile: PROFILE, home: null, now: NOW });
    assert.equal(withoutHome.scope, 'community');
    assert.ok(!/closest/.test(listHeading(withoutHome)), 'no distances, no such claim');
  });
});

// ── Legibility, measured rather than asserted ───────────────────────────────

describe('contrast', () => {
  const BRANDING_OK = BRANDING;
  const cases: Array<[string, DigestRecipient, { lat: number; lng: number } | null]> = [
    ['address', PROFILE, HOME],
    ['neighbourhood', PROFILE, null],
    ['no location', { uid: 'n', email: 'n@e.com', weeklyDigestOptIn: true, weeklyDigestOptInAt: 1 }, null],
  ];

  it('computes WCAG ratios correctly', () => {
    // Black on white is the reference value in the spec: exactly 21:1.
    assert.equal(Math.round(contrastRatio('#000000', '#FFFFFF')!), 21);
    assert.equal(Math.round(contrastRatio('#FFFFFF', '#FFFFFF')!), 1);
  });

  it('applies the large-text threshold only where it applies', () => {
    assert.equal(requiredRatio(14, false), 4.5);
    assert.equal(requiredRatio(19, true), 3);    // 18.66px+ bold counts as large
    assert.equal(requiredRatio(19, false), 4.5); // ...but not at normal weight
    assert.equal(requiredRatio(24, false), 3);
  });

  for (const [label, profile, home] of cases) {
    it(`every word is legible — ${label}`, () => {
      const summary = buildDigestSummary({
        incidents: [incident({ id: 'a', ...at(150) })], profile, home, now: NOW,
      });
      const shared = {
        summary, displayName: 'Aldo',
        unsubscribeUrl: unsubscribeUrl(BRANDING_OK.origin, 'u1', 'a'.repeat(32)),
        branding: BRANDING_OK,
      };
      for (const [kind, html] of [
        ['digest', renderDigestHtml(shared)], ['welcome', renderWelcomeHtml(shared)],
      ] as const) {
        const bad = contrastFailures(html);
        assert.equal(bad.length, 0,
          `${kind}: ${bad.map((f) => `${f.ratio}:1 ${f.colour} on ${f.background} "${f.text}"`).join('; ')}`);
      }
    });
  }
});

// ── Consent that predates the field that records it ─────────────────────────

describe('legacy consent', () => {
  const legacy: DigestRecipient = {
    uid: 'old', email: 'old@e.com', weeklyDigestOptIn: true,
    weeklyDigestOptInAt: null, onboardingCompletedAt: 1_700_000_000_000,
  };

  it('still emails somebody who opted in before the timestamp existed', () => {
    // Eight of the first fifteen subscribers were in exactly this state, and
    // the gate was silently dropping every one of them.
    assert.equal(consentRefusal(legacy), null);
    assert.equal(consentTimestamp(legacy), 1_700_000_000_000);
  });

  it('prefers the direct field whenever it is there', () => {
    const both = { ...legacy, weeklyDigestOptInAt: 1_800_000_000_000 };
    assert.equal(consentTimestamp(both), 1_800_000_000_000);
    assert.equal(consentTimestampIsInferred(both), false);
  });

  it('flags a recovered date so it can be written back', () => {
    assert.equal(consentTimestampIsInferred(legacy), true);
  });

  it('is not a way in for somebody who never opted in', () => {
    // The fallback only ever supplies a DATE for consent that already exists.
    const never = { ...legacy, weeklyDigestOptIn: false };
    assert.equal(consentTimestamp(never), null);
    assert.equal(consentRefusal(never), 'not-opted-in');
    const absent = { ...legacy, weeklyDigestOptIn: undefined };
    assert.equal(consentTimestamp(absent), null);
  });

  it('refuses when the account can produce no evidence at all', () => {
    const bare: DigestRecipient = { uid: 'b', email: 'b@e.com', weeklyDigestOptIn: true };
    assert.equal(consentRefusal(bare), 'no-consent-timestamp');
  });
});

// ── Images, the most reliable source of defects in this template ────────────

describe('images', () => {
  const summary = buildDigestSummary({
    incidents: [incident({ id: 'a', ...at(150) })], profile: PROFILE, home: HOME, now: NOW,
  });
  const shared = {
    summary, displayName: 'Aldo',
    unsubscribeUrl: unsubscribeUrl(BRANDING.origin, 'u1', 'a'.repeat(32)),
    branding: BRANDING,
  };

  it('the weekly digest ships exactly the art it shows', () => {
    const problems = validateImages(renderDigestHtml(shared), letterheadImages());
    assert.deepEqual(problems, [], problems.map((p) => `${p.kind}: ${p.detail}`).join('; '));
  });

  it('the welcome ships exactly the art it shows', () => {
    const problems = validateImages(renderWelcomeHtml(shared), welcomeImages());
    assert.deepEqual(problems, [], problems.map((p) => `${p.kind}: ${p.detail}`).join('; '));
  });

  it('does not put the welcome-only art on every weekly digest', () => {
    // The emblem and the three step icons are ~85 KB. Shipping them weekly to
    // every subscriber, in a message that never shows them, is the kind of
    // waste nobody notices because nothing visibly breaks.
    const weeklyCids = letterheadImages().map((i) => i.cid);
    assert.ok(!weeklyCids.includes('cw-emblem'));
    assert.ok(!weeklyCids.some((c) => c.startsWith('cw-step-')));
    assert.ok(welcomeImages().length > letterheadImages().length);
  });

  it('catches a cid that is referenced but not attached', () => {
    const problems = validateImages('<img src="cid:nope" width="10" height="10" alt="">', []);
    assert.equal(problems[0].kind, 'missing-attachment');
  });

  it('catches a hosted image, which is how this broke the first time', () => {
    const problems = validateImages(
      '<img src="https://calgarywatch.ca/x.png" width="10" height="10" alt="">', [],
    );
    assert.equal(problems[0].kind, 'remote-image');
  });

  it('catches art declared at the wrong aspect ratio', () => {
    // The three step icons were cropped to their own ink, giving three
    // different ratios, while the template rendered all of them at 44x44.
    const [shield] = letterheadImages();
    const squashed = `<img src="cid:${shield.cid}" width="40" height="200" alt="">`;
    const problems = validateImages(squashed, [shield]);
    assert.equal(problems[0].kind, 'distorted');
  });

  it('reads real dimensions out of the attached PNG', () => {
    const [shield] = letterheadImages();
    const size = pngSize(shield.base64);
    assert.ok(size && size.width > 0 && size.height > 0);
  });

  it('requires dimensions and alt on every image', () => {
    const [shield] = letterheadImages();
    assert.equal(validateImages(`<img src="cid:${shield.cid}" alt="">`, [shield])[0].kind, 'no-dimensions');
    const noAlt = `<img src="cid:${shield.cid}" width="38" height="51">`;
    assert.ok(validateImages(noAlt, [shield]).some((p) => p.kind === 'no-alt'));
  });

});

// ── The subject line, which is the half most people read ────────────────────

describe('subject lines', () => {
  const many = Array.from({ length: 12 }, (_, i) =>
    incident({ id: `s${i}`, ...at(200 + i * 40), neighborhood: 'Beltline' }));

  it('only says "near you" when a distance was actually measured', () => {
    const home = buildDigestSummary({ incidents: many, profile: PROFILE, home: HOME, now: NOW });
    assert.equal(home.scope, 'home');
    assert.match(digestSubject(home), /near you/);
  });

  it('never says "near you" to somebody we could not place', () => {
    // This shipped: "50 reports near you this week" to a city-wide digest for
    // an account with no location on it at all.
    const anonymous: DigestRecipient = {
      uid: 'x', email: 'x@e.com', weeklyDigestOptIn: true, weeklyDigestOptInAt: 1,
    };
    const city = buildDigestSummary({ incidents: many, profile: anonymous, home: null, now: NOW });
    assert.equal(city.scope, 'city');
    assert.ok(!/near you/i.test(digestSubject(city)), digestSubject(city));
    assert.match(digestSubject(city), /Calgary/);
  });

  it('names the community when that is what we matched on', () => {
    const community = buildDigestSummary({ incidents: many, profile: PROFILE, home: null, now: NOW });
    assert.equal(community.scope, 'community');
    assert.match(digestSubject(community), /in Beltline/);
    assert.ok(!/near you/i.test(digestSubject(community)));
  });

  it('tidies the case community names arrive in', () => {
    const messy: DigestRecipient = {
      uid: 'm', email: 'm@e.com', neighborhood: 'inglewood',
      weeklyDigestOptIn: true, weeklyDigestOptInAt: 1,
    };
    const s = buildDigestSummary({
      incidents: [incident({ id: 'i', neighborhood: 'INGLEWOOD' })],
      profile: messy, home: null, now: NOW,
    });
    assert.match(digestSubject(s), /Inglewood/);
  });
});

// ── The artwork must carry its own contrast ─────────────────────────────────

describe('artwork is opaque', () => {
  /** Every pixel's alpha, straight out of the PNG. */
  function isFullyOpaque(base64: string): boolean {
    const buf = Buffer.from(base64, 'base64');
    // Colour type lives at byte 25 of a PNG: 6 = RGBA, 4 = grey+alpha.
    // Anything without an alpha channel is opaque by definition.
    const colourType = buf[25];
    return colourType !== 6 && colourType !== 4;
  }

  it('every mark ships with its background baked in', () => {
    // This is the whole guarantee. Transparent art inherits whatever the client
    // decided the page is, and a client that forces dark leaves images alone —
    // dark ink on a now-dark page, invisible. CSS cannot rescue it either: the
    // clients that force dark are the ones that strip the <style> block. An
    // image's own pixels are the one thing no mail client repaints.
    for (const image of welcomeImages()) {
      assert.ok(isFullyOpaque(image.base64),
        `${image.filename} still has an alpha channel and can vanish on a dark page`);
    }
  });

  it('keeps the whole payload small enough to be welcome in an inbox', () => {
    const bytes = welcomeImages().reduce((n, i) => n + Buffer.from(i.base64, 'base64').length, 0);
    assert.ok(bytes < 300_000, `letterhead is ${Math.round(bytes / 1024)} KB`);
  });

  it('the weekly digest carries only the two marks it shows', () => {
    const bytes = letterheadImages().reduce((n, i) => n + Buffer.from(i.base64, 'base64').length, 0);
    assert.equal(letterheadImages().length, 2);
    assert.ok(bytes < 200_000, `weekly letterhead is ${Math.round(bytes / 1024)} KB`);
  });
});

// ── The page and the plate must be the same black ───────────────────────────

describe('the seam', () => {
  const renderSrc = readFileSync('scripts/digest/render.ts', 'utf8');
  const artSrc = readFileSync('scripts/prepare-email-art.ts', 'utf8');

  it('the plate baked into the art is exactly the page colour', () => {
    // Two near-blacks do not blend, they seam. The plate was #121413 while the
    // page was black, and every mark showed its own faint rectangle. They are
    // the same constant now, and this is what stops them drifting apart again.
    const page = /page:\s*'(#[0-9A-Fa-f]{6})'/.exec(renderSrc)?.[1];
    const plate = /const PLATE = '\((\d+), (\d+), (\d+)\)'/.exec(artSrc);
    assert.ok(page, 'could not find C.page');
    assert.ok(plate, 'could not find PLATE');
    const asHex = `#${[1, 2, 3].map((i) => Number(plate![i]).toString(16).padStart(2, '0')).join('')}`;
    assert.equal(asHex.toLowerCase(), page!.toLowerCase(),
      `page is ${page} but the baked plate is ${asHex} — every mark will show its edge`);
  });

  it('every mark is padded so no border pixel can differ from the page', () => {
    // Cropping to the ink leaves linework touching the boundary; the shield
    // measured 33 off the page value, which is the bright hairline that made
    // each mark look pasted on. The margin is what removes it.
    assert.match(artSrc, /margin = max\(5, round\(min\(art\.size\) \* 0\.05\)\)/);
  });

  it('the build measures the plate it actually wrote, not the one it meant to', () => {
    // Padding guarantees the border is plate before the file is encoded. The
    // palette step happens after, and an adaptive palette is chosen from the
    // image rather than declared — so the value that comes out is not promised
    // to be the value that went in. It survives today only because the plate
    // is the most common colour in each of these files, which is a fact about
    // this artwork and not a rule about the pipeline.
    //
    // So the build reads its own output back and refuses to save a mark whose
    // border has drifted at all. This asserts that check is still there, and
    // still fails rather than warning: a warning in a script nobody watches on
    // a Monday is the same as no check.
    assert.match(artSrc, /border = \(\[check\.getpixel/);
    assert.match(artSrc, /raise SystemExit\(f'\{out\}: border sits \{off\} off the plate/);
  });
});
