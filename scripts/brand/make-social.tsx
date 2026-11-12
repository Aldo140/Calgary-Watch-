/**
 * Draws the CalgaryWatch site picture: the image Google, iMessage, Slack, LinkedIn and
 * Facebook show for the homepage and for every page without a card of its own.
 *
 *   npm run brand:social
 *
 * Three crops of one design, because Google picks the ratio that fits the slot
 * (16:9 for results and Discover, 4:3 and 1:1 for the knowledge panel and phone
 * thumbnails): public/images/hero/calgarywatch-site-{wide,4x3,square}.jpg.
 * The badge and wordmark are drawn on, so the picture says whose it is even when
 * it is shown at thumbnail size. Committed output, like the icons.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import satori from 'satori';
import sharp from 'sharp';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const NAVY = '#06162f';
const CREAM = '#faf8f3';
const CYAN = '#2ec4f1';
const YELLOW = '#ffdf4f';

const SECTIONS = ['Events', 'Markets', 'Local', 'Live map', 'Safety'];

type Fonts = Parameters<typeof satori>[1]['fonts'];
async function loadFonts(): Promise<Fonts> {
  const f = (file: string) => readFile(join(ROOT, 'brand', 'fonts', file));
  return [
    { name: 'Bricolage', data: await f('bricolage-800.ttf'), weight: 800, style: 'normal' },
    { name: 'Inter', data: await f('inter-600.ttf'), weight: 600, style: 'normal' },
    { name: 'Inter', data: await f('inter-800.ttf'), weight: 800, style: 'normal' },
    { name: 'Mono', data: await f('plexmono-500.ttf'), weight: 500, style: 'normal' },
  ];
}

const dataUri = (buf: Buffer, type: string) => `data:image/${type};base64,${buf.toString('base64')}`;

interface Layout { name: string; width: number; height: number; badge: number; word: number; line: number; stacked: boolean }
const LAYOUTS: Layout[] = [
  { name: 'wide', width: 1200, height: 630, badge: 128, word: 84, line: 34, stacked: false },
  { name: '4x3', width: 1200, height: 900, badge: 190, word: 112, line: 44, stacked: true },
  { name: 'square', width: 1200, height: 1200, badge: 230, word: 120, line: 48, stacked: true },
];

function Card({ l, art, badge }: { l: Layout; art: string; badge: string }) {
  const pad = l.stacked ? 80 : 64;
  return (
    <div style={{ width: l.width, height: l.height, display: 'flex', position: 'relative', background: NAVY, fontFamily: 'Inter' }}>
      <img src={art} width={l.width} height={l.height} style={{ position: 'absolute', left: 0, top: 0, width: l.width, height: l.height, objectFit: 'cover' }} />
      {/* Navy wash so the type reads over the illustration; the city stays visible on the right or top. */}
      <div style={{ position: 'absolute', left: 0, top: 0, width: l.width, height: l.height, display: 'flex',
        background: l.stacked
          ? `linear-gradient(180deg, rgba(6,22,47,0.05) 0%, rgba(6,22,47,0.35) 32%, rgba(6,22,47,0.92) 58%, ${NAVY} 100%)`
          : `linear-gradient(90deg, ${NAVY} 0%, rgba(6,22,47,0.96) 44%, rgba(6,22,47,0.6) 66%, rgba(6,22,47,0.0) 92%)` }} />
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: l.stacked ? 'flex-end' : 'center', width: l.stacked ? l.width : 820, height: l.height, padding: pad }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: l.stacked ? 34 : 26 }}>
          <img src={badge} width={l.badge} height={l.badge} style={{ borderRadius: l.badge / 2, boxShadow: '0 18px 50px rgba(0,0,0,0.45)' }} />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', fontFamily: 'Bricolage', fontWeight: 800, fontSize: l.word, lineHeight: 0.95, letterSpacing: -3, color: CREAM }}>
              CalgaryWatch
              <div style={{ display: 'flex', width: l.word * 0.17, height: l.word * 0.17, borderRadius: l.word, background: CYAN, marginLeft: 6, marginBottom: l.word * 0.12 }} />
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', marginTop: l.stacked ? 38 : 30, fontFamily: 'Bricolage', fontWeight: 800, fontSize: l.line * 1.25, lineHeight: 1.05, letterSpacing: -1, color: YELLOW }}>
          What’s happening in Calgary?
        </div>
        <div style={{ display: 'flex', marginTop: 16, fontFamily: 'Inter', fontWeight: 600, fontSize: l.line * 0.72, lineHeight: 1.3, color: '#d4dceb' }}>
          Events, markets and local places, with live city updates.
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: l.stacked ? 40 : 32 }}>
          {SECTIONS.map((s, i) => (
            <div key={s} style={{ display: 'flex', fontFamily: 'Inter', fontWeight: 800, fontSize: l.line * 0.6, padding: '10px 20px', borderRadius: 999,
              background: i === 0 ? CYAN : 'rgba(250,248,243,0.1)', color: i === 0 ? NAVY : CREAM, border: i === 0 ? `2px solid ${CYAN}` : '2px solid rgba(250,248,243,0.35)' }}>{s}</div>
          ))}
        </div>
        <div style={{ display: 'flex', marginTop: l.stacked ? 44 : 34, fontFamily: 'Mono', fontWeight: 500, fontSize: l.line * 0.58, letterSpacing: 1.5, color: '#9fb0c9' }}>calgarywatch.ca</div>
      </div>
    </div>
  );
}

async function run() {
  const fonts = await loadFonts();
  const badge = dataUri(await sharp(join(ROOT, 'brand/mark/calgarywatch-badge.svg'), { density: 900 }).resize(460, 460).png().toBuffer(), 'png');
  for (const l of LAYOUTS) {
    // Stacked crops keep the skyline (upper part of the art); the wide one keeps the tower and river on the right.
    const art = dataUri(await sharp(join(ROOT, 'public/images/hero/calgarywatch-social-v1.webp'))
      .resize(l.width, l.height, { fit: 'cover', position: l.stacked ? 'top' : 'right' })
      .jpeg({ quality: 90 }).toBuffer(), 'jpeg');
    const svg = await satori(<Card l={l} art={art} badge={badge} />, { width: l.width, height: l.height, fonts });
    const jpg = await sharp(Buffer.from(svg)).resize(l.width, l.height).jpeg({ quality: 86, mozjpeg: true, chromaSubsampling: '4:4:4' }).toBuffer();
    const out = join(ROOT, `public/images/hero/calgarywatch-site-${l.name}.jpg`);
    await writeFile(out, jpg);
    console.log(`[social] ${out.replace(ROOT + '/', '')} (${(jpg.length / 1024).toFixed(0)} KB)`);
  }
}

run();
