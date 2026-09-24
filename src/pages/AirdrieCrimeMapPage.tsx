import { Link } from 'react-router-dom';
import { ArrowUpRight, BellOff, Check, CloudSun, EyeOff, Flag, Globe, MapPin, Phone, Route, Siren, Timer, Building2, X } from 'lucide-react';
import { SiteLayout } from '../components/site/SiteLayout';
import {
  AIRDRIE_GUIDE_FAQS,
  AIRDRIE_GUIDE_SOURCES,
  AIRDRIE_GUIDE_UPDATED,
  AIRDRIE_MAP_COMPARISON,
} from '../content/airdrieCrimeMapGuide';
import '../styles/community.css';
import '../styles/airdrie-page.css';

const OFFICIAL_MAP = AIRDRIE_GUIDE_SOURCES[0].url;
const ONLINE_REPORTING = AIRDRIE_GUIDE_SOURCES[3].url;

/* Flat projection of the Calgary–Airdrie corridor. Accurate enough to show where Airdrie sits. */
const BOX = { n: 51.37, s: 50.83, w: -114.36, e: -113.8 };
const px = (lng: number) => 15 + ((lng - BOX.w) / (BOX.e - BOX.w)) * 330;
const py = (lat: number) => 15 + ((BOX.n - lat) / (BOX.n - BOX.s)) * 430;
const line = (pts: [number, number][]) => pts.map(([lat, lng], i) => `${i ? 'L' : 'M'}${px(lng).toFixed(1)},${py(lat).toFixed(1)}`).join('');

const CALGARY: [number, number][] = [[51.2, -114.26], [51.212, -114.15], [51.21, -114.05], [51.19, -113.92], [51.12, -113.87], [51.02, -113.88], [50.95, -113.9], [50.87, -113.94], [50.85, -114.05], [50.86, -114.16], [50.9, -114.23], [50.98, -114.28], [51.08, -114.3], [51.15, -114.29]];
const AIRDRIE: [number, number][] = [[51.336, -114.065], [51.338, -113.96], [51.3, -113.952], [51.258, -113.958], [51.254, -114.02], [51.262, -114.068], [51.3, -114.07]];
const BOW: [number, number][] = [[51.105, -114.3], [51.092, -114.21], [51.08, -114.16], [51.066, -114.118], [51.055, -114.085], [51.047, -114.035], [51.012, -114.002], [50.97, -113.99], [50.92, -113.985], [50.86, -113.975]];
const HWY2: [number, number][] = [[51.37, -114.0], [51.3, -114.004], [51.22, -113.998], [51.15, -114.0], [51.09, -114.025], [51.05, -114.035], [50.98, -114.02], [50.9, -113.99], [50.83, -113.98]];

function CorridorMap() {
  const edge = py(51.3);
  return (
    <svg className="ad-map" viewBox="0 0 360 460" role="img" aria-label="Map showing Airdrie just north of Calgary, joined by Highway 2. Calgary is policed by Calgary Police Service; Airdrie is policed by the RCMP.">
      <defs>
        <pattern id="ad-grid" width="18" height="18" patternUnits="userSpaceOnUse"><path d="M18,0H0V18" fill="none" stroke="rgba(21,21,21,.07)" strokeWidth="1.5" /></pattern>
      </defs>
      <rect width="360" height="460" fill="#fffdf7" />
      <rect width="360" height="460" fill="url(#ad-grid)" />
      <path className="ad-map-calgary" d={line(CALGARY) + 'Z'} />
      <path className="ad-map-bow" d={line(BOW)} />
      <path className="ad-map-hwy" d={line(HWY2)} />
      <path className="ad-map-airdrie" d={line(AIRDRIE) + 'Z'} />
      <path className="ad-map-edge" d={`M15,${edge.toFixed(1)}H345`} />
      <text className="ad-map-note" x="20" y={(edge + 15).toFixed(1)}>511 road events stop here</text>
      <g className="ad-map-hwy-tag" transform={`translate(${px(-113.998).toFixed(1)} ${py(51.23).toFixed(1)})`}>
        <rect x="-17" y="-10" width="34" height="20" rx="5" />
        <text y="4.5" textAnchor="middle">Hwy 2</text>
      </g>
      <text className="ad-map-city" x={px(-114.15).toFixed(1)} y={py(51.06).toFixed(1)} textAnchor="middle">CALGARY</text>
      <text className="ad-map-sub" x={px(-114.15).toFixed(1)} y={(py(51.06) + 18).toFixed(1)} textAnchor="middle">Calgary Police Service</text>
      <text className="ad-map-city" x={px(-114.09).toFixed(1)} y={py(51.33).toFixed(1)} textAnchor="end">AIRDRIE</text>
      <text className="ad-map-sub" x={px(-114.09).toFixed(1)} y={(py(51.33) + 16).toFixed(1)} textAnchor="end">Airdrie RCMP</text>
      <g transform="translate(330 400)" className="ad-map-north">
        <circle r="15" />
        <path d="M0,-10L5,4H-5Z" />
        <text y="28" textAnchor="middle">N</text>
      </g>
    </svg>
  );
}

const FIND = [
  { icon: MapPin, title: 'Neighbour reports', body: 'Signed-in residents can pin a report anywhere in the map’s service area, which includes Airdrie. How many Airdrie reports you see depends on how many Airdrie residents post.', tone: 'yellow' },
  { icon: CloudSun, title: 'Weather and air quality', body: 'The map checks conditions at a point in Airdrie and adds a pin when the weather turns severe or the air quality is poor.', tone: 'blue' },
  { icon: Route, title: 'Some road events', body: '511 Alberta road events are pulled for an area around Calgary that ends partway through Airdrie. Events in south Airdrie and on Highway 2 south of the city can show up.', tone: 'navy' },
  { icon: Siren, title: 'Some emergency alerts', body: 'Alberta Emergency Alerts show when they fall in the Calgary area, which reaches into Airdrie, or when they are province-wide.', tone: 'purple' },
] as const;

const NOT_FIND = [
  ['Airdrie RCMP crime data', 'Use the City of Airdrie official crime map.'],
  ['Calgary Police news', 'It covers Calgary only. Airdrie is policed by the RCMP.'],
  ['City of Calgary 311 requests', 'Calgary only. Airdrie has its own 311.'],
  ['Calgary traffic incidents', 'City of Calgary traffic feeds stop at the Calgary city limits.'],
  ['Power outages and river levels', 'ENMAX outages and Bow and Elbow river levels are Calgary data.'],
  ['Police dispatch or officer locations', 'Neither CalgaryWatch nor the City map shows these.'],
] as const;

export default function AirdrieCrimeMapPage() {
  return (
    <SiteLayout>
      <div className="cm ad">
        <section className="cm-hero" aria-labelledby="ad-title">
          <div className="cw-wrap cm-hero-grid">
            <div>
              <p className="cm-kicker">Airdrie community safety guide · Reviewed {AIRDRIE_GUIDE_UPDATED}</p>
              <h1 id="ad-title">Airdrie crime maps: <span>know which map you’re reading.</span></h1>
              <p className="cm-lead">Check recent community reports around Airdrie, compare them with the City of Airdrie’s official map of crime reported to Airdrie RCMP, and use the right reporting channel when something needs action.</p>
              <div className="cm-ctas">
                <Link className="cm-btn cm-btn-primary" to="/map">View Airdrie-area reports <ArrowUpRight size={18} /></Link>
                <a className="cm-btn" href={OFFICIAL_MAP} target="_blank" rel="noopener noreferrer external">Official Airdrie crime map <ArrowUpRight size={18} /></a>
              </div>
              <ul className="ad-quick" aria-label="Airdrie contacts">
                <li className="ad-quick-911"><a href="tel:911"><small>Immediate danger</small>Call 911</a></li>
                <li><a href="tel:4039457267"><small>RCMP, not in progress</small>403-945-7267</a></li>
                <li><a href="tel:311"><small>City services</small>Airdrie 311</a></li>
              </ul>
            </div>
            <div className="ad-map-wrap">
              <CorridorMap />
              <p className="ad-map-card">Airdrie is its own city, north of Calgary. <b>Airdrie RCMP</b> polices it, not Calgary Police.</p>
            </div>
          </div>
        </section>

        <div className="cw-wrap">
          <section className="cm-section" aria-labelledby="ad-find">
            <div className="cm-head">
              <h2 id="ad-find">What CalgaryWatch shows for Airdrie</h2>
              <p>CalgaryWatch is built for Calgary. Some of it reaches Airdrie and some of it does not. Here is exactly what you will and won’t find.</p>
            </div>
            <ul className="cm-shows ad-shows">
              {FIND.map(({ icon: Icon, title, body, tone }) => (
                <li key={title} className={`cm-show cm-tone-${tone}`}>
                  <span className="cm-show-icon"><Icon size={28} strokeWidth={2.2} aria-hidden="true" /></span>
                  <strong>{title}</strong>
                  <p>{body}</p>
                </li>
              ))}
            </ul>
            <div className="ad-wont">
              <h3>You won’t find these for Airdrie</h3>
              <ul>
                {NOT_FIND.map(([title, body]) => (
                  <li key={title}><X size={18} strokeWidth={3} aria-hidden="true" /><span><b>{title}.</b> {body}</span></li>
                ))}
              </ul>
            </div>
          </section>

          <section className="cm-section" aria-labelledby="ad-two">
            <div className="cm-head">
              <h2 id="ad-two">Two maps answer different questions.</h2>
              <p>Use CalgaryWatch for recent reports from neighbours. Use the City of Airdrie map for crime reported to Airdrie RCMP.</p>
            </div>
            <div className="ad-two">
              <article className="ad-card ad-card-navy">
                <p className="ad-tag">Neighbour reports</p>
                <h3>CalgaryWatch map</h3>
                <p>Reports posted by signed-in residents, plus weather, air quality and some road and emergency alerts. Every pin shows its source and when it was posted. Nothing is checked by police.</p>
                <Link className="cm-btn cm-btn-primary" to="/map">Open the map <ArrowUpRight size={18} /></Link>
              </article>
              <article className="ad-card ad-card-yellow">
                <p className="ad-tag">Crime reported to police</p>
                <h3>City of Airdrie crime map</h3>
                <p>The official place to look up crime reported to Airdrie RCMP. It is run by the City of Airdrie and is separate from CalgaryWatch.</p>
                <a className="cm-btn ad-btn-ink" href={OFFICIAL_MAP} target="_blank" rel="noopener noreferrer external">Open the official map <ArrowUpRight size={18} /></a>
              </article>
            </div>
            <p className="ad-note">Neither map is a dispatch feed. Neither shows where officers are or confirms that police are responding to something.</p>
          </section>

          <section className="cm-section" aria-labelledby="ad-choose">
            <div className="cm-head">
              <h2 id="ad-choose">Start with the source that matches the need.</h2>
              <p>Neighbour reports, police-reported crime, emergencies and non-urgent RCMP matters each have their own place.</p>
            </div>
            <ul className="ad-rows">
              {AIRDRIE_MAP_COMPARISON.map((row) => {
                const external = row.action.startsWith('http');
                const internal = row.action.startsWith('/');
                return (
                  <li key={row.need} className={row.action === 'tel:911' ? 'ad-row-911' : undefined}>
                    <span className="ad-row-need"><small>If you need</small>{row.need}</span>
                    <span className="ad-row-src"><small>Go to</small>{row.source}</span>
                    {internal
                      ? <Link className="ad-row-act" to={row.action}>{row.actionLabel} <ArrowUpRight size={16} /></Link>
                      : <a className="ad-row-act" href={row.action} {...(external ? { target: '_blank', rel: 'noopener noreferrer external' } : {})}>{row.actionLabel} {external ? <ArrowUpRight size={16} /> : <Phone size={15} />}</a>}
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="cm-section" aria-labelledby="ad-read">
            <div className="cm-head">
              <h2 id="ad-read">Read an incident before drawing a conclusion.</h2>
              <p>The number of pins is not a crime rate. It depends on the time window you pick, which sources cover the area, and what people choose to post.</p>
            </div>
            <ol className="cm-steps">
              <li>
                <span className="cm-step-n">1</span>
                <h3>When was it posted?</h3>
                <p>Check the time first. Neighbour reports come off the map after 5 days, so everything you see is recent, but a pin from this morning and one from four days ago describe different things.</p>
              </li>
              <li>
                <span className="cm-step-n">2</span>
                <h3>Where did it come from?</h3>
                <p>Each pin says whether a neighbour posted it or an official source supplied it. Neighbour reports are not checked by police, and no reporter is verified.</p>
              </li>
              <li>
                <span className="cm-step-n">3</span>
                <h3>Did anyone else see it?</h3>
                <p>People nearby can tap “I saw this too”, “Still happening” or “Seems resolved”. If it needs action, report it through an official channel below.</p>
              </li>
            </ol>
          </section>

          <section className="cm-section" aria-labelledby="ad-how">
            <div className="cm-head">
              <h2 id="ad-how">How neighbour reports work</h2>
              <p>The same rules apply in Airdrie as in Calgary.</p>
            </div>
            <ul className="cm-trust-grid">
              <li><MapPin size={22} /><strong>Posted by signed-in residents</strong><p>You need an account to post. Anyone can browse the map without one.</p></li>
              <li><EyeOff size={22} /><strong>You can post anonymously</strong><p>Your name is optional on a report. Your email is never shown.</p></li>
              <li><Check size={22} /><strong>Neighbours can confirm</strong><p>Each report shows how many people nearby backed it up, or that no one has yet.</p></li>
              <li><Flag size={22} /><strong>Two flags hide a report</strong><p>When two different people flag a report, it comes off the map for review.</p></li>
              <li><Timer size={22} /><strong>Reports expire after 5 days</strong><p>Old neighbour reports don’t stay on the map.</p></li>
              <li><BellOff size={22} /><strong>No push alerts</strong><p>CalgaryWatch does not send phone alerts. Open the map to check your area.</p></li>
            </ul>
          </section>

          <section className="cm-section" aria-labelledby="ad-report">
            <div className="cm-head">
              <h2 id="ad-report">Report through the right channel first.</h2>
              <p>Posting on CalgaryWatch does not create a police report and does not reach the RCMP.</p>
            </div>
            <ul className="cm-trust-grid ad-channels">
              <li className="cm-trust-911"><Phone size={22} /><strong>Emergency or crime in progress</strong><p>Call <a href="tel:911">911</a> for immediate danger or a crime happening now.</p></li>
              <li><Phone size={22} /><strong>Airdrie RCMP non-emergency</strong><p>For a police matter that is not in progress, call <a className="ad-link" href="tel:4039457267">403-945-7267</a>.</p></li>
              <li><Globe size={22} /><strong>Online police report</strong><p>Some incidents can be reported online. <a className="ad-link" href={ONLINE_REPORTING} target="_blank" rel="noopener noreferrer external">Check if yours qualifies</a>.</p></li>
              <li><Building2 size={22} /><strong>City services</strong><p>For non-police issues, call Airdrie 311. From outside the city, call <a className="ad-link" href="tel:4039488800">403-948-8800</a>.</p></li>
            </ul>
          </section>

          <section className="cm-section" aria-labelledby="ad-faq">
            <div className="cm-head">
              <h2 id="ad-faq">Airdrie crime-map questions, answered plainly.</h2>
            </div>
            <div className="ad-faq">
              {AIRDRIE_GUIDE_FAQS.map((faq) => (
                <details key={faq.question}>
                  <summary><h3>{faq.question}</h3></summary>
                  <p>{faq.answer}</p>
                </details>
              ))}
            </div>
          </section>

          <section className="cm-section" aria-labelledby="ad-sources">
            <div className="cm-head">
              <h2 id="ad-sources">Official Airdrie references</h2>
              <p>These pages are run by the City of Airdrie and the RCMP, not by CalgaryWatch.</p>
            </div>
            <ul className="ad-sources">
              {AIRDRIE_GUIDE_SOURCES.map((s) => (
                <li key={s.url}><a href={s.url} target="_blank" rel="noopener noreferrer external">{s.name}<ArrowUpRight size={16} aria-hidden="true" /></a></li>
              ))}
            </ul>
          </section>

          <nav className="cm-more ad-more" aria-label="More from CalgaryWatch">
            <Link to="/map"><strong>Open the live map</strong><span>Browse reports near you, free and without an account</span><ArrowUpRight size={18} /></Link>
            <Link to="/community"><strong>Community Watch</strong><span>How neighbour reports work on CalgaryWatch</span><ArrowUpRight size={18} /></Link>
            <Link to="/coverage"><strong>Every source we use</strong><span>Where each kind of pin comes from</span><ArrowUpRight size={18} /></Link>
            <Link to="/calgary-neighbourhood-watch"><strong>Start a neighbourhood watch</strong><span>A practical guide for your street</span><ArrowUpRight size={18} /></Link>
          </nav>
        </div>
      </div>
    </SiteLayout>
  );
}
