// CalgaryWatch Picks (docs/cw-picks.md): one vetted company per service in
// src/data/localServices.ts. Keyed by service id. Empty until a company has
// passed every check; the code refuses to show a Pick that hasn't.
import published from '../generated/cw-picks.json';

/**
 * The CalgaryWatch Pick for a service list (docs/cw-picks.md). One company
 * per list, chosen only after every check below has passed and been written
 * down. It sits above the A–Z list, never inside it, and it can't be bought:
 * a company that pays for anything is still vetted the same way.
 */
export type PickCheck =
  /** Alberta trade certificate, or City business licence, looked up by us. */
  | 'licence'
  /** Certificate of liability insurance seen. */
  | 'insurance'
  /** WCB Alberta clearance letter, for trades that work on site. */
  | 'wcb'
  /** Owned and run in the Calgary area, not a lead-gen front. */
  | 'local'
  /** 50+ public reviews averaging 4.5+, read for patterns, not just the score. */
  | 'reviews'
  /** We called as a customer: answered, clear on price terms, no pressure. */
  | 'mystery-call'
  /** Agreed in writing to our standards: written quotes, permits pulled, complaints answered in 5 business days. */
  | 'pledge';

export const PICK_CHECKS: Record<PickCheck, string> = {
  licence: 'Trade certificate or business licence looked up',
  insurance: 'Liability insurance certificate seen',
  wcb: 'WCB Alberta clearance letter seen',
  local: 'Owned and run in the Calgary area',
  reviews: '50+ public reviews, 4.5 or better, read for patterns',
  'mystery-call': 'We called as a customer and got straight answers',
  pledge: 'Signed the CalgaryWatch Pick pledge',
};

export interface CwPick {
  /** Exactly a contender's name on that service's shelf (src/lib/cwPicks.ts shelfFor). */
  place: string;
  /** ISO date each check passed. All seven are required. */
  checks: Record<PickCheck, string>;
  /** One sentence on why, in our words, backed by the checks. */
  why: string;
  /** Re-vetted every 6 months; the Pick lapses after this date. */
  until: string;
}


const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Picks published from the admin vetting desk (Admin → Partners → CalgaryWatch
 * Picks). scripts/picks/export-picks.ts writes src/generated/cw-picks.json at
 * every deploy from the Picks marked live there. Anything malformed is dropped,
 * so a bad row can never put an unvetted company under the seal.
 */
export function readPublishedPicks(file: unknown): Record<string, CwPick> {
  const picks = (file as { picks?: unknown } | null)?.picks;
  const out: Record<string, CwPick> = {};
  if (!picks || typeof picks !== 'object') return out;
  for (const [id, raw] of Object.entries(picks as Record<string, unknown>)) {
    const p = raw as Partial<CwPick> | null;
    if (!p || typeof p.place !== 'string' || !p.place || typeof p.why !== 'string' || !p.why || typeof p.until !== 'string' || !DAY.test(p.until)) continue;
    const checks = p.checks as Record<string, unknown> | undefined;
    if (!checks || !(Object.keys(PICK_CHECKS) as PickCheck[]).every(k => typeof checks[k] === 'string' && DAY.test(checks[k] as string))) continue;
    out[id] = { place: p.place, why: p.why, until: p.until, checks: Object.fromEntries((Object.keys(PICK_CHECKS) as PickCheck[]).map(k => [k, checks[k] as string])) as Record<PickCheck, string> };
  }
  return out;
}

/**
 * The Picks. Normally made live from the admin vetting desk; one written here
 * wins over a published one for the same service. Every check must be dated:
 *   plumbing: { place: 'Knight Plumbing', why: '…', until: '2027-05-20', checks: { licence: '2026-11-18', … } },
 */
const IN_CODE: Partial<Record<string, CwPick>> = {};

export const PICKS: Partial<Record<string, CwPick>> = { ...readPublishedPicks(published), ...IN_CODE };
