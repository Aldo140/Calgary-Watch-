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
import { WELCOME, leadParagraph, spell, spellCap } from '../scripts/digest/copy.js';
import { loadSenderConfig, unsubscribeHeaders } from '../scripts/digest/send.js';
import type { Incident } from '../src/types/index.js';

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

  it('contains no images at all, in either email', () => {
    const s = buildDigestSummary({
      incidents: [incident({ id: 'a', ...at(100) })], profile: PROFILE, home: HOME, now: NOW,
    });
    const shared = {
      summary: s, unsubscribeUrl: unsubscribeUrl(BRANDING.origin, 'u1', 'a'.repeat(32)),
      branding: BRANDING,
    };
    for (const [label, html] of [['digest', renderDigestHtml(shared)], ['welcome', renderWelcomeHtml(shared)]] as const) {
      // The masthead is typographic on purpose. A remote image is blocked by
      // default in most clients, and a 404 (a missed deploy, a renamed path)
      // becomes a broken-image icon in every message already sent — which is
      // exactly what happened before this became a rule.
      assert.equal((html.match(/<img\s/gi) ?? []).length, 0, `${label} must have no <img>`);
      assert.ok(!/<script/i.test(html), `${label} must have no script`);
      assert.ok(!/<link\s/i.test(html), `${label} must have no external stylesheet`);
      // ...and the brand must therefore be live text.
      assert.ok(html.includes('CALGARY&nbsp;WATCH'), `${label} needs a typographic masthead`);
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
