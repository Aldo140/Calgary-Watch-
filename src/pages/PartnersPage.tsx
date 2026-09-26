import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { SiteLayout } from '../components/site/SiteLayout';
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
      <div className="cw-wrap cw-page pt-page">
        <header className="cw-page-heading">
          <p className="pt-eyebrow">For local businesses</p>
          <h1>How CalgaryWatch works with businesses.</h1>
          <p className="cw-lead">
            CalgaryWatch is a free guide to Calgary events, markets and local places. Every listing is checked against the business's own page. <a href={CALGARYDAILY.url} target="_blank" rel="noopener">@{CALGARYDAILY.handle}</a> is our sister account on Instagram and posts from the same listings.
          </p>
        </header>

        <div className="pt-grid">
          <section className="pt-card">
            <h2>Free, always</h2>
            <ul>
              <li>A listing built from the details on your own website, linking straight back to you.</li>
              <li>A direct line for corrections, schedule changes, cancellations and photos you'd like us to use.</li>
              <li>A place in CalgaryDaily posts when your dates fit. Nobody pays for that, and payment never changes the order.</li>
            </ul>
          </section>

          <section className="pt-card">
            <h2>Our picks aren't for sale</h2>
            <p>When we call something "our pick", that's our own opinion, written from the listing and its official source. We don't sell picks, rankings or "best in Calgary" claims, and we don't write about visits we didn't make.</p>
          </section>

          <section className="pt-card pt-card-soft">
            <h2>Featured partners</h2>
            <p>Later we'll offer a paid, invitation-only placement, one business per category. It will always be labelled <strong>Featured partner</strong>, on the site and on the first line of any Instagram post, and kept apart from our picks. It will never appear next to crime or safety reports.</p>
            <p className="pt-note">It isn't open yet. If you'd like to hear when it opens, email <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.</p>
          </section>

          <section className="pt-card">
            <h2>If we emailed you</h2>
            <p>We email a business only when it's listed on CalgaryWatch, and only at an address the business publishes on its own website. We don't email sites that ask not to receive unsolicited messages, and we record where we found each address.</p>
            <p>Every email says who it's from and gives our mailing address. We send at most one follow-up. Reply "stop" and you won't hear from us again. That's permanent.</p>
          </section>
        </div>

        <p className="pt-contact">
          Questions, corrections or a listing we got wrong? <a className="cw-text-link" href={`mailto:${CONTACT}`}>{CONTACT} <ArrowUpRight size={16} aria-hidden="true" /></a>
        </p>
        <p className="pt-more"><Link to="/local">See local places</Link> · <Link to="/events">Events</Link> · <Link to="/markets">Markets</Link></p>
      </div>
    </SiteLayout>
  );
}
