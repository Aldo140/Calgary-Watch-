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
  displayAreaName,
  digestSubject,
  formatDigestDistance,
  type DigestSummary,
  type ScoredIncident,
} from '../../src/lib/digest.js';
import { CID } from './art.js';
import {
  areasHeading,
  CTA_LABEL,
  locationPrompt,
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
/**
 * Set light, and committed to it.
 *
 * The dark version was correct in the file — inline background:#0E1A17 on the
 * body and on every table — and still arrived white in a real client. Mail
 * clients rewrite backgrounds and there is no declaration that reliably stops
 * them, which left cream artwork sitting on a white page. Designing against a
 * ground we do not control is the wrong bet, and it is why almost every large
 * sender ships light email.
 *
 * So: Paskapoo sandstone, dark ink, dark artwork. `supported-color-schemes:
 * light` asks clients not to invert, and where one does anyway, the dark-mode
 * block below repaints the surfaces rather than leaving the client to guess.
 *
 * Every value is checked against the surface it lands on by
 * `npm run digest:contrast`, which fails below WCAG AA.
 */
const C = {
  /** The page behind everything. */
  page: '#F4EEE3',
  /** Cards and report rows. */
  card: '#FFFCF7',
  /** The distance rail, a step down so the column reads as a gutter. */
  rail: '#F6F0E4',
  line: '#E2D9C7',
  edge: '#CBBDA6',
  /** Headings and anything that must not be missed. */
  ink: '#241E1A',
  /** Running text. */
  body: '#463D34',
  /** Secondary text. Still AA at the sizes it is used. */
  soft: '#655A4E',
  /** Bow River teal, darkened for a light ground. */
  bow: '#1C6B5B',
  /** Sandstone gold, darkened for a light ground. */
  gold: '#8A5C28',
  /** The one solid button. */
  button: '#1F3D37',
  buttonInk: '#FFFCF7',
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
  if (item.distanceM !== null) {
    // The rail carries the distance, so this line carries the day.
    bits.push(dayLabel(item.incident.timestamp));
  } else {
    // No rail: this line carries everything the reader would otherwise lose.
    if (item.incident.neighborhood) bits.push(displayAreaName(item.incident.neighborhood));
    bits.push(dayLabel(item.incident.timestamp));
  }
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
  <tr><td style="padding:32px 36px 0;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr>
        <td width="38" style="width:38px;padding-right:14px;vertical-align:middle;">
          <!-- Inline part, not a hosted URL — see scripts/digest/art.ts. The
               wordmark beside it is live text, so a reader with images off
               still gets a masthead rather than an empty box. -->
          <img src="cid:${CID.shield}" width="38" height="51" alt=""
               style="display:block;width:38px;height:51px;border:0;">
        </td>
        <td style="vertical-align:middle;">
          <div class="cw-ink" style="font:700 13px/1 ${BODY};color:${C.ink};letter-spacing:2.6px;">
            CALGARY&nbsp;WATCH
          </div>
          <div style="font:400 11px/1 ${BODY};color:${C.soft};padding-top:6px;">
            ${escapeHtml(dateLine)}
          </div>
        </td>
      </tr>
    </table>
    <div style="height:2px;background:${C.gold};font-size:0;line-height:0;margin-top:13px;">&nbsp;</div>
  </td></tr>`;
}

/**
 * The skyline, as a full-width band closing the letter.
 *
 * It was a delicate line drawing, which worked while the art was dark ink on
 * transparency. Now that every mark carries a baked black plate, a 230px
 * version of it read as a black slab dropped in the gap above the footer.
 *
 * So it becomes the thing it already wanted to be: a band the full width of
 * the column, with the city in white across it. At that size the plate is the
 * design rather than an artefact of it, and the band does the separating a
 * hairline was doing — so the hairline goes, and the email loses a rule it no
 * longer needs.
 */
function skylineRule(): string {
  return `
  <tr><td style="padding:26px 36px 0;">
    <img src="cid:${CID.skyline}" width="488" height="103" alt=""
         style="display:block;width:100%;max-width:488px;height:auto;border:0;">
  </td></tr>`;
}

/** A paragraph in the body voice. One place, so leading never drifts. */
function p(text: string, opts: { top?: number; color?: string; size?: number } = {}): string {
  const { top = 14, color = C.body, size = 15.5 } = opts;
  const tone = color === C.soft ? 'cw-soft' : 'cw-body';
  return `<p class="${tone}" style="margin:${top}px 0 0;font:400 ${size}px/1.62 ${BODY};`
    + `color:${color};">${text}</p>`;
}

/** The greeting, in the display face — the one place the serif goes large. */
function salutation(name: string, at: number): string {
  return `<div class="cw-ink" style="font:700 27px/1.25 ${DISPLAY};color:${C.ink};">
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
    .map((c) => `<span class="cw-ink" style="color:${C.ink};font-weight:700;">${c.count}</span> `
      + `${escapeHtml(c.label.toLowerCase())}`)
    // A solid value rather than opacity: the contrast audit reads colours, not
  // alpha, so an opacity here would hide a real legibility problem from it.
  .join(`<span style="color:${C.soft};"> &nbsp;·&nbsp; </span>`);
  return `<div class="cw-soft" style="font:400 13px/1.5 ${BODY};color:${C.soft};`
    + `padding-top:16px;">${parts}</div>`;
}

/** Small caps heading above a block. Quiet, warm, not a system label. */
function heading(text: string): string {
  return `<div style="font:700 11px/1 ${BODY};color:${C.gold};letter-spacing:1.9px;
                      text-transform:uppercase;padding-bottom:12px;">${escapeHtml(text)}</div>`;
}

/**
 * The busiest communities, as a ranked bar list.
 *
 * Shown only on a city-wide digest, where it does the job the distance rail
 * does for everybody else: turns a number nobody can hold — 159 — into a shape
 * they can read in two seconds, and gives a reader with no saved location the
 * one thing they can still act on, which is recognising their own
 * neighbourhood in the list.
 *
 * The bar is a table cell with a width percentage rather than a graphic: it
 * renders in Outlook, needs no image, and cannot break.
 */
function topAreasBlock(summary: DigestSummary): string {
  if (summary.topAreas.length === 0) return '';
  const max = summary.topAreas[0].count || 1;
  const rows = summary.topAreas.map((area) => {
    const pct = Math.max(6, Math.round((area.count / max) * 100));
    return `
    <tr>
      <td style="padding:0 10px 7px 0;width:41%;">
        <span class="cw-body" style="font:400 12.5px/1.4 ${BODY};color:${C.body};">
          ${escapeHtml(area.name)}
        </span>
      </td>
      <td style="padding:0 8px 7px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr><td style="width:${pct}%;background:${C.bow};height:7px;font-size:0;
                     line-height:0;border-radius:2px;">&nbsp;</td>
              <td style="font-size:0;line-height:0;">&nbsp;</td></tr>
        </table>
      </td>
      <td align="right" style="padding:0 0 7px 0;width:30px;">
        <span class="cw-ink" style="font:700 12px/1.4 ${MONO};color:${C.ink};">${area.count}</span>
      </td>
    </tr>`;
  }).join('');
  return `
  <tr><td style="padding:28px 36px 0;">
    ${heading(areasHeading(summary))}
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
      ${rows}
    </table>
  </td></tr>`;
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
  const title = `
    <a href="${escapeHtml(origin)}/map?incident=${encodeURIComponent(item.incident.id)}"
       style="font:700 15px/1.42 ${DISPLAY};color:${C.ink};text-decoration:none;">
      ${escapeHtml(item.incident.title)}
    </a>
    <div class="cw-soft" style="font:400 12px/1.45 ${BODY};color:${C.soft};padding-top:6px;">
      ${escapeHtml(itemSubtitle(item))}
    </div>`;

  // No distance, no rail.
  //
  // The rail exists to answer one question — how close was this — and it earns
  // its 76px only when it can. Filling it with the weekday instead produced a
  // column reading MON, MON, MON, MON down a city-wide digest: a fixed gutter
  // spent on a value that repeats. Those readers get the full width, and the
  // day moves into the subtitle where it costs nothing.
  if (item.distanceM === null) {
    return `
  <tr><td style="padding-bottom:9px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
           class="cw-card" style="background:${C.card};border:1px solid ${C.line};border-radius:3px;">
      <tr><td style="padding:13px 16px;">${title}</td></tr>
    </table>
  </td></tr>`;
  }

  return `
  <tr><td style="padding-bottom:9px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
           class="cw-card cw-stack" style="background:${C.card};border:1px solid ${C.line};border-radius:3px;">
      <tr>
        <td width="76" class="cw-rail" style="width:76px;background:${C.rail};border-right:1px solid ${C.line};
                   padding:14px 6px;text-align:center;vertical-align:middle;">
          <span class="cw-ink" style="font:700 11.5px/1.2 ${MONO};color:${C.ink};">
            ${escapeHtml(formatDigestDistance(item.distanceM))}
          </span>
        </td>
        <td style="padding:13px 16px;">${title}</td>
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
  <tr><td style="padding:24px 36px 0;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
      <tr><td style="background:${C.button};border-radius:3px;">
        <a href="${escapeHtml(origin)}/map"
           style="display:inline-block;padding:14px 26px;font:700 14px/1 ${BODY};
                  color:${C.buttonInk};text-decoration:none;">
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
  <tr><td style="padding:16px 36px 30px;">
    ${p(`You're getting this because you turned on the weekly digest in your Calgary Watch `
      + `settings. It's built from your saved location and public reports on the map, `
      + `nothing else.`, { top: 4, color: C.soft, size: 12 })}
    ${p(`<strong style="color:${C.body};">${escapeHtml(branding.senderName)}</strong><br>`
      + `${escapeHtml(branding.mailingAddress)}<br>`
      + `<a href="mailto:${escapeHtml(branding.supportEmail)}" `
      + `style="color:${C.bow};text-decoration:none;">${escapeHtml(branding.supportEmail)}</a>`,
      { top: 15, color: C.soft, size: 12 })}
    ${p(`<a href="${escapeHtml(unsubscribeUrl)}" style="color:${C.bow};font-weight:700;`
      + `text-decoration:underline;">Unsubscribe</a>`
      + `<span style="color:${C.soft};">&nbsp;&nbsp;·&nbsp;&nbsp;</span>`
      + `<a href="${escapeHtml(branding.origin)}/privacy" style="color:${C.bow};`
      + `text-decoration:none;">Privacy</a>`, { top: 15, color: C.soft, size: 12 })}
  </td></tr>`;
}

/**
 * The one line asking somebody to tell us where they live.
 *
 * Only rendered for an account with no location at all — never for somebody
 * whose neighbourhood simply had a quiet week, who would read it as being
 * blamed for our empty list. Set apart from the body so it is clearly an aside
 * rather than part of the week's news.
 */
function locationPromptBlock(summary: DigestSummary): string {
  const prompt = locationPrompt(summary);
  if (!prompt) return '';
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
         class="cw-card" style="background:${C.card};border:1px solid ${C.line};
                border-left:3px solid ${C.bow};border-radius:3px;margin-top:16px;">
    <tr><td style="padding:14px 16px;">
      <div class="cw-body" style="font:400 13px/1.55 ${BODY};color:${C.body};">
        ${escapeHtml(prompt)}
      </div>
    </td></tr>
  </table>`;
}

/**
 * How the map is fed, as three illustrated steps.
 *
 * A table rather than stacked blocks so the three read as one row on a desktop
 * client and stack cleanly on a phone. The icons are decorative — every step
 * carries its own words — so their alt text is empty and a reader with images
 * off loses nothing but the drawing.
 */
function processRow(): string {
  const icons = [CID.stepSignal, CID.stepCommunity, CID.stepMegaphone];
  const cells = WELCOME.steps.map((step, i) => `
    <td width="33%" class="cw-step" style="width:33.33%;padding:0 7px;vertical-align:top;text-align:center;">
      <img src="cid:${icons[i]}" width="44" height="44" alt=""
           style="display:block;margin:0 auto 10px;width:44px;height:44px;border:0;">
      <div class="cw-ink" style="font:700 12.5px/1.3 ${BODY};color:${C.ink};">
        ${escapeHtml(step.title)}
      </div>
      <div class="cw-soft" style="font:400 11.5px/1.5 ${BODY};color:${C.soft};padding-top:5px;">
        ${escapeHtml(step.body)}
      </div>
    </td>`).join('');
  return `
  <tr><td style="padding:28px 29px 0;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="cw-stack">
      <tr>${cells}</tr>
    </table>
  </td></tr>`;
}

/**
 * The Bow emblem, under the sign-off, where a seal would sit.
 *
 * Small and centred. It closes the letter rather than decorating it, which is
 * why it appears once and only in the message that is actually a letter.
 */
function emblem(): string {
  return `
  <tr><td style="padding:26px 36px 0;" align="center">
    <img src="cid:${CID.emblem}" width="52" height="52" alt=""
         style="display:block;width:52px;height:52px;border:0;">
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
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(options.title)}</title>
<style>
  /*
   * Dark mode, handled rather than suffered.
   *
   * Declaring "light only" does not stop Gmail: it inverts the page anyway,
   * and because it leaves transparent PNGs alone, the letterhead ended up at
   * 1.06:1 against its own background and disappeared. Two fixes, because no
   * single one covers every client:
   *
   *   1. The artwork is tinted brand gold, which holds contrast on sandstone
   *      AND on a dark ground — so even a client that force-inverts and
   *      ignores everything below still shows a readable letterhead.
   *   2. These rules, for the clients that do honour prefers-color-scheme
   *      (Apple Mail, Outlook.com, Thunderbird), so they get a designed dark
   *      version instead of an automatic approximation.
   *
   * !important is required: everything else in this document is an inline
   * style, and inline styles otherwise win.
   */
  /*
   * Narrow screens.
   *
   * The distance rail is a fixed 76px column. On a 600px client that is a
   * gutter; on a 360px phone it is a fifth of the screen, and it squeezed
   * "Water main break — expect low pressure until Thursday afternoon" into six
   * lines. The three process icons had the same problem in thirds.
   *
   * Both stack below 480px: the rail becomes a slim label above its headline,
   * and the steps become full-width rows. Outlook on Windows ignores media
   * queries entirely, which is fine — it is never 360px wide.
   */
  @media only screen and (max-width: 480px) {
    .cw-stack, .cw-stack > tbody > tr, .cw-stack td {
      display: block !important;
      width: 100% !important;
      /* Without this the cell's own padding is added to a full-width box and
         the text runs out past the card border it is supposed to sit inside. */
      box-sizing: border-box !important;
    }
    .cw-rail {
      border-right: 0 !important;
      border-bottom: 1px solid #2C443B !important;
      text-align: left !important;
      padding: 8px 14px !important;
    }
    .cw-step { padding: 0 0 18px 0 !important; }
    .cw-step img { margin-bottom: 6px !important; }
  }

  /*
   * If a client insists on dark anyway.
   *
   * The page is designed light and asks not to be inverted; Gmail ignores
   * that. Rather than let it invent a palette, these rules name one.
   *
   * They do nothing for the artwork, and cannot: the clients that force dark
   * are the same clients that strip this block, so a CSS plate behind an image
   * was never going to hold. The plate is baked into the PNG instead — see
   * scripts/prepare-email-art.ts. An image's own pixels are the one thing no
   * mail client repaints.
   */
  @media (prefers-color-scheme: dark) {
    .cw-page, .cw-shell { background: #1C1815 !important; }
    .cw-card { background: #262019 !important; border-color: #3D352C !important; }
    .cw-rail { background: #2F2820 !important; border-color: #3D352C !important; }
    .cw-ink, .cw-ink a { color: #F6EFE3 !important; }
    .cw-soft { color: #B3A796 !important; }
    .cw-body { color: #DED4C5 !important; }
    .cw-hair { background: #3D352C !important; }
  }
</style>
</head>
<body class="cw-page" style="margin:0;padding:0;background:${C.page};-webkit-text-size-adjust:100%;">
<!-- Preheader: the grey line an inbox shows beside the subject. Hidden in the
     message itself so it is not repeated at the top of the page. -->
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">
  ${escapeHtml(options.preheader)}
</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
       class="cw-page" style="background:${C.page};">
<tr><td align="center" style="padding:26px 12px 32px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${SHELL_W}"
         class="cw-shell" style="width:100%;max-width:${SHELL_W}px;background:${C.page};">
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
      ${locationPromptBlock(summary)}
      ${categoryLine(summary)}
    </td></tr>
    ${topAreasBlock(summary)}
    ${reportList(summary, origin)}
    ${cta(origin, summary.quiet ? CTA_LABEL_QUIET : CTA_LABEL)}
    ${skylineRule()}
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
      <!-- Why it arrived, in the first line rather than the small print.
           Somebody who does not remember signing up reaches for the spam
           button long before they reach the footer. -->
      <div class="cw-soft" style="font:400 12.5px/1.5 ${BODY};color:${C.soft};padding-top:11px;">
        ${escapeHtml(WELCOME.reason)}
      </div>
      ${note}
    </td></tr>
    ${processRow()}

    <!-- The ask. Boxed so it reads as a question and not as another paragraph
         somebody can skim past — it is the only thing in the message that
         wants something back. -->
    <tr><td style="padding:26px 36px 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
             class="cw-card" style="background:${C.card};border:1px solid ${C.line};
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
    ${emblem()}

    <tr><td style="padding:32px 36px 0;">
      <div style="height:1px;background:${C.edge};font-size:0;line-height:0;">&nbsp;</div>
      ${p(escapeHtml(WELCOME.sampleIntro), { top: 20, color: C.soft, size: 13.5 })}
      ${p(escapeHtml(leadParagraph(summary)), { top: 12 })}
      ${categoryLine(summary)}
    </td></tr>
    ${topAreasBlock(summary)}
    ${reportList(summary, origin)}
    ${cta(origin, summary.quiet ? CTA_LABEL_QUIET : CTA_LABEL)}
    ${skylineRule()}
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
