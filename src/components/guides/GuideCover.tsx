import type { CSSProperties } from 'react';
import type { Guide, GuideCover as Cover } from '../../types/discovery';

const FALLBACK: Cover = { from: '#1e3264', to: '#509bf5', ink: '#ffffff', motif: 'skyline', label: 'Guide' };

/** Drawn motifs, one per guide, in a 100×100 box. Everything is ink on the cover's wash. */
function Motif({ motif }: { motif: Cover['motif'] }) {
  switch (motif) {
    case 'river':
      return (
        <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          {[0, 1, 2, 3, 4, 5].map(i => (
            <path key={i} d={`M-10 ${22 + i * 9} C 15 ${10 + i * 9}, 35 ${36 + i * 9}, 60 ${22 + i * 9} S 95 ${12 + i * 9}, 115 ${24 + i * 9}`}
              fill="none" stroke="currentColor" strokeWidth={i === 2 ? 3.2 : 1.2} strokeLinecap="round" opacity={i === 2 ? 0.95 : 0.28 + i * 0.05} />
          ))}
          {/* The Peace Bridge, a red helix in reality, a single arc here. */}
          <path d="M58 41 Q 72 30 86 41" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          <circle cx="22" cy="28" r="2.4" fill="currentColor" />
        </svg>
      );
    case 'market':
      return (
        <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <path d="M8 34 L92 34 L84 20 L16 20 Z" fill="currentColor" opacity=".9" />
          {[0, 1, 2, 3, 4, 5].map(i => <path key={i} d={`M${16 + i * 14} 34 q7 9 14 0`} fill="currentColor" opacity=".9" />)}
          {Array.from({ length: 18 }, (_, i) => {
            const col = i % 6; const row = Math.floor(i / 6);
            return <circle key={i} cx={18 + col * 13 + (row % 2) * 6} cy={50 + row * 11} r={3.4 + ((i * 7) % 4) * 0.7} fill="currentColor" opacity={0.35 + ((i * 3) % 5) * 0.12} />;
          })}
        </svg>
      );
    case 'brick':
      return (
        <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          {Array.from({ length: 9 }, (_, row) => Array.from({ length: 6 }, (_, col) => (
            <rect key={`${row}-${col}`} x={col * 20 - (row % 2) * 10 - 4} y={row * 11 - 2} width="18" height="9" rx="1" fill="currentColor" opacity={0.1 + (((row * 5 + col * 3) % 7) * 0.035)} />
          )))}
          {/* An arched storefront window, the shape 9 Avenue SE is made of. */}
          <path d="M60 92 V58 a14 14 0 0 1 28 0 V92 Z" fill="none" stroke="currentColor" strokeWidth="2.6" />
          <path d="M74 44 V92 M60 70 H88" stroke="currentColor" strokeWidth="1.4" opacity=".7" />
        </svg>
      );
    case 'free':
      return (
        <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          {Array.from({ length: 16 }, (_, i) => {
            const a = (i / 16) * Math.PI * 2;
            return <line key={i} x1={74 + Math.cos(a) * 12} y1={30 + Math.sin(a) * 12} x2={74 + Math.cos(a) * 60} y2={30 + Math.sin(a) * 60} stroke="currentColor" strokeWidth={i % 2 ? 0.8 : 2} opacity={i % 2 ? 0.25 : 0.45} />;
          })}
          <circle cx="74" cy="30" r="9" fill="currentColor" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <path d="M0 100 V70 h10 V55 h8 V64 h9 V40 h7 V30 h3 V40 h6 V60 h10 V48 h9 V66 h12 V52 h8 V72 h18 V100 Z" fill="currentColor" opacity=".55" />
        </svg>
      );
  }
}

/**
 * A guide's cover: typographic, album-style, drawn rather than photographed, so a
 * guide never leans on a stock image. Sized by its container, so the same cover
 * works as a 44px thumbnail and a 320px hero.
 */
export function GuideCover({ guide, size = 'card', number }: { guide: Guide; size?: 'hero' | 'card' | 'mini'; number?: number }) {
  const c = guide.cover ?? FALLBACK;
  const style = { '--from': c.from, '--to': c.to, '--ink': c.ink } as CSSProperties;
  const big = c.motif === 'free' ? '$0' : number !== undefined ? String(number).padStart(2, '0') : undefined;
  return (
    <div className={`gd-cover is-${size} is-${c.motif}`} style={style} aria-hidden="true">
      <Motif motif={c.motif} />
      <span className="gd-cover-label">{c.label}</span>
      {big && <span className="gd-cover-big">{big}</span>}
      <span className="gd-cover-title">{guide.title}</span>
      <span className="gd-cover-brand">CalgaryWatch Guides</span>
    </div>
  );
}
