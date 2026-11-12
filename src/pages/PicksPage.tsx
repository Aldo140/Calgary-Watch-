import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, BadgeCheck, MailCheck, MessageSquareText, PhoneCall, ShieldCheck } from 'lucide-react';
import { SiteLayout } from '../components/site/SiteLayout';
import { BEST_CATEGORIES, PICK_CHECKS, type PickCheck } from '../content/bestOf';
import { bestPath } from '../lib/bestOf';
import { activePick } from '../lib/cwPicks';
import '../styles/best-of.css';
import '../styles/picks.css';

const CONTACT = 'aldo@calgarywatch.ca';

/**
 * /picks: the public rules for CalgaryWatch Picks, written so a reader can
 * trust the badge and a business can see exactly what earns it.
 */
export default function PicksPage() {
  const services = BEST_CATEGORIES.filter(c => c.kind === 'service');
  return (
    <SiteLayout>
      <div className="bo">
        <section className="bo-hero" aria-labelledby="pk-title">
          <div className="bo-wrap">
            <p className="bo-kicker"><Link to="/best">Best of Calgary</Link> · CalgaryWatch Picks</p>
            <h1 id="pk-title">One company we’d send <mark>our own neighbours to.</mark></h1>
            <p className="bo-lead">For each everyday service, one CalgaryWatch Pick. It earns the spot by passing seven checks we do ourselves, and keeps it only while the Calgarians who hired it through us say it did good work. It can’t be bought.</p>
          </div>
        </section>

        <div className="bo-wrap">
          <section className="bo-section" aria-labelledby="pk-how">
            <div className="bo-head"><h2 id="pk-how">How it works</h2></div>
            <ol className="bo-rules">
              <li><b>1</b><strong>We vet.</strong><span>Seven checks, each dated and shown on the Pick: {(Object.keys(PICK_CHECKS) as PickCheck[]).map(k => PICK_CHECKS[k].toLowerCase()).join('; ')}.</span></li>
              <li><b>2</b><strong>You choose.</strong><span>The Pick sits above an A–Z list of other local companies. Call anyone. If you like, tick one box and we’ll email you once, a week later, to ask how it went.</span></li>
              <li><b>3</b><strong>Neighbours decide.</strong><span>We read every answer. A Pick that slips (late, over quote, no callback) gets a call from us, then loses the spot. Every Pick is re-vetted every six months.</span></li>
            </ol>
          </section>

          <section className="bo-section" aria-labelledby="pk-lists">
            <div className="bo-head"><h2 id="pk-lists">Picks so far</h2><p>A spot stays open, and says so, until a company passes.</p></div>
            <ul className="pk-status">
              {services.map(c => {
                const live = activePick(c);
                return (
                  <li key={c.slug}>
                    <Link to={bestPath(c)}>
                      <strong>{c.label}</strong>
                      <span className={live ? 'is-live' : ''}>{live ? <><BadgeCheck size={15} aria-hidden="true" /> {live.place.name}</> : 'Vetting now'}</span>
                      <ArrowRight size={16} aria-hidden="true" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="bo-section" aria-labelledby="pk-privacy">
            <div className="bo-head"><h2 id="pk-privacy">Your privacy</h2></div>
            <ul className="pk-promises">
              <li><PhoneCall size={20} aria-hidden="true" /><span><b>A tap is just a count.</b> When you call or open a site from a list, we count it for that company. Never who you are.</span></li>
              <li><MailCheck size={20} aria-hidden="true" /><span><b>The check-in is opt-in.</b> One email, a week later. No list, no newsletter. Your address is deleted once you answer, or after 60 days.</span></li>
              <li><MessageSquareText size={20} aria-hidden="true" /><span><b>Your words, never your name.</b> We read every answer first. Nothing is published with your name or email, and we never pass your details to the company.</span></li>
            </ul>
          </section>

          <section className="bo-band" aria-labelledby="pk-biz">
            <div>
              <h2 id="pk-biz">Run a Calgary trade or service? <mark>Ask to be vetted.</mark></h2>
              <p>Vetting is free. If you pass, you get the Pick badge on the list and in search, a monthly count of Calgarians who contacted you from CalgaryWatch, and what your customers told us, so you hear about a problem before a one-star review does. Companies that don’t pass are told why and can try again in 90 days.</p>
            </div>
            <div className="bo-band-ctas">
              <a className="bo-btn bo-btn-hi" href={`mailto:${CONTACT}?subject=${encodeURIComponent('CalgaryWatch Pick vetting')}`}><ShieldCheck size={16} aria-hidden="true" /> Ask to be vetted</a>
              <Link className="bo-btn" to="/partners">How we work with businesses <ArrowUpRight size={16} aria-hidden="true" /></Link>
            </div>
          </section>
        </div>
      </div>
    </SiteLayout>
  );
}
