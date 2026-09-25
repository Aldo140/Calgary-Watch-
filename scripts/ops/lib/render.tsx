// Brand templates rendered to PNG without a browser (satori → SVG → resvg → PNG).
// Text is always the checked draft text; there is no photography and no
// generated scenery, so nothing here can be mistaken for a photo of a real place.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import type { PostImageText, PostTemplate } from '../../../src/types/ops';
import { ROOT, type BrandKit } from './brand';

export const POST_SIZE = { width: 1080, height: 1350 } as const;
export const PROFILE_SIZE = { width: 1080, height: 1080 } as const;

let fonts: Parameters<typeof satori>[1]['fonts'] | null = null;
function loadFonts() {
  if (fonts) return fonts;
  const f = (file: string) => readFileSync(join(ROOT, 'brand', 'fonts', file));
  fonts = [
    { name: 'Bricolage', data: f('bricolage-800.ttf'), weight: 800, style: 'normal' },
    { name: 'Bricolage', data: f('bricolage-600.ttf'), weight: 600, style: 'normal' },
    { name: 'Inter', data: f('inter-400.ttf'), weight: 400, style: 'normal' },
    { name: 'Inter', data: f('inter-600.ttf'), weight: 600, style: 'normal' },
    { name: 'Inter', data: f('inter-800.ttf'), weight: 800, style: 'normal' },
    { name: 'Mono', data: f('plexmono-500.ttf'), weight: 500, style: 'normal' },
  ];
  return fonts;
}

async function toPng(node: React.ReactNode, size: { width: number; height: number }): Promise<Buffer> {
  const svg = await satori(node as React.ReactElement, { ...size, fonts: loadFonts() });
  return Buffer.from(new Resvg(svg, { fitTo: { mode: 'width', value: size.width } }).render().asPng());
}

function headlineSize(text: string, daily: boolean): number {
  const n = text.length;
  if (daily) return n <= 22 ? 124 : n <= 40 ? 100 : 80;
  return n <= 24 ? 112 : n <= 42 ? 88 : 72;
}

function Wordmark({ kit, color, size = 34 }: { kit: BrandKit; color: string; size?: number }) {
  if (kit.id === 'calgarydaily') {
    return (
      <div style={{ display: 'flex', fontFamily: 'Bricolage', fontWeight: 800, fontSize: size, letterSpacing: 1 }}>
        <span style={{ color }}>CALGARY</span>
        <span style={{ color: kit.colors.brand }}>DAILY</span>
      </div>
    );
  }
  return <div style={{ display: 'flex', fontFamily: 'Bricolage', fontWeight: 800, fontSize: size, letterSpacing: 2, color }}>{kit.wordmark}</div>;
}

function Post({ kit, template, text }: { kit: BrandKit; template: PostTemplate; text: PostImageText }) {
  const c = kit.colors;
  const daily = kit.id === 'calgarydaily';
  const dark = daily || template === 'update';
  const bg = dark ? c.live : c.background;
  const ink = dark ? c.onLive : c.ink;
  const muted = dark ? (daily ? c.muted : '#AEB8C7') : c.muted;
  const sponsored = template === 'partner';
  const headline = daily ? text.headline.toUpperCase() : text.headline;
  const roundup = template === 'roundup';

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: bg, fontFamily: 'Inter', color: ink }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '56px 72px 0' }}>
        <Wordmark kit={kit} color={ink} />
        {sponsored && (
          <div style={{ display: 'flex', fontFamily: 'Inter', fontWeight: 800, fontSize: 26, color: c.ink, background: '#FFFFFF', border: `3px solid ${c.ink}`, borderRadius: 999, padding: '10px 24px' }}>
            Featured partner
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, justifyContent: roundup ? 'flex-start' : 'center', padding: roundup ? '72px 72px 0' : '0 72px' }}>
        <div style={{ display: 'flex', marginBottom: 32 }}>
          <div style={{ display: 'flex', fontFamily: 'Mono', fontWeight: 500, fontSize: 28, letterSpacing: 2, color: daily ? c.live : '#FFFFFF', background: c.brand, padding: '10px 20px', borderRadius: daily ? 0 : 8 }}>
            {text.eyebrow}
          </div>
        </div>
        <div style={{ display: 'flex', fontFamily: 'Bricolage', fontWeight: 800, fontSize: headlineSize(headline, daily), lineHeight: 1.02, letterSpacing: daily ? -1 : -2, color: ink }}>
          {headline}
        </div>

        {roundup ? (
          <div style={{ display: 'flex', flexDirection: 'column', marginTop: 56 }}>
            {text.details.map((line, i) => {
              const [when, ...rest] = line.split(' · ');
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', borderTop: `2px solid ${dark ? '#FFFFFF22' : c.line}`, padding: '22px 0' }}>
                  <div style={{ display: 'flex', width: 340, flexShrink: 0, fontFamily: 'Mono', fontWeight: 500, fontSize: 26, paddingTop: 8, color: c.brand }}>{when}</div>
                  <div style={{ display: 'flex', flex: 1, fontFamily: 'Inter', fontWeight: 600, fontSize: 36, color: ink }}>{rest.join(' · ')}</div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', marginTop: 48, borderLeft: `8px solid ${c.brand}`, paddingLeft: 28 }}>
            {text.details.map((line, i) => (
              <div key={i} style={{ display: 'flex', fontFamily: 'Inter', fontWeight: i === 0 ? 800 : 600, fontSize: i === 0 ? 46 : 40, color: i === 0 ? ink : muted, marginBottom: 12 }}>
                {line}
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '34px 72px', background: daily ? c.brand : (dark ? '#FFFFFF10' : c.live), color: daily ? c.live : c.onLive }}>
        <div style={{ display: 'flex', fontFamily: 'Mono', fontWeight: 500, fontSize: 30 }}>{text.footer}</div>
        <div style={{ display: 'flex', fontFamily: 'Inter', fontWeight: 600, fontSize: 22, opacity: 0.85 }}>
          {sponsored ? 'Paid placement' : 'Dates checked with the organizer'}
        </div>
      </div>
    </div>
  );
}

function Profile({ kit }: { kit: BrandKit }) {
  const c = kit.colors;
  const daily = kit.id === 'calgarydaily';
  // Instagram crops the profile image to a circle; keep everything inside the middle 70%.
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: c.live }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ display: 'flex', fontFamily: 'Bricolage', fontWeight: 800, fontSize: 176, lineHeight: 0.92, letterSpacing: -4, color: c.onLive }}>CALGARY</div>
        <div style={{ display: 'flex', fontFamily: 'Bricolage', fontWeight: 800, fontSize: 176, lineHeight: 0.92, letterSpacing: -4, color: daily ? c.brand : c.onLive }}>
          {daily ? 'DAILY' : 'WATCH'}
        </div>
        <div style={{ display: 'flex', width: 200, height: 16, marginTop: 40, background: c.brand, borderRadius: daily ? 0 : 8 }} />
      </div>
    </div>
  );
}

export const renderPost = (kit: BrandKit, template: PostTemplate, text: PostImageText) =>
  toPng(<Post kit={kit} template={template} text={text} />, POST_SIZE);

export const renderProfile = (kit: BrandKit) => toPng(<Profile kit={kit} />, PROFILE_SIZE);
