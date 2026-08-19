/**
 * The letterhead.
 *
 * Two engravings from the site — the shield and the skyline rule — read from
 * disk once per run and attached to every message as inline parts. They are not
 * linked from calgarywatch.ca on purpose: a hosted image is one missed deploy
 * or one renamed path away from a broken rectangle in every message already
 * sent, and mail cannot be re-issued. An inline part is immune to that.
 *
 * Both are re-tinted to the email's warm ink and sized at 2x for retina by
 * scripts/prepare-email-art.ts; the HTML sets the logical half.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { InlineImage } from './send.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export const CID = {
  shield: 'cw-shield',
  skyline: 'cw-skyline',
} as const;

function load(cid: string, relativePath: string): InlineImage {
  return {
    cid,
    filename: relativePath.split('/').pop() ?? 'image.png',
    contentType: 'image/png',
    base64: readFileSync(join(ROOT, relativePath)).toString('base64'),
  };
}

/**
 * Read once, reused for every recipient in the run.
 *
 * Re-reading and re-encoding per message would turn a 90 KB constant into work
 * proportional to the size of the list, for a byte-identical result.
 */
let cached: InlineImage[] | null = null;

export function letterheadImages(): InlineImage[] {
  if (!cached) {
    cached = [
      load(CID.shield, 'public/images/email/shield.png'),
      load(CID.skyline, 'public/images/email/skyline.png'),
    ];
  }
  return cached;
}
