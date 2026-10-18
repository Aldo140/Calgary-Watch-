import type { CSSProperties, ReactNode } from 'react';
import type { Shelf, ShelfId } from '../../lib/localShelves';
import { initials } from '../../lib/localShelves';

const MARK = '/images/brand/calgarywatch-city-spark-v2.webp';

/** Hash a profile id to a small number, so each cover's drawing is shifted its own way. */
const seedOf = (id: string) => [...id].reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) >>> 0, 7);

/** One drawn motif per shelf, in a 100×100 box, ink on the shelf colour. */
function Motif({ shelf, seed }: { shelf: ShelfId; seed: number }) {
  const s = (k: number) => ((seed >> k) & 7) / 7;
  let art: ReactNode;
  switch (shelf) {
    case 'stages':
      art = <>
        {/* Curtains, a proscenium arch and two spotlights crossing the stage. */}
        <path d="M0 0 H100 V10 Q75 18 50 10 Q25 18 0 10 Z" opacity=".9" />
        {[0, 1, 2, 3].map(i => <path key={i} d={`M${i * 6} 8 Q${i * 6 + 4} 50 ${i * 6 - 2} 100 H${i * 6 + 5} Q${i * 6 + 8} 50 ${i * 6 + 5} 8 Z`} opacity={0.55 - i * 0.1} />)}
        {[0, 1, 2, 3].map(i => <path key={`r${i}`} d={`M${100 - i * 6} 8 Q${96 - i * 6} 50 ${102 - i * 6} 100 H${95 - i * 6} Q${92 - i * 6} 50 ${95 - i * 6} 8 Z`} opacity={0.55 - i * 0.1} />)}
        <path d={`M${30 + s(0) * 10} 12 L${18 + s(3) * 8} 92 L${58 + s(3) * 8} 92 Z`} opacity=".14" />
        <path d={`M${70 - s(2) * 10} 12 L${44 - s(1) * 8} 92 L${84 - s(1) * 8} 92 Z`} opacity=".14" />
        <path d="M0 92 H100 V100 H0 Z" opacity=".85" />
      </>;
      break;
    case 'culture':
      art = <>
        {/* A gallery wall: frames hung salon-style, one of them catching the light. */}
        {[[12, 14, 26, 32], [44, 10, 20, 22], [70, 16, 22, 30], [44, 38, 20, 16], [14, 52, 18, 18], [70, 52, 18, 24]].map(([x, y, w, h], i) => (
          <g key={i} opacity={i === (seed % 6) ? 0.95 : 0.4}>
            <rect x={x} y={y} width={w} height={h} rx="1.5" fill="none" stroke="currentColor" strokeWidth="2.2" />
            <rect x={x + 3} y={y + 3} width={w - 6} height={h - 6} rx="1" opacity=".35" />
          </g>
        ))}
        <path d="M0 84 H100" stroke="currentColor" strokeWidth="1.6" opacity=".5" />
        {[0, 1, 2, 3, 4, 5, 6].map(i => <rect key={`c${i}`} x={6 + i * 14} y="86" width="5" height="14" opacity=".28" />)}
      </>;
      break;
    case 'markets':
      art = <>
        {/* A market awning and a table of produce. */}
        <path d="M6 22 L94 22 L86 8 L14 8 Z" opacity=".9" />
        {[0, 1, 2, 3, 4, 5].map(i => <path key={i} d={`M${6 + i * 14.7} 22 q7.3 10 14.7 0`} opacity={i % 2 ? 0.5 : 0.9} />)}
        {Array.from({ length: 21 }, (_, i) => {
          const col = i % 7; const row = Math.floor(i / 7);
          return <circle key={`p${i}`} cx={12 + col * 12.6 + (row % 2) * 5} cy={52 + row * 10} r={3.6 + ((i * 7 + seed) % 4) * 0.7} opacity={0.3 + (((i * 3 + seed) % 5) * 0.12)} />;
        })}
        <path d="M4 78 H96 V84 H4 Z" opacity=".85" />
      </>;
      break;
    case 'coffee':
      art = <>
        {/* A cup and saucer with steam rising in three curls. */}
        {[0, 1, 2].map(i => <path key={i} d={`M${38 + i * 12} 40 c-6 -8 6 -12 0 -20 s 6 -12 0 -20`} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" opacity={0.35 + i * 0.15} />)}
        <path d="M28 46 H76 V62 a22 22 0 0 1 -48 0 Z" opacity=".85" />
        <path d="M76 52 h6 a8 8 0 0 1 0 16 h-8" fill="none" stroke="currentColor" strokeWidth="3" opacity=".85" />
        <ellipse cx="52" cy="86" rx="36" ry="6" opacity=".5" />
        {Array.from({ length: 12 }, (_, i) => <ellipse key={`b${i}`} cx={(i * 37 + seed) % 100} cy={(i * 53 + seed * 3) % 100} rx="2.6" ry="1.6" transform={`rotate(${(i * 40) % 180} ${(i * 37 + seed) % 100} ${(i * 53 + seed * 3) % 100})`} opacity=".22" />)}
      </>;
      break;
    case 'days-out':
      art = <>
        {/* A Ferris wheel turning over a little crowd. */}
        <g className="pc-wheel" style={{ transformOrigin: '62px 46px' }}>
          <circle cx="62" cy="46" r="32" fill="none" stroke="currentColor" strokeWidth="2.4" opacity=".8" />
          <circle cx="62" cy="46" r="22" fill="none" stroke="currentColor" strokeWidth="1.2" opacity=".5" />
          {Array.from({ length: 10 }, (_, i) => {
            const a = (i / 10) * Math.PI * 2;
            return <g key={i}>
              <line x1="62" y1="46" x2={62 + Math.cos(a) * 32} y2={46 + Math.sin(a) * 32} stroke="currentColor" strokeWidth="1" opacity=".55" />
              <rect x={62 + Math.cos(a) * 32 - 3} y={46 + Math.sin(a) * 32 - 2} width="6" height="5" rx="1.2" opacity=".85" />
            </g>;
          })}
        </g>
        <path d="M62 46 L46 92 M62 46 L78 92" stroke="currentColor" strokeWidth="2.6" />
        <path d="M0 92 H100 V100 H0 Z" opacity=".8" />
        {Array.from({ length: 8 }, (_, i) => <circle key={`h${i}`} cx={6 + i * 5 + (i % 2)} cy={88 - (i % 3)} r="2.2" opacity=".5" />)}
      </>;
      break;
    case 'community':
      art = <>
        {/* A street of houses with their lights on. */}
        {Array.from({ length: 6 }, (_, i) => {
          const x = i * 17 - 2; const h = 26 + ((i * 5 + seed) % 4) * 6; const y = 92 - h;
          return <g key={i} opacity={0.45 + ((i + seed) % 3) * 0.2}>
            <path d={`M${x} ${y} L${x + 8} ${y - 10} L${x + 16} ${y} V92 H${x} Z`} />
          </g>;
        })}
        {Array.from({ length: 6 }, (_, i) => <rect key={`w${i}`} x={i * 17 + 3} y="74" width="5" height="5" rx=".6" className="pc-lit" />)}
        <path d="M0 92 H100 V100 H0 Z" opacity=".85" />
        {Array.from({ length: 5 }, (_, i) => <circle key={`s${i}`} cx={10 + i * 21} cy={14 + ((i * 7 + seed) % 12)} r="1.2" opacity=".55" />)}
      </>;
      break;
    case 'day-trips':
      art = <>
        {/* Rows of crops running to the foothills, and the sun over them. */}
        <circle cx={70 + s(1) * 10} cy="22" r="10" opacity=".85" />
        <path d="M0 48 L18 34 L30 42 L46 26 L62 40 L76 30 L100 46 V56 H0 Z" opacity=".45" />
        {Array.from({ length: 8 }, (_, i) => <path key={i} d={`M50 56 L${-40 + i * 26} 100`} stroke="currentColor" strokeWidth={1.6 + i % 2} opacity=".55" />)}
        <path d="M0 56 H100" stroke="currentColor" strokeWidth="2" opacity=".7" />
      </>;
      break;
    default:
      art = <>
        {/* A sky of snowflakes and stars for the seasonal shelf. */}
        {Array.from({ length: 14 }, (_, i) => {
          const x = (i * 29 + seed) % 96 + 2; const y = (i * 47 + seed * 3) % 90 + 4; const r = 2 + (i % 3) * 1.6;
          return <g key={i} stroke="currentColor" strokeWidth=".9" opacity={0.3 + (i % 4) * 0.15}>
            <line x1={x - r} y1={y} x2={x + r} y2={y} /><line x1={x} y1={y - r} x2={x} y2={y + r} />
            <line x1={x - r * .7} y1={y - r * .7} x2={x + r * .7} y2={y + r * .7} /><line x1={x - r * .7} y1={y + r * .7} x2={x + r * .7} y2={y - r * .7} />
          </g>;
        })}
        <path d="M0 100 V84 h8 V74 h6 V80 h8 V64 h5 V58 h3 V64 h5 V78 h9 V70 h8 V82 h12 V72 h8 V86 h28 V100 Z" opacity=".6" />
      </>;
  }
  return <svg className="pc-art" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" fill="currentColor" aria-hidden="true" focusable="false">{art}</svg>;
}

/**
 * A profile's cover: drawn, album-style, the same way guides get theirs, so every
 * profile has a striking piece of art whether or not it sent us a photo. Its shelf
 * picks the colour and the drawing; its initials and name make it its own.
 */
export function ProfileCover({ id, title, shelf, number, stamp, mini }: { id: string; title: string; shelf: Shelf; number?: number; stamp?: string; mini?: boolean }) {
  const seed = seedOf(id);
  const style = { '--tone': shelf.tone, '--tink': shelf.ink, '--tilt': `${((seed % 5) - 2) * 0.6}deg` } as CSSProperties;
  return (
    <div className={`pc pc-${shelf.id}${mini ? ' is-mini' : ''}`} style={style} aria-hidden="true">
      <Motif shelf={shelf.id} seed={seed} />
      <span className="pc-mark"><img src={MARK} alt="" width="40" height="40" loading="lazy" />Local</span>
      {number ? <span className="pc-no">No. {String(number).padStart(2, '0')}</span> : null}
      <span className="pc-big">{initials(title)}</span>
      {stamp ? <span className="pc-stamp">{stamp}</span> : null}
      <span className="pc-foot"><small>{shelf.label}</small><b>{title}</b></span>
    </div>
  );
}
