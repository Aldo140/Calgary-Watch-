/**
 * Rebuilds the letterhead PNGs from the site's illustrations.
 *
 *   npx tsx scripts/prepare-email-art.ts
 *
 * The originals are WebP, which Outlook on Windows cannot decode, so email gets
 * PNG. They are also near-black on transparency, so the ink is re-tinted while
 * the alpha channel — where all the engraved linework actually lives — is left
 * untouched. See INK below for why the colour is what it is.
 *
 * Committed output rather than a build step: the weekly job reads these files
 * directly, and a cron that depends on an image pipeline is a cron that fails
 * on a Monday for a reason nobody wants to debug on a Monday.
 *
 * Requires Pillow: pip install --user Pillow
 */

import { execFileSync } from 'node:child_process';

/**
 * Brand gold, chosen for contrast on BOTH grounds.
 *
 * The art was originally re-tinted to the email's warm black, which looked
 * right until a reader opened it in Gmail's dark mode: the client inverts the
 * sandstone background to near-black but leaves transparent PNGs alone, so the
 * ink dropped to 1.06:1 against its own background and the letterhead vanished.
 *
 * Gold sits at 3.4:1 on sandstone and 4.1:1 on a dark ground, so it survives
 * either treatment — and it is already the masthead rule's colour, so the
 * letterhead now reads as one piece rather than two.
 */
const INK = '(168, 118, 58)';

/** 4x the logical size — the engravings carry fine linework. */
const TARGETS = [
  { src: 'public/images/illustration/calgary-watch-shield.webp', out: 'public/images/email/shield.png', width: 152 },
  { src: 'public/images/illustration/calgary-skyline-rule.webp', out: 'public/images/email/skyline.png', width: 960 },
];

const script = `
import os
from PIL import Image
os.makedirs('public/images/email', exist_ok=True)
for src, out, width in ${JSON.stringify(TARGETS.map((t) => [t.src, t.out, t.width]))}:
    im = Image.open(src).convert('RGBA')
    im = im.crop(im.split()[3].getbbox())          # trim transparent padding
    im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    solid = Image.new('RGBA', im.size, ${INK} + (255,))
    solid.putalpha(im.split()[3])                  # keep the linework, retint it
    solid.save(out, 'PNG', optimize=True)
    print(f'  {out}  {solid.size[0]}x{solid.size[1]}  {os.path.getsize(out)//1024} KB')
`;

console.log('Rebuilding email letterhead…');
console.log(execFileSync('python3', ['-c', script], { encoding: 'utf8' }));
