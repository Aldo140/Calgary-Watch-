/**
 * Calgary Watch — the weekly digest, as an email.
 *
 * ── The constraint ─────────────────────────────────────────────────────────
 * Email is not the web. This renders nested tables with inline styles because
 * Outlook ignores flexbox and grid, Gmail strips <style> blocks in several
 * contexts, and every remote asset is blocked until the reader says otherwise.
 * Everything below therefore has to survive being read as plain rectangles with
 * images switched off — which is the state most of these will first be read in.
 *
 * ── The design ─────────────────────────────────────────────────────────────
 * Set in Calgary's own colours rather than a newsletter's: the prairie-night
 * navy the map's chrome already uses for the masthead, Paskapoo sandstone for
 * the page, Bow River teal for anything actionable. Those are the product's
 * existing tokens, so an email and the map read as one thing.
 *
 * The signature is the DISTANCE RAIL. Each report carries its distance from
 * home in a monospace column down the left edge, so scanning the list gives a
 * proximity ladder — 240 m, 620 m, 880 m, 1.0 km — before a single headline is
 * read. That is the question a resident actually opens this with: not what
 * happened, but how close. A reader who only gives us a community name has no
 * distance to show, so their rail carries the weekday instead; it is never
 * padded with a fake radius.
 *
 * The count is the headline, set large in the display face. One number about
 * one place is the entire value of the message, and burying it under a greeting
 * would be pretending otherwise.
 *
 * Type is three roles: Georgia for display, a monospace stack for data and
 * eyebrows, Arial for body. Web fonts are not used — Gmail and Outlook drop
 * them, and a fallback that only appears for some readers is not a typeface.
 *
 * Every message is rendered twice, HTML and text. The text part is not a
 * courtesy: a message with no text/plain alternative scores worse with spam
 * filters, and watch and screen-reader clients often prefer it.
 */

import {
  DIGEST_CATEGORY_LABEL,
  deltaSentence,
  digestSubject,
  formatDigestDistance,
  type DigestSummary,
  type ScoredIncident,
} from '../../src/lib/digest.js';

/**
 * The product's tokens, not a palette invented for email.
 *
 * `gold` is a step lighter than the app's #B0793C because it is used on navy
 * here rather than on sandstone, and the darker value fails contrast there.
 */
const C = {
  ink: '#0B1F33',
  inkStep: '#16304A',
  sand: '#F2EBDD',
  paper: '#FFFDF8',
  line: '#E2D9C7',
  edge: '#CFC2AA',
  body: '#3C4A57',
  soft: '#6B7A88',
  bow: '#2E8B7A',
  gold: '#C89355',
  clay: '#B0503A',
} as const;

const DISPLAY = "Georgia,'Times New Roman',Times,serif";
const MONO = "'SF Mono',SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace";
const BODY = "-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,Helvetica,sans-serif";

export interface DigestBranding {
  /**
   * CASL requires a physical mailing address in every commercial message.
   * There is no default and no placeholder — see `assertBrandingComplete`.
   */
  mailingAddress: string;
  senderName: string;
  origin: string;
  supportEmail: string;
}

/**
 * Refuses to build an email that would be unlawful to send.
 *
 * Canada's Anti-Spam Legislation requires the sender to be identified, to give
 * a physical mailing address, and to offer a working unsubscribe. The first two
 * are static configuration, which means they are exactly the kind of thing that
 * ships empty and is noticed months later by a regulator rather than by a test.
 * So a missing or placeholder address is a hard failure at render time, before
 * a single message is handed to the provider.
 */
export function assertBrandingComplete(branding: DigestBranding): void {
  const missing: string[] = [];
  if (!branding.mailingAddress.trim()) missing.push('DIGEST_MAILING_ADDRESS');
  if (!branding.senderName.trim()) missing.push('DIGEST_SENDER_NAME');
  if (!branding.supportEmail.trim()) missing.push('DIGEST_SUPPORT_EMAIL');
  if (missing.length > 0) {
    throw new Error(
      `Refusing to send: CASL requires sender identification and a physical mailing `
      + `address in every commercial email. Missing: ${missing.join(', ')}.`,
    );
  }
  if (/YOUR_|EXAMPLE|TODO|CHANGEME/i.test(branding.mailingAddress)) {
    throw new Error(
      `Refusing to send: DIGEST_MAILING_ADDRESS is still a placeholder `
      + `(${JSON.stringify(branding.mailingAddress)}). CASL requires a real address.`,
    );
  }
}

/** Anything interpolated into HTML goes through here. Titles are user input. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function firstName(displayName: string | undefined): string {
  const first = (displayName ?? '').trim().split(/\s+/)[0];
  return first && first.length <= 30 ? first : 'neighbour';
}

function fmt(timestamp: number, opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton', ...opts })
    .format(new Date(timestamp));
}

const dayLabel = (t: number) => fmt(t, { weekday: 'long' });
/** Three letters for the rail, where the column is only wide enough for that. */
const dayShort = (t: number) => fmt(t, { weekday: 'short' }).toUpperCase().slice(0, 3);

/** Where a report came from, phrased as the briefing phrases it. */
function sourceLabel(item: ScoredIncident): string {
  const { incident } = item;
  if (incident.data_source === 'community') return 'A neighbour';
  return incident.source_name?.trim() || 'City of Calgary';
}

/**
 * The line under a headline — deliberately not repeating the rail.
 *
 * The rail already carries the distance (or the weekday, when there is no
 * distance to carry), so restating it here would spend the only other line this
 * row has on a number the eye has just read. Each variant therefore names what
 * the rail does not: with a distance on the rail, the day; with a weekday on
 * the rail, the community.
 */
function itemSubtitle(item: ScoredIncident): string {
  const bits = [sourceLabel(item)];
  if (item.distanceM !== null) bits.push(dayLabel(item.incident.timestamp));
  else if (item.incident.neighborhood) bits.push(item.incident.neighborhood);
  return bits.join(' · ');
}

/** The window, as "13–19 Aug 2026". */
function dateRange(summary: DigestSummary): string {
  const from = fmt(summary.since, { day: 'numeric', month: 'short' });
  const to = fmt(summary.until, { day: 'numeric', month: 'short', year: 'numeric' });
  return `${from} – ${to}`;
}

// ── HTML ────────────────────────────────────────────────────────────────────

/**
 * Navy masthead.
 *
 * The mark is a bonus, not the identity: it is one small PNG served from the
 * site, and it will be blocked on first open for most readers. So the wordmark
 * beside it is live text on a navy cell, and the block reads correctly with
 * images off. Explicit width and height stop the layout collapsing while it
 * loads, and the alt text is empty because the wordmark already says it —
 * a screen reader should not hear "Calgary Watch" twice.
 */
function masthead(summary: DigestSummary, origin: string): string {
  return `
  <tr><td style="background:${C.ink};padding:22px 28px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr>
        <td width="34" style="width:34px;vertical-align:middle;padding-right:12px;">
          <img src="${escapeHtml(origin)}/images/brand/email-mark.png" alt=""
               width="34" height="21" style="display:block;width:34px;height:21px;border:0;">
        </td>
        <td style="vertical-align:middle;">
          <div style="font:700 15px/1 ${DISPLAY};color:#FFFFFF;letter-spacing:0.3px;">
            Calgary&nbsp;Watch
          </div>
          <div style="font:400 10px/1 ${MONO};color:${C.gold};letter-spacing:2.2px;padding-top:6px;">
            WEEKLY BRIEF
          </div>
        </td>
        <td align="right" style="vertical-align:middle;">
          <div style="font:400 10px/1 ${MONO};color:#8FA3B5;letter-spacing:1.4px;">
            ${escapeHtml(summary.weekKey)}
          </div>
          <div style="font:400 10px/1 ${MONO};color:#8FA3B5;letter-spacing:0.6px;padding-top:6px;">
            ${escapeHtml(dateRange(summary))}
          </div>
        </td>
      </tr>
    </table>
  </td></tr>`;
}

/** The area strip: which place this issue is about, stated once, in the rule. */
function areaStrip(summary: DigestSummary): string {
  return `
  <tr><td style="background:${C.inkStep};padding:9px 28px;">
    <div style="font:700 10px/1.4 ${MONO};color:${C.gold};letter-spacing:2.4px;">
      ${escapeHtml(summary.areaName.toUpperCase())}
    </div>
  </td></tr>`;
}

/** The count is the headline. One number about one place is the whole message. */
function headline(summary: DigestSummary, name: string): string {
  const delta = deltaSentence(summary);
  if (summary.quiet) {
    return `
    <tr><td style="padding:30px 28px 4px;">
      <div style="font:400 14px/1.5 ${BODY};color:${C.soft};">Morning, ${escapeHtml(name)}.</div>
      <div style="font:700 30px/1.2 ${DISPLAY};color:${C.ink};padding-top:12px;">
        A quiet week.
      </div>
      <div style="font:400 15px/1.6 ${BODY};color:${C.body};padding-top:10px;">
        Nothing was reported ${escapeHtml(summary.ringLabel)}. That is worth knowing too.
      </div>
    </td></tr>`;
  }
  return `
  <tr><td style="padding:30px 28px 4px;">
    <div style="font:400 14px/1.5 ${BODY};color:${C.soft};">Morning, ${escapeHtml(name)}.</div>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="padding-top:10px;">
      <tr>
        <td style="vertical-align:middle;padding-right:14px;">
          <div style="font:700 52px/1 ${DISPLAY};color:${C.ink};">${summary.total}</div>
        </td>
        <td style="vertical-align:middle;">
          <div style="font:700 17px/1.3 ${DISPLAY};color:${C.ink};">
            ${summary.total === 1 ? 'report' : 'reports'}
          </div>
          <div style="font:400 13px/1.4 ${BODY};color:${C.soft};padding-top:3px;">
            ${escapeHtml(summary.ringLabel)}
          </div>
        </td>
      </tr>
    </table>
    ${delta ? `<div style="font:400 13px/1.5 ${BODY};color:${C.soft};padding-top:12px;">
      ${escapeHtml(delta)}
    </div>` : ''}
  </td></tr>`;
}

/** Category counts, as a row of tiles. Only categories with something in them. */
function counters(summary: DigestSummary): string {
  if (summary.byCategory.length === 0) return '';
  const cells = summary.byCategory.map((c) => `
    <td style="padding-right:7px;vertical-align:top;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
             style="background:${C.paper};border:1px solid ${C.line};border-top:2px solid ${c.colour};">
        <tr><td style="padding:10px 12px;">
          <div style="font:700 20px/1 ${DISPLAY};color:${C.ink};">${c.count}</div>
          <div style="font:700 9px/1.3 ${MONO};color:${C.soft};letter-spacing:1.2px;padding-top:6px;">
            ${escapeHtml(c.label.toUpperCase())}
          </div>
        </td></tr>
      </table>
    </td>`).join('');
  return `
  <tr><td style="padding:22px 28px 0;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr>${cells}</tr>
    </table>
  </td></tr>`;
}

/**
 * A report, with its distance on the rail.
 *
 * The rail is the whole point of the layout: a monospace column the eye reads
 * downward as a proximity ladder before it reads any headline. Fixed width so
 * the numbers align, tinted so it reads as a gutter rather than a first word.
 */
function reportRow(item: ScoredIncident, origin: string): string {
  const rail = item.distanceM !== null
    ? formatDigestDistance(item.distanceM).replace(' ', ' ')
    : dayShort(item.incident.timestamp);
  return `
  <tr><td style="padding-bottom:7px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
           style="background:${C.paper};border:1px solid ${C.line};">
      <tr>
        <td width="72" style="width:72px;background:#F7F1E5;border-right:1px solid ${C.line};
                   padding:13px 8px;text-align:center;vertical-align:middle;">
          <div style="font:700 11px/1.2 ${MONO};color:${C.ink};letter-spacing:0.2px;">
            ${escapeHtml(rail)}
          </div>
        </td>
        <td style="padding:12px 14px;">
          <a href="${escapeHtml(origin)}/map?incident=${encodeURIComponent(item.incident.id)}"
             style="font:700 14.5px/1.4 ${DISPLAY};color:${C.ink};text-decoration:none;">
            ${escapeHtml(item.incident.title)}
          </a>
          <div style="font:400 11.5px/1.4 ${BODY};color:${C.soft};padding-top:5px;">
            ${escapeHtml(itemSubtitle(item))}
          </div>
        </td>
      </tr>
    </table>
  </td></tr>`;
}

/** A section eyebrow: gold tick, mono label, rule across the column. */
function eyebrow(label: string): string {
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
    <tr>
      <td width="16" style="width:16px;padding-right:9px;">
        <div style="height:3px;background:${C.gold};font-size:0;line-height:0;">&nbsp;</div>
      </td>
      <td width="1" style="white-space:nowrap;">
        <div style="font:700 10px/1 ${MONO};color:${C.gold};letter-spacing:2.2px;">
          ${escapeHtml(label)}
        </div>
      </td>
      <td style="padding-left:10px;">
        <div style="height:1px;background:${C.line};font-size:0;line-height:0;">&nbsp;</div>
      </td>
    </tr>
  </table>`;
}

function body(summary: DigestSummary, origin: string): string {
  if (summary.quiet) return '';
  return `
  <tr><td style="padding:26px 28px 0;">
    ${eyebrow('WHAT HAPPENED')}
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
           style="padding-top:12px;">
      ${summary.highlights.map((i) => reportRow(i, origin)).join('')}
    </table>
    ${summary.total > summary.highlights.length ? `
    <div style="font:400 12px/1.5 ${BODY};color:${C.soft};padding-top:4px;">
      ${summary.total - summary.highlights.length} more on the map.
    </div>` : ''}
  </td></tr>`;
}

/** Table-and-padding button: the shape Outlook renders correctly. */
function cta(origin: string, label: string): string {
  return `
  <tr><td style="padding:26px 28px 0;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
      <tr><td style="background:${C.ink};">
        <a href="${escapeHtml(origin)}/map"
           style="display:inline-block;padding:13px 26px;font:700 12px/1 ${MONO};
                  color:#FFFFFF;text-decoration:none;letter-spacing:1.4px;">
          ${escapeHtml(label)}
        </a>
      </td></tr>
    </table>
  </td></tr>`;
}

/**
 * CASL footer.
 *
 * Sender identity, a real mailing address and a working unsubscribe are legal
 * requirements, not design elements. Nothing here is safe to trim for tidiness,
 * and the unsubscribe is styled to be found rather than hidden in grey — a link
 * somebody cannot see is what makes them press the spam button instead, which
 * costs far more than the unsubscribe would have.
 */
function footer(unsubscribeUrl: string, branding: DigestBranding): string {
  return `
  <tr><td style="padding:30px 28px 34px;">
    <div style="height:1px;background:${C.edge};font-size:0;line-height:0;">&nbsp;</div>
    <p style="margin:18px 0 0;font:400 11.5px/1.7 ${BODY};color:${C.soft};">
      You are getting this because you turned on the weekly digest in your Calgary
      Watch settings. It is built only from your saved location and public reports
      on the map.
    </p>
    <p style="margin:14px 0 0;font:400 11.5px/1.7 ${BODY};color:${C.soft};">
      <strong style="color:${C.body};">${escapeHtml(branding.senderName)}</strong><br>
      ${escapeHtml(branding.mailingAddress)}<br>
      <a href="mailto:${escapeHtml(branding.supportEmail)}" style="color:${C.bow};text-decoration:none;">
        ${escapeHtml(branding.supportEmail)}</a>
    </p>
    <p style="margin:14px 0 0;font:400 11.5px/1.7 ${BODY};color:${C.soft};">
      <a href="${escapeHtml(unsubscribeUrl)}"
         style="color:${C.bow};font-weight:bold;text-decoration:underline;">Unsubscribe</a>
      <span style="color:${C.edge};">&nbsp;&nbsp;·&nbsp;&nbsp;</span>
      <a href="${escapeHtml(branding.origin)}/privacy" style="color:${C.bow};text-decoration:none;">Privacy</a>
    </p>
  </td></tr>`;
}

export function renderDigestHtml(options: {
  summary: DigestSummary;
  displayName?: string;
  unsubscribeUrl: string;
  branding: DigestBranding;
}): string {
  const { summary, unsubscribeUrl, branding } = options;
  assertBrandingComplete(branding);
  const { origin } = branding;
  const name = firstName(options.displayName);

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<!-- Light only. A client that inverts this would put white type on sandstone. -->
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(digestSubject(summary))}</title>
</head>
<body style="margin:0;padding:0;background:${C.sand};-webkit-text-size-adjust:100%;">
<!-- Preheader: the grey line an inbox shows beside the subject. Hidden in the
     message itself so it is not repeated at the top of the page. -->
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">
  ${escapeHtml(deltaSentence(summary) ?? `Your week ${summary.ringLabel}.`)}
</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
       style="background:${C.sand};">
<tr><td align="center" style="padding:26px 10px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600"
         style="width:100%;max-width:600px;background:${C.sand};border:1px solid ${C.edge};">
    ${masthead(summary, origin)}
    ${areaStrip(summary)}
    ${headline(summary, name)}
    ${counters(summary)}
    ${body(summary, origin)}
    ${cta(origin, summary.quiet ? 'OPEN THE MAP' : 'SEE IT ON THE MAP')}
    ${footer(unsubscribeUrl, branding)}
  </table>
</td></tr>
</table>
</body></html>`;
}

// ── Plain text ──────────────────────────────────────────────────────────────

export function renderDigestText(options: {
  summary: DigestSummary;
  displayName?: string;
  unsubscribeUrl: string;
  branding: DigestBranding;
}): string {
  const { summary, unsubscribeUrl, branding } = options;
  assertBrandingComplete(branding);
  const name = firstName(options.displayName);
  const delta = deltaSentence(summary);

  const lines: string[] = [
    'CALGARY WATCH — WEEKLY BRIEF',
    `${summary.weekKey}  ·  ${dateRange(summary)}`,
    summary.areaName.toUpperCase(),
    '',
    `Morning, ${name}.`,
    '',
  ];

  if (summary.quiet) {
    lines.push(
      'A quiet week.',
      `Nothing was reported ${summary.ringLabel}. That is worth knowing too.`,
    );
  } else {
    lines.push(
      `${summary.total} ${summary.total === 1 ? 'report' : 'reports'} ${summary.ringLabel}.`,
    );
    if (delta) lines.push(delta);
    lines.push(
      '',
      summary.byCategory.map((c) => `${c.count} ${DIGEST_CATEGORY_LABEL[c.category].toLowerCase()}`).join('  ·  '),
      '',
      'WHAT HAPPENED',
      '',
    );
    for (const item of summary.highlights) {
      // The rail, kept as a left column so the text part scans the same way.
      const rail = (item.distanceM !== null
        ? formatDigestDistance(item.distanceM)
        : dayShort(item.incident.timestamp)).padEnd(9);
      lines.push(`${rail}${item.incident.title}`, `${' '.repeat(9)}${itemSubtitle(item)}`, '');
    }
    if (summary.total > summary.highlights.length) {
      lines.push(`${summary.total - summary.highlights.length} more on the map.`, '');
    }
  }

  lines.push(
    '',
    `See it on the map: ${branding.origin}/map`,
    '',
    '--------------------------------------------------------------',
    'You are getting this because you turned on the weekly digest in',
    'your Calgary Watch settings. It is built only from your saved',
    'location and public reports on the map.',
    '',
    branding.senderName,
    branding.mailingAddress,
    branding.supportEmail,
    '',
    `Unsubscribe: ${unsubscribeUrl}`,
    `Privacy: ${branding.origin}/privacy`,
  );
  return lines.join('\n');
}
