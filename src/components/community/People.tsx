/**
 * Neighbour illustrations in the logo's sticker style: thick navy outlines, flat
 * cyan / yellow / red fills, a cream sticker border (added in CSS via .cw-sticker).
 */
const NAVY = '#0a1a33';
const S = { stroke: NAVY, strokeWidth: 3.5, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };

type Hair = 'toque' | 'cap' | 'long' | 'short' | 'bun';
type Pose = 'phone' | 'wave' | 'letter' | 'none';

export interface PersonProps {
  skin?: string; hairColor?: string; hair?: Hair; hat?: string; band?: string;
  jacket?: string; pose?: Pose; x?: number; y?: number; scale?: number; flip?: boolean;
}

function Arm({ from, to, jacket, skin }: { from: [number, number]; to: [number, number]; jacket: string; skin: string }) {
  const d = `M${from[0]},${from[1]} Q${(from[0] + to[0]) / 2 + 10},${(from[1] + to[1]) / 2 + 8} ${to[0]},${to[1]}`;
  return (
    <g>
      <path d={d} fill="none" stroke={NAVY} strokeWidth="31" strokeLinecap="round" />
      <path d={d} fill="none" stroke={jacket} strokeWidth="23" strokeLinecap="round" />
      <circle cx={to[0]} cy={to[1] - 4} r="12" fill={skin} {...S} />
    </g>
  );
}

/** A head-and-shoulders neighbour, 200 x 220 units. */
export function Person({ skin = '#f2c29b', hairColor = '#3b2416', hair = 'toque', hat = '#f0503c', band = '#ffd23f', jacket = '#19c3e6', pose = 'none', x = 0, y = 0, scale = 1, flip = false }: PersonProps) {
  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -scale : scale} ${scale})${flip ? ' translate(-200 0)' : ''}`}>
      {hair === 'long' ? <path d="M58,100 C52,50 148,50 142,100 L148,150 Q100,160 52,150 Z" fill={hairColor} {...S} /> : null}
      <path d="M32,222 C32,166 62,146 100,146 C138,146 168,166 168,222 Z" fill={jacket} {...S} />
      <path d="M100,152 V222" {...S} fill="none" />
      <path d="M78,150 L100,172 L122,150" fill="none" {...S} />
      <rect x="88" y="120" width="24" height="32" rx="8" fill={skin} {...S} />
      <circle cx="63" cy="102" r="8" fill={skin} {...S} />
      <circle cx="137" cy="102" r="8" fill={skin} {...S} />
      <circle cx="100" cy="98" r="37" fill={skin} {...S} />
      <ellipse cx="80" cy="110" rx="7" ry="4.5" fill="#f0503c" opacity=".35" />
      <ellipse cx="120" cy="110" rx="7" ry="4.5" fill="#f0503c" opacity=".35" />
      <circle cx="87" cy="100" r="4.2" fill={NAVY} />
      <circle cx="113" cy="100" r="4.2" fill={NAVY} />
      <path d="M89,115 Q100,125 111,115" fill="none" {...S} />
      {hair === 'toque' ? (
        <g>
          <path d="M62,94 C60,48 140,48 138,94 Z" fill={hat} {...S} />
          <rect x="59" y="82" width="82" height="17" rx="8.5" fill={band} {...S} />
          <circle cx="100" cy="50" r="10" fill={band} {...S} />
        </g>
      ) : hair === 'cap' ? (
        <g>
          <path d="M64,90 C62,54 138,54 136,90 Z" fill={hat} {...S} />
          <path d="M118,86 L166,88 Q166,98 156,99 L116,96 Z" fill={hat} {...S} />
          <circle cx="100" cy="58" r="4" fill={band} />
        </g>
      ) : hair === 'bun' ? (
        <g>
          <circle cx="100" cy="52" r="15" fill={hairColor} {...S} />
          <path d="M63,96 C62,58 138,58 137,96 C124,80 96,74 63,96 Z" fill={hairColor} {...S} />
        </g>
      ) : (
        <path d="M63,94 C60,56 140,56 137,94 C122,78 92,72 63,94 Z" fill={hairColor} {...S} />
      )}
      {pose === 'phone' ? (
        <g>
          <Arm from={[146, 182]} to={[160, 118]} jacket={jacket} skin={skin} />
          <g transform="rotate(10 164 88)">
            <rect x="146" y="58" width="36" height="58" rx="8" fill={NAVY} />
            <rect x="151" y="65" width="26" height="42" rx="3" fill="#fffbe9" />
            <path d="M164,96 C159,90 157,87 157,84 A7,7 0 1 1 171,84 C171,87 169,90 164,96 Z" fill="#f0503c" />
            <circle cx="164" cy="84" r="2.6" fill="#fffbe9" />
          </g>
          <circle cx="152" cy="114" r="6" fill={skin} {...S} />
        </g>
      ) : pose === 'wave' ? (
        <g>
          <Arm from={[56, 182]} to={[36, 112]} jacket={jacket} skin={skin} />
          <path d="M28,98 L26,86 M36,94 L36,82 M44,98 L46,86" {...S} fill="none" />
        </g>
      ) : pose === 'letter' ? (
        <g>
          <g transform="rotate(-6 100 188)">
            <rect x="64" y="166" width="72" height="46" rx="4" fill="#fffbe9" {...S} />
            <path d="M64,168 L100,194 L136,168" fill="none" {...S} />
            <rect x="118" y="172" width="12" height="14" fill="#ffd23f" stroke={NAVY} strokeWidth="2" />
          </g>
          <circle cx="62" cy="196" r="11" fill={skin} {...S} />
          <circle cx="138" cy="190" r="11" fill={skin} {...S} />
        </g>
      ) : null}
    </g>
  );
}

/** Hero: a neighbour holding up a phone with a pin on it. */
export function NeighbourWithPhone({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 200 224" aria-hidden="true" focusable="false">
      <Person pose="phone" hair="toque" jacket="#19c3e6" hat="#f0503c" />
    </svg>
  );
}

/** Step 1: someone posting a report. */
export function Poster({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 200 224" aria-hidden="true" focusable="false">
      <Person pose="phone" hair="long" hairColor="#1d1d2b" skin="#a8704c" jacket="#ffd23f" />
    </svg>
  );
}

/** Step 3: two neighbours, one saying "I saw this too". */
export function Confirmers({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 330 240" aria-hidden="true" focusable="false">
      <Person x={0} y={16} scale={.95} pose="wave" hair="cap" hat="#1554d1" band="#ffd23f" skin="#f2c29b" jacket="#f0503c" />
      <Person x={138} y={24} scale={.9} hair="bun" hairColor="#5a3a22" skin="#e0a57c" jacket="#19c3e6" flip />
      <g transform="translate(166 4)">
        <path d="M0,14 Q0,0 14,0 H148 Q162,0 162,14 V34 Q162,48 148,48 H40 L22,62 L26,48 H14 Q0,48 0,34 Z" fill="#fffbe9" stroke={NAVY} strokeWidth="3.5" strokeLinejoin="round" />
        <text x="81" y="30" textAnchor="middle" fill={NAVY} style={{ font: '800 17px "Bricolage Grotesque", Inter, sans-serif' }}>I saw this too</text>
      </g>
    </svg>
  );
}

/** Monday email: a neighbour reading their letter. */
export function Reader({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 200 224" aria-hidden="true" focusable="false">
      <Person pose="letter" hair="short" hairColor="#c9922f" skin="#f5d0b0" jacket="#1554d1" />
    </svg>
  );
}

/** Round source badges for the hero. */
export function SourceBadge({ kind, className }: { kind: 'police' | 'city' | 'alert' | 'power'; className?: string }) {
  const fill = { police: '#1554d1', city: '#19c3e6', alert: '#ffd23f', power: '#f0503c' }[kind];
  return (
    <svg className={className} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <circle cx="32" cy="32" r="28" fill={fill} {...S} />
      {kind === 'police' ? <><path d="M32,14 L46,19 V30 C46,39 40,46 32,50 C24,46 18,39 18,30 V19 Z" fill="#fffbe9" {...S} /><path d="M32,24l2.4,4.8 5.3.8-3.9,3.7.9,5.3-4.7-2.5-4.7,2.5.9-5.3-3.9-3.7 5.3-.8Z" fill={NAVY} /></>
        : kind === 'city' ? <><rect x="17" y="26" width="12" height="22" fill="#fffbe9" {...S} /><rect x="31" y="16" width="16" height="32" fill="#fffbe9" {...S} /><path d="M35,23h8M35,30h8M35,37h8" {...S} /></>
        : kind === 'alert' ? <><path d="M32,14 L50,46 H14 Z" fill="#fffbe9" {...S} /><path d="M32,26 V35 M32,40 v.5" {...S} strokeWidth={4.5} /></>
        : <path d="M35,12 L20,35 H31 L28,52 L44,28 H33 Z" fill="#fffbe9" {...S} />}
    </svg>
  );
}
