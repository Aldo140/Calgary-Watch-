import { Link } from 'react-router-dom';
import { ArrowUpRight, BadgeCheck, Check, Gift, Mail, ShieldCheck, Sparkles } from 'lucide-react';
import { SiteLayout } from '../components/site/SiteLayout';
import { PageHero } from '../components/site/PageHero';
import { CALGARYDAILY } from '../config/social';
import '../styles/partners.css';

const CONTACT = 'aldo@calgarywatch.ca';

/**
 * How CalgaryWatch (and @calgarydaily) work with businesses. Partner emails
 * link here, and it is the public page brand/outreach.json requires before
 * paidOfferEnabled may be switched on. Describes only what is true today; the
 * paid tier says it isn't open until the offer is final.
 */
export default function PartnersPage() {
  return (
    <SiteLayout>
      <div className="bp pt">
        <PageHero
          id="pt-title"
          kicker="For local businesses"
          title={<>How CalgaryWatch works <span>with businesses.</span></>}
          lead={<>CalgaryWatch is a free guide to Calgary events, markets and local places. Every listing is checked against the business’s own page. <a href={CALGARYDAILY.url} target="_blank" rel="noopener">@{CALGARYDAILY.handle}</a> is our sister account on Instagram and posts from the same listings.</>}
          ctas={<>
            <a className="bp-btn bp-btn-primary" href={`mailto:${CONTACT}?subject=${encodeURIComponent('My CalgaryWatch listing')}`}>Email us about your listing <ArrowUpRight size={18} aria-hidden="true" /></a>
            <Link className="bp-btn" to="/for-markets">Run a market?</Link>
          </>}
          aside={
            <div className="pt-ticket" aria-hidden="true">
              <p className="pt-ticket-head">Your listing <span>Free</span></p>
              <ul>
                <li><Check size={16} /> Built from your own website</li>
                <li><Check size={16} /> Links straight back to you</li>
                <li><Check size={16} /> Corrections by email, fast</li>
                <li><Check size={16} /> Claim it to edit it yourself</li>
              </ul>
              <p className="pt-ticket-stamp">Picks not for sale</p>
            </div>
          }
        />

        <div className="cw-wrap">
          <section className="bp-section" aria-labelledby="pt-how">
            <div className="bp-head">
              <h2 id="pt-how">What you get, <span>and what you don’t.</span></h2>
              <p>Plain terms. Nothing here changes if you pay us.</p>
            </div>
            <div className="bp-cards" style={{ ['--cols' as string]: 2 }}>
              <section className="bp-card bp-tone-yellow">
                <span className="bp-card-icon"><Gift size={24} aria-hidden="true" /></span>
                <h3>Free, always</h3>
                <ul>
                  <li>A listing built from the details on your own website, linking straight back to you.</li>
                  <li>A direct line for corrections, schedule changes, cancellations and photos you’d like us to use.</li>
                  <li>A place in CalgaryDaily posts when your dates fit. Nobody pays for that, and payment never changes the order.</li>
                </ul>
              </section>

              <section className="bp-card bp-tone-blue">
                <span className="bp-card-icon"><ShieldCheck size={24} aria-hidden="true" /></span>
                <h3>Our picks aren’t for sale</h3>
                <p>When we call something “our pick”, that’s our own opinion, written from the listing and its official source. We don’t sell picks, rankings or “best in Calgary” claims, and we don’t write about visits we didn’t make.</p>
              </section>

              <section className="bp-card bp-card-wide pt-claim">
                <span className="bp-card-icon"><BadgeCheck size={24} aria-hidden="true" /></span>
                <h3>Claim your listing</h3>
                <p>Sign in with Google, tell us who you are, and once we’ve confirmed it the listing is yours to keep right: dates and hours, photos, addresses and extra locations, and the link we send people to. Claimed listings show <strong>Managed by the organizer</strong>. It’s free, and it doesn’t buy placement.</p>
                <ol className="pt-steps">
                  <li><b>1</b>Open your listing on CalgaryWatch</li>
                  <li><b>2</b>Tap “Claim this listing” at the bottom</li>
                  <li><b>3</b>We confirm it’s you, then it’s yours</li>
                </ol>
                <p>Run a market? Claiming it opens <Link to="/for-markets">Market HQ</Link>: your vendor roster, applications, weekly lineups and vendor emails, run by you or by us.</p>
              </section>

              <section className="bp-card bp-tone-purple">
                <span className="bp-card-icon"><Sparkles size={24} aria-hidden="true" /></span>
                <span className="bp-tag">Not open yet</span>
                <h3>Featured partners</h3>
                <p>Later we’ll offer a paid, invitation-only placement, one business per category. It will always be labelled <strong>Featured partner</strong>, on the site and on the first line of any Instagram post, and kept apart from our picks. It will never appear next to crime or safety reports.</p>
                <p className="bp-card-note">If you’d like to hear when it opens, email <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.</p>
              </section>

              <section className="bp-card">
                <span className="bp-card-icon"><Mail size={24} aria-hidden="true" /></span>
                <h3>If we emailed you</h3>
                <p>We email a business only when it’s listed on CalgaryWatch, and only at an address the business publishes on its own website. We don’t email sites that ask not to receive unsolicited messages, and we record where we found each address.</p>
                <p>Every email says who it’s from and gives our mailing address. We send at most one follow-up. Reply “stop” and you won’t hear from us again. That’s permanent.</p>
              </section>
            </div>
          </section>

          <section className="bp-banner" aria-labelledby="pt-contact">
            <div>
              <h2 id="pt-contact">Something wrong with your listing?</h2>
              <p>Questions, corrections or a listing we got wrong. Email us and a person will fix it.</p>
            </div>
            <div className="bp-ctas">
              <a className="bp-btn bp-btn-navy" href={`mailto:${CONTACT}`}>{CONTACT} <ArrowUpRight size={18} aria-hidden="true" /></a>
            </div>
          </section>

          <nav className="bp-more" aria-label="More from CalgaryWatch">
            <Link to="/local"><strong>Local places</strong><span>The independent places we list</span><ArrowUpRight size={18} aria-hidden="true" /></Link>
            <Link to="/events"><strong>Events</strong><span>What’s on, day by day</span><ArrowUpRight size={18} aria-hidden="true" /></Link>
            <Link to="/submit"><strong>Add an event or market</strong><span>Free, checked against your page</span><ArrowUpRight size={18} aria-hidden="true" /></Link>
          </nav>
        </div>
      </div>
    </SiteLayout>
  );
}
