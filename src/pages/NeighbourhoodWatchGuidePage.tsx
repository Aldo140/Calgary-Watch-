import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, Bell, ChevronDown, EyeOff, Flag, MapPin, Phone, Radio, ShieldCheck, Timer } from 'lucide-react';
import { SiteLayout } from '../components/site/SiteLayout';
import {
  GUIDE_COMPARISON,
  GUIDE_FAQS,
  GUIDE_SOURCES,
  GUIDE_UPDATED,
} from '@/src/content/neighbourhoodWatchGuide';
import '../styles/community.css';
import '../styles/watch-guide.css';

const TOC = [
  { href: '#understand-the-map', label: 'Read the map' },
  { href: '#start-a-watch', label: 'Start a watch' },
  { href: '#choose-a-source', label: 'Which source to use' },
  { href: '#reporting', label: 'Reporting' },
  { href: '#questions', label: 'Questions' },
];

const CHECKS = [
  { label: 'Time', copy: 'When was it reported? A report from this morning means more than one from four days ago.', tone: 'red' },
  { label: 'Source', copy: 'Did a neighbour post it, or did it come from Calgary Police, the City or another official source?', tone: 'navy' },
  { label: 'Status', copy: 'Have neighbours confirmed it, marked it still happening, or marked it resolved?', tone: 'blue' },
] as const;

const STEPS = [
  {
    title: 'Meet your neighbours',
    body: 'Knock on a few doors or put a note in the lobby. Swap names and a way to reach each other with the people who want to take part.',
  },
  {
    title: 'Pick one place to share',
    body: 'A group chat or email list is enough. Agree to share what you saw, where and when. Don’t post names or photos of people who haven’t done anything.',
  },
  {
    title: 'Agree on who calls police',
    body: <>Anyone who sees an emergency or a crime in progress calls 911. For anything else, call Calgary Police non-emergency at <span className="wg-nw">403-266-1234</span>.</>,
  },
  {
    title: 'Watch the area together',
    body: 'Check the CalgaryWatch map for reports near you, and have everyone sign up for the free Monday email for your area.',
  },
];

/** A row of Calgary houses with a few pins over them, drawn in the site's ink-outline style. */
function StreetArt() {
  const ink = { stroke: '#151515', strokeWidth: 2.5, strokeLinejoin: 'round' as const };
  const houses = [
    { x: 24, top: 212, peak: 162, body: '#ffdf4f', door: '#06162f' },
    { x: 146, top: 196, peak: 146, body: '#ffe1dc', door: '#00c2e0' },
    { x: 268, top: 218, peak: 172, body: '#dfe7ff', door: '#ff5a4e' },
    { x: 390, top: 202, peak: 152, body: '#c9f2d4', door: '#ffdf4f' },
  ];
  const pin = 'M0,0C-8,-10 -12,-16 -12,-22A12,12 0 1 1 12,-22C12,-16 8,-10 0,0Z';
  return (
    <figure className="wg-art">
      <svg viewBox="0 0 520 400" role="img" aria-label="Illustration of a row of Calgary houses with map pins over two of them">
        <rect width="520" height="400" fill="#d7f3f9" />
        {/* skyline and the Calgary Tower, far off */}
        <g fill="#b3dcea">
          <rect x="30" y="120" width="34" height="90" />
          <rect x="68" y="96" width="26" height="114" />
          <rect x="300" y="110" width="30" height="100" />
          <rect x="334" y="130" width="40" height="80" />
          <path d="M118,210V96h6V210Z" />
          <path d="M108,98h26l-4,-12h-18Z" />
          <rect x="119" y="72" width="4" height="14" />
        </g>
        <circle cx="452" cy="68" r="26" fill="#ffdf4f" {...ink} />
        {/* ground */}
        <rect y="298" width="520" height="18" fill="#c9f2d4" />
        <rect y="316" width="520" height="16" fill="#fffdf7" />
        <path d="M0,298H520M0,316H520M0,332H520" fill="none" {...ink} />
        <rect y="332" width="520" height="68" fill="#06162f" />
        <path d="M14,366H520" stroke="#ffdf4f" strokeWidth="5" strokeDasharray="28 20" />
        {houses.map((h) => {
          const cx = h.x + 53;
          return (
            <g key={h.x}>
              <rect x={h.x} y={h.top} width="106" height={298 - h.top} fill={h.body} {...ink} />
              <path d={`M${h.x - 8},${h.top}L${cx},${h.peak}L${h.x + 114},${h.top}Z`} fill="#06162f" {...ink} />
              <rect x={cx - 12} y="256" width="24" height="42" rx="2" fill={h.door} {...ink} />
              <circle cx={cx + 6} cy="278" r="2.2" fill="#151515" />
              {[h.x + 12, h.x + 74].map((wx) => (
                <g key={wx}>
                  <rect x={wx} y={h.top + 16} width="20" height="20" fill="#fffdf7" {...ink} />
                  <path d={`M${wx + 10},${h.top + 16}V${h.top + 36}M${wx},${h.top + 26}H${wx + 20}`} fill="none" stroke="#151515" strokeWidth="2" />
                </g>
              ))}
            </g>
          );
        })}
        {/* shrubs */}
        {[16, 136, 258, 380, 506].map((x) => <circle key={x} cx={x} cy="296" r="11" fill="#2fb86a" {...ink} />)}
        {/* pins */}
        <g transform="translate(199 138) scale(1.35)"><path d={pin} fill="#ff5a4e" {...ink} strokeWidth={1.8} /><circle cy="-22" r="4.5" fill="#fff" /></g>
        <g transform="translate(443 144) scale(1.2)"><path d={pin} fill="#00c2e0" {...ink} strokeWidth={2} /><circle cy="-22" r="4.5" fill="#fff" /></g>
        <g transform="translate(300 360) scale(1.1)"><path d={pin} fill="#ffdf4f" {...ink} strokeWidth={2} /><circle cy="-22" r="4.5" fill="#151515" /></g>
        {/* neighbour confirmation bubble */}
        <g transform="translate(222 58)">
          <rect width="142" height="34" rx="17" fill="#fff" {...ink} />
          <path d="M16,33L6,46L30,33" fill="#fff" {...ink} />
          <rect x="3" y="31" width="30" height="4" fill="#fff" />
          <text x="71" y="22" textAnchor="middle" className="wg-art-bubble">I saw this too</text>
        </g>
      </svg>
    </figure>
  );
}

export default function NeighbourhoodWatchGuidePage() {
  return (
    <SiteLayout>
      <div className="cm wg">
        <section className="cm-hero" aria-labelledby="guide-title">
          <div className="cw-wrap cm-hero-grid">
            <div className="wg-hero-copy">
              <p className="cm-kicker">Calgary neighbourhood watch guide · Reviewed {GUIDE_UPDATED}</p>
              <h1 id="guide-title">Calgary crime map and <span>neighbourhood watch.</span></h1>
              <p className="cm-lead">How to check recent reports near you, what each source can and can’t tell you, how to start a watch on your street or in your building, and who to call when something needs action.</p>
              <div className="cm-ctas">
                <Link className="cm-btn cm-btn-primary" to="/map"><MapPin size={18} aria-hidden="true" /> Check reports near me</Link>
                <Link className="cm-btn" to="/community">How Community Watch works <ArrowRight size={18} aria-hidden="true" /></Link>
              </div>
              <div className="wg-hero-tels">
                <a href="tel:911" className="wg-tel wg-tel-911"><small>Immediate danger</small>Call 911</a>
                <a href="tel:4032661234" className="wg-tel"><small>Police, not in progress</small>403-266-1234</a>
              </div>
              <p className="wg-hero-note">CalgaryWatch is an independent community map. It is not a Calgary Police Service dispatch feed or officer tracker.</p>
            </div>
            <StreetArt />
          </div>
        </section>

        <div className="cw-wrap">
          <nav className="wg-toc" aria-label="On this page">
            <span>On this page</span>
            <ul>
              {TOC.map((item) => <li key={item.href}><a href={item.href}>{item.label}</a></li>)}
            </ul>
          </nav>

          <section id="understand-the-map" className="cm-section wg-anchor" aria-labelledby="near-me-heading">
            <div className="cm-head">
              <h2 id="near-me-heading">What a Calgary crime map can show near you</h2>
              <p>“Police activity near me” can mean a siren, a road closure, a neighbour’s report or official crime statistics. No public map shows every live police call or where officers are.</p>
            </div>
            <p className="wg-prose">CalgaryWatch shows recent reports from neighbours alongside official sources such as Calgary Police news releases and City of Calgary data. It helps you know what’s going on nearby, but it can’t confirm that police attended. Before you decide what a pin means, check three things:</p>
            <ul className="cm-shows wg-checks">
              {CHECKS.map((c, i) => (
                <li key={c.label} className={`cm-show cm-tone-${c.tone}`}>
                  <span className="wg-check-n" aria-hidden="true">{i + 1}</span>
                  <strong>{c.label}</strong>
                  <p>{c.copy}</p>
                </li>
              ))}
            </ul>
          </section>

          <section id="start-a-watch" className="cm-section wg-anchor" aria-labelledby="start-heading">
            <div className="cm-head">
              <h2 id="start-heading">How to start a neighbourhood watch in Calgary</h2>
              <p>A watch for your street or building doesn’t need a budget or a formal group. It needs a few neighbours who agree on how to share and who to call.</p>
            </div>
            <ol className="cm-steps wg-steps">
              {STEPS.map((s, i) => (
                <li key={s.title}>
                  <span className="cm-step-n">{i + 1}</span>
                  <h3>{s.title}</h3>
                  <p>{s.body}</p>
                </li>
              ))}
            </ol>
          </section>

          <section id="choose-a-source" className="cm-section wg-anchor" aria-labelledby="source-heading">
            <div className="cm-head">
              <h2 id="source-heading">Which source to use for what</h2>
              <p>A community map, official statistics and emergency lines each do a different job. Start with what you need to know.</p>
            </div>
            <ol className="wg-routes">
              {GUIDE_COMPARISON.map((row, i) => {
                const external = row.action.startsWith('http');
                const inner = <>{row.actionLabel} {external ? <ArrowUpRight size={16} aria-hidden="true" /> : <ArrowRight size={16} aria-hidden="true" />}</>;
                return (
                  <li key={row.need} className={row.action === 'tel:911' ? 'wg-route-911' : undefined}>
                    <span className="wg-route-n" aria-hidden="true">0{i + 1}</span>
                    <div>
                      <strong>{row.need}</strong>
                      <p>{row.source.replace('Calgary Watch', 'CalgaryWatch')}</p>
                    </div>
                    {row.action.startsWith('/')
                      ? <Link className="wg-route-go" to={row.action}>{inner}</Link>
                      : <a className="wg-route-go" href={row.action} rel={external ? 'external' : undefined}>{inner}</a>}
                  </li>
                );
              })}
            </ol>
          </section>

          <section className="cm-section" aria-labelledby="block-watch-heading">
            <div className="cm-head">
              <h2 id="block-watch-heading">Block Watch and CalgaryWatch are different</h2>
              <p>They can work well together, but one doesn’t replace the other.</p>
            </div>
            <div className="wg-compare">
              <div className="wg-compare-card">
                <p className="cm-eyebrow">Block Watch</p>
                <p>Neighbours organizing on their own block to reduce opportunities for crime, share prevention tips, and report suspicious activity through the right channels.</p>
              </div>
              <div className="wg-compare-card wg-compare-cw">
                <p className="cm-eyebrow">CalgaryWatch</p>
                <p>An independent public map of recent reports across Calgary. It is not a Block Watch chapter or a Calgary Police Service program.</p>
              </div>
            </div>
          </section>

          <section className="cm-section" aria-labelledby="cw-heading">
            <div className="cm-head">
              <h2 id="cw-heading">What CalgaryWatch adds for your street</h2>
              <p>Free to browse. You only need an account to post a report.</p>
            </div>
            <ul className="cm-trust-grid">
              <li><MapPin size={22} aria-hidden="true" /><strong>Reports from neighbours</strong><p>Signed-in residents post what they see, pinned where it happened. Posting anonymously is optional, and your email is never shown.</p></li>
              <li><Radio size={22} aria-hidden="true" /><strong>Official sources, pinned automatically</strong><p>Calgary Police news releases, City 311, traffic, weather and emergency alerts, and ENMAX power outages.</p></li>
              <li><ShieldCheck size={22} aria-hidden="true" /><strong>Neighbours can back it up</strong><p>People nearby can tap “I saw this too”, “Still happening” or “Seems resolved”.</p></li>
              <li><Flag size={22} aria-hidden="true" /><strong>Bad reports get hidden</strong><p>When two people flag a report, it comes off the map.</p></li>
              <li><Timer size={22} aria-hidden="true" /><strong>Reports expire</strong><p>Neighbour reports come off the map after 5 days.</p></li>
              <li className="cm-trust-911"><EyeOff size={22} aria-hidden="true" /><strong>Not a police feed</strong><p>CalgaryWatch doesn’t show dispatch calls or where officers are, and posting here doesn’t create a police report.</p></li>
            </ul>
            <div className="wg-email">
              <div>
                <strong>A free Monday email for your area</strong>
                <p>Reports within a 15-minute walk of home first, then 3 km and 10 km when it’s quiet. Opt in only.</p>
              </div>
              <Link className="cm-btn cm-btn-primary" to="/map?settings=alerts"><Bell size={18} aria-hidden="true" /> Get the Monday email</Link>
            </div>
          </section>

          <section id="reporting" className="cm-section wg-anchor wg-report" aria-labelledby="report-heading">
            <div>
              <p className="cm-eyebrow">Reporting</p>
              <h2 id="report-heading">Report through the right channel first</h2>
              <p>Call 911 for an emergency or a crime in progress. For a Calgary police matter that isn’t in progress, call <span className="wg-nw">403-266-1234</span>. Posting on CalgaryWatch can let neighbours know, but it does not create a police report.</p>
            </div>
            <div className="wg-report-tels">
              <a href="tel:911" className="wg-tel wg-tel-911"><small>Emergency or crime in progress</small><Phone size={18} aria-hidden="true" /> 911</a>
              <a href="tel:4032661234" className="wg-tel"><small>Police non-emergency</small><Phone size={18} aria-hidden="true" /> 403-266-1234</a>
            </div>
          </section>

          <section id="questions" className="cm-section wg-anchor" aria-labelledby="faq-heading">
            <div className="cm-head">
              <h2 id="faq-heading">Common questions</h2>
              <p>What the map can show, what it can’t confirm, and when to use an official service.</p>
            </div>
            <div className="wg-faq">
              {GUIDE_FAQS.map((faq) => (
                <details key={faq.question}>
                  <summary>{faq.question}<ChevronDown size={20} aria-hidden="true" /></summary>
                  <p>{faq.answer}</p>
                </details>
              ))}
            </div>
          </section>

          <section className="cm-section" aria-labelledby="sources-heading">
            <div className="cm-head">
              <h2 id="sources-heading">Official Calgary references</h2>
              <p>Use these when you need official confirmation or to make a report.</p>
            </div>
            <ul className="wg-sources">
              {GUIDE_SOURCES.map((s) => (
                <li key={s.url}><a href={s.url} rel="external">{s.name}<ArrowUpRight size={18} aria-hidden="true" /></a></li>
              ))}
            </ul>
          </section>

          <nav className="cm-more" aria-label="Next steps">
            <Link to="/map"><strong>Open the live map</strong><span>Recent reports near you, with sources</span><ArrowUpRight size={18} aria-hidden="true" /></Link>
            <Link to="/community"><strong>How Community Watch works</strong><span>Posting, confirming and flagging reports</span><ArrowUpRight size={18} aria-hidden="true" /></Link>
            <Link to="/airdrie-crime-map"><strong>Airdrie crime map guide</strong><span>Community reports and Airdrie’s official crime map</span><ArrowUpRight size={18} aria-hidden="true" /></Link>
          </nav>
        </div>
      </div>
    </SiteLayout>
  );
}
