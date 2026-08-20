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
/**
 * Warm near-black, for the sandstone ground the email is set on.
 *
 * The email is set dark, so the engravings are re-tinted to the same sandstone
 * the body text uses — 13:1 against the page, which is well past the point
 * where fine linework starts to close up. The alpha channel, where all the
 * detail actually lives, is never touched.
 *
 * One tint for everything: mixing a white logo with a gold rule and a cream
 * illustration is how a letterhead starts looking assembled rather than drawn.
 */
const INK = '(36, 30, 26)';

/**
 * The plate baked in behind every mark: the email's own page colour.
 *
 * Same value as C.page in render.ts. On the page as designed it is invisible;
 * on a client that forces dark it becomes a cream card the art stays legible
 * on. If one changes, change the other.
 */
const PLATE = '(244, 238, 227)';

/**
 * 4x the logical size. These are engravings — at 2x the hatching on the shield
 * turns to mush, and the difference costs a few KB on a message that is already
 * carrying two images.
 */
const TARGETS: Array<{ src: string; out: string; width: number; square?: boolean; plate?: boolean }> = [
  { src: 'public/images/illustration/calgary-watch-shield.webp', out: 'public/images/email/shield.png', width: 152, plate: true },
  { src: 'public/images/illustration/calgary-skyline-rule.webp', out: 'public/images/email/skyline.png', width: 960, plate: true },
  // The welcome email explains how the map is fed; these three carry that.
  // square: true pads to a square canvas. Cropping each icon to its own ink
  // left three different aspect ratios — 1.08, 0.88, 1.22 — while the template
  // renders them all at 44x44, so every one was being squashed a different
  // amount. Padding makes the declared box honest and lines the three up on a
  // shared baseline, which cropping never would.
  { src: 'public/images/illustration/process-signal.webp', out: 'public/images/email/step-signal.png', width: 176, square: true, plate: true },
  { src: 'public/images/illustration/process-community.webp', out: 'public/images/email/step-community.png', width: 176, square: true, plate: true },
  { src: 'public/images/illustration/process-megaphone.webp', out: 'public/images/email/step-megaphone.png', width: 176, square: true, plate: true },
  // Sits under the sign-off, the way a seal would.
  { src: 'public/images/illustration/calgary-bow-emblem.webp', out: 'public/images/email/emblem.png', width: 200, plate: true },
];

const script = `
import os
from PIL import Image, ImageOps
os.makedirs('public/images/email', exist_ok=True)

def alpha_for(im):
    """Where is there ink?

    Two kinds of source in this set. The shield, skyline and emblem are drawn on
    transparency, so the alpha channel already answers the question. The three
    process icons are flat RGB — dark linework printed on a cream disc — and
    their alpha is a solid rectangle that says nothing.

    For those, ink is derived from darkness: invert the greyscale, so the cream
    paper falls to zero and drops out while the linework stays opaque. That
    knocks the disc off and leaves the drawing, which is the only part that can
    be re-tinted onto a dark ground without bringing a pale slab with it.
    """
    a = im.split()[3]
    lo, hi = a.getextrema()
    if lo < 250:
        return a
    grey = ImageOps.grayscale(im.convert('RGB'))
    # These scans sit around 240 rather than 255, so a plain invert leaves the
    # paper as a faint grey slab — visible on a dark page as a square edge
    # around each icon. Autocontrast normalises the range, then the curve below
    # drops everything under a third to nothing and lifts the rest, so the disc
    # disappears and the linework keeps its weight instead of going spindly.
    inverted = ImageOps.invert(ImageOps.autocontrast(grey, cutoff=1))
    return inverted.point(lambda v: 0 if v < 86 else min(255, int((v - 86) * 1.75)))

for src, out, width, square, plate in ${JSON.stringify(TARGETS.map((t) => [t.src, t.out, t.width, t.square ? 1 : 0, t.plate ? 1 : 0]))}:
    im = Image.open(src).convert('RGBA')
    im.putalpha(alpha_for(im))

    box = im.split()[3].getbbox()
    if box:
        im = im.crop(box)

    if square:
        # Centre in a square canvas so the template's 44x44 is the truth rather
        # than a squash, and the three icons share a baseline.
        side = max(im.size)
        canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
        canvas.alpha_composite(im, ((side - im.width) // 2, (side - im.height) // 2))
        im = canvas

    im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)

    # Tint the linework, keeping the alpha that describes it.
    art = Image.new('RGBA', im.size, ${INK} + (255,))
    art.putalpha(im.split()[3])

    if plate:
        # ...then set it on an opaque plate, so the contrast lives inside the
        # file. Order matters: plating before tinting flattens the alpha the
        # tint depends on and yields a solid rectangle.
        backing = Image.new('RGBA', im.size, ${PLATE} + (255,))
        backing.alpha_composite(art)
        # Drop the alpha channel outright rather than leaving it fully opaque.
        # A file that still declares transparency invites a client to do
        # something with it, and costs a byte per pixel to say nothing.
        art = backing.convert('RGB')

    art.save(out, 'PNG', optimize=True)
    print(f'  {out}  {art.size[0]}x{art.size[1]}  {os.path.getsize(out)//1024} KB'
          f'{"  (plated)" if plate else ""}')
`;

console.log('Rebuilding email letterhead…');
console.log(execFileSync('python3', ['-c', script], { encoding: 'utf8' }));
