/**
 * The instant-alert email, rendered once for both the sender and the admin
 * preview so the two can never drift. Deliberately plain next to the digest's
 * letterhead — an alert is a short, urgent nudge, not a weekly read.
 */

import type { Incident } from '../../src/types/index.js';
import { formatRelativeTime } from '../../src/lib/format.js';

export interface RenderedAlert {
  subject: string;
  html: string;
  text: string;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

export function renderAlertEmail(alerts: Incident[], now: number, origin: string): RenderedAlert {
  const lead = alerts[0];
  const more = alerts.length - 1;
  const subject = alerts.length === 1
    ? `Nearby: ${lead.title}`
    : `${alerts.length} alerts near you — ${lead.title}${more > 0 ? ` +${more}` : ''}`;

  const line = (i: Incident) =>
    `• ${i.title} — ${i.neighborhood || 'Calgary'} · ${formatRelativeTime(i.timestamp, now)}`;
  const text = [
    'Reports near you on Calgary Watch:',
    '',
    ...alerts.map(line),
    '',
    `See the map: ${origin}/map`,
    '',
    'You are getting this because instant alerts are on. Turn them off any time in your Calgary Watch settings.',
  ].join('\n');

  const rows = alerts.map((i) => `
    <tr><td style="padding:10px 0;border-bottom:1px solid #E7E0D2;">
      <strong style="color:#0B1F33;">${escapeHtml(i.title)}</strong><br/>
      <span style="color:#5A6B7D;font-size:13px;">${escapeHtml(i.neighborhood || 'Calgary')} · ${escapeHtml(formatRelativeTime(i.timestamp, now))}</span>
    </td></tr>`).join('');
  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#1C2B3A;">
    <h1 style="font-size:18px;color:#06162F;">Reports near you</h1>
    <table style="width:100%;border-collapse:collapse;">${rows}</table>
    <p style="margin-top:18px;"><a href="${origin}/map" style="color:#2F6FB0;font-weight:bold;">Open the map &rarr;</a></p>
    <p style="color:#9AA6B2;font-size:12px;margin-top:20px;">
      Instant alerts are on for your account. Turn them off any time in your Calgary Watch settings.
    </p>
  </div>`;

  return { subject, html, text };
}
