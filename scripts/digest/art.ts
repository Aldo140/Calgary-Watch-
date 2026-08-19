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
  stepSignal: 'cw-step-signal',
  stepCommunity: 'cw-step-community',
  stepMegaphone: 'cw-step-megaphone',
  emblem: 'cw-emblem',
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
const cache = new Map<string, InlineImage[]>();

/** The two marks every message carries. */
export function letterheadImages(): InlineImage[] {
  if (!cache.has('letterhead')) {
    cache.set('letterhead', [
      load(CID.shield, 'public/images/email/shield.png'),
      load(CID.skyline, 'public/images/email/skyline.png'),
      load(CID.emblem, 'public/images/email/emblem.png'),
    ]);
  }
  return cache.get('letterhead')!;
}

/**
 * The three step icons, carried only by the welcome.
 *
 * Attaching them to every weekly digest would add ~65 KB to a message that
 * never shows them — twelve times a year, to every subscriber, for nothing.
 */
export function welcomeImages(): InlineImage[] {
  if (!cache.has('welcome')) {
    cache.set('welcome', [
      ...letterheadImages(),
      load(CID.stepSignal, 'public/images/email/step-signal.png'),
      load(CID.stepCommunity, 'public/images/email/step-community.png'),
      load(CID.stepMegaphone, 'public/images/email/step-megaphone.png'),
    ]);
  }
  return cache.get('welcome')!;
}
