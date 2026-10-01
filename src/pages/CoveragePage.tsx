import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Check, EyeOff, Flag, MapPin, Phone, Timer, UserCheck } from 'lucide-react';
import { SiteLayout } from '../components/site/SiteLayout';
import { COVERAGE_BROWSER_SOURCES as BROWSER, COVERAGE_FAQS as FAQS, COVERAGE_SERVER_SOURCES as SERVER, coverageSourceLink as link, type CoverageSource as Source } from '../content/coverage';
import '../styles/community.css';
import '../styles/coverage-page.css';

const KINDS = [
  { tone: 'red', title: 'Neighbour reports', body: 'Posted by signed-in Calgarians. They show up right away.', icon: 'people' },
  { tone: 'navy', title: 'Official feeds', body: 'Collected by our server every 30 minutes. Power outages every 5 minutes.', icon: 'server' },
  { tone: 'blue', title: 'Live city layers', body: 'Loaded by your browser when you open the map, then refreshed while it stays open.', icon: 'map' },
] as const;

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
