/**
 * Draws the link-preview card (og:image) for every listing, hub and Best of
 * Calgary list into dist/og/, after the prerender:
 *
 *   npx tsx scripts/seo/shareCards.tsx [--only /events/some-slug] [--out dir]
 *
 * What goes on each card comes from src/lib/shareImage.ts, which the prerender
 * also reads for the og:image tags, so a tag never points at a missing file.
 * satori turns the layout into an SVG (text as outlines, so no system fonts),
 * sharp turns it into a JPEG. Listing photos are fetched once per build; one
 * that can't be fetched just gets the photo-free design, never a broken card.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import satori from 'satori';
import sharp from 'sharp';
import { discoveryRepository } from '../../src/data/discovery';
import { SHARE_CARD, allShareCards, cardPath, type CardTheme, type ShareCard } from '../../src/lib/shareImage';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const arg = (name: string) => { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : undefined; };
const OUT = resolve(ROOT, arg('--out') ?? 'dist');
const ONLY = arg('--only');
const { width: W, height: H } = SHARE_CARD;
const PHOTO = { width: 432, height: 550 };
const CONCURRENCY = 6;

interface Palette { bg: string; ink: string; muted: string; accent: string; onAccent: string; panel: string; panelInk: string }
const NAVY = '#06162f';
const CREAM = '#faf8f3';
const PALETTES: Record<CardTheme, Palette> = {
  event: { bg: NAVY, ink: CREAM, muted: '#aeb8c7', accent: '#ffdf4f', onAccent: NAVY, panel: CREAM, panelInk: NAVY },
  hub: { bg: NAVY, ink: CREAM, muted: '#aeb8c7', accent: '#2ec4f1', onAccent: NAVY, panel: CREAM, panelInk: NAVY },
  market: { bg: CREAM, ink: NAVY, muted: '#565a61', accent: '#1554d1', onAccent: '#ffffff', panel: '#ffffff', panelInk: NAVY },
  local: { bg: '#121212', ink: '#ffffff', muted: '#b3b3b3', accent: '#2ec4f1', onAccent: NAVY, panel: '#1f1f1f', panelInk: '#ffffff' },
  neighbourhood: { bg: '#1554d1', ink: CREAM, muted: '#d6e2fa', accent: '#ffdf4f', onAccent: NAVY, panel: CREAM, panelInk: NAVY },
  guide: { bg: CREAM, ink: NAVY, muted: '#565a61', accent: NAVY, onAccent: CREAM, panel: '#ffffff', panelInk: NAVY },
  best: { bg: '#ffdf4f', ink: NAVY, muted: '#4d4415', accent: NAVY, onAccent: '#ffdf4f', panel: '#ffffff', panelInk: NAVY },
};

type Fonts = Parameters<typeof satori>[1]['fonts'];
async function loadFonts(): Promise<Fonts> {
  const f = (file: string) => readFile(join(ROOT, 'brand', 'fonts', file));
  return [
    { name: 'Bricolage', data: await f('bricolage-800.ttf'), weight: 800, style: 'normal' },
    { name: 'Bricolage', data: await f('bricolage-600.ttf'), weight: 600, style: 'normal' },
    { name: 'Inter', data: await f('inter-600.ttf'), weight: 600, style: 'normal' },
    { name: 'Inter', data: await f('inter-800.ttf'), weight: 800, style: 'normal' },
    { name: 'Mono', data: await f('plexmono-500.ttf'), weight: 500, style: 'normal' },
  ];
}

const dataUri = (buf: Buffer, type = 'jpeg') => `data:image/${type};base64,${buf.toString('base64')}`;

async function sourceBytes(src: string): Promise<Buffer | null> {
  try {
    // Our own images are in public/ already; no need to fetch the live site.
    const own = src.match(/^https:\/\/(?:www\.)?calgarywatch\.ca(\/[^?#]*)/);
    if (own || src.startsWith('/')) return await readFile(join(ROOT, 'public', decodeURIComponent(own ? own[1] : src.split('?')[0])));
    if (!/^https:\/\//.test(src)) return null;
    const res = await fetch(src, { headers: { 'user-agent': 'CalgaryWatchBot/1.0 (+https://calgarywatch.ca)' }, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length > 4_000 && buf.length < 15 * 1024 * 1024 ? buf : null;
  } catch {
    return null;
  }
}

const photoCache = new Map<string, Promise<string | null>>();
/** The listing photo cut to the card's photo frame. Posters sit whole on a blurred copy of themselves. */
function framedPhoto(src: string, poster: boolean): Promise<string | null> {
  const key = `${src}|${poster}`;
  if (!photoCache.has(key)) {
    photoCache.set(key, (async () => {
      const bytes = await sourceBytes(src);
      if (!bytes) return null;
      try {
        const meta = await sharp(bytes).metadata();
        // Logos and icons make poor photos; the photo-free design is better than a stretched logo.
        if ((meta.width ?? 0) < 300 || (meta.height ?? 0) < 200) return null;
        let out: Buffer;
        if (poster) {
          const bg = await sharp(bytes).resize(PHOTO.width, PHOTO.height, { fit: 'cover' }).blur(28).modulate({ brightness: 0.7 }).toBuffer();
          const fg = await sharp(bytes).resize(PHOTO.width - 48, PHOTO.height - 48, { fit: 'inside' }).toBuffer();
          out = await sharp(bg).composite([{ input: fg, gravity: 'centre' }]).jpeg({ quality: 84, mozjpeg: true }).toBuffer();
        } else {
          out = await sharp(bytes).resize(PHOTO.width * 2, PHOTO.height * 2, { fit: 'cover', position: sharp.strategy.attention }).jpeg({ quality: 84, mozjpeg: true }).toBuffer();
        }
        return dataUri(out);
      } catch {
        return null;
      }
    })());
  }
  return photoCache.get(key)!;
}

function titleSize(title: string): number {
  const n = title.length;
  return n <= 16 ? 84 : n <= 28 ? 70 : n <= 44 ? 60 : n <= 64 ? 50 : 44;
}

const clipText = (s: string, max: number) => (s.length <= max ? s : `${s.slice(0, max - 1).replace(/[\s,;:.–—-]+$/, '')}…`);

function Right({ card, p, photo }: { card: ShareCard; p: Palette; photo: string | null }) {
  const frame = { width: PHOTO.width, height: PHOTO.height, borderRadius: 34, display: 'flex', overflow: 'hidden' } as const;
  if (photo) {
    return (
      <div style={{ ...frame, border: `6px solid ${p.ink === CREAM || p.ink === '#ffffff' ? '#ffffff' : NAVY}`, boxShadow: '0 24px 60px rgba(0,0,0,0.35)' }}>
        <img src={photo} width={PHOTO.width} height={PHOTO.height} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
    );
  }
  if (card.ranked?.length) {
    const colors = card.colors;
    return (
      <div style={{ ...frame, flexDirection: 'column', background: colors ? `linear-gradient(160deg, ${colors.from}, ${colors.to})` : NAVY, padding: 40 }}>
        {card.mark ? <div style={{ display: 'flex', fontFamily: 'Bricolage', fontWeight: 800, fontSize: 104, lineHeight: 0.9, letterSpacing: -4, color: colors?.ink ?? CREAM, opacity: 0.9 }}>{clipText(card.mark.toUpperCase(), 9)}</div> : null}
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 'auto', background: '#ffffff', borderRadius: 22, padding: '10px 24px' }}>
          {card.ranked.slice(0, 4).map((name, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 0', borderTop: i ? '2px solid #e8e6df' : 'none' }}>
              <div style={{ display: 'flex', width: 40, height: 40, borderRadius: 20, background: i === 0 ? '#ffdf4f' : '#f1efe8', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter', fontWeight: 800, fontSize: 22, color: NAVY }}>{card.numbered ? i + 1 : '★'}</div>
              <div style={{ display: 'flex', flex: 1, fontFamily: 'Inter', fontWeight: 800, fontSize: 25, color: NAVY }}>{clipText(name, 24)}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (card.dateBlock) {
    const d = card.dateBlock;
    return (
      <div style={{ ...frame, flexDirection: 'column', background: p.panel, boxShadow: '0 24px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: p.accent, color: p.onAccent, padding: '26px 34px', fontFamily: 'Mono', fontWeight: 500, fontSize: 26, letterSpacing: 3 }}>
          <span>{d.eyebrow.toUpperCase()}</span>
          <span>{d.month}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, alignItems: 'center', justifyContent: 'center', color: p.panelInk }}>
          <div style={{ display: 'flex', fontFamily: 'Bricolage', fontWeight: 800, fontSize: 250, lineHeight: 0.9, letterSpacing: -10 }}>{d.day}</div>
          <div style={{ display: 'flex', fontFamily: 'Bricolage', fontWeight: 600, fontSize: 44, marginTop: 10 }}>{d.weekday}</div>
          {d.note ? <div style={{ display: 'flex', fontFamily: 'Mono', fontWeight: 500, fontSize: 24, marginTop: 18, padding: '8px 18px', borderRadius: 999, background: p.accent, color: p.onAccent }}>{d.note}</div> : null}
        </div>
        {/* Ticket stub perforation */}
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 20px 22px' }}>
          {Array.from({ length: 12 }, (_, i) => <div key={i} style={{ display: 'flex', width: 14, height: 14, borderRadius: 7, background: p.bg, opacity: 0.18 }} />)}
        </div>
      </div>
    );
  }
  const colors = card.colors ?? { from: p.accent, to: '#1554d1', ink: p.onAccent };
  return (
    <div style={{ ...frame, background: `linear-gradient(150deg, ${colors.from}, ${colors.to})`, alignItems: 'center', justifyContent: 'center', boxShadow: '0 24px 60px rgba(0,0,0,0.35)' }}>
      <div style={{ display: 'flex', fontFamily: 'Bricolage', fontWeight: 800, fontSize: (card.mark ?? '').length <= 2 ? 220 : 120, letterSpacing: -6, color: colors.ink }}>{clipText(card.mark ?? 'CW', 8)}</div>
    </div>
  );
}

function Card({ card, photo, logo }: { card: ShareCard; photo: string | null; logo: string }) {
  const p = PALETTES[card.theme];
  const title = clipText(card.title, 80);
  const bg = card.theme === 'guide' && card.colors ? `linear-gradient(135deg, ${CREAM} 55%, ${card.colors.from})` : p.bg;
  return (
    <div style={{ width: W, height: H, display: 'flex', background: bg, fontFamily: 'Inter', color: p.ink, position: 'relative' }}>
      {/* A soft glow behind the photo so dark cards don't read flat in a feed. */}
      <div style={{ position: 'absolute', right: -140, top: -160, width: 640, height: 640, borderRadius: 320, background: p.accent, opacity: card.theme === 'best' ? 0.0 : 0.12, display: 'flex' }} />
      <div style={{ display: 'flex', flexDirection: 'column', width: W - PHOTO.width - 64 - 56, padding: '50px 0 44px 64px', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <img src={logo} width={60} height={60} />
          <div style={{ display: 'flex', fontFamily: 'Bricolage', fontWeight: 800, fontSize: 32, letterSpacing: -0.5, color: p.ink }}>
            CalgaryWatch
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', marginBottom: 22 }}>
            <div style={{ display: 'flex', fontFamily: 'Mono', fontWeight: 500, fontSize: 22, letterSpacing: 2.5, padding: '9px 16px', borderRadius: 8, background: p.accent, color: p.onAccent }}>
              {clipText(card.label.toUpperCase(), 34)}
            </div>
          </div>
          <div style={{ display: 'flex', fontFamily: 'Bricolage', fontWeight: 800, fontSize: titleSize(title), lineHeight: 1.0, letterSpacing: -2, color: p.ink }}>
            {title}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', marginTop: 26, gap: 8 }}>
            {card.lines.slice(0, 3).map((line, i) => (
              <div key={i} style={{ display: 'flex', fontFamily: 'Inter', fontWeight: i === 0 ? 800 : 600, fontSize: i === 0 ? 30 : 27, lineHeight: 1.2, color: i === 0 ? p.ink : p.muted }}>
                {clipText(line, 70)}
              </div>
            ))}
          </div>
          {card.pill ? (
            <div style={{ display: 'flex', marginTop: 20 }}>
              <div style={{ display: 'flex', fontFamily: 'Inter', fontWeight: 800, fontSize: 26, padding: '8px 20px', borderRadius: 999, border: `3px solid ${p.ink}`, color: p.ink }}>{card.pill}</div>
            </div>
          ) : null}
        </div>

        <div style={{ display: 'flex', fontFamily: 'Mono', fontWeight: 500, fontSize: 21, color: p.muted }}>{clipText(card.footer, 52)}</div>
      </div>
      <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'flex-end', paddingRight: 56 }}>
        <Right card={card} p={p} photo={photo} />
      </div>
    </div>
  );
}

async function run() {
  const started = Date.now();
  const fonts = await loadFonts();
  const logo = dataUri(await sharp(join(ROOT, 'public/images/brand/calgarywatch-city-spark-v2.webp')).resize(120, 120).png().toBuffer(), 'png');
  let cards = allShareCards(discoveryRepository);
  if (ONLY) { const want = new Set(ONLY.split(',').map(cardPath)); cards = cards.filter(c => want.has(c.path)); }

  let done = 0, withPhoto = 0, failed = 0;
  let next = 0;
  async function worker() {
    while (next < cards.length) {
      const card = cards[next++];
      try {
        const photo = card.photo ? await framedPhoto(card.photo.src, card.photo.poster) : null;
        if (photo) withPhoto++;
        const svg = await satori(<Card card={card} photo={photo} logo={logo} />, { width: W, height: H, fonts });
        const jpg = await sharp(Buffer.from(svg), { density: 72 }).resize(W, H).jpeg({ quality: 86, mozjpeg: true, chromaSubsampling: '4:4:4' }).toBuffer();
        const out = join(OUT, card.path);
        await mkdir(dirname(out), { recursive: true });
        await writeFile(out, jpg);
        done++;
      } catch (error) {
        failed++;
        console.warn(`[share-cards] ${card.path} failed: ${(error as Error).message}`);
        // The page's og:image already names this file; the site picture beats a broken preview.
        try {
          await mkdir(dirname(join(OUT, card.path)), { recursive: true });
          await writeFile(join(OUT, card.path), await readFile(join(ROOT, 'public/images/hero/calgarywatch-social-v1.jpg')));
        } catch { /* nothing more to do */ }
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log(`[share-cards] Drew ${done} cards (${withPhoto} with photos${failed ? `, ${failed} failed` : ''}) in ${((Date.now() - started) / 1000).toFixed(1)}s.`);
}

run().catch((error) => {
  // A missing card falls back to the browser fetching a 404; never block a deploy for preview art.
  console.warn('[share-cards] Skipped:', error);
});
