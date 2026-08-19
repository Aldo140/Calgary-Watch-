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
  if (summary.quiet) {
    return `Nothing was reported ${summary.ringLabel} this week. `
      + `Quiet weeks get sent too — it's worth knowing when nothing happened.`;
  }
  const lead = `${spellCap(summary.total)} ${summary.total === 1 ? 'thing was' : 'things were'} `
    + `reported ${summary.ringLabel} this week.`;
  if (summary.delta === 0 && summary.previousTotal === 0) return lead;
  if (summary.delta === 0) return `${lead} Same as last week.`;
  const n = Math.abs(summary.delta);
  return summary.delta > 0
    ? `${lead} ${spellCap(n)} more than last week.`
    : `${lead} ${spellCap(n)} fewer than last week.`;
}

/** The line above the list. Says how the list is ordered, because it is. */
export function listHeading(summary: DigestSummary): string {
  return summary.total === 1 ? 'What happened' : 'What happened, closest first';
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
  askHeading: 'One thing before you go',
  ask: `The site just got rebuilt, and I'd like to know what you make of it. What would make `
    + `this email worth opening on a Monday? What's missing from the map? Reply to this one — `
    + `it comes to me, not a support queue.`,
  thanks: `Thanks for being early to this.`,
  signOff: 'Aldo',
  signOffRole: 'Calgary Watch',
  /** Introduces the digest below it, so the format explains itself once. */
  sampleIntro: `Here's this week's, so you can see what you're in for.`,
} as const;
