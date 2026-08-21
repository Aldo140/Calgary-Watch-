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
import {
  CONTRIBUTION_STYLE_COPY,
  type DigestContribution,
} from '../../src/lib/digestPlanner.js';
import type { IncidentCategory } from '../../src/types/index.js';
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
 * Set on spruce black, and the artwork is set on the same spruce black.
 *
 * The marks carry a baked plate, because CSS behind an image cannot survive a
 * client that repaints backgrounds. That solved the vanishing, but introduced
 * the fault this palette answers: the plate was #121413 — dark, and not the
 * value the page was — so every mark showed its own rectangle. Blending two
 * near-blacks is not something you can eyeball into place; they either share a
 * constant or they do not.
 *
 * The first fix was to move the page to the plate: both #000000, and the seam
 * genuinely could not exist. It also cost the email the ground it was designed
 * on, to satisfy an image pipeline. The reason the plate had to be crude was
 * that the process icons arrived with their ground baked in and their ink
 * derived from a luminance curve; cut-out sources removed that constraint, so
 * the direction reverses. The plate moves to the page.
 *
 * PAGE here and PLATE in scripts/prepare-email-art.ts are both #0E1A17,
 * exactly. Not near, not tuned — the same constant, so the seam cannot exist.
 * If one changes, the other must change with it, and a test asserts they still
 * agree.
 *
 * Everything else follows from that: cream marks, sandstone type. Every value
 * is checked against the surface it lands on by `npm run digest:contrast`.
 */
const C = {
  /** Spruce black. Must equal PLATE in scripts/prepare-email-art.ts. */
  page: '#0E1A17',
  /** Cards, lifted just enough to read as a surface. */
  card: '#17251F',
  /** The distance rail, one step further up. */
  rail: '#1E312A',
  line: '#2C443B',
  edge: '#3A5A4E',
  /** Headings and anything that must not be missed. */
  ink: '#F4EEE3',
  /** Running text. Warm, so a dark page does not read as a terminal. */
  body: '#DCD3C4',
  /** Secondary text. */
  soft: '#A6B8AE',
  /** Bow River teal, lifted for the dark ground. */
  bow: '#5CC3AA',
  /** Sandstone gold, lifted for the dark ground. */
  gold: '#E0AC63',
  /** The one solid button. */
  button: '#F4EEE3',
  buttonInk: '#0E1A17',
} as const;

/**
 * The app's category colours, lifted for this ground.
 *
 * `DIGEST_CATEGORY_COLOUR` is tuned against sandstone, where #2F5F52 reads as
 * a considered teal. On the spruce card it is a smudge — 1.6:1 against the
 * surface it sits on. These are the same hues moved up until they separate
 * from the card and from each other, which is the entire job of a category
 * colour in a list somebody scans rather than reads.
 *
 * They are never used behind text. Every one of them appears as a bar, a
 * swatch or a 3px edge, so the contrast audit has nothing to fail and no
 * reader gets a label they cannot make out.
 */
const TONE: Record<IncidentCategory, string> = {
  emergency: '#D2705C',
  crime: '#D2705C',
  traffic: '#E0AC63',
  infrastructure: '#5CC3AA',
  weather: '#A6B8AE',
};

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
          <img src="cid:${CID.shield}" width="38" height="50" alt=""
               style="display:block;width:38px;height:50px;border:0;">
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
 * It went full width to hide a problem: while the plate was true black and the
 * page was not, a 230px version read as a black slab dropped into the gap
 * above the footer, and the only way to make the slab look intentional was to
 * make it the width of the column.
 *
 * The plate is the page now, so the slab is gone and the width is no longer
 * load-bearing. It stays anyway, because the wide version turned out to be the
 * better drawing — the city reads as a horizon rather than a stamp, and the
 * band does the separating a hairline used to do, which is why the hairline is
 * gone and not coming back.
 */
function skylineRule(): string {
  return `
  <tr><td style="padding:26px 36px 0;">
    <img src="cid:${CID.skyline}" width="488" height="111" alt=""
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
 * The week, as one glanceable panel.
 *
 * This replaced a single line of running text — "2 crime · 1 traffic · 1
 * infrastructure" — which was accurate and told a reader nothing they could
 * act on. Three questions get asked of a digest like this before any headline
 * is read: how much, compared to what, and what kind. The panel answers all
 * three in the order they are asked, and the eye gets them in one stop.
 *
 * The count is set large here without contradicting the lead paragraph, which
 * still states it in a sentence. Those do different work: the sentence is
 * somebody telling you something, the numeral is the thing you remember after
 * closing the message. A digest that only had the numeral would read as a
 * dashboard, and one that only had the sentence gives the week no shape.
 *
 * An earlier version of the breakdown was three auto-sized tiles, which came
 * out narrow for "Crime" and wide for "Infrastructure" and read as a mistake.
 * The bar avoids that by construction: the widths are the data, so there is no
 * arrangement of labels that can make it look broken.
 *
 * Nothing here is an image. It is table cells with background colours, which
 * is the one piece of layout every client renders — so the panel survives
 * images being blocked, which is the state most of these are first read in.
 */
function weekBand(summary: DigestSummary): string {
  if (summary.quiet || summary.total === 0) return '';

  const noun = summary.total === 1 ? 'report' : 'reports';
  const where = summary.scope === 'city' ? 'across Calgary' : summary.ringLabel;

  // ── The delta, as a chip ──────────────────────────────────────────────────
  // Only when there is a like-for-like baseline. A digest that just widened its
  // own scope is comparing a city against a neighbourhood, and a chip reading
  // "+140" would be a lie told confidently.
  const chip = (() => {
    if (summary.widenedToCity) return '';
    if (summary.previousTotal === 0 && summary.total === 0) return '';
    const n = Math.abs(summary.delta);
    const text = summary.delta === 0
      ? 'Same as last week'
      : `${summary.delta > 0 ? '+' : '&minus;'}${n} vs last week`;
    // Fewer reports is the good direction, so it gets the teal the product
    // already uses for anything positive; more gets gold rather than red,
    // because a busier week is information and not an alarm.
    const colour = summary.delta === 0 ? C.soft : summary.delta > 0 ? C.gold : C.bow;
    return `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr><td style="background:${C.rail};border:1px solid ${C.line};border-radius:11px;
                   padding:5px 11px;white-space:nowrap;">
          <span style="font:700 11px/1 ${MONO};color:${colour};">${text}</span>
        </td></tr>
      </table>`;
  })();

  // ── The mix, as one bar ───────────────────────────────────────────────────
  // Percentages are rounded, and rounding does not sum to 100. The remainder
  // goes to the largest slice, where a percentage point is invisible, rather
  // than to the last one, where it can double a small segment's width.
  const mix = (() => {
    if (summary.byCategory.length === 0) return '';
    const parts = summary.byCategory.map((c) => ({
      ...c,
      // A single report out of 160 rounds to 0% and disappears from a bar it
      // belongs in. Four percent is the narrowest slice that still reads as a
      // slice at 490px, and the width it borrows comes off the largest.
      pct: Math.max(4, Math.round((c.count / summary.total) * 100)),
    }));
    const largest = parts.reduce((a, b) => (a.pct >= b.pct ? a : b));
    largest.pct += 100 - parts.reduce((n, c) => n + c.pct, 0);

    const segments = parts.map((c, i) => `
      <td style="width:${c.pct}%;background:${TONE[c.category]};height:9px;font-size:0;
                 line-height:0;${i < parts.length - 1 ? `border-right:2px solid ${C.card};` : ''}">&nbsp;</td>`).join('');

    // cw-stack turns the legend into one row per category below 480px, where
    // five categories across cannot fit and would otherwise crush the labels.
    const legend = parts.map((c) => `
      <td style="padding:0 16px 0 0;vertical-align:middle;white-space:nowrap;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td width="9" style="width:9px;vertical-align:middle;">
              <div style="width:9px;height:9px;background:${TONE[c.category]};
                          border-radius:2px;font-size:0;line-height:0;">&nbsp;</div>
            </td>
            <td style="padding-left:7px;">
              <span class="cw-soft" style="font:400 12px/1.4 ${BODY};color:${C.soft};">
                ${escapeHtml(c.label)}
              </span>
              <span class="cw-ink" style="font:700 12px/1.4 ${MONO};color:${C.ink};">
                &nbsp;${c.count}
              </span>
            </td>
          </tr>
        </table>
      </td>`).join('');

    return `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
             style="border-radius:2px;overflow:hidden;">
        <tr>${segments}</tr>
      </table>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" class="cw-legend"
             style="padding-top:11px;">
        <tr>${legend}</tr>
      </table>`;
  })();

  return `
  <tr><td style="padding:22px 36px 0;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
           class="cw-card" style="background:${C.card};border:1px solid ${C.line};border-radius:3px;">
      <tr><td style="padding:15px 18px 16px;">

        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr>
            <td style="vertical-align:middle;">
              <div style="font:700 10.5px/1 ${BODY};color:${C.gold};letter-spacing:1.9px;
                          text-transform:uppercase;">This week</div>
            </td>
            <td align="right" style="vertical-align:middle;">
              <div class="cw-soft" style="font:400 10.5px/1 ${MONO};color:${C.soft};
                          letter-spacing:1px;text-transform:uppercase;">
                ${escapeHtml(summary.areaName)}
              </div>
            </td>
          </tr>
        </table>

        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
               class="cw-count" style="padding-top:9px;">
          <tr>
            <td style="vertical-align:bottom;">
              <span class="cw-ink" style="font:700 38px/1 ${DISPLAY};color:${C.ink};">
                ${summary.total}
              </span>
              <span class="cw-body" style="font:400 13.5px/1.4 ${BODY};color:${C.body};">
                &nbsp;${noun} ${escapeHtml(where)}
              </span>
            </td>
            <td align="right" style="vertical-align:bottom;">${chip}</td>
          </tr>
        </table>

        <div style="height:14px;font-size:0;line-height:0;">&nbsp;</div>
        ${mix}

      </td></tr>
    </table>
  </td></tr>`;
}

/** Small caps heading above a block. Quiet, warm, not a system label. */
function heading(text: string): string {
  return `<div style="font:700 11px/1 ${BODY};color:${C.gold};letter-spacing:1.9px;
                      text-transform:uppercase;padding-bottom:12px;">${escapeHtml(text)}</div>`;
}

/** Optional editor-written note. It is deliberately the first content block. */
function contributionBlock(contribution: DigestContribution | undefined): string {
  if (!contribution?.body.trim()) return '';
  const copy = CONTRIBUTION_STYLE_COPY[contribution.style];
  const title = contribution.headline.trim() || copy.label;
  const paragraphs = contribution.body
    .split(/\n\s*\n/)
    .map((text, index) => p(escapeHtml(text.trim()).replace(/\n/g, '<br>'), {
      top: index === 0 ? 10 : 12,
      size: 14.5,
    }))
    .join('');

  return `
  <tr><td style="padding:22px 36px 0;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
           class="cw-card" style="background:${C.card};border:1px solid ${C.line};border-radius:6px;">
      <tr><td style="padding:19px 20px 20px;">
        ${heading(copy.emailLabel)}
        <div class="cw-ink" style="font:700 21px/1.3 ${DISPLAY};color:${C.ink};">
          ${escapeHtml(title)}
        </div>
        ${paragraphs}
      </td></tr>
    </table>
  </td></tr>`;
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
  // The category, as a 3px edge down the left of the card.
  //
  // A list of twelve reports is read by sorting before it is read by reading,
  // and the sort people actually run is "is this my problem" — a break-in and
  // a lane closure are not the same kind of news. The edge answers that in
  // peripheral vision, ahead of the headline, and costs no bytes and no image.
  //
  // It is a table cell and not `border-left`, for two reasons. The rules that
  // restate the card for a client that repaints backgrounds carry
  // `border-color: !important`, which silently ate the first version of this —
  // it was in the HTML, correct, and painted the wrong colour in every preview.
  // And Outlook on Windows is unreliable about borders on tables while being
  // completely reliable about a cell with a background. A cell cannot lose.
  const edge = `
        <td width="3" class="cw-edge" style="width:3px;background:${TONE[item.incident.category]};
                   font-size:0;line-height:0;">&nbsp;</td>`;

  if (item.distanceM === null) {
    return `
  <tr><td style="padding-bottom:9px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
           class="cw-card" style="background:${C.card};border:1px solid ${C.line};border-radius:3px;">
      <tr>${edge}
        <td style="padding:13px 16px;">${title}</td>
      </tr>
    </table>
  </td></tr>`;
  }

  return `
  <tr><td style="padding-bottom:9px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
           class="cw-card cw-stack" style="background:${C.card};border:1px solid ${C.line};border-radius:3px;">
      <tr>${edge}
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

/**
 * Table-and-padding button: the shape Outlook renders correctly.
 *
 * One filled button, and one plain link under it. The button is what the week
 * was about; the link is the other half of the product, and it is the reason
 * there is anything to send next Monday. A map fed only by official feeds is a
 * feed reader — the reports from neighbours are what makes it worth opening,
 * and this is the only moment in the week when somebody is already thinking
 * about what happened on their block.
 *
 * It is deliberately not a second button. Two buttons of equal weight is how a
 * reader ends up choosing neither.
 */
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
    <div class="cw-soft" style="font:400 12.5px/1.5 ${BODY};color:${C.soft};padding-top:13px;">
      Something happen on your block?
      <a href="${escapeHtml(origin)}/map" style="color:${C.bow};text-decoration:none;
         font-weight:700;">Add a report&nbsp;→</a>
    </div>
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
function footer(unsubscribeUrl: string, branding: DigestBranding, adminPreview = false): string {
  if (adminPreview) {
    return `
    <tr><td style="padding:16px 36px 30px;">
      ${p(`Internal preview for Calgary Watch administrators. This test was generated from the email planner and was not sent to subscribers.`, { top: 4, color: C.soft, size: 12 })}
      ${p(`<a href="${escapeHtml(branding.origin)}/admin" style="color:${C.bow};font-weight:700;text-decoration:underline;">Open the email planner</a>`, { top: 13, color: C.soft, size: 12 })}
    </td></tr>`;
  }
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
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
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
    .cw-edge { height: 3px !important; padding: 0 !important; }
    /* The legend flows instead of stacking: five categories down the page is a
       list, and the point of a legend is that it reads as one object. The
       child combinator matters: cw-stack uses a plain descendant td, which
       reaches into the swatch tables and puts every dot on its own line. */
    .cw-legend > tbody > tr > td {
      display: inline-block !important;
      padding: 0 15px 7px 0 !important;
    }
    /* The chip drops under the count rather than crushing the ring label into
       three lines next to it. */
    .cw-count > tbody > tr > td {
      display: block !important;
      width: 100% !important;
      text-align: left !important;
    }
    .cw-count > tbody > tr > td + td { padding-top: 13px !important; }
    .cw-step { padding: 0 0 18px 0 !important; }
    .cw-step img { margin-bottom: 6px !important; }
  }

  /*
   * The page is already dark, so there is no dark variant to switch to.
   * These rules exist for the opposite case: a client that decides to render a
   * dark email on a light ground would otherwise put cream type on white. They
   * restate the surfaces so the message survives that too — and they restate
   * them in the same values the marks are plated with, so a repainted page
   * still meets the artwork at its own edge.
   */
  @media (prefers-color-scheme: light) {
    .cw-page, .cw-shell { background: #0E1A17 !important; }
    .cw-card { background: #17251F !important; border-color: #2C443B !important; }
    .cw-rail { background: #1E312A !important; border-color: #2C443B !important; }
    .cw-ink, .cw-ink a { color: #F4EEE3 !important; }
    .cw-soft { color: #A6B8AE !important; }
    .cw-body { color: #DCD3C4 !important; }
    .cw-hair { background: #2C443B !important; }
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
  contribution?: DigestContribution;
  adminPreview?: boolean;
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
    ${contributionBlock(options.contribution)}
    <tr><td style="padding:26px 36px 0;">
      ${salutation(name, summary.until)}
      ${p(escapeHtml(leadParagraph(summary)), { top: 13 })}
      ${locationPromptBlock(summary)}
    </td></tr>
    ${weekBand(summary)}
    ${topAreasBlock(summary)}
    ${reportList(summary, origin)}
    ${cta(origin, summary.quiet ? CTA_LABEL_QUIET : CTA_LABEL)}
    ${skylineRule()}
    ${footer(unsubscribeUrl, branding, options.adminPreview)}`,
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
    </td></tr>
    ${weekBand(summary)}
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
  contribution?: DigestContribution;
  adminPreview?: boolean;
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
  ];

  if (options.contribution?.body.trim()) {
    const contribution = options.contribution;
    lines.push(
      CONTRIBUTION_STYLE_COPY[contribution.style].emailLabel.toUpperCase(),
      contribution.headline.trim() || CONTRIBUTION_STYLE_COPY[contribution.style].label,
      '',
      wrap(contribution.body.trim()),
      '',
      '--------------------------------------------------------------',
      '',
    );
  }

  lines.push(`Morning, ${name}.`, '');

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

  if (options.adminPreview) {
    lines.push(
      '',
      `See it on the map: ${branding.origin}/map`,
      '',
      '--------------------------------------------------------------',
      'Internal preview for Calgary Watch administrators.',
      'This test was not sent to subscribers.',
      `Open the email planner: ${branding.origin}/admin`,
    );
    return lines.join('\n');
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
