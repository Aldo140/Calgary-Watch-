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
import {
  CTA_LABEL,
  CTA_LABEL_QUIET,
  greeting,
  leadParagraph,
  listHeading,
  WELCOME,
} from './copy.js';

/**
 * The product's tokens, not a palette invented for email.
 *
 * `gold` is a step lighter than the app's #B0793C because it is used on navy
 * here rather than on sandstone, and the darker value fails contrast there.
 */
const C = {
  /** Warm black. A blue-black read as institutional next to the sandstone. */
  ink: '#2A2420',
  /** Foothill green — the deepest thing on the page, used sparingly. */
  deep: '#1F3D37',
  sand: '#F4EEE3',
  paper: '#FFFCF7',
  line: '#E7DFD0',
  edge: '#D5C9B6',
  body: '#4A423A',
  soft: '#7A6F62',
  bow: '#2E8B7A',
  gold: '#A8763A',
  rail: '#F7F2E8',
} as const;

const DISPLAY = "Georgia,'Iowan Old Style','Times New Roman',Times,serif";
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

const SHELL_W = 560;

/**
 * The masthead — set, not illustrated.
 *
 * There is no logo image, and that is a decision rather than a shortcut. Mail
 * clients block remote images by default, so a masthead built on one is a
 * broken rectangle on first open for most readers; and the moment the asset
 * 404s — a missed deploy, a renamed path — every message already sent shows a
 * broken-image icon forever. A typographic lockup cannot fail that way, loads
 * instantly, and is what a letter from a person would have at the top anyway.
 */
function masthead(dateLine: string): string {
  return `
  <tr><td style="padding:34px 36px 0;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr>
        <td style="vertical-align:baseline;">
          <span style="font:700 13px/1 ${BODY};color:${C.deep};letter-spacing:2.6px;">
            CALGARY&nbsp;WATCH
          </span>
        </td>
        <td align="right" style="vertical-align:baseline;">
          <span style="font:400 11.5px/1 ${BODY};color:${C.soft};">${escapeHtml(dateLine)}</span>
        </td>
      </tr>
    </table>
    <div style="height:2px;background:${C.gold};font-size:0;line-height:0;margin-top:11px;">&nbsp;</div>
  </td></tr>`;
}

/** A paragraph in the body voice. One place, so leading never drifts. */
function p(text: string, opts: { top?: number; color?: string; size?: number } = {}): string {
  const { top = 14, color = C.body, size = 15.5 } = opts;
  return `<p style="margin:${top}px 0 0;font:400 ${size}px/1.62 ${BODY};color:${color};">${text}</p>`;
}

/** The greeting, in the display face — the one place the serif goes large. */
function salutation(name: string, at: number): string {
  return `<div style="font:700 27px/1.25 ${DISPLAY};color:${C.ink};">
    ${escapeHtml(greeting(at))}, ${escapeHtml(name)}.
  </div>`;
}

/**
 * Category counts as one line, not a row of tiles.
 *
 * The tiles were three boxes that auto-sized to their labels, so "Crime" came
 * out narrow and "Infrastructure" wide and the row read as a mistake. They also
 * restated what the list below says, in a heavier form. One quiet line carries
 * the same information and lets the reports be the thing you look at.
 */
function categoryLine(summary: DigestSummary): string {
  if (summary.byCategory.length === 0) return '';
  const parts = summary.byCategory
    .map((c) => `<span style="color:${C.ink};font-weight:700;">${c.count}</span> `
      + `${escapeHtml(c.label.toLowerCase())}`)
    .join(`<span style="color:${C.soft};opacity:0.55;"> &nbsp;·&nbsp; </span>`);
  return `<div style="font:400 13px/1.5 ${BODY};color:${C.soft};padding-top:16px;">${parts}</div>`;
}

/** Small caps heading above a block. Quiet, warm, not a system label. */
function heading(text: string): string {
  return `<div style="font:700 11px/1 ${BODY};color:${C.gold};letter-spacing:1.9px;
                      text-transform:uppercase;padding-bottom:12px;">${escapeHtml(text)}</div>`;
}

/**
 * A report, with its distance on the rail.
 *
 * The rail is the layout's one strong idea: a fixed-width column the eye reads
 * downward as a proximity ladder — 240 m, 620 m, 880 m, 1.0 km — before it
 * reads a single headline. How close it was is the question people open this
 * with. Somebody who gave us only a community name has no distance to show, so
 * their rail carries the weekday; it is never padded with a radius we did not
 * measure.
 */
function reportRow(item: ScoredIncident, origin: string): string {
  const rail = item.distanceM !== null
    ? formatDigestDistance(item.distanceM)
    : dayShort(item.incident.timestamp);
  return `
  <tr><td style="padding-bottom:9px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
           style="background:${C.paper};border:1px solid ${C.line};border-radius:3px;">
      <tr>
        <td width="76" style="width:76px;background:${C.rail};border-right:1px solid ${C.line};
                   padding:14px 6px;text-align:center;vertical-align:middle;">
          <span style="font:700 11.5px/1.2 ${MONO};color:${C.deep};">${escapeHtml(rail)}</span>
        </td>
        <td style="padding:13px 16px;">
          <a href="${escapeHtml(origin)}/map?incident=${encodeURIComponent(item.incident.id)}"
             style="font:700 15px/1.42 ${DISPLAY};color:${C.ink};text-decoration:none;">
            ${escapeHtml(item.incident.title)}
          </a>
          <div style="font:400 12px/1.45 ${BODY};color:${C.soft};padding-top:6px;">
            ${escapeHtml(itemSubtitle(item))}
          </div>
        </td>
      </tr>
    </table>
  </td></tr>`;
}

/** The report list, or nothing at all on a quiet week. */
function reportList(summary: DigestSummary, origin: string): string {
  if (summary.quiet) return '';
  return `
  <tr><td style="padding:30px 36px 0;">
    ${heading(listHeading(summary))}
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
      ${summary.highlights.map((i) => reportRow(i, origin)).join('')}
    </table>
    ${summary.total > summary.highlights.length
      ? p(`${summary.total - summary.highlights.length} more are on the map.`,
          { top: 10, color: C.soft, size: 13 })
      : ''}
  </td></tr>`;
}

/** Table-and-padding button: the shape Outlook renders correctly. */
function cta(origin: string, label: string): string {
  return `
  <tr><td style="padding:28px 36px 0;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
      <tr><td style="background:${C.deep};border-radius:3px;">
        <a href="${escapeHtml(origin)}/map"
           style="display:inline-block;padding:14px 26px;font:700 14px/1 ${BODY};
                  color:#FFFCF7;text-decoration:none;">
          ${escapeHtml(label)}&nbsp;→
        </a>
      </td></tr>
    </table>
  </td></tr>`;
}

/**
 * CASL footer.
 *
 * Sender identity, a real mailing address and a working unsubscribe are legal
 * requirements, not design elements — nothing here is safe to trim for
 * tidiness. The unsubscribe is styled to be found rather than hidden in grey: a
 * link somebody cannot see is what makes them press the spam button instead,
 * and that costs far more than the unsubscribe would have.
 */
function footer(unsubscribeUrl: string, branding: DigestBranding): string {
  return `
  <tr><td style="padding:34px 36px 38px;">
    <div style="height:1px;background:${C.edge};font-size:0;line-height:0;">&nbsp;</div>
    ${p(`You're getting this because you turned on the weekly digest in your Calgary Watch `
      + `settings. It's built from your saved location and public reports on the map, `
      + `nothing else.`, { top: 20, color: C.soft, size: 12 })}
    ${p(`<strong style="color:${C.body};">${escapeHtml(branding.senderName)}</strong><br>`
      + `${escapeHtml(branding.mailingAddress)}<br>`
      + `<a href="mailto:${escapeHtml(branding.supportEmail)}" `
      + `style="color:${C.bow};text-decoration:none;">${escapeHtml(branding.supportEmail)}</a>`,
      { top: 15, color: C.soft, size: 12 })}
    ${p(`<a href="${escapeHtml(unsubscribeUrl)}" style="color:${C.bow};font-weight:700;`
      + `text-decoration:underline;">Unsubscribe</a>`
      + `<span style="color:${C.edge};">&nbsp;&nbsp;·&nbsp;&nbsp;</span>`
      + `<a href="${escapeHtml(branding.origin)}/privacy" style="color:${C.bow};`
      + `text-decoration:none;">Privacy</a>`, { top: 15, color: C.soft, size: 12 })}
  </td></tr>`;
}

/** The document shell. Both emails are the same page with a different middle. */
function shell(options: {
  title: string; preheader: string; inner: string;
}): string {
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<!-- Light only. A client that inverted this would put white type on sandstone. -->
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(options.title)}</title>
</head>
<body style="margin:0;padding:0;background:${C.sand};-webkit-text-size-adjust:100%;">
<!-- Preheader: the grey line an inbox shows beside the subject. Hidden in the
     message itself so it is not repeated at the top of the page. -->
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">
  ${escapeHtml(options.preheader)}
</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
       style="background:${C.sand};">
<tr><td align="center" style="padding:30px 12px 44px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${SHELL_W}"
         style="width:100%;max-width:${SHELL_W}px;background:${C.sand};">
    ${options.inner}
  </table>
</td></tr>
</table>
</body></html>`;
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

  return shell({
    title: digestSubject(summary),
    preheader: leadParagraph(summary),
    inner: `
    ${masthead(dateRange(summary))}
    <tr><td style="padding:26px 36px 0;">
      ${salutation(name, summary.until)}
      ${p(escapeHtml(leadParagraph(summary)), { top: 13 })}
      ${categoryLine(summary)}
    </td></tr>
    ${reportList(summary, origin)}
    ${cta(origin, summary.quiet ? CTA_LABEL_QUIET : CTA_LABEL)}
    ${footer(unsubscribeUrl, branding)}`,
  });
}

/**
 * The first email, sent once.
 *
 * Same shell and same digest underneath, so nobody has to learn a second
 * format — but it opens with a note explaining who this is and what will
 * arrive, and closes by asking what people want from it. A digest arriving
 * cold from a half-remembered signup is indistinguishable from spam; this is
 * the message that makes the next twelve months of them welcome.
 */
export function renderWelcomeHtml(options: {
  summary: DigestSummary;
  displayName?: string;
  unsubscribeUrl: string;
  branding: DigestBranding;
}): string {
  const { summary, unsubscribeUrl, branding } = options;
  assertBrandingComplete(branding);
  const { origin } = branding;
  const name = firstName(options.displayName);

  const note = WELCOME.paragraphs
    .map((text, i) => p(escapeHtml(text), { top: i === 0 ? 13 : 14 }))
    .join('');

  return shell({
    title: WELCOME.subject,
    preheader: WELCOME.paragraphs[0],
    inner: `
    ${masthead(dateRange(summary))}
    <tr><td style="padding:26px 36px 0;">
      ${salutation(name, summary.until)}
      ${note}
    </td></tr>

    <!-- The ask. Boxed so it reads as a question and not as another paragraph
         somebody can skim past — it is the only thing in the message that
         wants something back. -->
    <tr><td style="padding:26px 36px 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
             style="background:${C.paper};border:1px solid ${C.line};
                    border-left:3px solid ${C.bow};border-radius:3px;">
        <tr><td style="padding:18px 20px;">
          ${heading(WELCOME.askHeading)}
          ${p(escapeHtml(WELCOME.ask), { top: 0, color: C.body, size: 14.5 })}
        </td></tr>
      </table>
      ${p(escapeHtml(WELCOME.thanks), { top: 18 })}
      ${p(`<span style="font:700 15.5px/1.5 ${DISPLAY};color:${C.ink};">— `
        + `${escapeHtml(WELCOME.signOff)}</span><br>`
        + `<span style="color:${C.soft};font-size:13px;">${escapeHtml(WELCOME.signOffRole)}</span>`,
        { top: 10 })}
    </td></tr>

    <tr><td style="padding:32px 36px 0;">
      <div style="height:1px;background:${C.edge};font-size:0;line-height:0;">&nbsp;</div>
      ${p(escapeHtml(WELCOME.sampleIntro), { top: 20, color: C.soft, size: 13.5 })}
      ${p(escapeHtml(leadParagraph(summary)), { top: 12 })}
      ${categoryLine(summary)}
    </td></tr>
    ${reportList(summary, origin)}
    ${cta(origin, summary.quiet ? CTA_LABEL_QUIET : CTA_LABEL)}
    ${footer(unsubscribeUrl, branding)}`,
  });
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

/**
 * The welcome, as plain text.
 *
 * Kept in step with the HTML by construction: both read the same strings from
 * copy.ts, so a wording change lands in both parts or neither. A message whose
 * text alternative says something different from its HTML is worse than one
 * with no alternative at all.
 */
export function renderWelcomeText(options: {
  summary: DigestSummary;
  displayName?: string;
  unsubscribeUrl: string;
  branding: DigestBranding;
}): string {
  const { summary, unsubscribeUrl, branding } = options;
  assertBrandingComplete(branding);
  const name = firstName(options.displayName);

  const lines: string[] = [
    'CALGARY WATCH',
    dateRange(summary),
    '',
    `${greeting(summary.until)}, ${name}.`,
    '',
    ...WELCOME.paragraphs.flatMap((text) => [wrap(text), '']),
    WELCOME.askHeading.toUpperCase(),
    wrap(WELCOME.ask),
    '',
    WELCOME.thanks,
    '',
    `— ${WELCOME.signOff}`,
    WELCOME.signOffRole,
    '',
    '--------------------------------------------------------------',
    '',
    WELCOME.sampleIntro,
    '',
    wrap(leadParagraph(summary)),
  ];

  if (!summary.quiet) {
    lines.push(
      '',
      summary.byCategory
        .map((c) => `${c.count} ${DIGEST_CATEGORY_LABEL[c.category].toLowerCase()}`)
        .join('  ·  '),
      '',
      listHeading(summary).toUpperCase(),
      '',
    );
    for (const item of summary.highlights) {
      const rail = (item.distanceM !== null
        ? formatDigestDistance(item.distanceM)
        : dayShort(item.incident.timestamp)).padEnd(9);
      lines.push(`${rail}${item.incident.title}`, `${' '.repeat(9)}${itemSubtitle(item)}`, '');
    }
    if (summary.total > summary.highlights.length) {
      lines.push(`${summary.total - summary.highlights.length} more are on the map.`, '');
    }
  }

  lines.push(
    '',
    `${CTA_LABEL}: ${branding.origin}/map`,
    '',
    '--------------------------------------------------------------',
    "You're getting this because you turned on the weekly digest in",
    'your Calgary Watch settings.',
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

/** Hard-wraps a paragraph at 62 columns, the width the text part is set to. */
function wrap(text: string, width = 62): string {
  const out: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    if (line && (line + ' ' + word).length > width) { out.push(line); line = word; }
    else line = line ? `${line} ${word}` : word;
  }
  if (line) out.push(line);
  return out.join('\n');
}
