import { Link } from 'react-router-dom';
import { ArrowUpRight, Bell, Camera, Check, Clock, EyeOff, Flag, Mail, MapPin, Phone, Plus, ShieldCheck, Timer, UserRound } from 'lucide-react';
import { INCIDENT_CATEGORIES } from '../../constants';
import { COMMUNITY_FAQS } from '../../content/communityWatch';
import { timeAgo, type ExampleReport } from '../../lib/homeClaims';
import type { LivePulse } from '../../hooks/useLivePulse';
import { TEAR } from '../home/HomeHero';
import { COLOR, CityMap } from './CityMap';

/**
 * Community Watch, in the homepage's board language: cream paper, ink outlines,
 * hard shadows, a yellow highlighter on the words that matter, navy for the
 * Live product. The hero shows what is actually on the map right now; anything
 * that isn't real is labelled as an example.
 */

const clock = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton', hour: 'numeric', minute: '2-digit' });
const label = (c: string) => INCIDENT_CATEGORIES.find(x => x.value === c)?.label ?? c;

const EXAMPLES: ExampleReport[] = [
  { id: 'ex1', title: 'Car break-in, glass on the street', neighborhood: 'Inglewood', category: 'crime', timestamp: 0, source: 'Neighbour report' },
  { id: 'ex2', title: 'Road closed after a collision', neighborhood: 'Beltline', category: 'traffic', timestamp: 0, source: 'City of Calgary' },
  { id: 'ex3', title: 'Power out on several blocks', neighborhood: 'Bowness', category: 'infrastructure', timestamp: 0, source: 'ENMAX' },
];

function Tear({ bottom = false }: { bottom?: boolean }) {
  return (
    <svg className={`cv-tear${bottom ? ' cv-tear-bottom' : ''}`} viewBox="0 0 1440 60" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <path d={TEAR} />
    </svg>
  );
}

function ReportRow({ r, now, real }: { r: ExampleReport; now: number; real: boolean }) {
  return (
    <li className="cv-row">
      <i style={{ background: COLOR[r.category] ?? '#00c2e0' }} aria-hidden="true" />
      <div>
        <b>{r.title}</b>
        <small>{[label(r.category), r.neighborhood, r.source, real ? timeAgo(r.timestamp, now) : null].filter(Boolean).join(' · ')}</small>
      </div>
    </li>
  );
}

/* ── Hero: the live board ─────────────────────────────────────────── */

function NowBoard({ pulse }: { pulse: LivePulse }) {
  const { status, total, capped, byCategory, recent = [], checkedAt } = pulse.reports;
  const real = recent.filter(r => r.title);
  const loading = status === 'idle' || status === 'loading';
  const showReal = status === 'ready' && real.length > 0;
  const cats = INCIDENT_CATEGORIES.filter(c => byCategory[c.value]);

  return (
    <div className="cv-now" aria-live="polite">
      <div className="cv-now-top">
        <span className="cv-live"><span aria-hidden="true" />Right now</span>
        {status === 'ready' && checkedAt ? <small>Checked {clock.format(checkedAt)}</small> : null}
      </div>
      {loading ? (
        <div className="cv-now-skel" aria-hidden="true"><span /><span /><span /></div>
      ) : (
        <>
          {status === 'ready' ? (
            <p className="cv-now-count"><b>{total}{capped ? '+' : ''}</b><span>{total === 1 ? 'public report' : 'public reports'} in the last 24 hours</span></p>
          ) : (
            <p className="cv-now-count cv-now-count-sm"><span>What the map looks like</span></p>
          )}
          {cats.length ? (
            <ul className="cv-chips" aria-label="By category">
              {cats.map(c => <li key={c.value}><i style={{ background: c.color }} aria-hidden="true" />{c.label} <b>{byCategory[c.value]}</b></li>)}
            </ul>
          ) : null}
          <p className="cv-now-label">{showReal ? 'Latest' : 'Example reports'}</p>
          <ul className="cv-rows">
            {(showReal ? real : EXAMPLES).slice(0, 3).map(r => <ReportRow key={r.id} r={r} now={checkedAt ?? 0} real={showReal} />)}
          </ul>
        </>
      )}
      <Link className="cv-now-link" to="/map">See it all on the live map <ArrowUpRight size={16} /></Link>
    </div>
  );
}

export function CommunityHero({ pulse, views }: { pulse: LivePulse; views: string }) {
  return (
    <section className="cv-hero" aria-labelledby="cm-title">
      <div className="cv-hero-map" aria-hidden="true">
        <CityMap pins={pulse.reports.recent ?? []} className="cv-bgmap" labels={false} quads={false} />
      </div>
      <div className="cw-wrap cv-hero-grid">
        <div className="cv-hero-copy">
          <p className="cv-kicker"><span className="cv-pulse" aria-hidden="true" />Community Watch · Live</p>
          <h1 id="cm-title">Calgary crime watch, <mark>from your neighbours.</mark></h1>
          <p className="cv-lead">Crime and safety reports from people who live here, next to Calgary Police news, City of Calgary traffic and 311, weather alerts and power outages. One map, and every pin shows where it came from and when.</p>
          <div className="cv-ctas">
            <Link className="cv-btn cv-btn-yellow" to="/map">Open the live map <ArrowUpRight size={18} /></Link>
            <Link className="cv-btn cv-btn-line" to="/map?report=true"><Plus size={18} /> Post a report</Link>
          </div>
          <ul className="cv-facts">
            <li><b>Free</b> for everyone</li>
            <li><b>{views}</b> views from Calgarians</li>
            <li><b>Anonymous</b> posting</li>
          </ul>
        </div>
        <NowBoard pulse={pulse} />
      </div>
      <Tear bottom />
    </section>
  );
}

/* ── Five sources ─────────────────────────────────────────────────── */

const SOURCES = [
  { name: 'Neighbours', body: 'Break-ins, stolen bikes, suspicious activity, fires and crashes, posted by signed-in Calgarians.', fresh: 'Live', color: '#ef4444' },
  { name: 'Calgary Police', body: 'Arrests, public warnings and appeals from the police newsroom. Not a dispatch feed.', fresh: 'Every 30 min', color: '#1554d1' },
  { name: 'City of Calgary', body: 'Traffic incidents, water main breaks and safety-related 311 requests.', fresh: 'Every 5 min', color: '#00a8c6' },
  { name: 'Weather & alerts', body: 'Environment Canada warnings and Alberta Emergency Alerts.', fresh: 'Every 30 min', color: '#8b5cf6' },
  { name: 'Power & rivers', body: 'ENMAX outages, and Bow and Elbow river levels.', fresh: 'Every 5–30 min', color: '#f59e0b' },
];

export function Sources({ pulse }: { pulse: LivePulse }) {
  const { status, byCategory, total } = pulse.reports;
  const cats = INCIDENT_CATEGORIES.filter(c => byCategory[c.value]);
  const sum = cats.reduce((s, c) => s + (byCategory[c.value] ?? 0), 0) || 1;
  return (
    <section className="cv-sec cv-sources" aria-labelledby="cv-sources-title">
      <div className="cw-wrap">
        <div className="cv-head cv-head-split">
          <h2 id="cv-sources-title">Five sources, <mark>one map.</mark></h2>
          <p>What each one covers and how often it updates. Official sources are pinned automatically; neighbours add the rest.</p>
        </div>
        <div className="cv-board">
          <ul className="cv-source-grid">
            {SOURCES.map(s => (
              <li key={s.name} style={{ ['--c' as string]: s.color }}>
                <span className="cv-source-dot" aria-hidden="true" />
                <h3>{s.name}</h3>
                <em>{s.fresh}</em>
                <p>{s.body}</p>
              </li>
            ))}
          </ul>
          {status === 'ready' && cats.length ? (
            <div className="cv-split">
              <p><b>Last 24 hours</b> · {total} public reports by kind</p>
              <div className="cv-split-bar" role="img" aria-label={cats.map(c => `${c.label} ${byCategory[c.value]}`).join(', ')}>
                {cats.map(c => <span key={c.value} style={{ flexGrow: byCategory[c.value], background: c.color }} title={`${c.label}: ${byCategory[c.value]}`} />)}
              </div>
              <ul>{cats.map(c => <li key={c.value}><i style={{ background: c.color }} />{c.label} {Math.round(((byCategory[c.value] ?? 0) / sum) * 100)}%</li>)}</ul>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/* ── How a report gets on the map ─────────────────────────────────── */

export function Steps() {
  return (
    <section className="cv-sec cv-steps" aria-labelledby="cv-steps-title">
      <div className="cw-wrap">
        <div className="cv-head">
          <h2 id="cv-steps-title">From your phone to the map <mark>in about a minute.</mark></h2>
        </div>
        <ol className="cv-step-list">
          <li className="cv-step">
            <span className="cv-num">1</span>
            <h3>Post what you saw</h3>
            <div className="cv-step-art" aria-hidden="true">
              <div className="cv-mini-chips"><i className="on">Crime</i><i>Traffic</i><i>Weather</i></div>
              <div className="cv-mini-field"><small>Headline</small>Smoke coming from a building</div>
              <div className="cv-mini-row"><span><Camera size={14} /> Photo</span><span><EyeOff size={14} /> Anonymous</span></div>
            </div>
            <p>A headline, the neighbourhood, an optional photo and a pin. You sign in, so every report comes from a real account, but your name can stay hidden.</p>
          </li>
          <li className="cv-step">
            <span className="cv-num">2</span>
            <h3>It's pinned where it happened</h3>
            <div className="cv-step-art cv-step-map" aria-hidden="true">
              <CityMap pins={[]} className="cv-mini-city" labels={false} quads={false} viewBox="130 150 170 110" />
              <span className="cv-drop"><MapPin size={30} fill="#ef4444" stroke="#fff" /></span>
            </div>
            <p>Everyone sees it on the map right away, and people who live nearby get it in the next Monday email.</p>
          </li>
          <li className="cv-step">
            <span className="cv-num">3</span>
            <h3>Neighbours back it up</h3>
            <div className="cv-step-art" aria-hidden="true">
              <div className="cv-mini-chips"><i className="on"><Check size={12} /> I saw this too</i><i>Still happening</i></div>
              <div className="cv-mini-backed"><ShieldCheck size={15} /> Backed by 4 neighbours</div>
            </div>
            <p>People nearby tap once: "I saw this too", "Still happening" or "Seems resolved". The report shows the count.</p>
          </li>
        </ol>
        <p className="cv-note">Example screens, not real reports.</p>
      </div>
    </section>
  );
}

/* ── Reading a report ─────────────────────────────────────────────── */

const TRUST = [
  { icon: UserRound, title: 'Who posted it', body: 'A neighbour, Calgary Police, the City or another official source. Neighbours can stay anonymous; their email is never shown.' },
  { icon: Clock, title: 'When', body: 'Every report shows when it was posted, so old news never passes for now.' },
  { icon: Flag, title: 'Flag it if it’s wrong', body: 'When two different people flag a report, it comes off the map for review.' },
  { icon: Timer, title: 'It doesn’t linger', body: 'Neighbour reports come off the map after 5 days.' },
];

export function ReadingReports() {
  return (
    <section className="cv-sec cv-trust" aria-labelledby="cv-trust-title">
      <div className="cw-wrap">
        <div className="cv-trust-grid">
          <div>
            <h2 id="cv-trust-title">How much to trust a report, <mark>at a glance.</mark></h2>
            <p className="cv-sub">Neighbour reports aren't checked by police. Four things on every report tell you how much weight to give it.</p>
            <ol className="cv-trust-list">
              {TRUST.map((t, i) => (
                <li key={t.title}><span className="cv-num cv-num-sm">{i + 1}</span><div><strong><t.icon size={16} /> {t.title}</strong><p>{t.body}</p></div></li>
              ))}
            </ol>
          </div>
          <figure className="cv-report" aria-hidden="true">
            <div className="cv-report-top"><span className="cv-cat">Crime</span><span className="cv-tag"><b>1</b>Neighbour report · Anonymous</span></div>
            <h3>Car break-in, glass on the street</h3>
            <p className="cv-report-where"><MapPin size={14} /> 9 Ave SE, Inglewood <span className="cv-tag"><b>2</b>12 min ago</span></p>
            <p className="cv-report-body">Passenger window smashed on a grey hatchback overnight. Glass is still on the sidewalk.</p>
            <div className="cv-report-confirm"><i className="on"><Check size={12} /> I saw this too · 3</i><i>Still happening</i><i>Seems resolved</i></div>
            <div className="cv-report-foot"><span className="cv-tag"><b>3</b><Flag size={13} /> Flag</span><span className="cv-tag"><b>4</b><Timer size={13} /> Leaves the map in 4 days</span></div>
            <figcaption>Example report</figcaption>
          </figure>
        </div>
        <div className="cv-911">
          <Phone size={22} aria-hidden="true" />
          <p><b>In an emergency, call 911.</b> Police non-emergency: <a href="tel:4032661234">403-266-1234</a>. CalgaryWatch is not a way to reach police.</p>
        </div>
      </div>
    </section>
  );
}

/* ── Your street first: the Monday email ──────────────────────────── */

export function MondayEmail() {
  return (
    <section className="cv-street" aria-labelledby="cv-street-title">
      <Tear />
      <div className="cw-wrap cv-street-grid">
        <div>
          <p className="cv-kicker"><Bell size={14} aria-hidden="true" /> The Monday email</p>
          <h2 id="cv-street-title">Your street first, <mark>then the city.</mark></h2>
          <p className="cv-lead">Tell us your area and get a free email every Monday morning. It starts with reports within a 15-minute walk of home, and only widens to 3 km, then 10 km, when it's quiet.</p>
          <ul className="cv-rings">
            <li><i className="r1" /><b>15-minute walk</b><span>about 1.2 km</span></li>
            <li><i className="r2" /><b>3 km</b><span>your part of town</span></li>
            <li><i className="r3" /><b>10 km</b><span>the wider city</span></li>
          </ul>
          <Link className="cv-btn cv-btn-yellow" to="/map?settings=alerts"><Bell size={18} /> Get the Monday email</Link>
          <p className="cv-small">Free, opt in only, and one click to unsubscribe.</p>
        </div>
        <div className="cv-email" aria-hidden="true">
          <div className="cv-email-top"><Mail size={15} /><span><b>CalgaryWatch</b> · Monday, 7 am</span><em>Example</em></div>
          <p className="cv-email-subj">Your area this week</p>
          <p className="cv-email-ring"><i className="r1" />Within a 15-minute walk · 2</p>
          <p className="cv-email-row"><b>Car break-in</b> · 400 m away</p>
          <p className="cv-email-row"><b>Bike stolen from a garage</b> · 900 m away</p>
          <p className="cv-email-ring"><i className="r2" />Within 3 km · 5</p>
          <p className="cv-email-row cv-email-more">Road closure, power outage and 3 more</p>
        </div>
      </div>
      <Tear bottom />
    </section>
  );
}

/* ── Questions, then the close ────────────────────────────────────── */

export function Questions() {
  return (
    <section className="cv-sec cv-faq" aria-labelledby="cm-faq">
      <div className="cw-wrap cv-faq-grid">
        <div>
          <h2 id="cm-faq">Questions <mark>people ask.</mark></h2>
          <p className="cv-sub">About the Calgary crime map, sirens, helicopters and what CalgaryWatch is (and isn't). Something else? Email <a href="mailto:aldo@calgarywatch.ca">aldo@calgarywatch.ca</a>.</p>
        </div>
        <div className="cv-faq-list">
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

export function Closing() {
  return (
    <section className="cv-sec cv-close-wrap" aria-labelledby="cv-close-title">
      <div className="cw-wrap">
        <div className="cv-close">
          <h2 id="cv-close-title">It gets better with every neighbour.</h2>
          <p>Keep your Facebook group and Nextdoor for talking things through. CalgaryWatch is the whole city at a glance, built in Calgary and still small. The next report that helps someone on your street could be yours.</p>
          <div className="cv-ctas">
            <Link className="cv-btn cv-btn-ink" to="/map">Open the live map <ArrowUpRight size={18} /></Link>
            <Link className="cv-btn cv-btn-paper" to="/map?report=true"><Plus size={18} /> Post a report</Link>
          </div>
        </div>
        <nav className="cv-more" aria-label="More about Community Watch">
          <Link to="/calgary-neighbourhood-watch"><strong>Start a neighbourhood watch</strong><span>A practical guide for your street or building</span><ArrowUpRight size={18} /></Link>
          <Link to="/coverage"><strong>Every source we use</strong><span>Where each kind of pin comes from</span><ArrowUpRight size={18} /></Link>
          <Link to="/airdrie-crime-map"><strong>Airdrie crime map</strong><span>What's covered north of the city</span><ArrowUpRight size={18} /></Link>
        </nav>
      </div>
    </section>
  );
}
