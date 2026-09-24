import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Check, EyeOff, Flag, MapPin, Phone, Timer, UserCheck } from 'lucide-react';
import { SiteLayout } from '../components/site/SiteLayout';
import { DATA_SOURCE_BY_ID } from '../config/dataSources';
import '../styles/community.css';
import '../styles/coverage-page.css';

type Source = {
  name: string;
  covers: string;
  often: string;
  /** Registry id in src/config/dataSources.ts, used for the source link. */
  id?: string;
  href?: string;
  note?: string;
};

const link = (s: Source) => s.href ?? (s.id ? DATA_SOURCE_BY_ID.get(s.id)?.homepage : undefined);

/** scripts/ingest/index.ts, run by .github/workflows/ingest-live-data.yml at :13 and :43. */
const SERVER: Source[] = [
  { id: 'calgary_311', name: 'City of Calgary 311', covers: 'Safety-related service requests only. A 311 request is never shown as an emergency.', often: 'Every 30 minutes' },
  { id: 'calgary_police_news', name: 'Calgary Police news releases', covers: 'Releases from the Calgary Police newsroom that name a Calgary community or quadrant. This is not a police dispatch log.', often: 'Every 30 minutes' },
  { id: 'environment_canada', name: 'Environment Canada warnings', covers: 'Active weather warnings for the Calgary area.', often: 'Every 30 minutes' },
  { id: 'alberta_emergency', name: 'Alberta Emergency Alerts', covers: 'Provincial alerts for Calgary, plus Alberta-wide alerts.', often: 'Every 30 minutes' },
  { id: 'global_news', name: 'Global News Calgary', covers: 'Safety stories that name a Calgary location.', often: 'Every 30 minutes' },
  { id: 'enmax_outages', name: 'ENMAX power outages', covers: 'Current power outages.', often: 'Every 5 minutes' },
  { id: 'alberta_511', name: '511 Alberta', covers: 'Road events in the Calgary region.', often: 'Every 30 minutes', note: 'When available' },
];

/** Loaded by the browser from src/pages/MapPage.tsx and its hooks. */
const BROWSER: Source[] = [
  { id: 'calgary_traffic', name: 'City of Calgary traffic incidents', covers: 'Current collisions, closures and other traffic disruptions.', often: 'Every 5 minutes' },
  { id: 'calgary_311', name: 'City of Calgary 311', covers: 'Open safety-related requests from the last 7 days.', often: 'Every 5 minutes' },
  { id: 'water_main', name: 'City of Calgary water main breaks', covers: 'Active water main breaks.', often: 'Every 5 minutes' },
  { name: 'River levels', href: 'https://rivers.alberta.ca/', covers: 'Bow River at Calgary, Elbow River below Glenmore Dam, and Elbow River at Bragg Creek. A pin appears only when a river is rising.', often: 'Every 30 minutes' },
  { id: 'open_meteo', name: 'Weather conditions (Open-Meteo)', covers: 'Current conditions. A pin appears only for rain, snow, fog, strong wind or extreme cold.', often: 'Every 30 minutes' },
  { name: 'Air quality (Open-Meteo)', href: 'https://open-meteo.com/en/docs/air-quality-api', covers: 'Smoke and fine particles. A pin appears only when air quality is moderate or worse.', often: 'Every 30 minutes' },
  { name: 'Traffic cameras', href: 'https://data.calgary.ca/d/k7p9-kppz', covers: 'City of Calgary traffic camera locations, with the live image. Turn the layer on in the map.', often: 'Once per visit' },
  { name: 'Intersection safety cameras', href: 'https://data.calgary.ca/d/dv2f-necx', covers: 'Locations of the City’s fixed red-light and speed-on-green cameras. Turn the layer on in the map.', often: 'Once per visit' },
];

const KINDS = [
  { tone: 'red', title: 'Neighbour reports', body: 'Posted by signed-in Calgarians. They show up right away.', icon: 'people' },
  { tone: 'navy', title: 'Official feeds', body: 'Collected by our server every 30 minutes. Power outages every 5 minutes.', icon: 'server' },
  { tone: 'blue', title: 'Live city layers', body: 'Loaded by your browser when you open the map, then refreshed while it stays open.', icon: 'map' },
] as const;

const FAQS = [
  {
    q: 'Does CalgaryWatch cover towns outside Calgary?',
    a: 'CalgaryWatch is built for Calgary. The official feeds are filtered to the Calgary area. Neighbour reports can be pinned anywhere, and the map shows weather and air-quality pins for a few nearby towns such as Airdrie, Cochrane and Okotoks. It does not have full coverage outside Calgary.',
  },
  {
    q: 'Does an empty area mean nothing happened there?',
    a: 'No. The map only shows what neighbours posted and what the sources above published. Many incidents are never reported publicly. The number of pins is not a crime rate.',
  },
  {
    q: 'Are neighbour reports checked by police?',
    a: 'No. They are what residents saw. Each pin shows its source and when it was posted, and neighbours can mark a report as seen, still happening or resolved.',
  },
  {
    q: 'How do I report a crime?',
    a: 'Call 911 for an emergency or a crime in progress. For anything else, call Calgary Police non-emergency at 403-266-1234. Posting on CalgaryWatch does not create a police report.',
  },
  {
    q: 'Is CalgaryWatch free?',
    a: 'Yes. Anyone can look at the map without an account. You need a free account only to post a report.',
  },
];

function KindIcon({ k }: { k: (typeof KINDS)[number]['icon'] }) {
  const c = { fill: 'none', stroke: '#151515', strokeWidth: 2.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      {k === 'people' ? <><circle cx="17" cy="17" r="7" {...c} fill="#fff" /><circle cx="33" cy="19" r="6" {...c} fill="#fff" /><path d="M5,40c1-9 7-13 12-13s11,4 12,13" {...c} fill="#fff" /><path d="M26,38c1-7 4-10 7-10s7,3 9,10" {...c} /></>
        : k === 'server' ? <><rect x="8" y="8" width="32" height="13" rx="3" {...c} fill="#fff" /><rect x="8" y="27" width="32" height="13" rx="3" {...c} fill="#fff" /><path d="M14,14.5h2M14,33.5h2M24,14.5h10M24,33.5h10" {...c} /></>
        : <><path d="M6,12L17,7L31,12L42,7V36L31,41L17,36L6,41Z" {...c} fill="#fff" /><path d="M17,7V36M31,12V41" {...c} /></>}
    </svg>
  );
}

function SourceList({ items, label }: { items: Source[]; label: string }) {
  return (
    <div className="cov-table" role="table" aria-label={label}>
      <div className="cov-row cov-row-head" role="row">
        <span role="columnheader">Source</span>
        <span role="columnheader">What it covers</span>
        <span role="columnheader">How often</span>
      </div>
      {items.map(s => {
        const href = link(s);
        return (
          <div className="cov-row" role="row" key={s.name}>
            <span role="cell" className="cov-name">
              {href ? <a href={href} target="_blank" rel="noopener noreferrer">{s.name}<ArrowUpRight size={14} aria-hidden="true" /></a> : s.name}
              {s.note ? <em className="cov-note">{s.note}</em> : null}
            </span>
            <span role="cell" className="cov-covers">{s.covers}</span>
            <span role="cell" className="cov-often"><b>{s.often}</b></span>
          </div>
        );
      })}
    </div>
  );
}

export default function CoveragePage() {
  // FAQPage structured data, built from the questions visible on this page.
  useEffect(() => {
    const el = document.createElement('script');
    el.type = 'application/ld+json';
    el.setAttribute('data-ld', 'coverage-faq');
    el.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: FAQS.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
    });
    document.head.querySelector('script[data-ld="coverage-faq"]')?.remove();
    document.head.appendChild(el);
    return () => { el.remove(); };
  }, []);

  return (
    <SiteLayout>
      <div className="cm cov">
        <section className="cm-hero" aria-labelledby="cov-title">
          <div className="cw-wrap cm-hero-grid">
            <div>
              <p className="cm-kicker">CalgaryWatch sources</p>
              <h1 id="cov-title">Where every pin comes from, <span>and how often it updates.</span></h1>
              <p className="cm-lead">Each pin on the map comes from a neighbour or from a public source. This page lists every source, what it covers and how often we check it.</p>
              <div className="cm-ctas">
                <Link className="cm-btn cm-btn-primary" to="/map">Open the live map <ArrowUpRight size={18} /></Link>
                <Link className="cm-btn" to="/community">Back to Community Watch</Link>
              </div>
            </div>
            <div className="cov-card">
              <p className="cov-card-title">How often the map updates</p>
              <ul>
                <li><b>Right away</b><span>Neighbour reports</span></li>
                <li><b>5 min</b><span>City traffic, 311, water mains, power outages</span></li>
                <li><b>30 min</b><span>Police news, weather and emergency alerts, news, rivers</span></li>
              </ul>
            </div>
          </div>
        </section>

        <div className="cw-wrap">
          <section className="cm-section" aria-labelledby="cov-kinds">
            <div className="cm-head">
              <h2 id="cov-kinds">Three kinds of pins</h2>
              <p>Every pin says where it came from and when.</p>
            </div>
            <ul className="cm-shows">
              {KINDS.map(k => (
                <li key={k.title} className={`cm-show cm-tone-${k.tone}`}>
                  <span className="cm-show-icon"><KindIcon k={k.icon} /></span>
                  <strong>{k.title}</strong>
                  <p>{k.body}</p>
                </li>
              ))}
            </ul>
          </section>

          <section className="cm-section" aria-labelledby="cov-neighbours">
            <div className="cm-head">
              <h2 id="cov-neighbours">Neighbour reports</h2>
              <p>Residents post what they see. These are not checked by police.</p>
            </div>
            <ul className="cm-trust-grid">
              <li><UserCheck size={22} /><strong>Signed-in residents only</strong><p>You need a free account to post. Anyone can read the map.</p></li>
              <li><EyeOff size={22} /><strong>Anonymous if you want</strong><p>You can post anonymously. Your email is never shown on a report.</p></li>
              <li><Timer size={22} /><strong>On the map for 5 days</strong><p>After 5 days a neighbour report comes off the map.</p></li>
              <li><Check size={22} /><strong>Neighbours can respond</strong><p>People can tap “I saw this too”, “Still happening” or “Seems resolved”.</p></li>
              <li><Flag size={22} /><strong>Two flags hide a report</strong><p>When two different people flag a report, it is hidden.</p></li>
              <li className="cm-trust-911"><Phone size={22} /><strong>In an emergency, call 911</strong><p>Non-emergency police: <a href="tel:4032661234">403-266-1234</a>. CalgaryWatch does not contact police.</p></li>
            </ul>
          </section>

          <section className="cm-section" aria-labelledby="cov-server">
            <div className="cm-head">
              <h2 id="cov-server">Official feeds</h2>
              <p>Our server collects these on a schedule and adds them to the map.</p>
            </div>
            <SourceList items={SERVER} label="Official feeds collected by our server" />
            <p className="cov-foot">511 Alberta road events are added only when that feed is switched on.</p>
          </section>

          <section className="cm-section" aria-labelledby="cov-browser">
            <div className="cm-head">
              <h2 id="cov-browser">Live city layers</h2>
              <p>Your browser loads these when you open the map, and refreshes them while it is open.</p>
            </div>
            <SourceList items={BROWSER} label="Layers loaded when you open the map" />
          </section>

          <section className="cm-section cov-area" aria-labelledby="cov-area">
            <div className="cov-area-copy">
              <p className="cm-eyebrow">Area covered</p>
              <h2 id="cov-area">Built for Calgary.</h2>
              <p>The official feeds are filtered to the Calgary area. Neighbour reports can be pinned anywhere, and the map shows weather and air-quality pins for a few nearby towns such as Airdrie, Cochrane and Okotoks. We don’t claim full coverage outside the city.</p>
              <p>An empty part of the map doesn’t mean nothing happened there. The number of pins is not a crime rate.</p>
            </div>
            <div className="cov-area-tag" aria-hidden="true"><MapPin size={26} /> Calgary</div>
          </section>

          <section className="cm-section" aria-labelledby="cov-faq">
            <div className="cm-head">
              <h2 id="cov-faq">Questions</h2>
            </div>
            <div className="cov-faq">
              {FAQS.map(f => (
                <details key={f.q}>
                  <summary>{f.q}</summary>
                  <p>{f.a}</p>
                </details>
              ))}
            </div>
          </section>

          <nav className="cm-more" aria-label="More from CalgaryWatch">
            <Link to="/community"><strong>Community Watch</strong><span>How neighbour reports work</span><ArrowUpRight size={18} /></Link>
            <Link to="/calgary-neighbourhood-watch"><strong>Start a neighbourhood watch</strong><span>A practical guide for your street or building</span><ArrowUpRight size={18} /></Link>
            <Link to="/airdrie-crime-map"><strong>Airdrie crime map guide</strong><span>Where to find Airdrie crime data</span><ArrowUpRight size={18} /></Link>
          </nav>
        </div>
      </div>
    </SiteLayout>
  );
}
