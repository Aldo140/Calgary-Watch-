/**
 * Rebuilds the favicon and app icon set in public/ from the CalgaryWatch badge.
 *
 *   npm run brand:icons
 *
 * Two sources in brand/mark/:
 * - calgarywatch-badge-small.svg: wave C, sun and spark on navy. Tabs, bookmarks and
 *   Google's search-result icon, which is drawn at about 16-28px inside a circle.
 * - calgarywatch-badge.svg: the full badge (dusk over the Rockies, the Calgary Tower,
 *   downtown). Home screens, install prompts, the Organization logo Google shows
 *   beside the knowledge panel, and anything 48px or larger that people look at.
 *
 * Both are round, so Google's circular crop and Android's maskable crop never cut
 * them. Committed output: icons change rarely, and the deploy shouldn't depend on an
 * image pipeline.
 */

import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PUBLIC = join(ROOT, 'public');
const SMALL = join(ROOT, 'brand/mark/calgarywatch-badge-small.svg');
const FULL = join(ROOT, 'brand/mark/calgarywatch-badge.svg');
/** The badge's own outer colour, so a square tile around the round badge has no visible edge. */
const NAVY = '#06162f';

const render = (svg, size) => sharp(svg, { density: Math.ceil((size / 96) * 72 * 4) }).resize(size, size).png({ compressionLevel: 9 }).toBuffer();

/** The badge centred on a solid navy square, `scale` of the side (iOS and Android fill transparency with black). */
async function onSquare(size, scale) {
  const badge = await render(FULL, Math.round(size * scale));
  return sharp({ create: { width: size, height: size, channels: 4, background: NAVY } })
    .composite([{ input: badge, gravity: 'centre' }])
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

const out = async (name, data) => {
  await mkdir(dirname(join(PUBLIC, name)), { recursive: true });
  await writeFile(join(PUBLIC, name), data);
  console.log(`[icons] public/${name} (${(data.length / 1024).toFixed(1)} KB)`);
};

// Tab and search-result sizes: the simple badge.
const small = await Promise.all([16, 32, 48].map(async (size) => ({ size, data: await render(SMALL, size) })));
await out('favicon.ico', ico(small));
await out('favicon-32.png', small[1].data);
// Google asks for a square favicon that is a multiple of 48px; 96 and 192 cover its high-density slots.
await out('favicon-96.png', await render(SMALL, 96));
await out('favicon-192.png', await render(SMALL, 192));
await copyFile(SMALL, join(PUBLIC, 'favicon.svg'));
console.log('[icons] public/favicon.svg');
await copyFile(FULL, join(PUBLIC, 'icon.svg'));
console.log('[icons] public/icon.svg');

// App sizes: the full badge. Round with a transparent outside, so Chrome and Android draw it on their own surface.
await out('icon-192.png', await render(FULL, 192));
await out('icon-512.png', await render(FULL, 512));
// Maskable: launchers crop to a circle or squircle; the badge's own edge is navy, so the tile reads as one disc.
await out('icon-maskable-512.png', await onSquare(512, 0.86));
// iOS home screen: no transparency allowed, corners rounded by the OS.
await out('apple-touch-icon.png', await onSquare(180, 1));
// Windows tiles.
await out('icon-tile-310.png', await onSquare(310, 0.8));
// Organization logo for structured data: Google wants at least 112px, on a background it can show on white.
await out('images/brand/calgarywatch-logo-512.png', await render(FULL, 512));
