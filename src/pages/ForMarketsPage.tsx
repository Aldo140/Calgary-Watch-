import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowUpRight, CalendarDays, Check, Inbox, Megaphone, Search, Users } from 'lucide-react';
import { SiteLayout } from '../components/site/SiteLayout';
import { discoveryRepository } from '../data/discovery';
import { EASE_OUT } from '../components/plans/Motion';
import '../styles/plans.css';
import '../styles/claim.css';
import '../styles/hq.css';

const STEPS = [
  { icon: Users, title: 'Your vendor roster', body: 'Everyone who sells with you, with private contact details only you can see.' },
  { icon: Inbox, title: 'Applications', body: 'A link for your website. Approve a vendor and they join the roster in one tap.' },
  { icon: CalendarDays, title: 'Weekly lineups', body: 'Tick who’s coming each date, add a line about the week. Shoppers see it on CalgaryWatch.' },
  { icon: Megaphone, title: 'Vendor messages', body: 'Load-in times, weather calls and cancellations, to everyone or just one date’s vendors.' },
];

/**
 * For market organizers: Market HQ, run yourself or run by us. Leads to the
 * market's claim (which unlocks HQ) or straight into HQ when already claimed.
 */
export default function ForMarketsPage() {
  const reduce = useReducedMotion();
  const [q, setQ] = useState('');
  useEffect(() => { document.title = 'Market HQ for organizers | CalgaryWatch'; }, []);
  const markets = useMemo(() => discoveryRepository.list().filter((e) => e.kind === 'market').sort((a, b) => a.title.localeCompare(b.title)), []);
  const found = q.trim().length >= 2 ? markets.filter((m) => m.title.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 6) : [];
  const rise = (i: number) => ({ initial: reduce ? false : { opacity: 0, y: 18 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true }, transition: { duration: 0.6, ease: EASE_OUT, delay: i * 0.07 } });

  return (
    <SiteLayout>
      <div className="cw-plans cl-page">
        <header className="cw-wrap cl-head">
          <motion.p className="pl-eyebrow" {...rise(0)}>For market organizers</motion.p>
          <motion.h1 className="cl-title" {...rise(1)}>Less vendor admin. <em>More shoppers.</em></motion.h1>
          <motion.p className="cl-lead" {...rise(2)}>Market HQ keeps your vendors, applications, weekly lineups and vendor emails in one place. Every lineup you publish shows up for Calgarians on CalgaryWatch, in event picks and the Monday email. Run it yourself, or have us run it for you.</motion.p>
          <motion.div className="hq-find" {...rise(3)}>
            <label className="hq-search"><Search size={18} aria-hidden="true" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find your market" aria-label="Find your market" /></label>
            {found.length ? (
              <ul className="hq-found">
                {found.map((m) => <li key={m.id}><strong>{m.title}</strong><span><Link to={`/organizer/${encodeURIComponent(m.id)}`}>Open Market HQ</Link><Link to={`/claim/${encodeURIComponent(m.id)}`}>Claim it</Link></span></li>)}
              </ul>
            ) : q.trim().length >= 2 ? <p className="pl-hint">Not listed yet? <Link to="/submit">Add your market</Link> and claim it once it’s up.</p> : null}
          </motion.div>
        </header>

        <section className="cw-wrap hq-steps" aria-label="What’s in Market HQ">
          {STEPS.map((s, i) => (
            <motion.article key={s.title} className="hq-step" {...rise(i)}>
              <s.icon size={22} aria-hidden="true" />
              <h2>{s.title}</h2>
              <p>{s.body}</p>
            </motion.article>
          ))}
        </section>

        <section className="cw-wrap hq-plans" aria-label="Plans">
          <motion.article className="hq-plan" {...rise(0)}>
            <p className="pl-kicker">Run it yourself · free</p>
            <h2>You run Market HQ</h2>
            <ul><li>Roster, applications, lineups and messages</li><li>Lineups shown to shoppers on CalgaryWatch</li><li>Your own reply address on every vendor email</li></ul>
            <p className="pl-fine">Claim your market, and once we’ve confirmed it, Market HQ opens.</p>
          </motion.article>
          <motion.article className="hq-plan hq-plan-managed" {...rise(1)}>
            <p className="pl-kicker">We run it for you</p>
            <h2>CalgaryWatch runs it</h2>
            <ul><li>We review applications and keep the roster current</li><li>We publish each week’s lineup and note</li><li>We send load-in, weather and cancellation emails</li><li>A short weekly summary to you</li></ul>
            <p className="pl-fine">For volunteer-run markets and community associations. Ask from Market HQ, or email <a href="mailto:aldo@calgarywatch.ca">aldo@calgarywatch.ca</a>.</p>
          </motion.article>
        </section>

        <section className="cw-wrap hq-promise">
          <h2>What doesn’t change</h2>
          <p><Check size={16} aria-hidden="true" /> Your listing stays free. <Check size={16} aria-hidden="true" /> Using Market HQ never buys placement in our picks. <Check size={16} aria-hidden="true" /> Vendor contact details are never shown publicly.</p>
          <Link className="pl-btn" to="/markets">See Calgary markets <ArrowUpRight size={18} aria-hidden="true" /></Link>
        </section>
      </div>
    </SiteLayout>
  );
}
