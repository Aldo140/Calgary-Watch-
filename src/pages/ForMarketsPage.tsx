import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, CalendarDays, Check, Inbox, Megaphone, Search, Users } from 'lucide-react';
import { SiteLayout } from '../components/site/SiteLayout';
import { discoveryRepository } from '../data/discovery';
import { PageHero } from '../components/site/PageHero';
import '../styles/for-markets.css';

const STEPS = [
  { icon: Users, title: 'Your vendor roster', body: 'Everyone who sells with you, with private contact details only you can see.' },
  { icon: Inbox, title: 'Applications', body: 'A link for your website. Approve a vendor and they join the roster in one tap.' },
  { icon: CalendarDays, title: 'Weekly lineups', body: 'Tick who’s coming each date, add a line about the week. Shoppers see it on CalgaryWatch.' },
  { icon: Megaphone, title: 'Vendor messages', body: 'Load-in times, weather calls and cancellations, to everyone or just one date’s vendors.' },
];
const TONES = ['yellow', 'blue', 'green', 'purple'];

/**
 * For market organizers: Market HQ, run yourself or run by us. Leads to the
 * market's claim (which unlocks HQ) or straight into HQ when already claimed.
 */
export default function ForMarketsPage() {
  const [q, setQ] = useState('');
  useEffect(() => { document.title = 'Market HQ for organizers | CalgaryWatch'; }, []);
  const markets = useMemo(() => discoveryRepository.list().filter((e) => e.kind === 'market').sort((a, b) => a.title.localeCompare(b.title)), []);
  const found = q.trim().length >= 2 ? markets.filter((m) => m.title.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 6) : [];

  return (
    <SiteLayout>
      <div className="bp fm">
        <PageHero
          id="fm-title"
          kicker="Market HQ · for organizers"
          title={<>Less vendor admin. <span>More shoppers.</span></>}
          lead="Market HQ keeps your vendors, applications, weekly lineups and vendor emails in one place. Every lineup you publish shows up for Calgarians on CalgaryWatch, in event picks and the Monday email. Run it yourself, or have us run it for you."
          facts={<>
            <li><b>Free</b> to run yourself</li>
            {markets.length > 1 ? <li><b>{markets.length}</b> Calgary markets listed</li> : null}
            <li><b>Private</b> vendor details</li>
          </>}
          aside={
            <div className="fm-find">
              <p className="bp-eyebrow">Start here</p>
              <h2>Find your market</h2>
              <label className="fm-search"><Search size={20} aria-hidden="true" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Market name" aria-label="Find your market" /></label>
              {found.length ? (
                <ul className="fm-found">
                  {found.map((m) => <li key={m.id}><strong>{m.title}</strong><span><Link className="fm-open" to={`/organizer/${encodeURIComponent(m.id)}`}>Open Market HQ</Link><Link to={`/claim/${encodeURIComponent(m.id)}`}>Claim it</Link></span></li>)}
                </ul>
              ) : q.trim().length >= 2 ? <p className="fm-hint">Not listed yet? <Link to="/submit?type=market">Add your market</Link> and claim it once it’s up.</p>
                : <p className="fm-hint">Type two letters or more. Claiming your market is what opens Market HQ.</p>}
            </div>
          }
        />

        <div className="cw-wrap">
          <section className="bp-section" aria-labelledby="fm-whats">
            <div className="bp-head">
              <h2 id="fm-whats">What’s in <span>Market HQ</span></h2>
              <p>Four tools that replace the spreadsheet, the inbox and the group chat.</p>
            </div>
            <ul className="bp-cards" style={{ ['--cols' as string]: 4 }}>
              {STEPS.map((s, i) => (
                <li key={s.title} className={`bp-card bp-tone-${TONES[i]}`}>
                  <span className="bp-card-icon"><s.icon size={24} aria-hidden="true" /></span>
                  <h3>{s.title}</h3>
                  <p>{s.body}</p>
                </li>
              ))}
            </ul>
          </section>

          <section className="bp-section" aria-labelledby="fm-plans">
            <div className="bp-head">
              <h2 id="fm-plans">Run it yourself, <span>or hand it to us.</span></h2>
              <p>Either way your listing stays free and your vendors’ details stay private.</p>
            </div>
            <div className="bp-cards fm-plans" style={{ ['--cols' as string]: 2 }}>
              <article className="bp-card">
                <span className="bp-tag">Free</span>
                <h3>You run Market HQ</h3>
                <ul><li>Roster, applications, lineups and messages</li><li>Lineups shown to shoppers on CalgaryWatch</li><li>Your own reply address on every vendor email</li></ul>
                <p className="bp-card-note">Claim your market, and once we’ve confirmed it, Market HQ opens.</p>
              </article>
              <article className="bp-card bp-card-dark">
                <span className="bp-tag">We run it for you</span>
                <h3>CalgaryWatch runs it</h3>
                <ul><li>We review applications and keep the roster current</li><li>We publish each week’s lineup and note</li><li>We send load-in, weather and cancellation emails</li><li>A short weekly summary to you</li></ul>
                <p className="bp-card-note">For volunteer-run markets and community associations. Ask from Market HQ, or email <a href="mailto:aldo@calgarywatch.ca">aldo@calgarywatch.ca</a>.</p>
              </article>
            </div>
          </section>

          <section className="bp-banner" aria-labelledby="fm-promise">
            <div>
              <h2 id="fm-promise">What doesn’t change</h2>
              <ul className="fm-promise">
                <li><Check size={16} aria-hidden="true" /> Your listing stays free.</li>
                <li><Check size={16} aria-hidden="true" /> Using Market HQ never buys placement in our picks.</li>
                <li><Check size={16} aria-hidden="true" /> Vendor contact details are never shown publicly.</li>
              </ul>
            </div>
            <div className="bp-ctas">
              <Link className="bp-btn bp-btn-navy" to="/markets">See Calgary markets <ArrowUpRight size={18} aria-hidden="true" /></Link>
            </div>
          </section>
        </div>
      </div>
    </SiteLayout>
  );
}
