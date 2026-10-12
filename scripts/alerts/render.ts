/**
 * The instant-alert email, rendered once for both the sender and the admin
 * preview so the two can never drift.
 *
 * It used to be a bare white list in Arial, the one message from CalgaryWatch
 * that did not look like CalgaryWatch, and the one most likely to be read in a
 * hurry. It now shares the digest's navy page, wordmark and category edges, on
 * a red "Heads up" cover so it is never mistaken for the Monday brief. It is
 * still short: a cover, the reports with how long ago each was, one button.
 *
 * No inline images: alerts are sent without attachments, so the wordmark is
 * live text and nothing here can render as an empty box.
 */

import type { Incident, IncidentCategory } from '../../src/types/index.js';
import { formatRelativeTime } from '../../src/lib/format.js';
import { BODY, DISPLAY, EMAIL_TOKENS as C, MONO } from '../digest/render.js';

const EDGE: Record<IncidentCategory, string> = {
  emergency: '#FF5A4E',
  crime: '#D2705C',
  traffic: '#FFC94D',
  infrastructure: '#4FD1C5',
  weather: '#A9B9CC',
};
const LABEL: Record<IncidentCategory, string> = {
  emergency: 'Emergency', crime: 'Crime', traffic: 'Traffic', infrastructure: 'Infrastructure', weather: 'Weather',
};

export interface RenderedAlert {
  subject: string;
  html: string;
  text: string;
  /** Deep link to the alert settings, carried into List-Unsubscribe. */
  unsubscribeUrl: string;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

/**
 * A subject line is a header, not HTML — escaping it would show `&amp;` to the
 * reader. What actually matters is that a report title cannot inject a newline
 * (header splitting) or run unboundedly long. Replace every control character
 * with a space, collapse whitespace, cap the length.
 */
function sanitizeSubject(s: string): string {
  const clean = Array.from(s, (ch) => {
    const code = ch.codePointAt(0) ?? 0;
    return code < 0x20 || code === 0x7f ? ' ' : ch;
  })
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
  return clean.length > 150 ? `${clean.slice(0, 147)}...` : clean;
}

export function renderAlertEmail(alerts: Incident[], now: number, origin: string): RenderedAlert {
  const lead = alerts[0];
  const more = alerts.length - 1;
  const subject = sanitizeSubject(
    alerts.length === 1
      ? `Nearby: ${lead.title}`
      : `${alerts.length} alerts near you — ${lead.title}${more > 0 ? ` +${more}` : ''}`,
  );

  const settingsUrl = `${origin}/map?settings=alerts`;

  const line = (i: Incident) =>
    `• ${i.title} — ${i.neighborhood || 'Calgary'} · ${formatRelativeTime(i.timestamp, now)}`;
  const text = [
    'Reports near you on Calgary Watch:',
    '',
    ...alerts.map(line),
    '',
    `See the map: ${origin}/map`,
    '',
    `You are getting this because instant alerts are on for your account. Turn them off: ${settingsUrl}`,
  ].join('\n');

  const emergency = alerts.some((i) => i.category === 'emergency');
  const rows = alerts.map((i) => `
        <tr><td style="padding-bottom:9px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${C.card};border:1px solid ${C.line};border-radius:8px;">
            <tr>
              <td width="4" style="width:4px;background:${EDGE[i.category] ?? C.soft};font-size:0;line-height:0;border-radius:8px 0 0 8px;">&nbsp;</td>
              <td style="padding:13px 16px;">
                <div style="font:700 10px/1 ${MONO};color:${C.gold};letter-spacing:1px;text-transform:uppercase;">${escapeHtml(LABEL[i.category] ?? 'Report')} · ${escapeHtml(formatRelativeTime(i.timestamp, now))}</div>
                <a href="${origin}/map?i=${encodeURIComponent(i.id)}" style="display:block;font:700 16px/1.35 ${DISPLAY};color:${C.ink};text-decoration:none;padding-top:7px;">${escapeHtml(i.title)}</a>
                <div style="font:400 12.5px/1.45 ${BODY};color:${C.soft};padding-top:4px;">${escapeHtml(i.neighborhood || 'Calgary')}</div>
              </td>
            </tr>
          </table>
        </td></tr>`).join('');
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:${C.page};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(lead.title)} · ${escapeHtml(lead.neighborhood || 'Calgary')}</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${C.page};">
<tr><td align="center" style="padding:26px 12px 32px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="width:100%;max-width:560px;">
    <tr><td style="padding:4px 28px 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
        <td style="font:800 16px/1 ${DISPLAY};color:${C.ink};">CALGARY<span style="font-weight:600;">WATCH</span><span style="color:${C.bow};">&nbsp;&#8226;</span></td>
        <td align="right"><span style="display:inline-block;padding:6px 10px;border-radius:999px;background:${C.coral};color:${C.page};font:700 10.5px/1 ${MONO};letter-spacing:1px;text-transform:uppercase;">Instant alert</span></td>
      </tr></table>
    </td></tr>
    <tr><td style="padding:20px 28px 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${C.coral};border-radius:14px;">
        <tr><td style="padding:22px 24px 24px;">
          <div style="font:700 10.5px/1.3 ${MONO};color:${C.page};letter-spacing:1.4px;text-transform:uppercase;">Heads up · ${escapeHtml(lead.neighborhood || 'Near you')}</div>
          <div style="font:800 30px/1.06 ${DISPLAY};color:${C.page};letter-spacing:-0.8px;padding-top:12px;">${alerts.length === 1 ? 'Something nearby' : `${alerts.length} reports nearby`}</div>
          <div style="font:500 14px/1.45 ${BODY};color:${C.page};padding-top:8px;">${emergency ? 'Includes an emergency. Follow official instructions first.' : 'Reported in the last few hours, close to an area you follow.'}</div>
        </td></tr>
      </table>
    </td></tr>
    <tr><td style="padding:20px 28px 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${rows}</table>
    </td></tr>
    <tr><td style="padding:12px 28px 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="background:${C.button};border-radius:999px;">
        <a href="${origin}/map" style="display:inline-block;padding:13px 22px;font:700 14px/1 ${BODY};color:${C.buttonInk};text-decoration:none;">Open the map&nbsp;→</a>
      </td></tr></table>
      <p style="margin:14px 0 0;font:400 12.5px/1.5 ${BODY};color:${C.soft};">In danger right now? Call 911. These are reports, not police confirmations.</p>
    </td></tr>
    <tr><td style="padding:26px 28px 0;">
      <div style="height:1px;background:${C.line};font-size:0;line-height:0;">&nbsp;</div>
      <p style="margin:14px 0 0;font:400 12px/1.6 ${BODY};color:${C.soft};">
        Instant alerts are on for your account.
        <a href="${settingsUrl}" style="color:${C.bow};font-weight:700;text-decoration:underline;">Turn them off or change what you hear about</a>.
      </p>
    </td></tr>
  </table>
</td></tr>
</table>
</body></html>`;

  return { subject, html, text, unsubscribeUrl: settingsUrl };
}
