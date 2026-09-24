import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Bell, Camera, Check, Clock, EyeOff, Flag, Mail, MapPin, Phone, Plus, ShieldCheck, Timer, UserRound } from 'lucide-react';
import { INCIDENT_CATEGORIES } from '../../constants';
import type { LivePulse } from '../../hooks/useLivePulse';
import { COMMUNITY_FAQS } from '../../content/communityWatch';
import { CityMap } from './CityMap';

const NAVY = '#0a1a33';

/* ── 1. What's on the map: stacked layers ─────────────────────────── */

const LAYERS = [
  { key: 'neighbours', name: 'Neighbour reports', body: 'Break-ins, stolen bikes, suspicious activity, fires and crashes, posted by signed-in Calgarians.', fresh: 'Live', color: '#ef4444' },
  { key: 'police', name: 'Calgary Police news', body: 'Arrests, public warnings and appeals from the Calgary Police Service newsroom. Not a dispatch feed.', fresh: 'Every 30 min', color: '#1554d1' },
  { key: 'city', name: 'City of Calgary', body: 'Traffic incidents, water main breaks and safety-related 311 requests.', fresh: 'Every 5 min', color: '#00a8c6' },
  { key: 'alerts', name: 'Weather & emergency alerts', body: 'Environment Canada warnings and Alberta Emergency Alerts.', fresh: 'Every 30 min', color: '#8b5cf6' },
  { key: 'power', name: 'Power & rivers', body: 'ENMAX outages every 5 minutes; Bow and Elbow river levels every 30.', fresh: 'Every 5–30 min', color: '#f59e0b' },
] as const;

/** Marks drawn flat on each plane, in plane coordinates (-100..100). */
const MARKS: Record<string, [number, number][]> = {
  neighbours: [[-40, -20], [30, 10], [-10, 50], [60, -50], [-70, 30]],
  police: [[10, -40], [-50, 60], [70, 40]],
  city: [[-60, -60], [40, 60], [0, 0], [80, -10]],
  alerts: [[-20, -70], [50, -20]],
  power: [[-80, -10], [20, 80]],
};

function Plane({ cy, color, active, kind, top }: { cy: number; color: string; active: boolean; kind?: string; top?: boolean }) {
  return (
    <g transform={`translate(260 ${cy - (active ? 22 : 0)})`} className="cx-plane" style={{ transition: 'transform .45s cubic-bezier(.2,.8,.2,1)' }}>
      <g transform="matrix(0.8,0.46,-0.8,0.46,0,0)">
        <rect x="-100" y="-100" width="200" height="200" rx="14" fill={top ? '#0d2447' : active ? '#fff' : '#eef2f8'} stroke={active || top ? color : 'rgba(10,26,51,.14)'} strokeWidth={active ? 4 : 1.5} />{active && !top ? <rect x="-100" y="-100" width="200" height="200" rx="14" fill={color} opacity=".08" /> : null}
        {top ? (
          <>
            <path d="M-100,-10 C-40,0 -20,30 30,20 S80,40 100,80" fill="none" stroke="#00c2e0" strokeWidth="9" strokeLinecap="round" opacity=".8" />
            <path d="M0,-100V100M-100,0H100" stroke="rgba(255,255,255,.18)" strokeWidth="2" strokeDasharray="6 6" />
            {LAYERS.flatMap(l => MARKS[l.key].map(([x, y], i) => <circle key={l.key + i} cx={x} cy={y} r="8" fill={l.color} stroke="#fff" strokeWidth="2.5" />))}
          </>
        ) : kind ? (
          <>
            <path d="M-100,-10 C-40,0 -20,30 30,20 S80,40 100,80" fill="none" stroke="rgba(0,194,224,.25)" strokeWidth="9" strokeLinecap="round" />
            {MARKS[kind].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={active ? 10 : 8} fill={color} stroke="#fff" strokeWidth="2.5" />)}
          </>
        ) : null}
      </g>
    </g>
  );
}

export function MapLayers({ pulse }: { pulse: LivePulse }) {
  const [active, setActive] = useState(0);
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (touched || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const t = window.setInterval(() => setActive(a => (a + 1) % LAYERS.length), 2600);
    return () => window.clearInterval(t);
  }, [touched]);
  const { status, byCategory } = pulse.reports;
  const counts = INCIDENT_CATEGORIES.filter(c => byCategory[c.value]);
  const max = Math.max(1, ...counts.map(c => byCategory[c.value] ?? 0));

  return (
    <section className="cx-layers" aria-labelledby="cx-layers-title">
      <div className="cw-wrap cx-layers-grid">
        <div>
          <p className="cx-eyebrow">What’s on the map</p>
          <h2 id="cx-layers-title">Five sources. <span>One map.</span></h2>
          <p className="cx-lead">What each source covers, and how fresh it is.</p>
          <ul className="cx-layer-list" onMouseLeave={() => setTouched(false)}>
            {LAYERS.map((l, i) => (
              <li key={l.key}>
                <button type="button" aria-pressed={active === i} onMouseEnter={() => { setActive(i); setTouched(true); }} onFocus={() => { setActive(i); setTouched(true); }} onClick={() => { setActive(i); setTouched(true); }} style={{ ['--c' as string]: l.color }}>
                  <i />
                  <span><b>{l.name}<em>{l.fresh}</em></b><small>{l.body}</small></span>
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="cx-stack">
          <svg viewBox="0 0 520 600" role="img" aria-label="Five map layers, one per source, stacked into one map">
            {[...LAYERS].reverse().map((l, ri) => {
              const i = LAYERS.length - 1 - ri;
              return <Plane key={l.key} cy={520 - ri * 70} color={l.color} kind={l.key} active={active === i} />;
            })}
            <Plane cy={130} color="#ffdf4f" active={false} top />
            <g className="cx-stack-label"><rect x="330" y="54" width="150" height="34" rx="17" fill="#ffdf4f" stroke={NAVY} strokeWidth="2" /><text x="405" y="76" textAnchor="middle">Your map</text></g>
          </svg>
          {status === 'ready' && counts.length ? (
            <div className="cx-bars">
              <p>Last 24 hours, by category</p>
              {counts.map(c => (
                <div key={c.value}><span>{c.label}</span><i style={{ width: `${((byCategory[c.value] ?? 0) / max) * 100}%`, background: c.color }} /><b>{byCategory[c.value]}</b></div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/* ── 2. How a report gets on the map: three phone screens ─────────── */

function MiniPhone({ children, step, title }: { children: React.ReactNode; step: number; title: string }) {
  return (
    <figure className="cx-step">
      <div className="cx-mini" aria-hidden="true">
        <div className="cx-mini-screen">
          <div className="cx-mini-status"><span className="cx-mini-island" /></div>
          {children}
        </div>
      </div>
      <figcaption><span>{step}</span>{title}</figcaption>
    </figure>
  );
}

export function HowItWorks() {
  return (
    <section className="cx-how" aria-labelledby="cx-how-title">
      <div className="cw-wrap">
        <div className="cx-head">
          <p className="cx-eyebrow">How it works</p>
          <h2 id="cx-how-title">From your phone to the map <span>in about a minute.</span></h2>
          <p className="cx-lead">Official sources are pinned automatically. A neighbour report takes three steps.</p>
        </div>
        <div className="cx-steps">
          <svg className="cx-steps-line" viewBox="0 0 1000 40" preserveAspectRatio="none" aria-hidden="true"><path d="M60,20 C250,-10 330,50 500,20 S760,-10 940,20" /></svg>
          <div className="cx-step-wrap">
            <MiniPhone step={1} title="Someone posts what they saw">
              <div className="cx-app-head">New report</div>
              <div className="cx-form">
                <div className="cx-chips"><i className="on">Crime</i><i>Traffic</i><i>Weather</i></div>
                <label><small>Headline</small>Smoke coming from a building</label>
                <label><small>Neighbourhood</small>Manchester</label>
                <div className="cx-photo"><Camera size={16} /> Add a photo</div>
                <div className="cx-toggle"><EyeOff size={14} /> Post anonymously <span className="on" /></div>
                <div className="cx-post">Post report</div>
              </div>
            </MiniPhone>
            <p>Headline, neighbourhood, an optional photo and a pin. Sign-in is required, so every report comes from a real account, but your name can stay hidden.</p>
          </div>
          <div className="cx-step-wrap">
            <MiniPhone step={2} title="It’s pinned where it happened">
              <div className="cx-mini-map">
                <CityMap pins={[]} className="cx-mini-city" quads={false} viewBox="150 150 150 170" />
                <span className="cx-drop"><MapPin size={34} /></span>
              </div>
              <div className="cx-sheet">
                <div className="cx-rcard"><i style={{ background: '#ef4444' }} /><div><small>Crime · Manchester</small><b>Smoke coming from a building</b><em><UserRound size={11} /> Neighbour report · just now</em></div></div>
              </div>
            </MiniPhone>
            <p>It’s on the map for everyone right away, and in the next Monday email for people who live nearby.</p>
          </div>
          <div className="cx-step-wrap">
            <MiniPhone step={3} title="Neighbours back it up">
              <div className="cx-app-head">Report</div>
              <div className="cx-form">
                <div className="cx-rcard cx-rcard-lg"><i style={{ background: '#ef4444' }} /><div><small>Crime · Manchester</small><b>Smoke coming from a building</b><em>Neighbour report · 6 min ago</em></div></div>
                <p className="cx-confirm-h">Neighbour confirmation</p>
                <div className="cx-confirm"><i className="on"><Check size={12} /> I saw this too</i><i>Still happening</i><i>Seems resolved</i></div>
                <div className="cx-backed"><ShieldCheck size={15} /> Backed by 4 neighbours</div>
              </div>
            </MiniPhone>
            <p>People nearby tap once: “I saw this too”, “Still happening” or “Seems resolved”. The report shows the count.</p>
          </div>
        </div>
        <p className="cx-note">Example screens, not real reports.</p>
      </div>
    </section>
  );
}

/* ── 3. Your street first: radar rings and the Monday email ───────── */

export function StreetFirst() {
  return (
    <section className="cx-street" aria-labelledby="cx-street-title">
      <div className="cw-wrap cx-street-grid">
        <div className="cx-street-copy">
          <p className="cx-eyebrow cx-eyebrow-light">Your street first</p>
          <h2 id="cx-street-title">Know what’s happening <span>around your home.</span></h2>
          <p className="cx-lead cx-lead-light">Tell us your area and get a free email every Monday morning. It starts with reports within a 15-minute walk of home, and only widens to 3 km, then 10 km, when it’s quiet.</p>
          <ul className="cx-ring-key">
            <li><i className="k1" /><b>15-minute walk</b><span>about 1.2 km</span></li>
            <li><i className="k2" /><b>3 km</b><span>your part of town</span></li>
            <li><i className="k3" /><b>10 km</b><span>the wider city</span></li>
          </ul>
          <Link className="cx-btn cx-btn-yellow" to="/map?settings=alerts"><Bell size={18} /> Get the Monday email</Link>
          <p className="cx-small">Free. Opt in only. Unsubscribe in one click.</p>
        </div>
        <div className="cx-radar-stage">
          <svg className="cx-radar" viewBox="0 0 400 400" role="img" aria-label="Rings around home: a 15-minute walk, 3 km and 10 km">
            <defs>
              <radialGradient id="cx-rg" cx="50%" cy="50%" r="50%"><stop offset="0" stopColor="#00c2e0" stopOpacity=".28" /><stop offset="1" stopColor="#00c2e0" stopOpacity="0" /></radialGradient>
              <linearGradient id="cx-sweep" x1="200" y1="200" x2="200" y2="20" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#00c2e0" stopOpacity="0" /><stop offset="1" stopColor="#00c2e0" stopOpacity=".45" /></linearGradient>
            </defs>
            <circle cx="200" cy="200" r="190" fill="url(#cx-rg)" />
            <circle cx="200" cy="200" r="180" className="cx-ring cx-ring-3" />
            <circle cx="200" cy="200" r="118" className="cx-ring cx-ring-2" />
            <circle cx="200" cy="200" r="56" className="cx-ring cx-ring-1" />
            <g className="cx-sweep"><path d="M200,200 L200,20 A180,180 0 0 1 327,73 Z" fill="url(#cx-sweep)" /></g>
            {[[232, 170, '#ef4444', 0], [168, 236, '#f97316', 1], [290, 128, '#3b82f6', 2], [108, 120, '#ef4444', 3], [318, 280, '#a855f7', 4], [80, 290, '#f97316', 5]].map(([x, y, c, i]) => (
              <g key={i as number} className="cx-blip" style={{ animationDelay: `${(i as number) * 0.5}s` }}>
                <circle cx={x as number} cy={y as number} r="14" fill={c as string} opacity=".2" />
                <circle cx={x as number} cy={y as number} r="6.5" fill={c as string} stroke="#fff" strokeWidth="2" />
              </g>
            ))}
            <circle cx="200" cy="200" r="20" fill="#ffdf4f" stroke={NAVY} strokeWidth="2.5" />
            <path d="M191,205 V197 L200,189 L209,197 V205 Z" fill={NAVY} />
            <text x="200" y="136" className="cx-ring-t">15-min walk</text>
            <text x="200" y="74" className="cx-ring-t">3 km</text>
            <text x="200" y="14" className="cx-ring-t">10 km</text>
          </svg>
          <div className="cx-email" aria-hidden="true">
            <div className="cx-email-top"><Mail size={15} /><span><b>CalgaryWatch</b> · Monday morning</span><em>Example</em></div>
            <p className="cx-email-subj">Your area this week</p>
            <p className="cx-email-ring"><i className="k1" />Within a 15-minute walk · 2</p>
            <p className="cx-email-row"><b>Car break-in</b> · 400 m away</p>
            <p className="cx-email-row"><b>Bike stolen from a garage</b> · 900 m away</p>
            <p className="cx-email-ring"><i className="k2" />Within 3 km · 5</p>
            <p className="cx-email-row cx-email-more">Road closure, power outage and 3 more</p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── 4. Can you trust it: an annotated report ─────────────────────── */

const TRUST = [
  { icon: UserRound, title: 'Who posted it', body: 'A neighbour, Calgary Police, the City or another official source. Neighbours can stay anonymous; their email is never shown.' },
  { icon: Clock, title: 'When', body: 'Every report shows when it was posted, so you can tell old news from now.' },
  { icon: Flag, title: 'Flag it if it’s wrong', body: 'When two different people flag a report, it comes off the map for review.' },
  { icon: Timer, title: 'It doesn’t linger', body: 'Neighbour reports come off the map after 5 days.' },
];

export function TrustAnatomy() {
  return (
    <section className="cx-trust" aria-labelledby="cx-trust-title">
      <div className="cw-wrap">
        <div className="cx-head">
          <p className="cx-eyebrow">Can you trust what you see?</p>
          <h2 id="cx-trust-title">Every report shows you <span>how much to trust it.</span></h2>
          <p className="cx-lead">Neighbour reports aren’t checked by police. Four things on every report tell you how much weight to give it.</p>
        </div>
        <div className="cx-trust-grid">
          <div className="cx-anatomy" aria-hidden="true">
            <div className="cx-report">
              <div className="cx-report-top">
                <span className="cx-cat">Crime</span>
                <span className="cx-tag cx-tag-1"><b>1</b>Neighbour report · Anonymous</span>
              </div>
              <h3>Car break-in, glass on the street</h3>
              <p className="cx-report-where"><MapPin size={14} /> 9 Ave SE, Inglewood <span className="cx-tag cx-tag-2"><b>2</b>12 min ago</span></p>
              <p className="cx-report-body">Passenger window smashed on a grey hatchback overnight. Glass is still on the sidewalk.</p>
              <div className="cx-report-confirm">
                <i className="on"><Check size={12} /> I saw this too · 3</i><i>Still happening</i><i>Seems resolved</i>
              </div>
              <div className="cx-report-foot">
                <span className="cx-tag cx-tag-4"><b>3</b><Flag size={13} /> Flag</span>
                <span className="cx-tag cx-tag-5"><b>4</b><Timer size={13} /> Leaves the map in 4 days</span>
              </div>
            </div>
            <p className="cx-note">Example report.</p>
          </div>
          <ol className="cx-trust-list">
            {TRUST.map((t, i) => (
              <li key={t.title}><span className="cx-num">{i + 1}</span><div><strong><t.icon size={17} /> {t.title}</strong><p>{t.body}</p></div></li>
            ))}
          </ol>
        </div>
        <div className="cx-911">
          <Phone size={22} />
          <p><b>In an emergency, call 911.</b> Police non-emergency: <a href="tel:4032661234">403-266-1234</a>. CalgaryWatch is not a way to reach police.</p>
        </div>
      </div>
    </section>
  );
}

/* ── 5. Alongside what you use ─────────────────────────────────────── */

export function Alongside() {
  const feeds = [
    { name: 'Community Facebook group', best: 'Best for talking it through', line: '“Anyone else hear sirens on 17th Ave?”', c: '#1554d1' },
    { name: 'Nextdoor', best: 'Best for your immediate block', line: '“Package taken off our porch this afternoon.”', c: '#1f8a4c' },
    { name: 'Local news', best: 'Best for the full story', line: '“Police investigate overnight break-ins in the Beltline.”', c: '#ef4444' },
  ];
  return (
    <section className="cx-along" aria-labelledby="cx-along-title">
      <div className="cw-wrap cx-along-grid">
        <div>
          <p className="cx-eyebrow">Use it alongside what you already have</p>
          <h2 id="cx-along-title">Keep your Facebook group <span>and Nextdoor.</span></h2>
          <p className="cx-lead">Each is good at something different. CalgaryWatch is best for the whole city at a glance: neighbour reports and official updates, on one map, with how far each is from you.</p>
        </div>
        <div className="cx-funnel" aria-hidden="true">
          <div className="cx-feeds">
            {feeds.map((f, i) => (
              <div key={f.name} className="cx-feed" style={{ ['--c' as string]: f.c, animationDelay: `${i * 0.4}s` }}>
                <small><i />{f.name}<span>{f.best}</span></small>
                <p>{f.line}</p>
              </div>
            ))}
          </div>
          <svg className="cx-funnel-lines" viewBox="0 0 80 300" preserveAspectRatio="none"><path d="M0,50 C40,50 40,150 80,150" /><path d="M0,150 H80" /><path d="M0,250 C40,250 40,150 80,150" /></svg>
          <div className="cx-onemap">
            <CityMap pins={[]} className="cx-onemap-city" labels={false} quads={false} viewBox="120 120 200 200" />
            {[[40, 38, '#ef4444'], [58, 55, '#1554d1'], [30, 62, '#1f8a4c']].map(([l, t, c], i) => (
              <span key={i} className="cx-onemap-pin" style={{ left: `${l}%`, top: `${t}%`, color: c as string, animationDelay: `${0.6 + i * 0.4}s` }}><MapPin size={26} fill="currentColor" stroke="#fff" /></span>
            ))}
            <b>The whole city, on one map</b>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── 6. Questions ──────────────────────────────────────────────────── */

export function Questions() {
  return (
    <section className="cx-faq" aria-labelledby="cm-faq">
      <div className="cw-wrap cx-faq-grid">
        <div className="cx-faq-side">
          <p className="cx-eyebrow">Questions people ask</p>
          <h2 id="cm-faq">Straight answers about the <span>Calgary crime map.</span></h2>
          <p className="cx-lead">Something else? Email <a href="mailto:aldo@calgarywatch.ca">aldo@calgarywatch.ca</a>.</p>
        </div>
        <div className="cx-faq-list">
          {COMMUNITY_FAQS.map((f, i) => (
            <details key={f.question} open={i === 0}>
              <summary>{f.question}<span aria-hidden="true"><Plus size={18} /></span></summary>
              <p>{f.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── 7. Closing ────────────────────────────────────────────────────── */

export function Closing({ views, pulse }: { views: string; pulse: LivePulse }) {
  return (
    <section className="cx-close" aria-labelledby="cx-close-title">
      <div className="cx-close-bg" aria-hidden="true"><CityMap pins={pulse.reports.recent ?? []} className="cx-close-map" labels={false} quads={false} /></div>
      <div className="cw-wrap cx-close-inner">
        <p className="cx-eyebrow cx-eyebrow-light">Built in Calgary, for Calgary</p>
        <h2 id="cx-close-title">It gets better with <span>every neighbour.</span></h2>
        <p className="cx-lead cx-lead-light">CalgaryWatch is built in Calgary and still small. The next report that helps someone on your street could be yours.</p>
        <div className="cx-close-ctas">
          <Link className="cx-btn cx-btn-yellow" to="/map">Open the live map <ArrowUpRight size={18} /></Link>
          <Link className="cx-btn cx-btn-ghost" to="/map?report=true"><Plus size={18} /> Post a report</Link>
        </div>
        <p className="cx-sign">With love, CalgaryWatch</p>
        <nav className="cx-more" aria-label="More about Community Watch">
          <Link to="/calgary-neighbourhood-watch"><strong>Start a neighbourhood watch</strong><span>A practical guide for your street or building</span><ArrowUpRight size={18} /></Link>
          <Link to="/coverage"><strong>Every source we use</strong><span>Where each kind of pin comes from</span><ArrowUpRight size={18} /></Link>
          <Link to="/about"><strong>About CalgaryWatch</strong><span>Who we are and how it works</span><ArrowUpRight size={18} /></Link>
        </nav>
      </div>
    </section>
  );
}
