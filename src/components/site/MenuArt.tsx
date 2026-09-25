/** Small tile artworks for the phone menu, in the homepage board style (2px ink, flat colour). */
const INK = '#151515';
const S = { stroke: INK, strokeWidth: 2.5, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };

export type MenuArtKind = 'events' | 'markets' | 'neighbourhoods' | 'guides' | 'local' | 'community' | 'mail';

export function MenuArt({ kind }: { kind: MenuArtKind }) {
  return (
    <svg className="cw-menu-art" viewBox="0 0 80 64" aria-hidden="true" focusable="false">
      {kind === 'events' ? (
        <g transform="rotate(-8 40 32)">
          <path d="M10,14H70V26A6,6 0 0 0 70,38V50H10V38A6,6 0 0 0 10,26Z" fill="#1554d1" {...S} />
          <path d="M30,16V48" stroke="#fff" strokeWidth="2" strokeDasharray="3 3" />
          <path d="M16,26h8M16,32h6M16,38h8" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M50,21l2.6,5.3 5.8.8-4.2,4.1 1,5.8-5.2-2.7-5.2,2.7 1-5.8-4.2-4.1 5.8-.8Z" fill="#ffdf4f" stroke={INK} strokeWidth="1.8" strokeLinejoin="round" />
        </g>
      ) : kind === 'markets' ? (
        <g>
          <rect x="14" y="30" width="52" height="24" fill="#fff" {...S} />
          {[0, 1, 2, 3, 4].map(i => <rect key={i} x={10 + i * 12} y="12" width="12" height="14" fill={i % 2 ? '#fff' : '#1554d1'} />)}
          {[0, 1, 2, 3, 4].map(i => <path key={i} d={`M${10 + i * 12},26a6,6 0 0 0 12,0Z`} fill={i % 2 ? '#fff' : '#1554d1'} {...S} />)}
          <rect x="10" y="12" width="60" height="14" fill="none" {...S} />
          <circle cx="28" cy="42" r="5" fill="#ff8a3d" {...S} /><circle cx="40" cy="42" r="5" fill="#3fbf6a" {...S} /><circle cx="52" cy="42" r="5" fill="#e2573d" {...S} />
        </g>
      ) : kind === 'neighbourhoods' ? (
        <g>
          <rect x="8" y="8" width="64" height="48" rx="6" fill="#faf8f3" {...S} />
          <rect x="40" y="32" width="32" height="24" fill="#ffdf4f" />
          <rect x="8" y="8" width="64" height="48" rx="6" fill="none" {...S} />
          <path d="M40,8V56M8,32H72" stroke={INK} strokeWidth="1.5" strokeDasharray="3 3" />
          <path d="M6,22C20,20 30,34 44,30S62,40 74,50" fill="none" stroke="#00c2e0" strokeWidth="5" strokeLinecap="round" />
          <path d="M56,46C52,41 50,38 50,35A6,6 0 1 1 62,35C62,38 60,41 56,46Z" fill="#1554d1" {...S} />
        </g>
      ) : kind === 'guides' ? (
        <g>
          <path d="M10,14L28,8L46,14L66,8V50L46,56L28,50L10,56Z" fill="#fff" {...S} />
          <path d="M28,8V50M46,14V56" stroke={INK} strokeWidth="1.5" opacity=".5" />
          <path d="M16,46C22,34 30,40 36,30S50,20 58,18" fill="none" stroke="#e2403a" strokeWidth="2.5" strokeDasharray="4 4" strokeLinecap="round" />
          <circle cx="16" cy="46" r="4" fill="#ffdf4f" {...S} />
          <path d="M58,24C55,20 53,18 53,15.5A5,5 0 1 1 63,15.5C63,18 61,20 58,24Z" fill="#e2403a" {...S} />
        </g>
      ) : kind === 'local' ? (
        <g>
          <rect x="12" y="20" width="56" height="36" fill="#1f8a4c" {...S} />
          <rect x="8" y="12" width="64" height="8" fill="#ffdf4f" {...S} />
          {[0, 1, 2, 3, 4, 5].map(i => <path key={i} d={`M${12 + i * 9.33},20a4.66,4.66 0 0 0 9.33,0Z`} fill={i % 2 ? '#1f8a4c' : '#fff'} {...S} strokeWidth={2} />)}
          <rect x="18" y="32" width="24" height="16" fill="#ffe9a8" {...S} />
          <rect x="48" y="32" width="14" height="24" fill="#ffdf4f" {...S} />
          <path d="M26,40h6v4a3,3 0 0 1-6,0Z" fill="#fff" stroke={INK} strokeWidth="1.8" />
        </g>
      ) : kind === 'community' ? (
        <g>
          <circle cx="40" cy="32" r="26" fill="#0d2447" stroke="#00c2e0" strokeWidth="2" />
          <circle cx="40" cy="32" r="17" fill="none" stroke="rgba(255,255,255,.25)" />
          <circle cx="40" cy="32" r="8" fill="none" stroke="rgba(255,255,255,.25)" />
          <g className="cw-menu-sweep"><path d="M40,32 L40,6 A26,26 0 0 1 58.4,13.6 Z" fill="rgba(0,194,224,.45)" /></g>
          <circle cx="52" cy="22" r="3.5" fill="#ff5a4e" stroke="#fff" strokeWidth="1.5" />
          <circle cx="30" cy="42" r="3" fill="#ffdf4f" stroke="#fff" strokeWidth="1.5" />
          <circle cx="40" cy="32" r="2.5" fill="#00c2e0" />
        </g>
      ) : (
        <g transform="rotate(-6 40 32)">
          <rect x="10" y="14" width="60" height="38" rx="5" fill="#fff" {...S} />
          <path d="M11,16L40,36L69,16" fill="none" {...S} />
          <rect x="54" y="20" width="10" height="12" fill="#ffdf4f" stroke={INK} strokeWidth="1.8" strokeDasharray="2 1.5" />
        </g>
      )}
    </svg>
  );
}
