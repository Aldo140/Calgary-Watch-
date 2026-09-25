// CalgaryDaily's post designs, built from its real logo: the sunset gradient
// (orange → red → magenta → purple), the Calgary Tower over a skyline, and the
// white "DAILY" pill. The logo badge itself sits on every post.
// News and events ride the gradient; OUR TAKE flips to white so opinion never
// reads as news; photo posts put a credited, openly licensed photo up top.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PostImageText, PostTemplate } from '../../../src/types/ops';
import { ROOT } from './brand';

/** Bump when the look changes: queued posts in an older design are re-rendered before they publish. */
export const DAILY_DESIGN_VERSION = 2;

export const DAILY = {
  orange: '#FE7F26',
  red: '#F52730',
  magenta: '#CB1E59',
  purple: '#6820A6',
  navy: '#1B247F',
  pillRed: '#C90E2B',
  white: '#FFFFFF',
} as const;
export const DAILY_GRADIENT = `linear-gradient(150deg, ${DAILY.orange} 0%, ${DAILY.red} 32%, ${DAILY.magenta} 62%, ${DAILY.purple} 100%)`;

const cache = new Map<string, string>();
function dataUri(relPath: string, type: string): string {
  if (!cache.has(relPath)) cache.set(relPath, `data:${type};base64,${readFileSync(join(ROOT, relPath)).toString('base64')}`);
  return cache.get(relPath)!;
}
const logo = () => dataUri('brand/calgarydaily-logo.jpg', 'image/jpeg');
const photo = (file: string) => dataUri(file, file.endsWith('.png') ? 'image/png' : 'image/jpeg');

/** The skyline and Calgary Tower from the logo, as a quiet silhouette along the bottom. */
function skyline(color: string, opacity: number): string {
  // [x, width, height]: a low, dense downtown so the tower is the one thing that stands out.
  const blocks = [
    [0, 70, 60], [60, 44, 95], [100, 60, 75], [150, 38, 130], [185, 70, 105], [250, 46, 160], [290, 64, 120],
    [350, 40, 185], [385, 58, 140], [440, 50, 110], [485, 36, 90], [600, 44, 115], [640, 62, 170], [700, 40, 205],
    [735, 66, 150], [795, 48, 125], [840, 60, 180], [895, 42, 135], [935, 70, 100], [1000, 50, 145], [1045, 40, 80],
  ];
  const rects = blocks.map(([x, w, h]) => `<rect x="${x}" y="${420 - h}" width="${w}" height="${h}"/>`).join('');
  // Calgary Tower: shaft, flared pod, crown and spike, well above the skyline.
  const tower = '<path d="M531 420 L537 150 h26 L569 420 z"/><path d="M500 150 h100 l-14 32 h-72 z"/><rect x="514" y="130" width="72" height="22" rx="6"/><rect x="546" y="78" width="8" height="54"/>';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="420" viewBox="0 0 1080 420"><g fill="${color}" fill-opacity="${opacity}">${rects}${tower}</g></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

function Badge({ size = 118 }: { size?: number }) {
  return <img src={logo()} width={size} height={size} style={{ borderRadius: size, border: '5px solid #FFFFFF' }} />;
}

function Pill({ text, bg, ink }: { text: string; bg: string; ink: string }) {
  return (
    <div style={{ display: 'flex', fontFamily: 'Inter', fontWeight: 800, fontSize: 28, letterSpacing: 2, textTransform: 'uppercase', color: ink, background: bg, padding: '12px 26px', borderRadius: 999 }}>
      {text}
    </div>
  );
}

function Top({ tag, pillBg = DAILY.white, pillInk = DAILY.pillRed }: { tag: string; pillBg?: string; pillInk?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '52px 64px 0' }}>
      <Badge />
      <Pill text={tag} bg={pillBg} ink={pillInk} />
    </div>
  );
}

function Bottom({ left, right, bg = DAILY.white, ink = DAILY.navy, accent = DAILY.pillRed }: { left: string; right?: string; bg?: string; ink?: string; accent?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 24, padding: '28px 64px', background: bg }}>
      <div style={{ display: 'flex', flex: 1, fontFamily: 'Inter', fontWeight: 600, fontSize: 24, lineHeight: 1.3, color: ink }}>{left}</div>
      <div style={{ display: 'flex', fontFamily: 'Inter', fontWeight: 800, fontSize: 26, color: accent }}>{right ?? '@calgarydaily'}</div>
    </div>
  );
}

const headlineSize = (t: string, big = 118) => (t.length <= 20 ? big : t.length <= 36 ? 96 : t.length <= 56 ? 80 : 66);

function Headline({ text, color = DAILY.white, size }: { text: string; color?: string; size?: number }) {
  return (
    <div style={{ display: 'flex', fontFamily: 'Bricolage', fontWeight: 800, fontSize: size ?? headlineSize(text), lineHeight: 1.0, letterSpacing: -2, color, textTransform: 'uppercase' }}>
      {text}
    </div>
  );
}

function Stats({ lines, value, label, rule }: { lines: string[]; value: string; label: string; rule: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', marginTop: 40 }}>
      {lines.map((line, i) => {
        const [v, l] = line.split('|');
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 28, borderTop: `3px solid ${rule}`, padding: '18px 0' }}>
            <div style={{ display: 'flex', width: 330, flexShrink: 0, fontFamily: 'Bricolage', fontWeight: 800, fontSize: v.length > 7 ? 60 : 78, letterSpacing: -2, color: value }}>{v}</div>
            <div style={{ display: 'flex', flex: 1, fontFamily: 'Inter', fontWeight: 600, fontSize: 33, lineHeight: 1.2, color: label }}>{l ?? ''}</div>
          </div>
        );
      })}
    </div>
  );
}

/** The gradient card every news, event, roundup and slide post sits on. */
function GradientCard({ tag, children, footer, right, center = true }: { tag: string; children: React.ReactNode; footer: string; right?: string; center?: boolean }) {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', backgroundImage: DAILY_GRADIENT, position: 'relative' }}>
      <img src={skyline('#FFFFFF', 0.10)} width={1080} height={420} style={{ position: 'absolute', left: 0, bottom: 92 }} />
      <Top tag={tag} />
      <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, justifyContent: center ? 'center' : 'flex-start', padding: center ? '0 64px' : '64px 64px 0' }}>
        {children}
      </div>
      <Bottom left={footer} right={right} />
    </div>
  );
}

function EventCard({ text }: { text: PostImageText }) {
  return (
    <GradientCard tag={text.eyebrow} footer={text.footer || 'Dates checked with the organizer'}>
      <Headline text={text.headline} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 44 }}>
        {text.details.map((line, i) => (
          <div key={i} style={{ display: 'flex', alignSelf: 'flex-start', fontFamily: 'Inter', fontWeight: i === 0 ? 800 : 600, fontSize: i === 0 ? 46 : 38, color: DAILY.white, background: i === 0 ? '#00000026' : 'transparent', padding: i === 0 ? '6px 16px' : '0 16px', borderRadius: 12 }}>
            {line}
          </div>
        ))}
      </div>
    </GradientCard>
  );
}

function RoundupCard({ text }: { text: PostImageText }) {
  return (
    <GradientCard tag={text.eyebrow} footer="Dates checked with each organizer" center={false}>
      <Headline text={text.headline} />
      <div style={{ display: 'flex', flexDirection: 'column', marginTop: 44, background: '#FFFFFFF0', borderRadius: 28, padding: '10px 32px' }}>
        {text.details.map((line, i) => {
          const [when, ...rest] = line.split(' · ');
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 20, borderTop: i ? `2px solid ${DAILY.navy}1F` : 'none', padding: '20px 0' }}>
              <div style={{ display: 'flex', width: 300, flexShrink: 0, fontFamily: 'Mono', fontWeight: 500, fontSize: 25, paddingTop: 7, color: DAILY.pillRed }}>{when}</div>
              <div style={{ display: 'flex', flex: 1, fontFamily: 'Inter', fontWeight: 800, fontSize: 34, lineHeight: 1.15, color: DAILY.navy }}>{rest.join(' · ')}</div>
            </div>
          );
        })}
      </div>
    </GradientCard>
  );
}

function NewsCard({ text }: { text: PostImageText }) {
  return (
    <GradientCard tag={text.eyebrow} footer={text.footer}>
      <Headline text={text.headline} size={text.headline.length > 48 ? 76 : 92} />
      <Stats lines={text.details} value={DAILY.white} label={DAILY.white} rule="#FFFFFF55" />
    </GradientCard>
  );
}

function SlideCard({ text }: { text: PostImageText }) {
  const [source, counter] = text.footer.split('||');
  const stats = text.details.some(d => d.includes('|'));
  return (
    <GradientCard tag={text.eyebrow} footer={source} right={counter}>
      <Headline text={text.headline} size={text.headline.length <= 6 ? 280 : text.headline.length > 30 ? 84 : 120} />
      {stats
        ? <Stats lines={text.details} value={DAILY.white} label={DAILY.white} rule="#FFFFFF55" />
        : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 22, marginTop: 36 }}>
            {text.details.map((p, i) => (
              <div key={i} style={{ display: 'flex', fontFamily: 'Inter', fontWeight: i === 0 ? 800 : 600, fontSize: p.length > 150 ? 36 : 42, lineHeight: 1.3, color: DAILY.white }}>{p}</div>
            ))}
          </div>
        )}
    </GradientCard>
  );
}

/** Opinion: white ground, navy type, gradient label and bar. Unmistakably not news. */
function TakeCard({ text }: { text: PostImageText }) {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: DAILY.white, position: 'relative' }}>
      <div style={{ display: 'flex', position: 'absolute', left: 0, top: 0, width: 1080, height: 16, backgroundImage: DAILY_GRADIENT }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '56px 64px 0' }}>
        <Badge />
        <div style={{ display: 'flex', fontFamily: 'Inter', fontWeight: 800, fontSize: 28, letterSpacing: 2, color: DAILY.white, backgroundImage: DAILY_GRADIENT, padding: '12px 26px', borderRadius: 999 }}>
          {text.eyebrow}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, justifyContent: 'center', padding: '0 64px' }}>
        <div style={{ display: 'flex', fontFamily: 'Bricolage', fontWeight: 800, fontSize: text.headline.length > 60 ? 76 : 90, lineHeight: 1.02, letterSpacing: -2, color: DAILY.navy }}>
          {text.headline}
        </div>
        <Stats lines={text.details} value={DAILY.pillRed} label={DAILY.navy} rule={`${DAILY.navy}26`} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '28px 64px', backgroundImage: DAILY_GRADIENT }}>
        <div style={{ display: 'flex', fontFamily: 'Inter', fontWeight: 600, fontSize: 24, color: DAILY.white }}>{text.footer}</div>
        <div style={{ display: 'flex', fontFamily: 'Inter', fontWeight: 800, fontSize: 26, color: DAILY.white }}>@calgarydaily</div>
      </div>
    </div>
  );
}

/** Full-bleed photo on top, the gradient rising into it, the story below. */
function PhotoCard({ text }: { text: PostImageText }) {
  const p = text.photo!;
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', backgroundImage: DAILY_GRADIENT, position: 'relative' }}>
      <img src={photo(p.file)} width={1080} height={1262} style={{ position: 'absolute', left: 0, top: 0, objectFit: 'cover', objectPosition: p.focus ?? 'center' }} />
      {/* The brand gradient rises out of the bottom of the photo; the top stays clear for the logo. */}
      <div style={{ display: 'flex', position: 'absolute', left: 0, top: 0, width: 1080, height: 1262, backgroundImage: `linear-gradient(180deg, #00000059 0%, #00000000 18%, #00000000 42%, ${DAILY.red}B3 66%, ${DAILY.magenta}F2 84%, ${DAILY.purple} 100%)` }} />
      <div style={{ display: 'flex', position: 'absolute', right: 28, top: 190, fontFamily: 'Inter', fontWeight: 600, fontSize: 19, color: '#FFFFFFD9' }}>{p.credit}</div>
      <Top tag={text.eyebrow} />
      <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, justifyContent: 'flex-end', padding: '0 64px 36px' }}>
        <Headline text={text.headline} size={text.headline.length > 34 ? 80 : 100} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 22 }}>
          {text.details.map((line, i) => (
            <div key={i} style={{ display: 'flex', fontFamily: 'Inter', fontWeight: i === 0 ? 800 : 600, fontSize: i === 0 ? 40 : 34, color: DAILY.white }}>{line}</div>
          ))}
        </div>
      </div>
      <Bottom left={text.footer} />
    </div>
  );
}

export function DailyPost({ template, text }: { template: PostTemplate; text: PostImageText }) {
  if (text.photo) return <PhotoCard text={text} />;
  switch (template) {
    case 'roundup': return <RoundupCard text={text} />;
    case 'news': return <NewsCard text={text} />;
    case 'slide': return <SlideCard text={text} />;
    case 'take': return <TakeCard text={text} />;
    default: return <EventCard text={text} />;
  }
}

/** Profile image: the gradient, the tower, CALGARY and the DAILY pill, inside the circle crop. */
export function DailyProfile() {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundImage: DAILY_GRADIENT, position: 'relative' }}>
      <img src={skyline('#FFFFFF', 0.22)} width={1080} height={420} style={{ position: 'absolute', left: 0, bottom: 60 }} />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ display: 'flex', fontFamily: 'Bricolage', fontWeight: 800, fontSize: 190, letterSpacing: -4, color: DAILY.white, lineHeight: 1 }}>CALGARY</div>
        <div style={{ display: 'flex', marginTop: 18, fontFamily: 'Bricolage', fontWeight: 800, fontSize: 120, letterSpacing: 2, color: DAILY.pillRed, background: DAILY.white, padding: '4px 56px', borderRadius: 999 }}>DAILY</div>
      </div>
    </div>
  );
}
