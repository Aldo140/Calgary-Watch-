// Partner-lead rules. Pure functions so the CASL-relevant decisions (which
// address, on what basis, whether we may send at all) are tested, not implied.

import type { LeadStatus, PartnerLead } from '../../../src/types/ops';
import type { OutreachConfig } from './brand';
import type { Entity } from './posts';
import { calgaryMinutes, calgaryWeekday } from './time';

/** Kinds of listing a business can enter the lead list through. Events are run by
 * institutions and venues whose listing is editorial, not a sales opportunity. */
export const LEAD_KINDS = new Set(['business', 'market']);

export const normalizeEmail = (e: string) => e.trim().toLowerCase();
export const emailDomain = (e: string) => normalizeEmail(e).split('@')[1] ?? '';
export const hostOf = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } };

export function leadIdFor(entity: Entity): string {
  return `lead-${entity.id}`;
}

export function websiteFor(entity: Entity): string | null {
  const direct = entity.socials?.website ?? entity.website;
  if (direct) return direct;
  const official = (entity.sources ?? []).find((s: any) => s.kind === 'official' && /^https?:/.test(s.url));
  return official ? new URL(official.url).origin + '/' : null;
}

const JUNK = /^(no-?reply|donotreply|privacy|abuse|postmaster|webmaster|careers|jobs|hr|recruit|billing|accounts?|payroll|sentry|example|test|user|name|email|your)@/i;
const PREFER = ['partnerships', 'partners', 'marketing', 'hello', 'info', 'contact', 'events', 'market', 'manager', 'admin', 'office'];

/**
 * Addresses actually published on the business's own pages. mailto: links and
 * visible text count; addresses inside image filenames or scripts do not.
 */
export function extractEmails(html: string, siteHost: string): string[] {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/&#64;|&#x40;|\s?\[at\]\s?|\s\(at\)\s/gi, '@')
    .replace(/%40/g, '@');
  const found = new Set<string>();
  for (const m of text.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,24}/gi)) {
    const e = normalizeEmail(m[0]).replace(/\.$/, '');
    if (JUNK.test(e) || /\.(png|jpe?g|gif|webp|svg)$/i.test(e) || /@\dx\./.test(e)) continue;
    found.add(e);
  }
  const rank = (e: string) => {
    const local = e.split('@')[0];
    const sameSite = siteHost && (emailDomain(e) === siteHost || siteHost.endsWith(`.${emailDomain(e)}`) || emailDomain(e).endsWith(siteHost)) ? 0 : 10;
    const pref = PREFER.findIndex(p => local.startsWith(p));
    return sameSite + (pref === -1 ? PREFER.length : pref);
  };
  return [...found].sort((a, b) => rank(a) - rank(b));
}

export function hasNoSolicitationNotice(pageText: string, cfg: OutreachConfig): boolean {
  const t = pageText.toLowerCase().replace(/\s+/g, ' ');
  return cfg.noSolicitationPatterns.some(p => new RegExp(p, 'i').test(t));
}

export function consentBasisFor(emailSourceUrl: string): string {
  return `Implied consent (CASL s.10(9)(b)): address conspicuously published by the business at ${emailSourceUrl}, with no notice refusing unsolicited messages; message relates to the recipient's business.`;
}

export function signature(cfg: OutreachConfig, mailingAddress: string): string {
  return [
    'Thank you,',
    '',
    cfg.sender.name,
    cfg.sender.title,
    cfg.sender.mailbox,
    cfg.sender.site,
    mailingAddress,
    '',
    cfg.unsubscribeLine,
  ].join('\n');
}

/** CASL needs identification and a working opt-out in every message. */
export function checkPitch(body: string, cfg: OutreachConfig, mailingAddress: string): string[] {
  const problems: string[] = [];
  if (!body.includes(cfg.sender.name)) problems.push('Missing sender name.');
  if (!body.includes(mailingAddress)) problems.push('Missing mailing address.');
  if (!body.includes(cfg.unsubscribeLine)) problems.push('Missing the opt-out line.');
  if (!cfg.paidOfferEnabled && /\$\s?\d|price|pricing|advertis|sponsor|paid placement|featured partner/i.test(body.replace(cfg.unsubscribeLine, ''))) {
    problems.push('Mentions pricing or paid placement while the paid offer is switched off.');
  }
  const words = body.split(/\s+/).length;
  if (words > 260) problems.push(`Too long (${words} words).`);
  return problems;
}

const toMinutes = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

export function inSendWindow(now: number, cfg: OutreachConfig): boolean {
  const [from, to] = cfg.limits.sendWindowLocal.map(toMinutes);
  const m = calgaryMinutes(now);
  return cfg.limits.sendDays.includes(calgaryWeekday(now)) && m >= from && m <= to;
}

const CLOSED: LeadStatus[] = ['do-not-contact', 'not-interested', 'no-response', 'partner', 'blocked'];

/** Whether a message may go to this lead right now. Returns the reason when not. */
export function sendBlocker(lead: PartnerLead, suppressed: Set<string>, suppressedDomains: Set<string>): string | null {
  if (!lead.contactEmail) return 'No contact email.';
  const email = normalizeEmail(lead.contactEmail);
  if (lead.doNotContact) return 'Lead is marked do-not-contact.';
  if (CLOSED.includes(lead.status)) return `Lead is ${lead.status}.`;
  if (suppressed.has(email)) return 'Address is on the suppression list.';
  if (suppressedDomains.has(emailDomain(email))) return 'Domain is on the suppression list.';
  if (lead.noSolicitationNotice) return 'Business publishes a no-solicitation notice.';
  if (!lead.emailSourceUrl || !lead.consentBasis) return 'No recorded consent basis.';
  return null;
}

export function isStopRequest(text: string): boolean {
  // Only their own words, not the quoted email below.
  const first = text.split(/\n\s*(>|On .+wrote:|From:)/)[0].toLowerCase().replace(/[’]/g, "'");
  return /^\W*(stop|unsubscribe)\b/.test(first) ||
    /\b(unsubscribe|remove me|remove us|take (me|us) off|do not (contact|email)|don't (contact|email)|stop (emailing|contacting|sending|messaging)|please stop|not interested,? (please )?(remove|stop))\b/.test(first);
}
