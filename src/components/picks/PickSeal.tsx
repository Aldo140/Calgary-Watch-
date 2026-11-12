import { useId } from 'react';

/**
 * The CalgaryWatch Pick seal: a stamped round mark, like a licence sticker on
 * a van window. `live` is the earned seal (yellow on navy, the year it was
 * vetted); `open` is the dashed "vetting" outline the slot shows until then.
 */
export function PickSeal({ state = 'live', year = '2026', size = 112, checks = 7, of = 7 }: { state?: 'live' | 'open'; year?: string; size?: number; checks?: number; of?: number }) {
  const id = useId().replace(/:/g, '');
  const live = state === 'live';
  const ring = 'CALGARYWATCH PICK · VETTED IN CALGARY · ';
  const r = 42;
  const arc = (Math.PI * 2 * 31) * Math.min(1, checks / of);
  return (
    <svg className={`pk-seal${live ? ' is-live' : ' is-open'}`} viewBox="0 0 120 120" width={size} height={size} role="img" aria-label={live ? `CalgaryWatch Pick, vetted ${year}` : `CalgaryWatch Pick: vetting, ${checks} of ${of} checks`}>
      <defs><path id={`${id}-c`} d={`M60 60m-${r} 0a${r} ${r} 0 1 1 ${r * 2} 0a${r} ${r} 0 1 1 -${r * 2} 0`} /></defs>
      {/* Scalloped edge, like a pressed seal. */}
      <path className="pk-seal-edge" d={Array.from({ length: 24 }, (_, i) => {
        const a = (i / 24) * Math.PI * 2, b = ((i + 0.5) / 24) * Math.PI * 2;
        return `${i ? 'L' : 'M'}${(60 + 58 * Math.cos(a)).toFixed(2)} ${(60 + 58 * Math.sin(a)).toFixed(2)}L${(60 + 53 * Math.cos(b)).toFixed(2)} ${(60 + 53 * Math.sin(b)).toFixed(2)}`;
      }).join('') + 'Z'} />
      <circle className="pk-seal-inner" cx="60" cy="60" r="34" />
      <text className="pk-seal-ring"><textPath href={`#${id}-c`} startOffset="0" textLength={Math.floor(Math.PI * 2 * r) - 2} lengthAdjust="spacing">{ring}</textPath></text>
      {live ? (
        <>
          <path className="pk-seal-check" d="M45 60l10 10 20-22" />
          <text className="pk-seal-year" x="60" y="86" textAnchor="middle">{year}</text>
        </>
      ) : (
        <>
          <circle className="pk-seal-track" cx="60" cy="60" r="31" />
          <circle className="pk-seal-progress" cx="60" cy="60" r="31" strokeDasharray={`${arc} 999`} transform="rotate(-90 60 60)" />
          <text className="pk-seal-count" x="60" y="62" textAnchor="middle">{checks}/{of}</text>
          <text className="pk-seal-sub" x="60" y="76" textAnchor="middle">VETTING</text>
        </>
      )}
    </svg>
  );
}
