/**
 * The email a claimant gets when an admin approves their listing claim. Sent
 * by scripts/claims/send-approval-emails.ts, which runs hourly from
 * .github/workflows/discovery-actions.yml.
 *
 * Every line describes something that is already built:
 *  - the Verified mark shows on the listing as soon as the claim is approved
 *    (ClaimCta reads verified_listings at runtime);
 *  - the account is a business account (src/lib/businessAccount.ts) and the
 *    dashboard at /plans shows the listing with "Manage listing";
 *  - the ranking weight (src/lib/verified.ts) is mentioned only while
 *    VERIFICATION_PRIORITY_ENABLED, and starts with the next site build.
 * No guarantee wording, ever (docs/verified-listings.md).
 *
 * Pure, so the copy is tested without Firestore or Resend.
 */

import { VERIFICATION_PRIORITY_ENABLED } from './verified';

export const SITE = 'https://calgarywatch.ca';

/**
 * Claims approved before automatic approval emails existed never get one;
 * those organizations were already told by hand.
 */
export const APPROVAL_EMAILS_SINCE = Date.parse('2026-10-14T01:30:00Z');

export type ApprovalEmailStatus = 'sending' | 'sent' | 'failed' | 'skipped';

export interface ApprovalEmailClaim {
  entityId: string;
  entityTitle: string;
  entityPath: string;
  name: string;
  workEmail: string;
  accountEmail: string;
  status: string;
  reviewedAt?: number | null;
  approvalEmailStatus?: ApprovalEmailStatus;
}

export interface ApprovalEmail { to: string[]; subject: string; text: string; html: string }

/** True when this approved claim still needs its approval email. */
export function needsApprovalEmail(c: ApprovalEmailClaim, since = APPROVAL_EMAILS_SINCE): boolean {
  return c.status === 'approved' && !c.approvalEmailStatus && typeof c.reviewedAt === 'number' && c.reviewedAt >= since;
}

const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

/** The signed-in account's address first, then the work email if it's a different one. */
export function approvalRecipients(c: Pick<ApprovalEmailClaim, 'accountEmail' | 'workEmail'>): string[] {
  const out: string[] = [];
  for (const raw of [c.accountEmail, c.workEmail]) {
    const e = (raw ?? '').trim();
    if (EMAIL.test(e) && !out.some((x) => x.toLowerCase() === e.toLowerCase())) out.push(e);
  }
  return out;
}

const firstName = (name: string) => name.trim().split(/\s+/)[0]?.replace(/[^\p{L}\p{M}'’-]/gu, '') || '';
const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!));

export function approvalEmail(
  c: Pick<ApprovalEmailClaim, 'entityId' | 'entityTitle' | 'entityPath' | 'name' | 'accountEmail' | 'workEmail'>,
  opts: { mailingAddress: string; priorityEnabled?: boolean },
): ApprovalEmail {
  const title = c.entityTitle.trim() || 'your listing';
  const listingUrl = `${SITE}${c.entityPath.startsWith('/') ? c.entityPath : `/${c.entityPath}`}`;
  const claimUrl = `${SITE}/claim/${encodeURIComponent(c.entityId)}`;
  const priority = opts.priorityEnabled ?? VERIFICATION_PRIORITY_ENABLED;
  const hi = firstName(c.name);

  const changes: Array<{ lead: string; body: string; url?: string }> = [
    { lead: 'Verified mark.', body: `${title} now shows “Verified · Confirmed by the organization” on CalgaryWatch.`, url: listingUrl },
    { lead: 'Business account.', body: 'Your CalgaryWatch account is now a business account. Your dashboard shows the listing, and you can send changes from there.', url: `${SITE}/plans` },
    ...(priority ? [{ lead: 'More weight in recommendations.', body: 'Verified listings are given more weight when we surface relevant listings and recommendations across CalgaryWatch. It’s a modest nudge that starts with the next site update, usually within a day, not a fixed spot.' }] : []),
    { lead: 'Direct updates.', body: 'Edit your profile and explicitly linked events from your dashboard or the listing’s management page. Save one update every seven days per business, with several fields in one save. Changes publish automatically without admin approval, and CalgaryWatch is notified. Images cannot be added, changed or deleted there; email us about images.', url: claimUrl },
  ];

  const subject = `${title} is now verified on CalgaryWatch`;
  const intro = `Your claim for ${title} is approved, so the listing is now verified on CalgaryWatch. Here’s what that gives you:`;
  const outro = 'If anything on the listing looks wrong, just reply to this email.';
  const sig = ['Aldo Ortiz', 'Founder, CalgaryWatch', SITE.replace('https://', '')];
  const footer = `You’re getting this because you claimed ${title} on CalgaryWatch. CalgaryWatch${opts.mailingAddress ? `, ${opts.mailingAddress}` : ''}.`;

  const text = [
    `Hi${hi ? ` ${hi}` : ''},`,
    '',
    intro,
    '',
    ...changes.flatMap((x) => [`- ${x.lead} ${x.body}${x.url ? `\n  ${x.url}` : ''}`]),
    '',
    outro,
    '',
    ...sig,
    '',
    '--',
    footer,
  ].join('\n');

  const p = 'margin:0 0 14px';
  const html = `<div style="font:15px/1.6 -apple-system,Segoe UI,Arial,sans-serif;color:#151515;max-width:560px">`
    + `<p style="${p}">Hi${hi ? ` ${esc(hi)}` : ''},</p>`
    + `<p style="${p}">${esc(intro)}</p>`
    + `<ul style="margin:0 0 14px;padding-left:20px">${changes.map((x) => `<li style="margin:0 0 8px"><strong>${esc(x.lead)}</strong> ${esc(x.body)}${x.url ? ` <a href="${esc(x.url)}" style="color:#0b6e7a">${esc(x.url.replace('https://', ''))}</a>` : ''}</li>`).join('')}</ul>`
    + `<p style="${p}">${esc(outro)}</p>`
    + `<p style="${p}">${sig.map(esc).join('<br>')}</p>`
    + `<p style="margin:24px 0 0;font-size:12px;color:#666">${esc(footer)}</p>`
    + `</div>`;

  return { to: approvalRecipients(c), subject, text, html };
}
