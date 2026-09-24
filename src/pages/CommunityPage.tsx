import { Link } from 'react-router-dom';
import { ArrowUpRight, Bell, Camera, Check, EyeOff, Flag, MapPin, Phone, ShieldCheck, Timer } from 'lucide-react';
import { SiteLayout } from '../components/site/SiteLayout';
import { useLivePulse } from '../hooks/useLivePulse';
import { INCIDENT_CATEGORIES } from '../constants';
import { timeAgo, type ExampleReport } from '../lib/homeClaims';
import '../styles/community.css';

/** Site-wide reach the owner reports; update here when it changes. */
const VIEWS = '80K+';

const COLOR: Record<string, string> = Object.fromEntries(INCIDENT_CATEGORIES.map(c => [c.value, c.color]));

/** Calgary's box, projected flat: good enough to show where things cluster. */
const BOX = { n: 51.215, s: 50.842, w: -114.315, e: -113.86 };
const px = (lng: number) => ((lng - BOX.w) / (BOX.e - BOX.w)) * 400;
const py = (lat: number) => ((BOX.n - lat) / (BOX.n - BOX.s)) * 440;

const line = (pts: [number, number][]) => pts.map(([lat, lng], i) => `${i ? 'L' : 'M'}${px(lng).toFixed(1)},${py(lat).toFixed(1)}`).join('');
const OUTLINE: [number, number][] = [[51.2, -114.26], [51.212, -114.15], [51.21, -114.05], [51.19, -113.92], [51.12, -113.87], [51.02, -113.88], [50.95, -113.9], [50.87, -113.94], [50.85, -114.05], [50.86, -114.16], [50.9, -114.23], [50.98, -114.28], [51.08, -114.3], [51.15, -114.29]];
const STONEY: [number, number][] = [[51.16, -114.22], [51.175, -114.1], [51.17, -113.98], [51.11, -113.93], [51.03, -113.935], [50.93, -113.95], [50.885, -114.03], [50.885, -114.14], [50.93, -114.2], [51.0, -114.215], [51.08, -114.235], [51.16, -114.22]];
const BOW: [number, number][] = [[51.105, -114.3], [51.092, -114.21], [51.08, -114.16], [51.066, -114.118], [51.055, -114.085], [51.052, -114.06], [51.047, -114.035], [51.037, -114.02], [51.012, -114.002], [50.97, -113.99], [50.92, -113.985], [50.86, -113.975]];
const ELBOW: [number, number][] = [[50.96, -114.19], [50.975, -114.15], [50.99, -114.115], [51.005, -114.09], [51.022, -114.073], [51.035, -114.058], [51.045, -114.045]];
/** [name, lat, lng, label dx, label dy, anchor] — the downtown cluster fans out so labels don't collide. */
const PLACES: [string, number, number, number?, number?, ('start' | 'end')?][] = [['Downtown', 51.0478, -114.0593, 6, 14], ['Kensington', 51.0529, -114.0913, -6, -5, 'end'], ['Bridgeland', 51.0545, -114.0391, 6, -6], ['Inglewood', 51.0369, -114.0189], ['Marda Loop', 51.0232, -114.1062], ['Bowness', 51.0906, -114.2083], ['Forest Lawn', 51.0419, -113.9636], ['Airport', 51.1215, -114.0076], ['Chinook', 50.9981, -114.0733], ['Shawnessy', 50.9086, -114.0717], ['Tuscany', 51.1255, -114.2515]];

function CityMap({ pins }: { pins: ExampleReport[] }) {
  return (
    <svg className="cm-city" viewBox="0 0 400 440" role="img" aria-label={pins.length ? `Map of Calgary with ${pins.length} reports from the last 24 hours` : 'Map of Calgary'}>
      <defs>
        <pattern id="cm-grid" width="16" height="16" patternUnits="userSpaceOnUse"><path d="M16,0H0V16" fill="none" stroke="rgba(255,255,255,.05)" /></pattern>
      </defs>
      <path className="cm-city-land" d={line(OUTLINE) + 'Z'} />
      <path d={line(OUTLINE) + 'Z'} fill="url(#cm-grid)" />
      <path className="cm-city-ring" d={line(STONEY)} />
      <path className="cm-city-axis" d={`M${px(-114.063)},${py(51.21)}V${py(50.85)}M${px(-114.29)},${py(51.048)}H${px(-113.875)}`} />
      <path className="cm-city-bow" d={line(BOW)} />
      <path className="cm-city-elbow" d={line(ELBOW)} />
      <ellipse className="cm-city-lake" cx={px(-114.128)} cy={py(50.985)} rx="12" ry="7" />
      {PLACES.map(([name, lat, lng, dx = 6, dy = 3.5, anchor = 'start']) => (
        <g key={name} transform={`translate(${px(lng).toFixed(1)} ${py(lat).toFixed(1)})`} className="cm-place">
          <circle r="2.5" />
          <text x={dx} y={dy} textAnchor={anchor}>{name}</text>
        </g>
      ))}
      <text className="cm-quad" x="34" y="44">NW</text><text className="cm-quad" x="340" y="44">NE</text><text className="cm-quad" x="34" y="420">SW</text><text className="cm-quad" x="340" y="420">SE</text>
      {pins.map((p, i) => (
        <g key={p.id} transform={`translate(${px(p.lng!).toFixed(1)} ${py(p.lat!).toFixed(1)})`}>
          <g className="cm-pin" style={{ animationDelay: `${(i % 12) * 0.12}s` }}>
            <circle r="10" fill={COLOR[p.category] ?? '#00c2e0'} opacity=".22" />
            <circle r="5.5" fill={COLOR[p.category] ?? '#00c2e0'} stroke="#fff" strokeWidth="1.8" />
          </g>
        </g>
      ))}
    </svg>
  );
}

function PhoneMock() {
  return (
    <div className="cm-phone" aria-hidden="true">
      <p className="cm-phone-bar">New report</p>
      <span className="cm-field"><small>Headline</small>Smoke coming from a building</span>
      <span className="cm-field"><small>Neighbourhood</small>Manchester</span>
      <span className="cm-field cm-field-row"><Camera size={14} /> Add a photo <em>optional</em></span>
      <span className="cm-field cm-field-row"><EyeOff size={14} /> Post anonymously</span>
      <span className="cm-phone-btn">Post report</span>
    </div>
  );
}

function PinMock() {
  return (
    <div className="cm-pinmock" aria-hidden="true">
      <svg viewBox="0 0 220 150">
        <rect width="220" height="150" fill="#eef3fb" />
        <path d="M0,40H220M0,95H220M60,0V150M150,0V150" stroke="#cfd8e6" strokeWidth="8" />
        <path d="M0,120C60,110 120,140 220,112" stroke="#00c2e0" strokeWidth="10" fill="none" />
        <g transform="translate(104 78)">
          <circle r="22" fill="#ef4444" opacity=".18" />
          <path d="M0,0C-8,-10 -12,-16 -12,-22A12,12 0 1 1 12,-22C12,-16 8,-10 0,0Z" fill="#ef4444" stroke="#151515" strokeWidth="2" />
          <circle cy="-22" r="4.5" fill="#fff" />
        </g>
      </svg>
      <span className="cm-source"><b>Posted by a neighbour</b> · 12 min ago</span>
    </div>
  );
}

function ConfirmMock() {
  return (
    <div className="cm-confirm" aria-hidden="true">
      <p>Neighbour confirmation</p>
      <span className="cm-confirm-btns"><i className="on"><Check size={13} /> I saw this too</i><i>Still happening</i><i>Seems resolved</i></span>
      <span className="cm-backed"><ShieldCheck size={16} /> Backed by 4 neighbours</span>
    </div>
  );
}

function Rings() {
  return (
    <svg className="cm-rings" viewBox="0 0 360 360" role="img" aria-label="Three rings around home: a 15-minute walk, 3 km and 10 km">
      <defs><pattern id="cm-streets" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24,0H0V24" fill="none" stroke="rgba(21,21,21,.08)" strokeWidth="2" /></pattern></defs>
      <rect width="360" height="360" fill="#fffdf7" />
      <rect width="360" height="360" fill="url(#cm-streets)" />
      <circle cx="180" cy="180" r="166" className="cm-ring cm-ring-3" />
      <circle cx="180" cy="180" r="108" className="cm-ring cm-ring-2" />
      <circle cx="180" cy="180" r="50" className="cm-ring cm-ring-1" />
      {[[214, 150, 'crime'], [150, 214, 'traffic'], [262, 110, 'infrastructure'], [96, 118, 'crime'], [300, 250, 'weather'], [70, 260, 'traffic']].map(([x, y, c], i) => (
        <circle key={i} cx={x} cy={y} r="7" fill={COLOR[c as string]} stroke="#151515" strokeWidth="2" />
      ))}
      <g transform="translate(180 180)">
        <circle r="22" fill="#ffdf4f" stroke="#151515" strokeWidth="2.5" />
        <path d="M-9,5V-3L0,-11L9,-3V5Z" fill="#151515" />
      </g>
      <g className="cm-ring-labels">
        <text x="180" y="120">15-min walk</text>
        <text x="180" y="62">3 km</text>
        <text x="180" y="24">10 km</text>
      </g>
    </svg>
  );
}

const SHOWS = [
  { key: 'neighbours', title: 'Neighbour reports', body: 'Break-ins, stolen bikes, suspicious activity, fires and crashes, posted by signed-in Calgarians.', tone: 'red' },
  { key: 'police', title: 'Calgary Police news', body: 'Arrests, public warnings and appeals from the Calgary Police Service newsroom.', tone: 'navy' },
  { key: 'city', title: 'City of Calgary', body: 'Safety-related 311 requests, traffic incidents and water main breaks.', tone: 'blue' },
  { key: 'alerts', title: 'Weather & emergency alerts', body: 'Environment Canada warnings and Alberta Emergency Alerts.', tone: 'purple' },
  { key: 'power', title: 'Power & rivers', body: 'ENMAX power outages and Bow and Elbow river levels.', tone: 'yellow' },
  { key: 'news', title: 'Local news', body: 'Calgary headlines from Global News, alongside everything else.', tone: 'cyan' },
] as const;

function ShowIcon({ k }: { k: (typeof SHOWS)[number]['key'] }) {
  const common = { fill: 'none', stroke: '#151515', strokeWidth: 2.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      {k === 'neighbours' ? <><circle cx="17" cy="17" r="7" {...common} fill="#fff" /><circle cx="33" cy="19" r="6" {...common} fill="#fff" /><path d="M5,40c1-9 7-13 12-13s11,4 12,13" {...common} fill="#fff" /><path d="M26,38c1-7 4-10 7-10s7,3 9,10" {...common} /></>
        : k === 'police' ? <><path d="M24,4L40,10V22C40,32 33,40 24,44C15,40 8,32 8,22V10Z" {...common} fill="#fff" /><path d="M24,16l2.5,5 5.5,.8-4,3.9 1,5.5-5-2.6-5,2.6 1-5.5-4-3.9 5.5-.8Z" fill="#151515" /></>
        : k === 'city' ? <><rect x="8" y="16" width="14" height="26" {...common} fill="#fff" /><rect x="24" y="8" width="16" height="34" {...common} fill="#fff" /><path d="M12,22h6M12,28h6M28,14h8M28,20h8M28,26h8M4,42h40" {...common} /></>
        : k === 'alerts' ? <><path d="M24,6L44,40H4Z" {...common} fill="#fff" /><path d="M24,18V28M24,33v1" {...common} strokeWidth={3.5} /></>
        : k === 'power' ? <><path d="M27,4L10,27H23L20,44L38,19H25Z" {...common} fill="#fff" /></>
        : <><rect x="6" y="9" width="36" height="30" rx="3" {...common} fill="#fff" /><path d="M12,17h24M12,24h14M12,31h10M30,24h6v7h-6Z" {...common} /></>}
    </svg>
  );
}

export default function CommunityPage() {
  const pulse = useLivePulse(true);
  const { status, total, capped, byCategory, recent = [], example, checkedAt } = pulse.reports;
  const counts = INCIDENT_CATEGORIES.filter(c => byCategory[c.value]);
  const max = Math.max(1, ...counts.map(c => byCategory[c.value] ?? 0));

  return (
    <SiteLayout>
      <div className="cm">
        <section className="cm-hero" aria-labelledby="cm-title">
          <div className="cw-wrap cm-hero-grid">
            <div className="cm-hero-copy">
              <p className="cm-kicker"><span className="cm-pulse" aria-hidden="true" />CalgaryWatch Community Watch</p>
              <h1 id="cm-title">Crime and safety reports from your neighbours, <span>on one map.</span></h1>
              <p className="cm-lead">Calgarians post what they see. We add Calgary Police news releases, City of Calgary data, weather alerts and power outages. Everything is pinned where it happened, with its source.</p>
              <div className="cm-ctas">
                <Link className="cm-btn cm-btn-primary" to="/map">Open the live map <ArrowUpRight size={18} /></Link>
                <Link className="cm-btn" to="/map?report=true">Post a report</Link>
              </div>
              <ul className="cm-facts">
                <li><b>Free</b> for everyone</li>
                <li><b>Calgary</b> only</li>
                <li><b>{VIEWS}</b> views from Calgarians</li>
              </ul>
            </div>
            <div className="cm-hero-map">
              <CityMap pins={recent} />
              <div className="cm-map-card" aria-live="polite">
                {status === 'ready' ? (
                  <>
                    <p className="cm-map-count"><b>{total}{capped ? '+' : ''}</b> reports in the last 24 hours</p>
                    {example ? <p className="cm-map-latest"><small>Latest · {timeAgo(example.timestamp, checkedAt ?? example.timestamp)}</small>{example.title}{example.neighborhood ? <em>{example.neighborhood}</em> : null}</p> : null}
                  </>
                ) : status === 'error' ? <p className="cm-map-count">Open the map to see what’s happening now.</p> : <span className="cm-map-skeleton" />}
              </div>
            </div>
          </div>
        </section>

        <div className="cw-wrap">
          <section className="cm-section" aria-labelledby="cm-shows">
            <div className="cm-head">
              <h2 id="cm-shows">What you’ll see on the map</h2>
              <p>Neighbour reports and official sources together, so you get the full picture in one place.</p>
            </div>
            <ul className="cm-shows">
              {SHOWS.map(s => (
                <li key={s.key} className={`cm-show cm-tone-${s.tone}`}>
                  <span className="cm-show-icon"><ShowIcon k={s.key} /></span>
                  <strong>{s.title}</strong>
                  <p>{s.body}</p>
                </li>
              ))}
            </ul>
            {status === 'ready' && counts.length ? (
              <div className="cm-bars" aria-label="Reports by category in the last 24 hours">
                <p>Last 24 hours, by category</p>
                {counts.map(c => (
                  <div key={c.value} className="cm-bar">
                    <span>{c.label}</span>
                    <i style={{ width: `${((byCategory[c.value] ?? 0) / max) * 100}%`, background: c.color }} />
                    <b>{byCategory[c.value]}</b>
                  </div>
                ))}
              </div>
            ) : null}
          </section>

          <section className="cm-section" aria-labelledby="cm-how">
            <div className="cm-head">
              <h2 id="cm-how">How a report gets on the map</h2>
              <p>Official sources are pinned automatically. Neighbour reports take about a minute to post.</p>
            </div>
            <ol className="cm-steps">
              <li>
                <span className="cm-step-n">1</span>
                <h3>Someone posts it</h3>
                <p>A signed-in Calgarian adds a headline, the neighbourhood and an optional photo, and drops a pin. You can post anonymously.</p>
                <PhoneMock />
              </li>
              <li>
                <span className="cm-step-n">2</span>
                <h3>It’s pinned where it happened</h3>
                <p>Every pin says where it came from: a neighbour, Calgary Police, the City or another official source.</p>
                <PinMock />
              </li>
              <li>
                <span className="cm-step-n">3</span>
                <h3>Neighbours back it up</h3>
                <p>People nearby can tap “I saw this too”, “Still happening” or “Seems resolved”, so you can tell what’s confirmed.</p>
                <ConfirmMock />
              </li>
            </ol>
            <p className="cm-example-note">The screens above are examples, not real reports.</p>
          </section>

          <section className="cm-section cm-street" aria-labelledby="cm-street">
            <div className="cm-street-copy">
              <p className="cm-eyebrow">Your street first</p>
              <h2 id="cm-street">Know what’s happening around your home.</h2>
              <p>Tell us your area and get a free email every Monday morning. It starts with reports within a 15-minute walk of home, and only widens to 3 km, then 10 km, when it’s quiet.</p>
              <ul className="cm-ring-key">
                <li><i className="k1" />15-minute walk <small>about 1.2 km</small></li>
                <li><i className="k2" />3 km <small>your part of town</small></li>
                <li><i className="k3" />10 km <small>the wider city</small></li>
              </ul>
              <Link className="cm-btn cm-btn-primary" to="/map?settings=alerts"><Bell size={18} /> Get the Monday email</Link>
              <p className="cm-small">Opt in only. Unsubscribe in one click.</p>
            </div>
            <Rings />
          </section>

          <section className="cm-section cm-trust" aria-labelledby="cm-trust">
            <div className="cm-head">
              <h2 id="cm-trust">Can you trust what you see?</h2>
              <p>Neighbour reports aren’t checked by police. Here’s what we do so you can judge for yourself.</p>
            </div>
            <ul className="cm-trust-grid">
              <li><MapPin size={22} /><strong>Every pin shows its source</strong><p>A neighbour, Calgary Police, the City or another official feed, with the time it was posted.</p></li>
              <li><ShieldCheck size={22} /><strong>Neighbours can back it up</strong><p>Reports show how many people nearby confirmed them, or that no one has yet.</p></li>
              <li><Flag size={22} /><strong>Bad reports get hidden</strong><p>When two different people flag a report, it comes off the map for review.</p></li>
              <li><EyeOff size={22} /><strong>Your privacy is protected</strong><p>Post anonymously if you like. Your email is never shown on a report.</p></li>
              <li><Timer size={22} /><strong>Reports don’t linger</strong><p>Neighbour reports come off the map after 5 days.</p></li>
              <li className="cm-trust-911"><Phone size={22} /><strong>In an emergency, call 911</strong><p>Non-emergency police: <a href="tel:4032661234">403-266-1234</a>. CalgaryWatch is not a way to reach police.</p></li>
            </ul>
          </section>

          <section className="cm-section cm-ontop" aria-labelledby="cm-ontop">
            <div className="cm-ontop-copy">
              <p className="cm-eyebrow">Use it alongside what you already have</p>
              <h2 id="cm-ontop">Keep your Facebook group and Nextdoor.</h2>
              <p>CalgaryWatch doesn’t replace them. It adds a map: the headlines and neighbour posts you already read, pinned where they happened, so you can see what’s near you and what isn’t.</p>
            </div>
            <div className="cm-ontop-art" aria-hidden="true">
              {['Community Facebook group', 'Nextdoor', 'Local news'].map((t, i) => <span key={t} className={`cm-bubble cm-bubble-${i}`}>{t}</span>)}
              <svg viewBox="0 0 120 40" className="cm-arrow"><path d="M4,20H104M92,8L108,20L92,32" fill="none" stroke="#151515" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" /></svg>
              <span className="cm-onemap"><MapPin size={20} /> One map</span>
            </div>
          </section>

          <section className="cm-love" aria-labelledby="cm-love">
            <p className="cm-eyebrow">Built in Calgary, for Calgary</p>
            <h2 id="cm-love">Small, local, and growing every day.</h2>
            <p>CalgaryWatch covers Calgary and nowhere else. {VIEWS} views from Calgarians so far. It gets more useful with every neighbour who posts what they see.</p>
            <p className="cm-sign">With love, CalgaryWatch</p>
            <div className="cm-ctas">
              <Link className="cm-btn cm-btn-primary" to="/map">Open the live map <ArrowUpRight size={18} /></Link>
              <Link className="cm-btn" to="/map?report=true">Post a report</Link>
            </div>
          </section>

          <nav className="cm-more" aria-label="More about Community Watch">
            <Link to="/calgary-neighbourhood-watch"><strong>Start a neighbourhood watch</strong><span>A practical guide for your street or building</span><ArrowUpRight size={18} /></Link>
            <Link to="/coverage"><strong>Every source we use</strong><span>Where each kind of pin comes from</span><ArrowUpRight size={18} /></Link>
            <Link to="/about"><strong>About CalgaryWatch</strong><span>Who we are and how it works</span><ArrowUpRight size={18} /></Link>
          </nav>
        </div>
      </div>
    </SiteLayout>
  );
}
