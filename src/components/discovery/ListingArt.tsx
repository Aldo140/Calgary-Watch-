import { memo } from 'react';

/**
 * Generated artwork for listings that have no licensed photo. Everything is drawn from
 * the listing's own data (its id seeds the colourway and layout, its name goes on the
 * chalkboard, its next real day goes on the sticker), so no two markets look alike and
 * nothing suggests a photo of the actual place.
 */

const INK = '#151515';

function seeded(key: string) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  let s = h >>> 0;
  return () => ((s = Math.imul(s ^ (s >>> 15), 2246822507) ^ Math.imul(s ^ (s >>> 13), 3266489909)) >>> 0) / 4294967296;
}

const MARKET_WAYS = [
  { bg: '#ffdf4f', ground: '#f2c21f', a: '#1554d1', b: '#ffffff' },
  { bg: '#00c2e0', ground: '#00a3bd', a: INK, b: '#ffdf4f' },
  { bg: '#dfe7ff', ground: '#c3cff5', a: '#1554d1', b: '#ffffff' },
  { bg: '#c9f2d4', ground: '#a6e3b8', a: '#1f8a4c', b: '#ffffff' },
  { bg: '#ffd8c2', ground: '#f6bd9d', a: '#06162f', b: '#ffdf4f' },
];
const PRODUCE = ['#ff8a3d', '#3fbf6a', '#7b4bd8', '#ffdf4f', '#e2573d', '#9bd34a'];

/** Chalkboard text: the market's distinctive name, not its boilerplate. */
function boardName(title: string) {
  const words = title.replace(/[’']/g, '').replace(/&/g, ' ').replace(/\b(calgary|farmers|farmer|makers|market|at|the|and)\b/gi, ' ').split(/\s+/).filter(Boolean);
  const pair = words.slice(0, 2).join(' ');
  const name = (pair.length <= 11 ? pair : words[0] || 'MARKET').toUpperCase();
  return name.length > 11 ? name.slice(0, 10) + '…' : name;
}

export const MarketArt = memo(function MarketArt({ id, title, day }: { id: string; title: string; day?: string }) {
  const r = seeded(id);
  const w = MARKET_WAYS[Math.floor(r() * MARKET_WAYS.length)];
  const crates = Array.from({ length: 4 }, (_, i) => ({ x: 78 + i * 64 + r() * 6, fruit: PRODUCE[Math.floor(r() * PRODUCE.length)], leafy: r() > 0.7 }));
  const flags = Array.from({ length: 11 }, (_, i) => i);
  const pid = `ma-${id.slice(0, 8)}`;
  return (
    <svg className="cw-art" viewBox="0 0 400 250" preserveAspectRatio="xMidYMid slice" role="img" aria-label={`Illustration for ${title}`}>
      <defs>
        <pattern id={`${pid}-dots`} width="10" height="10" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.4" fill={INK} opacity=".09" /></pattern>
      </defs>
      <rect width="400" height="250" fill={w.bg} />
      <rect width="400" height="250" fill={`url(#${pid}-dots)`} />
      <path d="M-10,26Q200,62 410,26" fill="none" stroke={INK} strokeWidth="2" />
      {flags.map(i => {
        const x = 12 + i * 37; const y = 26 + Math.sin((x / 400) * Math.PI) * 34;
        return <path key={i} d={`M${x - 11},${y - 2}L${x + 11},${y - 2}L${x},${y + 20}Z`} fill={i % 2 ? w.a : w.b} stroke={INK} strokeWidth="2" strokeLinejoin="round" />;
      })}
      <rect x="0" y="214" width="400" height="36" fill={w.ground} />
      <path d="M0,214H400" stroke={INK} strokeWidth="2.5" />
      <rect x="68" y="104" width="9" height="112" fill={INK} />
      <rect x="323" y="104" width="9" height="112" fill={INK} />
      {Array.from({ length: 10 }, (_, i) => <rect key={i} x={56 + i * 29} y="74" width="29" height="34" fill={i % 2 ? w.b : w.a} />)}
      {Array.from({ length: 10 }, (_, i) => <path key={i} d={`M${56 + i * 29},107a14.5,14.5 0 0 0 29,0Z`} fill={i % 2 ? w.b : w.a} stroke={INK} strokeWidth="2.5" />)}
      <rect x="56" y="74" width="290" height="34" fill="none" stroke={INK} strokeWidth="2.5" />
      <path d="M50,74H350L336,62H64Z" fill={w.a} stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M170,121V131M230,121V131" stroke={INK} strokeWidth="2" />
      <rect x="148" y="131" width="104" height="30" rx="4" fill="#1f2a2e" stroke={INK} strokeWidth="2.5" />
      <text x="200" y="151" textAnchor="middle" fill="#fff" style={{ font: '700 12px "IBM Plex Mono", monospace', letterSpacing: '.06em' }}>{boardName(title)}</text>
      {crates.map((c, i) => (
        <g key={i}>
          {c.leafy
            ? <path d={`M${c.x + 4},178q6,-26 12,-4q6,-24 12,0q6,-22 12,4`} fill="#3fbf6a" stroke={INK} strokeWidth="2" strokeLinejoin="round" />
            : [0, 1, 2].map(k => <circle key={k} cx={c.x + 10 + k * 13} cy={172 - (k === 1 ? 5 : 0)} r="7.5" fill={c.fruit} stroke={INK} strokeWidth="2" />)}
          <rect x={c.x} y="176" width="50" height="22" fill="#c98b4b" stroke={INK} strokeWidth="2.5" />
          <path d={`M${c.x},187H${c.x + 50}`} stroke={INK} strokeWidth="1.5" />
        </g>
      ))}
      <rect x="60" y="197" width="280" height="18" fill="#fff" stroke={INK} strokeWidth="2.5" />
      {day ? (
        <g transform="translate(346 150) rotate(-12)">
          <circle r="27" fill="#fff" stroke={INK} strokeWidth="2.5" />
          <circle r="21" fill="none" stroke={INK} strokeWidth="1.2" strokeDasharray="3 3" />
          <text y="5" textAnchor="middle" fill={INK} style={{ font: '800 14px "IBM Plex Mono", monospace' }}>{day.toUpperCase()}</text>
        </g>
      ) : null}
    </svg>
  );
});

const EVENT_WAYS: Record<string, { bg: string; fg: string; accent: string }> = {
  music: { bg: '#1554d1', fg: '#ffdf4f', accent: '#00c2e0' },
  arts: { bg: '#ffdf4f', fg: '#1554d1', accent: '#ff8a3d' },
  sports: { bg: '#00c2e0', fg: '#ffffff', accent: '#ffdf4f' },
  family: { bg: '#ffd8c2', fg: '#1554d1', accent: '#3fbf6a' },
  food: { bg: '#c9f2d4', fg: '#1f8a4c', accent: '#ff8a3d' },
  other: { bg: '#dfe7ff', fg: '#1554d1', accent: '#ffdf4f' },
};

export function eventArtKind(categories: string[]) {
  const c = categories.map(x => x.toLowerCase()).join(' ');
  if (/music|concert/.test(c)) return 'music';
  if (/sport|hockey|football|soccer|basketball/.test(c)) return 'sports';
  if (/family|kids/.test(c)) return 'family';
  if (/food|drink/.test(c)) return 'food';
  if (/art|theat|comedy|film|dance|workshop/.test(c)) return 'arts';
  return 'other';
}

export const EventArt = memo(function EventArt({ id, title, categories }: { id: string; title: string; categories: string[] }) {
  const r = seeded(id);
  const kind = eventArtKind(categories);
  // Same category, different colourway per event, so a day of arts listings isn't a wall of one poster.
  const ways = Object.values(EVENT_WAYS);
  const w = r() < 0.45 ? EVENT_WAYS[kind] : ways[(ways.indexOf(EVENT_WAYS[kind]) + 1 + Math.floor(r() * (ways.length - 1))) % ways.length];
  const pid = `ea-${id.slice(0, 8)}`;
  const tilt = (r() - 0.5) * 16;
  return (
    <svg className="cw-art" viewBox="0 0 400 250" preserveAspectRatio="xMidYMid slice" role="img" aria-label={`Illustration for ${title}`}>
      <defs>
        <pattern id={`${pid}-dots`} width="10" height="10" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.5" fill={INK} opacity=".1" /></pattern>
      </defs>
      <rect width="400" height="250" fill={w.bg} />
      <rect width="400" height="250" fill={`url(#${pid}-dots)`} />
      <path d={`M0,${180 + r() * 30}Q200,${120 + r() * 40} 400,${170 + r() * 30}V250H0Z`} fill={w.accent} stroke={INK} strokeWidth="2.5" />

      {kind === 'music' ? (
        <g transform={`rotate(${tilt} 260 118)`}>
          <circle cx="260" cy="118" r="92" fill={INK} />
          {[80, 68, 56, 44].map(rr => <circle key={rr} cx="260" cy="118" r={rr} fill="none" stroke="#fff" strokeOpacity=".16" strokeWidth="1.5" />)}
          <circle cx="260" cy="118" r="30" fill={w.fg} stroke={INK} strokeWidth="2.5" />
          <circle cx="260" cy="118" r="4" fill={INK} />
          {Array.from({ length: 7 }, (_, i) => { const h = 20 + r() * 70; return <rect key={i} x={36 + i * 18} y={130 - h / 2} width="10" height={h} rx="5" fill={w.fg} stroke={INK} strokeWidth="2" />; })}
        </g>
      ) : kind === 'arts' ? (
        <g transform={`rotate(${tilt} 200 118)`}>
          <rect x="110" y="32" width="180" height="150" fill="#fff" stroke={INK} strokeWidth="3" />
          <rect x="124" y="46" width="152" height="122" fill="none" stroke={INK} strokeWidth="1.5" />
          <circle cx={160 + r() * 30} cy="92" r="26" fill={w.accent} stroke={INK} strokeWidth="2.5" />
          <path d="M190,150L236,74L270,150Z" fill={w.fg} stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
          <path d="M40,200C90,150 120,230 180,196" fill="none" stroke={INK} strokeWidth="10" strokeLinecap="round" />
          <path d="M40,200C90,150 120,230 180,196" fill="none" stroke={w.fg} strokeWidth="5" strokeLinecap="round" />
        </g>
      ) : kind === 'sports' ? (
        <g>
          {[0, 1, 2].map(i => <path key={i} d={`M${30 + i * 14},${80 + i * 30}H${150 - i * 20}`} stroke={INK} strokeWidth="5" strokeLinecap="round" />)}
          <g transform={`rotate(${tilt * 2} 250 118)`}>
            <circle cx="250" cy="118" r="80" fill="#fff" stroke={INK} strokeWidth="3" />
            <path d="M250,38C220,90 220,146 250,198M250,38C280,90 280,146 250,198M170,118H330" fill="none" stroke={INK} strokeWidth="2.5" />
          </g>
        </g>
      ) : kind === 'family' ? (
        <g>
          {[[120, 90, w.fg], [200, 70, w.accent], [280, 96, '#ffdf4f']].map(([x, y, c], i) => (
            <g key={i} transform={`rotate(${(r() - 0.5) * 14} ${x} ${y})`}>
              <path d={`M${x},${Number(y) + 46}C${Number(x) - 6},${Number(y) + 90} ${Number(x) + 10},${Number(y) + 110} ${x},${Number(y) + 150}`} fill="none" stroke={INK} strokeWidth="1.8" />
              <ellipse cx={x} cy={y} rx="36" ry="46" fill={String(c)} stroke={INK} strokeWidth="2.5" />
              <ellipse cx={Number(x) - 12} cy={Number(y) - 16} rx="7" ry="11" fill="#fff" opacity=".6" />
            </g>
          ))}
        </g>
      ) : kind === 'food' ? (
        <g transform={`rotate(${tilt} 200 120)`}>
          <ellipse cx="200" cy="128" rx="120" ry="70" fill="#fff" stroke={INK} strokeWidth="3" />
          <ellipse cx="200" cy="128" rx="88" ry="48" fill="none" stroke={INK} strokeWidth="1.5" />
          {[0, 1, 2, 3, 4].map(i => <circle key={i} cx={150 + i * 25} cy={120 + (i % 2) * 14} r="15" fill={PRODUCE[i]} stroke={INK} strokeWidth="2" />)}
        </g>
      ) : (
        <g transform={`rotate(${tilt} 200 118)`}>
          <path d={Array.from({ length: 24 }, (_, i) => { const a = (i / 24) * Math.PI * 2; const rr = i % 2 ? 58 : 96; return `${i ? 'L' : 'M'}${(200 + Math.cos(a) * rr).toFixed(1)},${(118 + Math.sin(a) * rr).toFixed(1)}`; }).join('') + 'Z'} fill={w.accent} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
          <circle cx="200" cy="118" r="42" fill="#fff" stroke={INK} strokeWidth="2.5" />
          <path d="M184,118L196,130L218,104" fill="none" stroke={w.fg} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )}
    </svg>
  );
});

const SHOP_WAYS = [
  { wall: '#dfe7ff', facade: '#1554d1', trim: '#ffdf4f', a: '#ffffff', b: '#1554d1', door: '#ffdf4f' },
  { wall: '#fff5cc', facade: '#1f8a4c', trim: '#ffffff', a: '#ffdf4f', b: '#1f8a4c', door: '#ffdf4f' },
  { wall: '#c9f2d4', facade: '#06162f', trim: '#00c2e0', a: '#00c2e0', b: '#ffffff', door: '#00c2e0' },
  { wall: '#ffd8c2', facade: '#b8472a', trim: '#ffdf4f', a: '#ffffff', b: '#b8472a', door: '#06162f' },
  { wall: '#d7f3f9', facade: '#7b4bd8', trim: '#ffdf4f', a: '#ffdf4f', b: '#7b4bd8', door: '#ffffff' },
];

type ShopGlyph = 'cup' | 'record' | 'frame' | 'bag';
export function shopGlyph(tags: string[], categories: string[]): ShopGlyph {
  const t = [...tags, ...categories].join(' ').toLowerCase();
  if (/vinyl|record/.test(t)) return 'record';
  if (/coffee|espresso|cafe|café|bakery|pastr/.test(t)) return 'cup';
  if (/art|gallery|studio/.test(t)) return 'frame';
  return 'bag';
}

/** Sign text: the business name before any "— Neighbourhood" suffix. */
function signName(title: string) {
  return title.split(/\s+[—–-]\s+/)[0].toUpperCase();
}

export const ShopArt = memo(function ShopArt({ id, title, tags, categories }: { id: string; title: string; tags: string[]; categories: string[] }) {
  const r = seeded(id);
  const w = SHOP_WAYS[Math.floor(r() * SHOP_WAYS.length)];
  const glyph = shopGlyph(tags, categories);
  const name = signName(title);
  const pid = `sa-${id.slice(0, 10)}`;
  return (
    <svg className="cw-art" viewBox="0 0 400 260" preserveAspectRatio="xMidYMid slice" role="img" aria-label={`Illustrated storefront for ${title}`}>
      <defs>
        <pattern id={`${pid}-brick`} width="24" height="12" patternUnits="userSpaceOnUse">
          <path d="M0,0H24M0,6H24M6,0V6M18,6V12" stroke={INK} strokeWidth="1" opacity=".12" fill="none" />
        </pattern>
        <pattern id={`${pid}-dots`} width="10" height="10" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.4" fill={INK} opacity=".08" /></pattern>
      </defs>
      <rect width="400" height="260" fill={w.wall} />
      <rect width="400" height="260" fill={`url(#${pid}-dots)`} />
      <rect x="0" y="232" width="400" height="28" fill="#cfcac0" />
      <path d="M0,232H400" stroke={INK} strokeWidth="2.5" />
      <rect x="44" y="30" width="312" height="203" fill={w.facade} stroke={INK} strokeWidth="2.5" />
      <rect x="44" y="30" width="312" height="203" fill={`url(#${pid}-brick)`} />
      <rect x="36" y="22" width="328" height="14" fill={w.trim} stroke={INK} strokeWidth="2.5" />
      <rect x="66" y="46" width="268" height="36" rx="4" fill="#1f2a2e" stroke={INK} strokeWidth="2.5" />
      <text x="200" y="70" textAnchor="middle" fill="#fff" textLength={name.length * 12.5 > 244 ? 244 : undefined} lengthAdjust="spacingAndGlyphs" style={{ font: '800 17px "Bricolage Grotesque", Inter, sans-serif', letterSpacing: '.04em' }}>{name}</text>
      {Array.from({ length: 11 }, (_, i) => <rect key={i} x={52 + i * 27} y="90" width="27" height="24" fill={i % 2 ? w.b : w.a} />)}
      {Array.from({ length: 11 }, (_, i) => <path key={i} d={`M${52 + i * 27},113a13.5,13.5 0 0 0 27,0Z`} fill={i % 2 ? w.b : w.a} stroke={INK} strokeWidth="2.2" />)}
      <rect x="52" y="90" width="297" height="24" fill="none" stroke={INK} strokeWidth="2.5" />
      <rect x="64" y="136" width="176" height="84" fill="#ffe9a8" stroke={INK} strokeWidth="2.5" />
      <path d="M152,136V220M64,178H240" stroke={INK} strokeWidth="2" opacity=".5" />
      <path d="M72,144L96,144L72,168Z" fill="#fff" opacity=".55" />
      <g transform="translate(152 178)">
        {glyph === 'cup' ? (
          <g>
            <path d="M-22,-14H18V8A14,14 0 0 1 4,22H-8A14,14 0 0 1 -22,8Z" fill="#fff" stroke={INK} strokeWidth="2.5" />
            <path d="M18,-6h6a7,7 0 0 1 0,14h-7" fill="none" stroke={INK} strokeWidth="2.5" />
            <path d="M-12,-22q4,-6 0,-12M-2,-22q4,-6 0,-12M8,-22q4,-6 0,-12" fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" />
          </g>
        ) : glyph === 'record' ? (
          <g>
            <circle r="30" fill={INK} />
            <circle r="22" fill="none" stroke="#fff" strokeOpacity=".2" />
            <circle r="10" fill={w.trim} stroke={INK} strokeWidth="2" />
            <circle r="2.5" fill={INK} />
          </g>
        ) : glyph === 'frame' ? (
          <g transform="rotate(-4)">
            <rect x="-30" y="-24" width="60" height="48" fill="#fff" stroke={INK} strokeWidth="2.5" />
            <circle cx="-10" cy="-4" r="9" fill={w.trim} stroke={INK} strokeWidth="2" />
            <path d="M-2,16L12,-10L24,16Z" fill={w.facade} stroke={INK} strokeWidth="2" strokeLinejoin="round" />
          </g>
        ) : (
          <g>
            <path d="M-22,-10H22L18,26H-18Z" fill="#fff" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
            <path d="M-10,-10V-18A10,10 0 0 1 10,-18V-10" fill="none" stroke={INK} strokeWidth="2.5" />
          </g>
        )}
      </g>
      <rect x="262" y="136" width="70" height="97" fill={w.door} stroke={INK} strokeWidth="2.5" />
      <rect x="274" y="148" width="46" height="36" fill="#ffe9a8" stroke={INK} strokeWidth="2" />
      <circle cx="320" cy="200" r="3.5" fill={INK} />
      <text x="297" y="170" textAnchor="middle" fill={INK} style={{ font: '800 10px "IBM Plex Mono", monospace' }}>OPEN</text>
      {[[30, 232], [372, 232]].map(([x, y], i) => (
        <g key={i}>
          <path d={`M${x - 12},${y}L${x - 9},${y - 20}H${x + 9}L${x + 12},${y}Z`} fill="#c98b4b" stroke={INK} strokeWidth="2.2" />
          <circle cx={x - 6} cy={y - 28} r="10" fill="#3fbf6a" stroke={INK} strokeWidth="2" />
          <circle cx={x + 6} cy={y - 30} r="10" fill="#3fbf6a" stroke={INK} strokeWidth="2" />
          <circle cx={x} cy={y - 38} r="10" fill="#3fbf6a" stroke={INK} strokeWidth="2" />
        </g>
      ))}
    </svg>
  );
});
