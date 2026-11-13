import { calgaryDateTimeFormat } from './calgaryTz';
/**
 * The vetting desk behind CalgaryWatch Picks (docs/cw-picks.md). One Firestore
 * doc per service in pick_vetting, admin-only: the company being vetted, the
 * date and private note for each of the seven checks, the one-line why, and
 * whether it is live. Only dates, the company and the why are ever published
 * (scripts/picks/export-picks.ts → src/generated/cw-picks.json); notes stay
 * in Firestore.
 */
import { PICK_CHECKS, type CwPick, type PickCheck } from '../content/cwPicks';

export const PICK_VETTING = 'pick_vetting';
export const CHECK_ORDER = Object.keys(PICK_CHECKS) as PickCheck[];
/** Re-vetted every six months, counted from the oldest check. */
export const VALID_MONTHS = 6;
export const WHY_MAX = 220;

export type VettingStatus = 'vetting' | 'live' | 'paused';

export interface Vetting {
  /** Local service id; also the doc id. */
  service: string;
  /** Contender key on that service's shelf (src/lib/cwPicks.ts placeKey). */
  place: string;
  /** The contender's exact name, which is what PICKS matches on. */
  placeName: string;
  /** ISO day each check passed, and our private note on what we saw. */
  checks: Partial<Record<PickCheck, { date: string; note?: string }>>;
  why: string;
  status: VettingStatus;
  updatedAt: number;
  /** Set when the status changes, so the next scheduled run redeploys the site. */
  publish?: boolean;
  /** When the live site last carried this doc's status. */
  publishedAt?: number;
}

/** What each check asks of us, shown beside its date on the desk. */
export const CHECK_HOW: Record<PickCheck, string> = {
  licence: 'Alberta trade certificate (tradesecrets.alberta.ca) or City of Calgary business licence. Note the number.',
  insurance: 'Ask for the certificate of liability insurance. Note the insurer and expiry.',
  wcb: 'Ask for a WCB Alberta clearance letter (they download it free). Note the date on it.',
  local: 'Owner and office in the Calgary area, not a lead-gen site or national call centre. Note the address.',
  reviews: '50+ Google reviews averaging 4.5 or better. Read the 1–3★ ones for patterns. Note count and score.',
  'mystery-call': 'Call as a customer. Answered or called back same day? Clear on the call-out fee? No pressure?',
  pledge: 'They agree in writing to the pledge below. Save the email.',
};

/** The pledge a company signs (by replying "I agree") before it can be the Pick. */
export const PICK_PLEDGE = [
  'Written quotes before work starts, and no surprise charges.',
  'City permits pulled when the job needs one.',
  'Every complaint CalgaryWatch passes on answered within 5 business days.',
  'We keep our licence, insurance and WCB clearance current, and tell CalgaryWatch if any lapse.',
  'We understand the Pick can’t be bought, and that CalgaryWatch removes it if neighbours’ answers slip.',
];

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const SHORT: Record<PickCheck, string> = { licence: 'licence', insurance: 'insurance', wcb: 'WCB', local: 'local', reviews: 'reviews', 'mystery-call': 'mystery call', pledge: 'pledge' };

export function calgaryDay(now = Date.now()): string {
  return calgaryDateTimeFormat('en-CA', { timeZone: 'America/Edmonton', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** The oldest check plus six months: the date the Pick lapses unless re-vetted. */
export function untilFor(v: Pick<Vetting, 'checks'>): string | null {
  const dates = CHECK_ORDER.map(k => v.checks[k]?.date).filter((d): d is string => !!d && DAY.test(d)).sort();
  if (dates.length < CHECK_ORDER.length) return null;
  const [y, m, d] = dates[0].split('-').map(Number);
  const end = new Date(Date.UTC(y, m - 1 + VALID_MONTHS, d));
  return end.toISOString().slice(0, 10);
}

export function checksDone(v: Pick<Vetting, 'checks'>, today: string): PickCheck[] {
  return CHECK_ORDER.filter(k => { const d = v.checks[k]?.date; return !!d && DAY.test(d) && d <= today; });
}

/** Why it can't go live yet, in plain words; empty means ready. */
export function blockers(v: Vetting, today: string): string[] {
  const out: string[] = [];
  if (!v.place || !v.placeName) out.push('Choose the company.');
  const done = checksDone(v, today);
  const missing = CHECK_ORDER.filter(k => !done.includes(k));
  if (missing.length) out.push(`${missing.length} check${missing.length === 1 ? '' : 's'} not dated: ${missing.map(k => SHORT[k]).join(', ')}.`);
  const why = v.why.trim();
  if (why.length < 30) out.push('Write the one-line why (30+ characters).');
  if (why.length > WHY_MAX) out.push(`Shorten the why to ${WHY_MAX} characters.`);
  const until = untilFor(v);
  if (until && until < today) out.push('The oldest check is over six months old. Re-check it.');
  return out;
}

/** The public Pick for a live doc, or null. Notes never leave Firestore. */
export function publicPick(v: Vetting, today: string): CwPick | null {
  if (v.status !== 'live' || blockers(v, today).length) return null;
  const checks = Object.fromEntries(CHECK_ORDER.map(k => [k, v.checks[k]!.date])) as Record<PickCheck, string>;
  return { place: v.placeName, why: v.why.trim(), until: untilFor(v)!, checks };
}

/** Reads an untrusted Firestore row into a Vetting, or null. */
export function readVetting(id: string, raw: unknown): Vetting | null {
  const x = raw as Partial<Vetting> | null;
  if (!x || typeof x !== 'object') return null;
  const checks: Vetting['checks'] = {};
  for (const k of CHECK_ORDER) {
    const c = (x.checks as Record<string, unknown> | undefined)?.[k] as { date?: unknown; note?: unknown } | undefined;
    if (!c) continue;
    const date = typeof c.date === 'string' && DAY.test(c.date) ? c.date : '';
    const note = typeof c.note === 'string' ? c.note : '';
    if (date || note) checks[k] = { date, ...(note ? { note } : {}) };
  }
  return {
    service: id,
    place: typeof x.place === 'string' ? x.place : '',
    placeName: typeof x.placeName === 'string' ? x.placeName : '',
    checks,
    why: typeof x.why === 'string' ? x.why : '',
    status: x.status === 'live' || x.status === 'paused' ? x.status : 'vetting',
    updatedAt: typeof x.updatedAt === 'number' ? x.updatedAt : 0,
    ...(x.publish === true ? { publish: true } : {}),
    ...(typeof x.publishedAt === 'number' ? { publishedAt: x.publishedAt } : {}),
  };
}

/** The file the site reads, from every vetting doc. */
export function buildPicksFile(rows: readonly Vetting[], now = Date.now()): { generatedAt: string; picks: Record<string, CwPick> } {
  const today = calgaryDay(now);
  const picks: Record<string, CwPick> = {};
  for (const v of [...rows].sort((a, b) => a.service.localeCompare(b.service))) {
    const p = publicPick(v, today);
    if (p) picks[v.service] = p;
  }
  return { generatedAt: new Date(now).toISOString(), picks };
}
