/**
 * Rebuilds the favicon and app icon set in public/.
 *
 *   node scripts/brand/make-icons.mjs
 *
 * Small sizes (tab, bookmarks) come from public/favicon.svg, the city-spark
 * mark simplified so it stays crisp at 16px. Large sizes (home screen, app
 * launcher, install prompts) use the full illustrated mark. Committed output:
 * icons change rarely, and the deploy shouldn't depend on an image pipeline.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PUBLIC = join(ROOT, 'public');
const MARK = join(PUBLIC, 'images/brand/calgarywatch-city-spark-v2.webp');
const CREAM = '#faf8f3';
const NAVY = '#06162f';

const fromSvg = (size) => sharp(join(PUBLIC, 'favicon.svg'), { density: Math.ceil((size / 64) * 72 * 4) }).resize(size, size).png({ compressionLevel: 9 }).toBuffer();

/** The full mark centred on a solid square, `scale` of the side (iOS and Android fill transparency with black). */
async function onSquare(size, scale, background) {
  const inner = Math.round(size * scale);
  const mark = await sharp(MARK).resize(inner, inner).png().toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background } })
    .composite([{ input: mark, gravity: 'centre' }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/** An .ico holding PNG images: every browser since IE11 reads these. */
function ico(pngs) {
  const header = Buffer.alloc(6 + pngs.length * 16);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  let offset = header.length;
  pngs.forEach(({ size, data }, i) => {
    const at = 6 + i * 16;
    header.writeUInt8(size >= 256 ? 0 : size, at);
    header.writeUInt8(size >= 256 ? 0 : size, at + 1);
    header.writeUInt8(0, at + 2);
    header.writeUInt8(0, at + 3);
    header.writeUInt16LE(1, at + 4);
    header.writeUInt16LE(32, at + 6);
    header.writeUInt32LE(data.length, at + 8);
    header.writeUInt32LE(offset, at + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...pngs.map((p) => p.data)]);
}

const out = (name, data) => writeFile(join(PUBLIC, name), data).then(() => console.log(`[icons] public/${name} (${(data.length / 1024).toFixed(1)} KB)`));

const sizes = [16, 32, 48];
const small = await Promise.all(sizes.map(async (size) => ({ size, data: await fromSvg(size) })));
await out('favicon.ico', ico(small));
await out('favicon-32.png', small[1].data);
// Full mark, transparent: Android/Chrome draw it on their own surface.
await out('icon-192.png', await sharp(MARK).resize(192, 192).png({ compressionLevel: 9 }).toBuffer());
await out('icon-512.png', await sharp(MARK).resize(512, 512).png({ compressionLevel: 9 }).toBuffer());
// Maskable: launchers crop to a circle or squircle, so the mark sits inside the middle 80%.
await out('icon-maskable-512.png', await onSquare(512, 0.72, CREAM));
// iOS home screen: no transparency allowed, rounded by the OS.
await out('apple-touch-icon.png', await onSquare(180, 0.84, CREAM));
// Safari pinned tabs and Windows tiles want a dark tile.
await out('icon-tile-310.png', await onSquare(310, 0.7, NAVY));
await readFile(join(PUBLIC, 'favicon.svg')); // fail loudly if the source went missing
