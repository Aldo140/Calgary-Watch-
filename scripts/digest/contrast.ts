/**
 * Reads the rendered email and checks that every word of it is legible.
 *
 * Not a linter over the palette — a pass over the actual HTML that goes in the
 * envelope. It walks the document, tracks the background in force at each
 * depth, pairs it with the text colour at that node, and measures the WCAG 2.1
 * contrast ratio. A colour that only looks fine in the constant it was defined
 * as, but lands on a surface nobody thought about, is caught here.
 *
 * This exists because the email has now been wrong twice for exactly this
 * reason: warm-black artwork that vanished when a client inverted the page, and
 * a rail figure in deep green on a dark rail that came out at a ratio nobody
 * had checked. Both were found by eye, late. Eyes are the wrong instrument.
 *
 *   npm run digest:contrast     # audits both emails, exits non-zero on a fail
 *
 * Thresholds are WCAG AA: 4.5:1 for body text, 3:1 for text at 18.66px+ bold or
 * 24px+ regular, which the parser derives from each node's own font shorthand
 * rather than assuming.
 */

export interface ContrastFinding {
  /** A short, human location: the tag and the first words of its text. */
  where: string;
  text: string;
  colour: string;
  background: string;
  ratio: number;
  required: number;
  fontPx: number;
  bold: boolean;
  passes: boolean;
}

// ── Colour ──────────────────────────────────────────────────────────────────

function parseHex(value: string): [number, number, number] | null {
  const m = value.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** Relative luminance, per WCAG 2.1. */
export function luminance([r, g, b]: [number, number, number]): number {
  const f = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrastRatio(a: string, b: string): number | null {
  const x = parseHex(a);
  const y = parseHex(b);
  if (!x || !y) return null;
  const la = luminance(x);
  const lb = luminance(y);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** WCAG AA: large text is 18.66px+ bold, or 24px+ at any weight. */
export function requiredRatio(fontPx: number, bold: boolean): number {
  const large = fontPx >= 24 || (bold && fontPx >= 18.66);
  return large ? 3 : 4.5;
}

// ── Parsing ─────────────────────────────────────────────────────────────────

const STYLE = /style="([^"]*)"/i;
const TAG = /<(\/?)([a-z0-9]+)([^>]*)>/gi;

function declaration(style: string, prop: string): string | null {
  const m = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, 'i').exec(style);
  return m ? m[1].trim() : null;
}

/**
 * Pulls size and weight out of a `font:` shorthand or the longhand properties.
 *
 * The templates use the shorthand almost everywhere — `font:700 15px/1.4 …` —
 * so a checker that only understood `font-size` would silently assume a default
 * for nearly every node and get the large-text threshold wrong.
 */
function typography(style: string): { px: number; bold: boolean } {
  const shorthand = declaration(style, 'font');
  let px = 16;
  let bold = false;
  if (shorthand) {
    const weight = /(?:^|\s)([1-9]00|bold)(?:\s|$)/.exec(shorthand);
    bold = Boolean(weight) && (weight![1] === 'bold' || Number(weight![1]) >= 700);
    const size = /(\d+(?:\.\d+)?)px/.exec(shorthand);
    if (size) px = Number(size[1]);
  }
  const longSize = declaration(style, 'font-size');
  if (longSize && /(\d+(?:\.\d+)?)px/.test(longSize)) {
    px = Number(/(\d+(?:\.\d+)?)px/.exec(longSize)![1]);
  }
  const longWeight = declaration(style, 'font-weight');
  if (longWeight) bold = longWeight === 'bold' || Number(longWeight) >= 700;
  return { px, bold };
}

const VOID_TAGS = new Set(['img', 'br', 'meta', 'link', 'hr', 'input']);

/**
 * Walks the document, carrying the background down.
 *
 * HTML backgrounds inherit visually but not as a property: a <span> with a
 * colour and no background sits on whatever its nearest painted ancestor
 * declared. So the stack below records the last background seen at each depth,
 * which is what lets a colour be judged against the surface it will actually
 * appear on rather than against the page default.
 */
export function auditContrast(html: string): ContrastFinding[] {
  const findings: ContrastFinding[] = [];
  const bgStack: string[] = ['#FFFFFF'];
  const styleStack: string[] = [''];

  let index = 0;
  let match: RegExpExecArray | null;
  TAG.lastIndex = 0;

  while ((match = TAG.exec(html)) !== null) {
    const [full, closing, tag, attrs] = match;

    // Text sitting between the previous tag and this one belongs to whatever
    // element is currently open.
    const between = html.slice(index, match.index);
    const text = between.replace(/\s+/g, ' ').trim();
    if (text && !/^&nbsp;$/.test(text)) {
      const style = styleStack[styleStack.length - 1];
      const colour = declaration(style, 'color');
      const background = bgStack[bgStack.length - 1];
      if (colour) {
        const ratio = contrastRatio(colour, background);
        if (ratio !== null) {
          const { px, bold } = typography(style);
          const required = requiredRatio(px, bold);
          findings.push({
            where: tag ? `before </${tag}>` : 'text',
            text: text.slice(0, 52),
            colour, background, ratio: Math.round(ratio * 100) / 100,
            required, fontPx: px, bold, passes: ratio >= required,
          });
        }
      }
    }
    index = match.index + full.length;

    if (closing) {
      if (bgStack.length > 1) bgStack.pop();
      if (styleStack.length > 1) styleStack.pop();
      continue;
    }
    if (VOID_TAGS.has(tag.toLowerCase())) continue;

    const style = STYLE.exec(attrs)?.[1] ?? '';
    const declared = declaration(style, 'background') ?? declaration(style, 'background-color');
    const hex = declared ? /#[0-9a-f]{3,6}/i.exec(declared)?.[0] ?? null : null;
    bgStack.push(hex ?? bgStack[bgStack.length - 1]);
    styleStack.push(style);
  }

  return findings;
}

/** Only the failures, worst first — what a build wants to print. */
export function contrastFailures(html: string): ContrastFinding[] {
  return auditContrast(html).filter((f) => !f.passes).sort((a, b) => a.ratio - b.ratio);
}
