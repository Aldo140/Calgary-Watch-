/**
 * The email that tells CalgaryWatch admins someone wants to run an
 * organization profile: a new pending claim, or an organizer account made on
 * a claim page whose claim never arrived (usually stuck on email
 * verification). scripts/claims/notify-admins.ts sends it hourly; each claim
 * and each sign-up is reported once (admin_alerts holds what was sent).
 *
 * Pure, so the rules are tested without Firestore or Resend.
 */
import { EVIDENCE_COPY, type ClaimEvidence } from './claims';

export const ADMIN_ALERTS = 'admin_alerts';
/** A new organizer gets this long to verify and send the claim before we call it stuck. */
export const SIGNUP_GRACE_MS = 45 * 60_000;
/** Sign-ups older than this are history, not news: never alerted. */
export const SIGNUP_LOOKBACK_MS = 14 * 24 * 60 * 60_000;

export interface ClaimAlert {
  kind: 'claim';
  claimId: string;
  entityTitle: string;
  entityPath: string;
  name: string;
  role: string;
  workEmail: string;
  accountEmail: string;
  phone: string;
  note: string;
  evidence: ClaimEvidence;
  createdAt: number;
}

export interface SignupAlert {
  kind: 'signup';
  uid: string;
  name: string;
  email: string;
  entityTitle: string;
  entityPath: string;
  emailVerified: boolean;
  createdAt: number;
}

export type AdminAlert = ClaimAlert | SignupAlert;

export const alertKey = (a: AdminAlert) => (a.kind === 'claim' ? `claim_${a.claimId}` : `signup_${a.uid}`);

/**
 * Whether an organizer sign-up is worth an email: recent, past the grace
 * period, and with no claim from that account. A sign-up whose claim arrived
 * is covered by the claim alert.
 */
export function signupNeedsAlert(createdAt: number, hasClaim: boolean, now: number): boolean {
  if (hasClaim || !createdAt) return false;
  const age = now - createdAt;
  return age >= SIGNUP_GRACE_MS && age <= SIGNUP_LOOKBACK_MS;
}

const SITE = 'https://calgarywatch.ca';
const calgary = (ms: number) => new Date(ms).toLocaleString('en-CA', { timeZone: 'America/Edmonton', dateStyle: 'medium', timeStyle: 'short' });
const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function lines(a: AdminAlert): string[] {
  if (a.kind === 'claim') {
    const ev = EVIDENCE_COPY[a.evidence];
    return [
      `New claim: ${a.entityTitle}`,
      `${a.name}${a.role ? `, ${a.role}` : ''}`,
      `Work email: ${a.workEmail || 'none'} · account: ${a.accountEmail}${a.phone ? ` · ${a.phone}` : ''}`,
      `Evidence: ${ev.label}. ${ev.next}`,
      ...(a.note ? [`Note: ${a.note}`] : []),
      `Sent ${calgary(a.createdAt)} · ${SITE}${a.entityPath}`,
    ];
  }
  return [
    `Signed up, claim not sent: ${a.entityTitle}`,
    `${a.name || 'No name'} · ${a.email}`,
    a.emailVerified
      ? 'Email verified, but the claim form was never sent. They may need a nudge to finish it.'
      : 'Email not verified yet, so the claim is waiting on the verification link.',
    `Account made ${calgary(a.createdAt)} · ${SITE}${a.entityPath}`,
  ];
}

export function adminAlertEmail(alerts: ReadonlyArray<AdminAlert>): { subject: string; text: string; html: string } {
  const claims = alerts.filter((a) => a.kind === 'claim').length;
  const signups = alerts.length - claims;
  const parts = [claims ? `${claims} new claim${claims === 1 ? '' : 's'}` : '', signups ? `${signups} organizer sign-up${signups === 1 ? '' : 's'} without a claim` : ''].filter(Boolean);
  const first = alerts.length === 1 ? `: ${alerts[0].entityTitle}` : '';
  const subject = `[CalgaryWatch] ${parts.join(', ')}${first}`;
  const review = `Review in /admin: ${SITE}/admin`;
  const text = [...alerts.flatMap((a) => [...lines(a), '']), review].join('\n');
  const html = `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#14213d">${alerts
    .map((a) => {
      const [head, ...rest] = lines(a);
      return `<div style="margin:0 0 18px;padding:12px 14px;border-left:4px solid ${a.kind === 'claim' ? '#2f6fde' : '#d08c18'};background:#f6f7fb"><strong>${esc(head)}</strong><br>${rest.map(esc).join('<br>')}</div>`;
    })
    .join('')}<p><a href="${SITE}/admin">Review in /admin</a></p></div>`;
  return { subject, text, html };
}
