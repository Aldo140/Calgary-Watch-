/**
 * The words.
 *
 * Kept apart from the markup because the copy decides whether this reads like a
 * neighbour wrote it or like a system generated it, and it should be editable
 * without touching a single table cell.
 *
 * ── Voice ──────────────────────────────────────────────────────────────────
 * A neighbour who happens to run the thing. Warm, direct, a little dry, never
 * pleased with itself. Short sentences, contractions, no exclamation marks, no
 * "we're thrilled", no "community" used as a verb. The test is whether it can
 * be read out loud without wincing.
 *
 * Three rules keep it honest:
 *   - Say the number, then say what it means. Never dress a quiet week up.
 *   - Small counts are spelled out: "Four things were reported" is how a person
 *     says it, "4 things were reported" is how a dashboard says it.
 *   - Never thank somebody for their attention or apologise for the email.
 *     They asked for it.
 */

import type { DigestSummary } from '../../src/lib/digest.js';

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

/** "four" up to ten, "23" past it — the way people actually write numbers. */
export function spell(n: number): string {
  return n >= 0 && n <= 10 ? WORDS[n] : String(n);
}

/** Sentence-initial version of the same. */
export function spellCap(n: number): string {
  const w = spell(n);
  return w.charAt(0).toUpperCase() + w.slice(1);
}

/** The job lands at 09:00 Calgary, but a resend at any hour should still fit. */
export function greeting(at: number): string {
  const hour = Number(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Edmonton', hour: 'numeric', hour12: false,
  }).format(new Date(at)));
  if (hour < 12) return 'Morning';
  if (hour < 17) return 'Afternoon';
  return 'Evening';
}

/**
 * The lead paragraph — the whole message in two sentences.
 *
 * The count sits inside a sentence rather than standing alone as a numeral. A
 * number on its own is a metric; a number in a sentence is somebody telling you
 * something, and this only works if it reads like the second one.
 */
export function leadParagraph(summary: DigestSummary): string {
  const count = summary.total;
  const verb = count === 1 ? 'thing was' : 'things were';

  // Nothing at all, anywhere we looked. Only reachable when the city itself was
  // silent for a week, which is close to impossible — but an email that renders
  // a blank page because the ingest broke is worse than one that says so.
  if (summary.quiet) {
    return summary.scope === 'city'
      ? `No public reports came in anywhere in Calgary this week. That is unusual `
        + `enough that it may be us rather than the city — we're looking.`
      : `Nothing was reported ${summary.ringLabel} this week. `
        + `Quiet weeks get sent too — it's worth knowing when nothing happened.`;
  }

  const lead = (() => {
    switch (summary.scope) {
      case 'home':
      case 'community':
        return `${spellCap(count)} ${verb} reported ${summary.ringLabel} this week.`;
      case 'city':
        // Never phrased as "near you". We do not know where they are, or their
        // own area was empty — either way, claiming proximity would be false.
        return summary.widenedToCity
          ? `Your area was quiet this week, so here is what came in ${summary.ringLabel} `
            + `instead — ${spell(count)} ${count === 1 ? 'report' : 'reports'} in all.`
          : `${spellCap(count)} ${verb} reported ${summary.ringLabel} this week.`;
    }
  })();

  // The week-over-week line is only meaningful against a like-for-like
  // baseline, and a digest that just widened its own scope has none.
  if (summary.widenedToCity) return lead;
  if (summary.delta === 0 && summary.previousTotal === 0) return lead;
  if (summary.delta === 0) return `${lead} Same as last week.`;
  const n = Math.abs(summary.delta);
  return summary.delta > 0
    ? `${lead} ${spellCap(n)} more than last week.`
    : `${lead} ${spellCap(n)} fewer than last week.`;
}

/**
 * The nudge for somebody we cannot place.
 *
 * Shown only when there is genuinely no location on the account — never to
 * somebody whose neighbourhood simply had a quiet week, who would rightly read
 * it as being blamed for our empty list. It asks once, explains what it buys
 * them, and does not repeat.
 */
export function locationPrompt(summary: DigestSummary): string | null {
  if (!summary.needsLocation) return null;
  return `This one covers the whole city, because your account doesn't have a `
    + `neighbourhood on it yet. Add one and next Monday's will be about your `
    + `blocks instead — how close each report was, and whether your week was `
    + `busier than usual.`;
}

/** The line above the list. Says how the list is ordered, because it is. */
export function listHeading(summary: DigestSummary): string {
  if (summary.total === 1) return 'What happened';
  // Only claim an ordering the list actually has. Without distances the list is
  // newest-first, and saying "closest first" would be a small, checkable lie.
  return summary.scope === 'home' ? 'What happened, closest first' : 'What happened';
}

export const CTA_LABEL = 'See these on the map';
export const CTA_LABEL_QUIET = 'Have a look at the map';

/**
 * The first email anybody gets.
 *
 * It exists because a digest arriving cold from a name you half-remember
 * signing up to is indistinguishable from spam. So the first one says who this
 * is, what the map is for, and what will arrive how often — then asks a real
 * question, because the fastest way to learn what belongs in this email is to
 * ask the people getting it.
 *
 * First person and signed, because it is from a person. The reply goes to a
 * mailbox that is actually read; inviting a reply nobody answers is worse than
 * not inviting one.
 */
export const WELCOME = {
  subject: 'Quick hello from Calgary Watch',
  /**
   * Why this landed in their inbox, said in the first line rather than buried
   * in the footer. Somebody who does not remember signing up reaches for the
   * spam button long before they reach the small print, and a spam complaint
   * costs the whole list — so the reason goes where it will actually be read.
   */
  reason: `You're getting this because you enabled the weekly digest on Calgary Watch.`,
  paragraphs: [
    `Quick hello, since this is the first one.`,
    `Calgary Watch is a map of what's actually going on around your block — break-ins, `
      + `road closures, water main breaks, the things you'd want a heads-up about. Some of it `
      + `comes from neighbours who report it. Some comes straight from Calgary Police, 311 and `
      + `511 Alberta. It all lands in one place instead of five.`,
    `Every Monday you'll get a short read on your corner of the city: what happened near you, `
      + `how close it was, and whether the week was busier than usual. Quiet weeks get sent `
      + `too — that's worth knowing.`,
  ],
  /**
   * How the map is fed, in three steps.
   *
   * Illustrated because this is the one thing about Calgary Watch people get
   * wrong — they assume it is either all official data or all neighbours, and
   * it is both. Three marks and six words each carry that faster than the
   * paragraph above them does.
   */
  steps: [
    { title: 'Official feeds', body: 'Calgary Police, 311 and 511 Alberta, pulled in automatically.' },
    { title: 'Your neighbours', body: 'Anyone can report what they saw on their block.' },
    { title: 'Monday morning', body: 'The week near you, in one short email.' },
  ],
  askHeading: 'One thing before you go',
  ask: `The site just got rebuilt, and we'd like to know what you make of it. What would make `
    + `this email worth opening on a Monday? What's missing from the map? Reply to this one — `
    + `it comes straight to us, not a support queue.`,
  thanks: `Thanks for being early to this.`,
  /**
   * Signed by the team, not by a person.
   *
   * A single name implies one inbox and one pair of hands, which sets an
   * expectation about replies that a growing list cannot keep. "The Calgary
   * Watch team" still reads as people rather than a system, and stays true
   * whoever ends up answering.
   */
  signOff: 'The Calgary Watch team',
  signOffRole: 'calgarywatch.ca',
  /** Introduces the digest below it, so the format explains itself once. */
  sampleIntro: `Here's this week's, so you can see what you're in for.`,
} as const;
