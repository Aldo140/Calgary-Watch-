import { memo, useMemo } from 'react';
import { mix, moonPath, type SkyPalette } from '../../lib/sky';
import type { SkyIcon } from '../../lib/weatherCodes';

export type SkyVariant = 'mobile' | 'tablet' | 'desktop';

/** Extra sky above the city per layout, so the headline always sits in open sky
 * and the skyline sits below it (the SVG is anchored bottom-centre and sliced). */
/** `size` enlarges the plane, train and cyclist where the scene is drawn small. */
const VIEW: Record<SkyVariant, { y: number; moon: [number, number]; plane: number; size: { plane: number; train: number; bike: number } }> = {
  desktop: { y: -250, moon: [1330, 150], plane: 10, size: { plane: 1, train: 1, bike: 1 } },
  tablet: { y: -700, moon: [1260, -140], plane: -560, size: { plane: 1.6, train: 1.3, bike: 1.35 } },
  mobile: { y: -900, moon: [1110, -640], plane: 262, size: { plane: 2.4, train: 1.7, bike: 2.2 } },
};
const W = 1600, BASE = 705, RIVER = 712, BANK = 795;

function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const lift = (pts: number[][], k: number) => pts.map(([x, y]) => [x, Math.round(RIVER - (RIVER - y) * k)]);
const ridge = (pts: number[][]) => `M-20,${RIVER}L${pts.map(p => p.join(',')).join('L')}L1620,${RIVER}Z`;
const FAR = lift([[-20, 612], [80, 560], [140, 590], [220, 522], [300, 575], [360, 540], [430, 590], [520, 500], [600, 560], [680, 526], [760, 584], [850, 472], [930, 540], [1010, 506], [1090, 560], [1180, 482], [1260, 546], [1340, 500], [1420, 560], [1500, 516], [1620, 572]], 1.9);
const NEAR = lift([[-20, 652], [110, 610], [190, 642], [280, 592], [370, 636], [470, 600], [560, 650], [650, 616], [740, 656], [830, 602], [920, 646], [1010, 612], [1120, 660], [1210, 606], [1310, 652], [1400, 616], [1490, 656], [1620, 626]], 1.45);

/** Snow on each peak higher than `below`: a jagged cap a quarter of the way down each flank. */
function caps(pts: number[][], below: number) {
  const out: string[] = [];
  for (let i = 1; i < pts.length - 1; i++) {
    const [x, y] = pts[i], [lx, ly] = pts[i - 1], [rx, ry] = pts[i + 1];
    if (y > below || y > ly || y > ry) continue;
    const a = [x + (lx - x) * 0.3, y + (ly - y) * 0.3], b = [x + (rx - x) * 0.3, y + (ry - y) * 0.3];
    const at = (f: number, dy: number) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f + dy];
    const m1 = at(0.25, 7), m2 = at(0.5, -3), m3 = at(0.75, 8);
    out.push(`M${x},${y}L${a}L${m1}L${m2}L${m3}L${b}Z`);
  }
  return out.join('');
}

const box = (x: number, w: number, top: number) => `M${x},${BASE}V${top}H${x + w}V${BASE}Z`;
const BACK: [number, number, number][] = [[742, 40, 540], [784, 30, 478], [862, 22, 430], [944, 44, 408], [1034, 44, 386], [1146, 34, 402], [1200, 50, 432], [1250, 44, 482], [1296, 50, 540], [1344, 44, 590], [1392, 40, 626]];
const FRONT: [number, number, number][] = [[722, 44, 612], [770, 36, 566], [852, 30, 530], [972, 40, 486], [1062, 36, 506], [1118, 42, 548], [1196, 44, 526], [1242, 52, 584], [1296, 42, 616], [1336, 62, 646], [1400, 48, 664]];
const LANDMARKS = {
  suncorA: 'M880,705V312L935,286V705Z',
  suncorB: 'M938,705V350L972,334V705Z',
  bow: 'M990,705V288C996,270 1016,258 1040,252L1072,249V705Z',
  brookfield: 'M1086,705V252L1098,238H1142V705Z',
  telus: 'M1150,705V334H1158V322H1166V310H1176V300H1196V705Z',
};
const TREES_X = [30, 90, 150, 215, 270, 330, 380, 1180, 1236, 1300, 1370, 1440, 1510, 1570];

export const CalgarySky = memo(function CalgarySky({ palette: p, sun, phase, cloudCover, windKph, precip, variant, now }: {
  palette: SkyPalette;
  sun: { altitude: number; azimuth: number };
  phase: number;
  cloudCover: number;
  windKph: number;
  precip: SkyIcon | null;
  variant: SkyVariant;
  now: number;
}) {
  const view = VIEW[variant];
  const top = view.y;
  const skyH = RIVER - top;
  const night = p.darkness;
  const concrete = mix('#efe6d6', '#2e3656', night * 0.85);
  const granite = mix(p.cityLit, '#8a3f47', 0.45 - night * 0.2);
  const backFill = mix(p.city, p.horizon, 0.32);
  const frontFill = mix(p.city, '#000000', 0.12);

  // Sun: altitude is exact; its left–right travel is stylized from azimuth so
  // both sunrise (east) and sunset (west, over the Rockies) stay in frame.
  const sunX = 120 + Math.min(1, Math.max(0, (sun.azimuth - 70) / 220)) * 1360;
  const sunY = 690 - (sun.altitude / 65) * 640;
  const sunVisible = sun.altitude > -3;
  const sunThrough = 1 - Math.max(0, (cloudCover - 45) / 55) * 0.92; // cloud hides the disc
  const sunColor = mix('#ffb14e', '#fff6dc', Math.min(1, Math.max(0, sun.altitude / 20)));

  const stars = useMemo(() => {
    const r = rng(7);
    return Array.from({ length: 110 }, () => ({ x: r() * W, y: -900 + r() * 1420, s: 0.8 + r() * 1.8, d: r() * 4 }));
  }, []);
  const clouds = useMemo(() => {
    const r = rng(Math.round(cloudCover) + 11);
    const n = Math.round((cloudCover / 100) * 10);
    const yMin = variant === 'desktop' ? 30 : variant === 'tablet' ? -520 : -760;
    return Array.from({ length: n }, (_, i) => ({ x: ((i + r() * 0.8) / Math.max(1, n)) * 1700 - 80, y: yMin + r() * (430 - yMin), s: 0.55 + r() * 0.9, d: r() }));
  }, [cloudCover, variant]);
  const drops = useMemo(() => {
    const r = rng(3);
    return Array.from({ length: precip === 'snow' ? 90 : 130 }, () => ({ x: -100 + r() * 1800, y: r() * 900, s: r() }));
  }, [precip]);
  const trees = useMemo(() => {
    const r = rng(5);
    return TREES_X.map(x => ({ x: x + r() * 20, h: 40 + r() * 46, w: 16 + r() * 14, poplar: r() > 0.45 }));
  }, []);
  const drift = Math.max(40, 160 - windKph * 3);
  const layers = [-1800, -900, 0].filter(o => o + 900 > top);
  const wet = precip === 'rain' || precip === 'drizzle' || precip === 'storm';
  const lit = night > 0.2;

  return (
    <svg className="h-sky" viewBox={`0 ${top} ${W} ${900 - top}`} preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false" data-now={now}>
      <defs>
        <linearGradient id="hs-sky" x1="0" y1={top} x2="0" y2={RIVER} gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={p.top} /><stop offset=".62" stopColor={p.mid} /><stop offset="1" stopColor={p.horizon} />
        </linearGradient>
        <radialGradient id="hs-glow" cx={sunX} cy={sunY} r="320" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={sunColor} stopOpacity=".75" /><stop offset=".35" stopColor={p.horizon} stopOpacity=".25" /><stop offset="1" stopColor={p.horizon} stopOpacity="0" />
        </radialGradient>
        <linearGradient id="hs-haze" x1="0" y1="420" x2="0" y2={RIVER} gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={p.horizon} stopOpacity="0" /><stop offset="1" stopColor={p.horizon} stopOpacity=".55" />
        </linearGradient>
        <linearGradient id="hs-river" x1="0" y1={RIVER} x2="0" y2={BANK} gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={mix(p.horizon, p.city, 0.35)} /><stop offset="1" stopColor={mix(p.mid, p.ground, 0.6)} />
        </linearGradient>
        <pattern id="hs-win-d" width="12" height="16" patternUnits="userSpaceOnUse"><rect x="3" y="3" width="5" height="8" fill="#fff" opacity=".17" /></pattern>
        <pattern id="hs-win-n" width="36" height="48" patternUnits="userSpaceOnUse">
          <rect x="3" y="3" width="5" height="8" fill="#ffd27a" opacity=".8" /><rect x="15" y="3" width="5" height="8" fill="#ffd27a" opacity=".12" /><rect x="27" y="3" width="5" height="8" fill="#9fc4ff" opacity=".35" />
          <rect x="3" y="19" width="5" height="8" fill="#ffd27a" opacity=".1" /><rect x="15" y="19" width="5" height="8" fill="#ffe3a3" opacity=".65" /><rect x="27" y="19" width="5" height="8" fill="#ffd27a" opacity=".08" />
          <rect x="3" y="35" width="5" height="8" fill="#ffe3a3" opacity=".4" /><rect x="15" y="35" width="5" height="8" fill="#ffd27a" opacity=".06" /><rect x="27" y="35" width="5" height="8" fill="#ffd27a" opacity=".7" />
        </pattern>
        <pattern id="hs-diag" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M0,24L12,0L24,24" fill="none" stroke="#fff" strokeOpacity=".2" strokeWidth="1.2" /></pattern>
        <pattern id="hs-fins" width="8" height="10" patternUnits="userSpaceOnUse"><path d="M4,0V10" stroke="#fff" strokeOpacity=".14" strokeWidth="1.4" /></pattern>
        <pattern id="hs-helix" width="14" height="14" patternUnits="userSpaceOnUse"><path d="M0,0L14,14M14,0L0,14" stroke="#e2403a" strokeWidth="2.4" /></pattern>
        <linearGradient id="hs-trail" x1="-230" x2="-18" y1="0" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#fff" stopOpacity="0" /><stop offset="1" stopColor="#fff" stopOpacity=".75" /></linearGradient>
        <radialGradient id="hs-moonglow"><stop offset=".25" stopColor="#f6f1de" stopOpacity=".22" /><stop offset="1" stopColor="#f6f1de" stopOpacity="0" /></radialGradient>
        <clipPath id="hs-river-clip"><rect x="0" y={RIVER} width={W} height={BANK - RIVER} /></clipPath>
      </defs>

      <rect x="0" y={top} width={W} height={skyH} fill="url(#hs-sky)" />

      <g className="h-sky-stars" opacity={Math.max(0, night - 0.25) * (1 - cloudCover / 140)}>
        {stars.map((s, i) => <circle key={i} cx={s.x} cy={s.y} r={s.s} fill="#fff" style={{ animationDelay: `${s.d}s` }} />)}
      </g>

      {sunVisible ? (
        <g opacity={sunThrough}>
          <rect x="0" y={top} width={W} height={skyH} fill="url(#hs-glow)" />
          <circle cx={sunX} cy={sunY} r="40" fill={sunColor} />
        </g>
      ) : (
        <g className="h-sky-moon" opacity={Math.min(1, Math.max(0, night - 0.2) * 1.5) * (1 - cloudCover / 160)}>
          <circle cx={view.moon[0]} cy={view.moon[1]} r="110" fill="url(#hs-moonglow)" />
          <circle cx={view.moon[0]} cy={view.moon[1]} r="30" fill="#fff" opacity=".1" />
          <path d={moonPath(phase, view.moon[0], view.moon[1], 30)} fill="#f6f1de" />
        </g>
      )}

      <g className="h-sky-clouds" style={{ ['--drift' as string]: `${drift}s` }}>
        {clouds.map((c, i) => (
          <g key={i} transform={`translate(${c.x} ${c.y}) scale(${c.s})`}>
            <g className="h-cloud" style={{ animationDelay: `${-c.d * drift}s` }}>
              <ellipse cx="0" cy="0" rx="118" ry="24" fill={p.cloud} />
              <circle cx="-52" cy="-16" r="34" fill={p.cloud} />
              <circle cx="0" cy="-34" r="46" fill={p.cloud} />
              <circle cx="50" cy="-14" r="30" fill={p.cloud} />
              <ellipse cx="6" cy="12" rx="104" ry="11" fill={mix(p.cloud, p.top, 0.3)} opacity=".6" />
            </g>
          </g>
        ))}
      </g>

      {night < 0.45 && !precip ? (
        <g transform="translate(0 185)" stroke={mix(p.city, p.top, 0.2)} strokeWidth="1.8" fill="none" strokeLinecap="round">
          <g className="h-geese">
            {[[0, 0], [12, -5], [24, -10], [36, -15], [12, 5], [24, 10]].map(([x, y], i) => (
              <path key={i} className="h-goose" style={{ animationDelay: `${-i * 0.13}s` }} d={`M${x - 6},${y}q3,-4 6,0q3,-4 6,0`} />
            ))}
          </g>
        </g>
      ) : null}
      <g transform={`translate(0 ${view.plane})`}>
        <g className="h-plane"><g transform={`scale(${view.size.plane})`}>
          {night < 0.5 ? <path d="M-230,1H-18" stroke="url(#hs-trail)" strokeWidth="2.5" /> : null}
          <path d="M-18,0C-12,-2.6 8,-2.6 16,-1.2C19,-.6 19,.6 16,1.2C8,2.6 -12,2.6 -18,0Z" fill={mix(p.city, '#ffffff', 0.75 - night * 0.55)} />
          <path d="M-2,0L-8,-9H-4L6,0L-4,9H-8Z" fill={mix(p.city, '#ffffff', 0.6 - night * 0.45)} />
          <path d="M-17,0L-20,-6H-17L-12,0Z" fill={mix(p.city, '#ffffff', 0.6 - night * 0.45)} />
          {night > 0.3 ? <><circle className="h-strobe" cx="-7" cy="-9" r="1.8" fill="#ff5a4e" /><circle className="h-strobe h-strobe-2" cx="-7" cy="9" r="1.8" fill="#fff" /></> : null}
        </g></g>
      </g>

      <path d={ridge(FAR)} fill={p.far} />
      <path d={caps(FAR, 450)} fill={mix('#ffffff', p.top, 0.12 + night * 0.55)} />
      {/* Cloud settling into the far-right valleys, as it does along the Rockies; thicker as real cover rises. */}
      <g className="h-mist" fill={mix(p.cloud, p.far, 0.22)} opacity={0.72 + (cloudCover / 100) * 0.28}>
        <g transform="translate(1300 404)">
          <ellipse rx="150" ry="20" /><circle cx="-60" cy="-14" r="30" /><circle cx="-8" cy="-26" r="40" /><circle cx="52" cy="-12" r="28" />
        </g>
        <g transform="translate(1482 432) scale(1.15)">
          <ellipse rx="160" ry="22" /><circle cx="-70" cy="-12" r="28" /><circle cx="-18" cy="-28" r="42" /><circle cx="40" cy="-18" r="34" /><circle cx="92" cy="-8" r="24" />
        </g>
        <g transform="translate(1600 372)">
          <ellipse rx="90" ry="16" /><circle cx="-24" cy="-18" r="30" /><circle cx="22" cy="-10" r="24" />
        </g>
      </g>
      <g className="h-mist h-mist-slow" fill={mix(p.cloud, '#ffffff', 0.25)} opacity={0.55 + (cloudCover / 100) * 0.3}>
        <ellipse cx="1342" cy="330" rx="78" ry="9" />
        <ellipse cx="1330" cy="318" rx="46" ry="7" />
      </g>
      <path d={ridge(NEAR)} fill={p.near} />
      <path d={caps(NEAR, 560)} fill={mix('#ffffff', p.top, 0.22 + night * 0.55)} opacity=".85" />
      <rect x="0" y="420" width={W} height={RIVER - 420} fill="url(#hs-haze)" />
      <path d={`M-20,${RIVER}V696Q200,664 420,684T860,676T1300,688T1620,680V${RIVER}Z`} fill={p.hills} />

      <g id="hs-city">
        {BACK.map(([x, w, t]) => <path key={`b${x}`} d={box(x, w, t)} fill={backFill} />)}
        <path d={LANDMARKS.suncorA} fill={granite} />
        <path d={LANDMARKS.suncorB} fill={mix(granite, '#000', 0.12)} />
        <path d={LANDMARKS.bow} fill={p.cityLit} />
        <path d={LANDMARKS.bow} fill="url(#hs-diag)" />
        <path d={LANDMARKS.brookfield} fill={p.city} />
        <path d={LANDMARKS.brookfield} fill="url(#hs-fins)" />
        <path d={LANDMARKS.telus} fill={mix(p.cityLit, p.horizon, 0.15)} />
        {/* Calgary Tower */}
        <path d="M814,705L821,352H839L846,705Z" fill={concrete} />
        <path d="M830,705V352H839L846,705Z" fill={mix(concrete, '#000', 0.14)} />
        <path d="M821,356L806,336H854L839,356Z" fill={concrete} />
        <rect x="800" y="322" width="60" height="14" fill="#1b2a47" />
        <path d="M798,322L806,309H854L862,322Z" fill="#d8433f" />
        <rect x="815" y="297" width="30" height="12" fill={concrete} />
        <rect x="828.5" y="262" width="3" height="36" fill={concrete} />
        {FRONT.map(([x, w, t]) => <path key={`f${x}`} d={box(x, w, t)} fill={frontFill} />)}
        <path d="M1452,705V660Q1506,690 1560,660V705Z" fill={p.cityLit} />
        <path d="M1466,700V670M1486,700V676M1506,700V679M1526,700V676M1546,700V670" stroke={p.horizon} strokeOpacity=".25" strokeWidth="2" />
        <g opacity={1 - night}>
          {[...BACK.map(([x, w, t]) => box(x, w, t)), ...FRONT.map(([x, w, t]) => box(x, w, t)), LANDMARKS.suncorA, LANDMARKS.telus].map(d => <path key={d} d={d} fill="url(#hs-win-d)" />)}
        </g>
        {lit ? (
          <g opacity={night * 0.8}>
            {[...BACK.map(([x, w, t]) => box(x, w, t)), ...FRONT.map(([x, w, t]) => box(x, w, t)), LANDMARKS.suncorA, LANDMARKS.suncorB, LANDMARKS.brookfield, LANDMARKS.telus, LANDMARKS.bow].map(d => <path key={d} d={d} fill="url(#hs-win-n)" />)}
            <rect x="802" y="326" width="56" height="5" fill="#ffd27a" opacity=".9" />
            {[[1105, 238], [1056, 250], [830, 262]].map(([x, y]) => <circle key={x} className="h-sky-beacon" cx={x} cy={y - 4} r="3" fill="#ff4d4d" />)}
          </g>
        ) : null}
      </g>

      <rect x="0" y={RIVER - 8} width={W} height="10" fill={mix(p.hills, p.ground, 0.5)} />
      <path d={`M0,${RIVER - 7}H${W}`} stroke={mix(p.city, p.horizon, 0.3)} strokeWidth="1.5" />
      <g transform={`translate(0 ${RIVER - 7})`}>
        <g className="h-train"><g transform={`scale(${view.size.train})`}>
          {[0, 1, 2].map(i => (
            <g key={i} transform={`translate(${i * 50} 0)`}>
              <rect x="0" y="-13" width="47" height="12" rx="3" fill={mix('#eef0f2', '#39425e', night * 0.8)} />
              <rect x="0" y="-5" width="47" height="2.2" fill="#d8433f" />
              <rect x="5" y="-11" width="37" height="4" rx="1" fill={lit ? '#ffd27a' : mix(p.city, '#000000', 0.2)} opacity={lit ? 0.85 : 1} />
            </g>
          ))}
        </g></g>
      </g>
      <rect x="0" y={RIVER} width={W} height={BANK - RIVER} fill="url(#hs-river)" />
      <g clipPath="url(#hs-river-clip)" opacity=".28">
        <use href="#hs-city" transform={`translate(0 ${RIVER}) scale(1 -0.3) translate(0 ${-RIVER})`} />
      </g>
      {sunVisible && sun.altitude < 35 ? (
        <g className="h-sky-glint" stroke={sunColor} strokeWidth="3" strokeLinecap="round" opacity=".7">
          {[0, 1, 2, 3, 4, 5, 6].map(i => <path key={i} d={`M${sunX - 34 + (i % 3) * 18 - i * 2},${RIVER + 10 + i * 11}h${40 - i * 4}`} />)}
        </g>
      ) : null}
      <g className="h-ripples" stroke="#fff" strokeOpacity=".16" strokeWidth="2" strokeLinecap="round">
        <path d="M120,730h60M340,748h90M980,736h70M1260,756h110M620,778h80M1460,774h60" />
      </g>

      {/* Peace Bridge: a red helix tube from the near bank to the far one, in perspective.
          The near end dips below the shoreline so the bank (drawn next) anchors it. */}
      <path d="M724,714L790,714L786,709L728,709Z" fill={mix('#efe6d6', p.ground, 0.35 + night * 0.4)} />
      <path d="M506,812Q640,750 734,716L792,716Q690,760 626,812Z" fill={mix('#0b1a2a', p.ground, 0.4)} opacity=".3" transform="translate(16 8)" />
      <path d="M510,808Q640,748 736,712L778,712Q684,756 618,808Z" fill={mix('#efe6d6', p.ground, night * 0.6)} />
      <path d="M510,808Q640,748 736,712L736,697Q640,728 510,768Z" fill="url(#hs-helix)" opacity=".5" />
      <g className="h-cyclist" fill="none" stroke={mix(p.city, '#000000', 0.3)} strokeWidth="1.6" strokeLinecap="round"><g transform={`scale(${view.size.bike})`}>
        <circle cx="-5" cy="-3.5" r="3.3" /><circle cx="5" cy="-3.5" r="3.3" />
        <path d="M-5,-3.5L-1,-8L4,-8L5,-3.5M-1,-8L-3,-12M-3,-12L1,-17M1,-17L4,-10" />
        <circle cx="2" cy="-19.5" r="2.2" fill={mix(p.city, '#000000', 0.3)} stroke="none" />
      </g></g>
      <path d="M618,808Q684,756 778,712L778,697Q690,736 618,768Z" fill="url(#hs-helix)" />
      <path d="M510,768Q564,748 618,768Q690,736 778,697Q757,690 736,697Q640,728 510,768Z" fill="url(#hs-helix)" />
      <g fill="none" stroke="#e2403a" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round">
        <path d="M618,808Q684,756 778,712M618,768Q690,736 778,697M510,768Q640,728 736,697M736,697Q757,690 778,697V712" />
        <path d="M510,812V768Q564,748 618,768V812" strokeWidth="3.5" />
      </g>

      <path d={`M-20,800Q300,786 620,796T1300,794T1620,800V900H-20Z`} fill={p.ground} />
      <path d="M-20,842Q400,826 800,840T1620,836" fill="none" stroke={mix('#efe6d6', p.ground, 0.55 + night * 0.3)} strokeWidth="5" />
      <path d="M544,836Q548,820 554,808L598,808Q606,820 610,836Q578,832 544,836Z" fill={mix('#efe6d6', p.ground, 0.55 + night * 0.3)} />
      {trees.map((t, i) => (
        <g key={i} fill={mix(p.ground, i % 2 ? p.hills : '#000000', 0.35)}>
          <rect x={t.x - 2} y={800 - t.h * 0.3} width="4" height={t.h * 0.3 + 4} />
          {t.poplar
            ? <ellipse cx={t.x} cy={800 - t.h * 0.62} rx={t.w * 0.45} ry={t.h * 0.46} />
            : <><circle cx={t.x - t.w * 0.3} cy={800 - t.h * 0.45} r={t.w * 0.55} /><circle cx={t.x + t.w * 0.3} cy={800 - t.h * 0.55} r={t.w * 0.6} /><circle cx={t.x} cy={800 - t.h * 0.75} r={t.w * 0.55} /></>}
        </g>
      ))}

      {precip && precip !== 'fog' && precip !== 'cloud' && precip !== 'sun' && precip !== 'moon' && precip !== 'partly' ? (
        <g className={`h-sky-precip h-sky-${precip === 'snow' ? 'snow' : 'rain'}`}>
          {layers.map(o => (
            <g key={o} transform={`translate(0 ${o})`}>
              {drops.map((d, i) => precip === 'snow'
                ? <circle key={i} cx={d.x} cy={d.y} r={2 + d.s * 3} fill="#fff" opacity={0.55 + d.s * 0.4} />
                : <path key={i} d={`M${d.x},${d.y}l-7,${22 + d.s * 12}`} stroke="#dbe8f5" strokeOpacity={0.35 + d.s * 0.35} strokeWidth="1.8" strokeLinecap="round" />)}
            </g>
          ))}
        </g>
      ) : null}
      {precip === 'storm' ? <rect className="h-sky-flash" x="0" y={top} width={W} height={900 - top} fill="#fff" /> : null}
      {precip === 'fog' ? <rect x="0" y={top} width={W} height={900 - top} fill={p.horizon} opacity=".4" /> : null}
      {wet ? <rect x="0" y={top} width={W} height={900 - top} fill={p.mid} opacity=".12" /> : null}
    </svg>
  );
});
