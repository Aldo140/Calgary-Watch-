/**
 * Rebuilds the letterhead PNGs from the site's illustrations.
 *
 *   npx tsx scripts/prepare-email-art.ts
 *
 * The originals are WebP, which Outlook on Windows cannot decode, so email gets
 * PNG. Everything below exists to make one guarantee: a mark's contrast lives
 * inside its own pixels, so no client can repaint it away.
 *
 * Committed output rather than a build step: the weekly job reads these files
 * directly, and a cron that depends on an image pipeline is a cron that fails
 * on a Monday for a reason nobody wants to debug on a Monday.
 *
 * Requires Pillow: pip install --user Pillow
 */

import { execFileSync } from 'node:child_process';

/**
 * The linework: sandstone cream, the same value the body text uses.
 *
 * The email is set on a dark ground, so the engravings are re-tinted to read
 * against it — 13:1 against the page, which is well past the point where fine
 * linework starts to close up. The alpha channel, where all the detail
 * actually lives, is never touched.
 *
 * One tint for everything that is linework, because mixing a white logo with a
 * gold rule and a cream illustration is how a letterhead starts looking
 * assembled rather than drawn.
 */
const INK = '(244, 238, 227)';

/**
 * The plate baked in behind every mark: spruce black, #0E1A17.
 *
 * This must equal C.page in scripts/digest/render.ts exactly. A plate that is
 * merely close to the page is worse than one that is obviously different —
 * two near-blacks do not blend, they seam, and every mark shows its own
 * rectangle. A test asserts the two constants still agree.
 *
 * It was #000000 for exactly one commit, and only because the plate could not
 * be trusted to be anything else: the three process icons arrived as flat RGB
 * with their ground baked in, so the ink had to be derived from darkness by a
 * curve, and the safest page was the one that matched the crudest plate. True
 * black was the surrender, not the design. The icons now arrive cut out, so
 * the plate is a choice again, and the choice is the spruce this email was
 * designed in.
 *
 * Baked into the pixels rather than applied as CSS, because the clients that
 * repaint a page background are the same ones that strip a <style> block, and
 * an image's own pixels are the one thing none of them touch. There is no
 * state in which a mark disappears.
 */
const PLATE = '(14, 26, 23)';

/**
 * Two kinds of mark, and the difference is what the artwork already carries.
 *
 * LINEWORK is a drawing on transparency: the shield, the skyline, the Bow
 * emblem. Alpha describes the engraving, so the ink is re-tinted to INK and
 * set on the plate.
 *
 * MEDALLION is a drawing that brought its own ground — the three process icons
 * are dark engravings on a cream disc, and the disc is part of the drawing.
 * They are placed as they are: no tint, no threshold, nothing derived. On the
 * dark page they read as three pressed seals, and at the 44px the template
 * gives them that is far more legible than cream hairlines would be.
 *
 * The disc used to be fought rather than used. The site's process artwork was
 * flat RGB with a cream square behind it, so the alpha channel said nothing
 * and ink had to be inferred from darkness — autocontrast, then a curve tuned
 * to drop the paper and keep the line. It worked, in the way a tuned threshold
 * works: until the next asset. Cut-out sources retire the whole approach.
 *
 * 4x the logical size. These are engravings — at 2x the hatching on the shield
 * turns to mush, and the difference costs a few KB on a message that is
 * already carrying two images.
 */
type Mark = {
  src: string;
  out: string;
  width: number;
  mode: 'linework' | 'medallion';
  /** Pads to a square canvas so the template's fixed box is honest. */
  square?: boolean;
};

const TARGETS: Mark[] = [
  // Primary brand mark used in the public-site navigation and every email
  // masthead. The shield remains a secondary illustration rather than being
  // asked to stand in for the product logo.
  { src: 'public/images/brand/calgary-watch-plane-mark.webp', out: 'public/images/email/logo.png', width: 176, mode: 'medallion', square: true },
  { src: 'public/images/illustration/calgary-watch-shield.webp', out: 'public/images/email/shield.png', width: 152, mode: 'linework' },
  { src: 'public/images/illustration/calgary-skyline-rule.webp', out: 'public/images/email/skyline.png', width: 960, mode: 'linework' },
  // The welcome email explains how the map is fed; these three carry that.
  // square: true pads to a square canvas. Cropping each icon to its own ink
  // left three different aspect ratios while the template renders them all at
  // 44x44, so every one was being squashed a different amount. Padding makes
  // the declared box honest and lines the three up on a shared baseline.
  { src: 'design-sources/email-cutouts/process-signal.webp', out: 'public/images/email/step-signal.png', width: 176, mode: 'medallion', square: true },
  { src: 'design-sources/email-cutouts/process-community.webp', out: 'public/images/email/step-community.png', width: 176, mode: 'medallion', square: true },
  { src: 'design-sources/email-cutouts/process-megaphone.webp', out: 'public/images/email/step-megaphone.png', width: 176, mode: 'medallion', square: true },
  // Sits under the sign-off, the way a seal would.
  { src: 'public/images/illustration/calgary-bow-emblem.webp', out: 'public/images/email/emblem.png', width: 200, mode: 'linework' },
];

const script = `
import os
from PIL import Image
os.makedirs('public/images/email', exist_ok=True)

PLATE = ${PLATE}

for src, out, width, mode, square in ${JSON.stringify(
  TARGETS.map((t) => [t.src, t.out, t.width, t.mode, t.square ? 1 : 0]),
)}:
    im = Image.open(src).convert('RGBA')

    # Every source in this set carries a real alpha channel, so the bounding
    # box of the ink is simply the bounding box of what is opaque. Nothing is
    # inferred from colour any more.
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

    if mode == 'linework':
        # Tint the drawing, keeping the alpha that describes it.
        art = Image.new('RGBA', im.size, ${INK} + (255,))
        art.putalpha(im.split()[3])
    else:
        # The medallion is already the finished drawing. Touch nothing.
        art = im

    # Set it on an opaque plate, so the contrast lives inside the file. Order
    # matters for linework: plating before tinting flattens the alpha the tint
    # depends on and yields a solid rectangle.
    #
    # Pad before plating so the outermost pixels are guaranteed to be the page
    # colour exactly. Cropping to the ink leaves the drawing touching the
    # boundary — the shield's edge measured 33 off the page value, which is
    # precisely the thin bright seam that made every mark look like a pasted
    # rectangle, and antialiasing accounts for another 2-3 on the others. A
    # margin of pure plate removes the whole class of problem rather than
    # tuning it down. Scaled off the SHORTER side: using the longer one gave
    # the 960px skyline a 48px margin top and bottom, turning a band into a slab.
    margin = max(5, round(min(art.size) * 0.05))
    backing = Image.new('RGBA',
                        (art.size[0] + margin * 2, art.size[1] + margin * 2),
                        ${PLATE} + (255,))
    backing.alpha_composite(art, (margin, margin))
    # Drop the alpha channel outright rather than leaving it fully opaque. A
    # file that still declares transparency invites a client to do something
    # with it, and costs a byte per pixel to say nothing.
    art = backing.convert('RGB')

    # Then to a 64-colour palette, which is not a compromise on this artwork.
    # Every mark is two hues — cream ink on the spruce plate — and what is left
    # is the antialiasing ramp between them, which is one-dimensional and has
    # nowhere near 64 steps in it. The medallions carry a paper texture that
    # truecolour PNG cannot compress and a palette can: they came out at 49 KB
    # each and land at 17, which is the difference between a welcome that costs
    # 325 KB in every inbox and one that costs 115.
    #
    # Dithering is off deliberately. It buys nothing on a ramp this shallow and
    # scatters noise that the next compressor has to carry.
    art = art.convert('P', palette=Image.ADAPTIVE, colors=64, dither=Image.NONE)

    # An adaptive palette is chosen from the image, so nothing in the process
    # promises the plate comes out the exact value it went in as — and a plate
    # one step off the page is the seam, again, arriving by a route nobody was
    # watching. It survives today because the plate is the most common colour
    # in every one of these files, which is a property of this artwork rather
    # than a rule. So the border is measured and the build fails on any
    # deviation at all, rather than shipping a mark that shows its rectangle.
    check = art.convert('RGB')
    w, h = check.size
    border = ([check.getpixel((x, y)) for x in range(w) for y in (0, h - 1)]
              + [check.getpixel((x, y)) for y in range(h) for x in (0, w - 1)])
    off = max(max(abs(c - p) for c, p in zip(pixel, PLATE)) for pixel in border)
    if off:
        raise SystemExit(f'{out}: border sits {off} off the plate — the seam is back')

    art.save(out, 'PNG', optimize=True)
    print(f'  {out}  {art.size[0]}x{art.size[1]}  {os.path.getsize(out)//1024} KB  ({mode})')
`;

console.log('Rebuilding email letterhead…');
console.log(execFileSync('python3', ['-c', script], { encoding: 'utf8' }));
