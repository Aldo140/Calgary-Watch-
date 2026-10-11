/**
 * About CalgaryWatch, in the site's own collage language: who it is for, what
 * the two halves of the site do, how it stays honest, and how to get involved.
 * Says only what is true today; no invented counts, contributors or uptime.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import emailjs from '@emailjs/browser';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import {
  ArrowUpRight, BadgeCheck, CalendarDays, Check, Cone, Layers, Mail, MapPin, MessagesSquare, Phone, ShieldCheck, Siren, Store, Users, Zap,
} from 'lucide-react';
import { db } from '@/src/firebase';
import { SiteLayout } from '../components/site/SiteLayout';
import { PageHero } from '../components/site/PageHero';
import '../styles/about.css';

const CONTACT = 'aldo@calgarywatch.ca';

const SOURCES = [
  { icon: Cone, source: 'City of Calgary 311', knows: 'Knows the pothole, the graffiti, the bylaw complaint, once it has been filed, queued and assigned.' },
  { icon: Zap, source: 'ENMAX', knows: 'Knows the outage, with a restoration estimate for the grid rather than for your street.' },
  { icon: Siren, source: 'Calgary Police Service', knows: 'Knows the file number, and publishes the statistics after the fact.' },
  { icon: MessagesSquare, source: 'Reddit', knows: 'Knows the rumour, six hours later, three neighbourhoods off, and hard to check.' },
  { icon: Users, source: 'Your Facebook group', knows: 'Knows the truck that circled twice, if you are in the group and happen to scroll past it.' },
];

const WHATS_ON = [
  { to: '/events', label: 'Events' },
  { to: '/markets', label: 'Markets' },
  { to: '/neighbourhoods', label: 'Neighbourhoods' },
  { to: '/guides', label: 'Guides' },
  { to: '/local', label: 'Local' },
];

const ROLES = ['Reporter', 'Analyst', 'Developer', 'Community Advocate', 'Other'];

function VolunteerForm() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('');
  const [whyJoin, setWhyJoin] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'done' | 'error'>('idle');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !role || !whyJoin.trim()) return;
    setStatus('submitting');
    if (!db) { setStatus('error'); return; }
    try {
      await addDoc(collection(db, 'volunteers'), {
        name: name.trim().slice(0, 100),
        email: email.trim().slice(0, 200),
        role,
        whyJoin: whyJoin.trim().slice(0, 500),
        createdAt: serverTimestamp(),
      });

      // EmailJS public key is a browser-side credential — intentional by design.
      // Abuse protection: restrict allowed domains in the EmailJS dashboard to
      // your production origin. The service/template IDs are read from env vars
      // so they don't have to be rotated via a code push.
      const ejsPublicKey = import.meta.env.VITE_EMAILJS_PUBLIC_KEY ?? 'SwfXJ-eXi92R0m_nV';
      const ejsServiceId = import.meta.env.VITE_EMAILJS_SERVICE_ID ?? 'service_77g2o0a';
      const ejsTemplateId = import.meta.env.VITE_EMAILJS_TEMPLATE_ID ?? 'template_sx463hg';
      emailjs.init({ publicKey: ejsPublicKey });
      emailjs.send(ejsServiceId, ejsTemplateId, {
        name: name.trim().slice(0, 100),
        email: email.trim().slice(0, 200),
        subject: role,
        message: `Role: ${role}\n\nWhy they want to join:\n${whyJoin.trim().slice(0, 500)}`,
      }).catch((err) => { console.error('EmailJS error:', JSON.stringify(err)); });

      setStatus('done');
    } catch {
      setStatus('error');
    }
  }

  if (status === 'done') {
    return (
      <div className="ab-form-done" role="status">
        <span className="ab-form-tick"><Check size={28} aria-hidden="true" /></span>
        <h3>Thanks, {name.split(' ')[0]}.</h3>
        <p>It’s with us. We read every one and we’ll reply by email.</p>
      </div>
    );
  }

  return (
    <form className="ab-form" onSubmit={handleSubmit}>
      <div className="ab-form-row">
        <label className="bp-field"><span>Your name</span>
          <input className="bp-input" type="text" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required />
        </label>
        <label className="bp-field"><span>Your email</span>
          <input className="bp-input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={200} required />
        </label>
      </div>
      <fieldset className="bp-field ab-roles">
        <legend><span>I want to help with</span></legend>
        <div className="bp-chips">
          {ROLES.map((r) => (
            <button key={r} type="button" className="bp-chip" aria-pressed={role === r} onClick={() => setRole(r)}>{r}</button>
          ))}
        </div>
      </fieldset>
      <label className="bp-field"><span>Why you’d like to join</span>
        <textarea className="bp-input" rows={3} value={whyJoin} onChange={(e) => setWhyJoin(e.target.value)} maxLength={500} required placeholder="A line or two is plenty." />
        <small className="ab-count">{whyJoin.length}/500</small>
      </label>
      {status === 'error' ? <p className="ab-error" role="alert">That didn’t send. Try again, or email <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.</p> : null}
      <button type="submit" className="bp-btn bp-btn-navy ab-submit" disabled={status === 'submitting' || !name.trim() || !email.trim() || !role || !whyJoin.trim()}>
        {status === 'submitting' ? 'Sending…' : 'Send it to us'} <ArrowUpRight size={18} aria-hidden="true" />
      </button>
    </form>
  );
}

export default function AboutPage() {
  return (
    <SiteLayout>
      <div className="bp ab">
        <PageHero
          id="ab-title"
          kicker="About CalgaryWatch"
          title={<>A little closer to <span>your city.</span></>}
          lead="CalgaryWatch is a free, independent guide to Calgary. What’s on this week, the markets and local places worth knowing, and a live map of what neighbours and public sources are reporting. Made in Calgary, and checked against the source."
          ctas={<>
            <Link className="bp-btn bp-btn-primary" to="/events">See what’s on <ArrowUpRight size={18} aria-hidden="true" /></Link>
            <Link className="bp-btn" to="/map"><MapPin size={18} aria-hidden="true" /> Open the live map</Link>
          </>}
          facts={<>
            <li><b>Free</b> for residents</li>
            <li><b>Checked</b> against the source</li>
            <li><b>Never</b> pay-to-pick</li>
          </>}
          aside={
            <div className="ab-postcards">
              <Link to="/events" className="ab-postcard ab-postcard-day">
                <img src="/images/hero/calgarywatch-city-guide-v1.webp" alt="" width="1600" height="900" loading="eager" />
                <span><small>By day</small>What’s on in Calgary</span>
              </Link>
              <Link to="/map" className="ab-postcard ab-postcard-night">
                <img src="/images/hero/calgarywatch-live-watch-v1.webp" alt="" width="1376" height="768" loading="eager" />
                <span><small><i className="ab-live" aria-hidden="true" />Live</small>What neighbours are seeing</span>
              </Link>
            </div>
          }
        />

        <div className="cw-wrap">
          <section className="bp-section" aria-labelledby="ab-halves">
            <div className="bp-head">
              <h2 id="ab-halves">Two halves, <span>one city.</span></h2>
              <p>Most people come for one and stay for the other.</p>
            </div>
            <div className="ab-halves">
              <article className="bp-card bp-tone-yellow ab-half">
                <span className="bp-card-icon"><CalendarDays size={26} aria-hidden="true" /></span>
                <p className="bp-eyebrow">Discover</p>
                <h3>What’s on, where, and when it’s worth going.</h3>
                <p>Events day by day, farmers’ and makers’ markets with their weekly lineups, self-guided days out, and the independent places that make each neighbourhood. Every listing links to the organizer’s own page.</p>
                <ul className="ab-chips" aria-label="Discover sections">
                  {WHATS_ON.map((s) => <li key={s.to}><Link to={s.to}>{s.label} <ArrowUpRight size={14} aria-hidden="true" /></Link></li>)}
                </ul>
              </article>
              <article className="bp-card bp-card-dark ab-half">
                <span className="bp-card-icon"><MapPin size={26} aria-hidden="true" /></span>
                <p className="bp-eyebrow">Community Watch</p>
                <h3>What neighbours and public sources are reporting, on one map.</h3>
                <p>Neighbour reports sit next to clearly labelled Calgary Police news, City 311 and traffic, weather and emergency alerts, and power outages. Every pin says where it came from and when.</p>
                <ul className="ab-chips ab-chips-dark" aria-label="Community Watch">
                  <li><Link to="/map">Live map <ArrowUpRight size={14} aria-hidden="true" /></Link></li>
                  <li><Link to="/community">How it works <ArrowUpRight size={14} aria-hidden="true" /></Link></li>
                  <li><Link to="/coverage">Sources <ArrowUpRight size={14} aria-hidden="true" /></Link></li>
                  <li><Link to="/check-your-community">Check your community <ArrowUpRight size={14} aria-hidden="true" /></Link></li>
                </ul>
              </article>
            </div>
          </section>

          <section className="bp-section" aria-labelledby="ab-honest">
            <div className="bp-head">
              <h2 id="ab-honest">How we keep it <span>honest.</span></h2>
              <p>Four rules every page on the site follows.</p>
            </div>
            <ul className="bp-cards" style={{ ['--cols' as string]: 4 }}>
              <li className="bp-card bp-tone-blue">
                <span className="bp-card-icon"><BadgeCheck size={24} aria-hidden="true" /></span>
                <h3>Checked at the source</h3>
                <p>Dates, places and prices are checked against the organizer’s own page before a listing goes up.</p>
              </li>
              <li className="bp-card bp-tone-yellow">
                <span className="bp-card-icon"><ShieldCheck size={24} aria-hidden="true" /></span>
                <h3>Picks aren’t for sale</h3>
                <p>“Our pick” is our own opinion. Paid placements, when they exist, are always labelled Featured partner. <Link to="/partners">How we work with businesses</Link>.</p>
              </li>
              <li className="bp-card bp-tone-purple">
                <span className="bp-card-icon"><Layers size={24} aria-hidden="true" /></span>
                <h3>Every pin is sourced</h3>
                <p>Each pin on the map names who posted it and when. Neighbour reports are not checked by police. <Link to="/coverage">See every source</Link>.</p>
              </li>
              <li className="bp-card bp-tone-red">
                <span className="bp-card-icon"><Phone size={24} aria-hidden="true" /></span>
                <h3>Not a 911 service</h3>
                <p>In an emergency, call 911. Non-emergency police: <a href="tel:4032661234">403-266-1234</a>. We don’t contact police for you.</p>
              </li>
            </ul>
          </section>

          <section className="bp-section ab-why" aria-labelledby="ab-why">
            <div className="ab-why-copy">
              <p className="bp-eyebrow">Why it exists</p>
              <h2 id="ab-why">Calgary already knows. It just knows it in <span>five different places.</span></h2>
              <p>Every source here is real, and every one of them is right about something. None of them is about the block you live on, right now, in one view. That gap is the whole reason CalgaryWatch exists.</p>
              <p className="ab-why-fine">CalgaryWatch is not affiliated with, endorsed by, or operated by the City of Calgary, ENMAX, or the Calgary Police Service, and it does not replace any of them.</p>
            </div>
            <ol className="ab-sources">
              {SOURCES.map(({ icon: Icon, source, knows }, i) => (
                <li key={source} style={{ ['--r' as string]: `${[-1.2, .8, -.6, 1, -.9][i]}deg` }}>
                  <span className="ab-source-icon"><Icon size={18} aria-hidden="true" /></span>
                  <strong>{source}</strong>
                  <p>{knows}</p>
                </li>
              ))}
              <li className="ab-source-meet">
                <span className="ab-source-icon"><Layers size={18} aria-hidden="true" /></span>
                <strong>CalgaryWatch is where they meet.</strong>
                <p>One map that holds what neighbours see alongside clearly attributed public data.</p>
              </li>
            </ol>
          </section>

          <section className="bp-section" aria-labelledby="ab-involved">
            <div className="bp-head">
              <h2 id="ab-involved">Help build it.</h2>
              <p>CalgaryWatch is small and run from Calgary. These are the ways in.</p>
            </div>
            <div className="ab-involved">
              <article className="bp-card ab-volunteer">
                <p className="bp-eyebrow">Volunteer</p>
                <h3>Report, research, write code or spread the word.</h3>
                <VolunteerForm />
              </article>
              <div className="ab-ways">
                <Link to="/submit" className="ab-way">
                  <CalendarDays size={22} aria-hidden="true" />
                  <span><strong>Add an event or market</strong>Share it with the organizer’s link and we’ll check it.</span>
                  <ArrowUpRight size={18} aria-hidden="true" />
                </Link>
                <Link to="/for-markets" className="ab-way">
                  <Store size={22} aria-hidden="true" />
                  <span><strong>Run a market?</strong>Market HQ keeps vendors, lineups and emails in one place.</span>
                  <ArrowUpRight size={18} aria-hidden="true" />
                </Link>
                <Link to="/partners" className="ab-way">
                  <BadgeCheck size={22} aria-hidden="true" />
                  <span><strong>For businesses</strong>Claim your listing, free. Our picks stay unpaid.</span>
                  <ArrowUpRight size={18} aria-hidden="true" />
                </Link>
                <a href={`mailto:${CONTACT}?subject=${encodeURIComponent('Partnering with CalgaryWatch')}`} className="ab-way ab-way-dark">
                  <Mail size={22} aria-hidden="true" />
                  <span><strong>Partner or fund the app</strong>Sponsorship, data partnerships, grants and investment. {CONTACT}</span>
                  <ArrowUpRight size={18} aria-hidden="true" />
                </a>
              </div>
            </div>
          </section>

          <section className="bp-banner" aria-labelledby="ab-join">
            <div>
              <h2 id="ab-join">Your week in Calgary, in your inbox.</h2>
              <p>Picks for what you like on Thursdays, and what happened near home on Mondays. Free, and easy to stop.</p>
            </div>
            <div className="bp-ctas">
              <Link className="bp-btn bp-btn-navy" to="/plans">Sign up free <ArrowUpRight size={18} aria-hidden="true" /></Link>
              <a className="bp-btn" href={`mailto:${CONTACT}`}>Say hello</a>
            </div>
          </section>

          <nav className="bp-more" aria-label="More from CalgaryWatch">
            <Link to="/coverage"><strong>Where the map’s data comes from</strong><span>Every source, and how often it updates</span><ArrowUpRight size={18} aria-hidden="true" /></Link>
            <Link to="/privacy"><strong>Privacy</strong><span>Exactly what we store, and for how long</span><ArrowUpRight size={18} aria-hidden="true" /></Link>
            <Link to="/calgary-neighbourhood-watch"><strong>Start a neighbourhood watch</strong><span>A practical guide for your street</span><ArrowUpRight size={18} aria-hidden="true" /></Link>
          </nav>
        </div>
      </div>
    </SiteLayout>
  );
}
