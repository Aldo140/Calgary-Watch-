/**
 * Validates every image in a rendered email against what is actually attached.
 *
 * Images have been the single most reliable source of defects in this template.
 * A hosted PNG that was never deployed came back as index.html with a 200 and
 * rendered as a broken icon; artwork tinted for a light page vanished when a
 * client inverted it; a `cid:` typo would fail the same way and be invisible in
 * every preview, because the preview substitutes data URIs and the mail client
 * does not.
 *
 * So the checks below are mechanical and run in the test suite:
 *
 *   - every `cid:` in the HTML has an attachment carrying that content id
 *   - every attachment is referenced by the HTML it ships with (dead weight in
 *     an email is bytes charged to every recipient, forever)
 *   - no image is loaded over http(s) — the failure mode we already shipped
 *   - every image declares width and height, so the layout does not collapse
 *     while the parts decode, and reserves the right space when blocked
 *   - every image has an `alt`, because they are decorative here and a reader
 *     with images off must get silence rather than a filename
 *   - the declared dimensions are the asset's real aspect ratio, so nothing is
 *     silently stretched
 */

import type { InlineImage } from './send.js';

export interface ImageProblem {
  kind:
    | 'missing-attachment'
    | 'unused-attachment'
    | 'remote-image'
    | 'no-dimensions'
    | 'no-alt'
    | 'distorted';
  detail: string;
}

const IMG = /<img\s[^>]*>/gi;

function attr(tag: string, name: string): string | null {
  const m = new RegExp(`${name}="([^"]*)"`, 'i').exec(tag);
  return m ? m[1] : null;
}

/** PNG dimensions, straight from the IHDR chunk. No decoder needed. */
export function pngSize(base64: string): { width: number; height: number } | null {
  const head = Buffer.from(base64.slice(0, 64), 'base64');
  if (head.length < 24 || head.toString('ascii', 1, 4) !== 'PNG') return null;
  return { width: head.readUInt32BE(16), height: head.readUInt32BE(20) };
}

export function validateImages(html: string, attached: InlineImage[]): ImageProblem[] {
  const problems: ImageProblem[] = [];
  const tags = html.match(IMG) ?? [];
  const referenced = new Set<string>();

  for (const tag of tags) {
    const src = attr(tag, 'src') ?? '';
    const label = src.slice(0, 46) || tag.slice(0, 46);

    if (/^https?:/i.test(src)) {
      problems.push({
        kind: 'remote-image',
        detail: `${label} — a hosted image is one missed deploy from a broken box`,
      });
      continue;
    }

    const cid = /^cid:(.+)$/.exec(src)?.[1];
    if (!cid) {
      problems.push({ kind: 'missing-attachment', detail: `${label} — src is not a cid: reference` });
      continue;
    }
    referenced.add(cid);

    const image = attached.find((a) => a.cid === cid);
    if (!image) {
      problems.push({ kind: 'missing-attachment', detail: `cid:${cid} is referenced but not attached` });
      continue;
    }

    const width = Number(attr(tag, 'width'));
    const height = Number(attr(tag, 'height'));
    if (!width || !height) {
      problems.push({ kind: 'no-dimensions', detail: `cid:${cid} has no width/height` });
    }
    if (attr(tag, 'alt') === null) {
      problems.push({ kind: 'no-alt', detail: `cid:${cid} has no alt attribute` });
    }

    const real = pngSize(image.base64);
    if (real && width && height) {
      const declared = width / height;
      const actual = real.width / real.height;
      // 4% covers rounding on a half-pixel; anything wider is a squash.
      if (Math.abs(declared - actual) / actual > 0.04) {
        problems.push({
          kind: 'distorted',
          detail: `cid:${cid} declared ${width}x${height} (${declared.toFixed(2)}) `
            + `but the file is ${real.width}x${real.height} (${actual.toFixed(2)})`,
        });
      }
    }
  }

  for (const image of attached) {
    if (!referenced.has(image.cid)) {
      problems.push({
        kind: 'unused-attachment',
        detail: `${image.filename} (cid:${image.cid}) ships but is never shown`,
      });
    }
  }

  return problems;
}
