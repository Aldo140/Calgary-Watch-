import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, Mail, Phone, Siren } from 'lucide-react';
import { Wordmark } from './SiteLayout';
import { CALGARYDAILY } from '../../config/social';
import { useAuth } from '../FirebaseProvider';
import '../../styles/site-footer.css';

const COLUMNS: Array<{ title: string; links: Array<[string, string, string?]> }> = [
  { title: 'Get out', links: [['Events', '/events'], ['Markets', '/markets'], ['Date night', '/date-night'], ['Guides', '/guides'], ['Local', '/local'], ['Best of Calgary', '/best'], ['Neighbourhoods', '/neighbourhoods']] },
  { title: 'Stay in the know', links: [['Live map', '/map', 'live'], ['Community Watch', '/community'], ['Check your community', '/check-your-community'], ['Calgary safety news', '/safety'], ['Start a block watch', '/calgary-neighbourhood-watch'], ['Where pins come from', '/coverage']] },
  { title: 'Get involved', links: [['Add an event or market', '/submit'], ['Run a market?', '/for-markets'], ['For businesses', '/partners'], ['Search the site', '/search']] },
  { title: 'CalgaryWatch', links: [['About us', '/about'], ['Your CalgaryWatch', '/plans'], ['Email preferences', '/plans'], ['Privacy', '/privacy']] },
];

/**
 * The footer for every page except the homepage: one last useful stop.
 * The Monday email, every section by what people come to do, and the two
 * numbers a safety site should never hide.
 */
export function SiteFooter() {
  const { user } = useAuth();
  const first = user?.displayName?.split(' ')[0];
  return (
    <footer className="cf" aria-labelledby="cf-title">
      <div className="cw-wrap cf-inner">
        <div className="cf-top">
          <div className="cf-intro">
            <p className="cf-kicker">Made in Calgary · free for residents</p>
            <h2 id="cf-title">A little closer to <span>your city.</span></h2>
            <p className="cf-lead">What’s on, where to go, and what neighbours are seeing. Every listing and every pin is checked against its source.</p>
          </div>
          <Link to="/plans" className="cf-mail">
            <span className="cf-mail-icon" aria-hidden="true"><Mail size={22} /></span>
            <span className="cf-mail-copy">
              <small>{user ? 'Your CalgaryWatch' : 'The Monday email'}</small>
              <strong>{user ? `Your dashboard${first ? `, ${first}` : ''}` : 'Safety near home, every Monday.'}</strong>
              <span>{user ? 'Your picks, plans, emails and badges.' : 'What was reported within a walk of you, and weekend picks on Thursday. Free, one-click unsubscribe.'}</span>
            </span>
            <span className="cf-mail-go">{user ? 'Open' : 'Get it free'} <ArrowRight size={18} aria-hidden="true" /></span>
          </Link>
        </div>

        <nav className="cf-cols" aria-label="Footer">
          {COLUMNS.map(col => (
            <div key={col.title} className="cf-col">
              <h3>{col.title}</h3>
              <ul>
                {col.links.map(([label, to, flag]) => (
                  <li key={label}>
                    <Link to={to}>{flag === 'live' ? <span className="cf-pulse" aria-hidden="true" /> : null}{label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <aside className="cf-help" aria-label="Emergency numbers">
          <span className="cf-help-tag"><Siren size={16} aria-hidden="true" /> Need help now?</span>
          <a href="tel:911"><strong>911</strong> Emergency</a>
          <a href="tel:4032661234"><Phone size={15} aria-hidden="true" /><strong>403-266-1234</strong> Police non-emergency</a>
          <p>CalgaryWatch isn’t run by the City of Calgary or Calgary Police and doesn’t contact them for you.</p>
        </aside>

        <div className="cf-bottom">
          <Wordmark />
          <p>© {new Date().getFullYear()} CalgaryWatch · <a className="cf-credit" href="https://arctoslaunchpad.com/calgary-web-design" target="_blank" rel="noopener">Managed by Arctos Launchpad</a></p>
          <p className="cf-social">
            <a href={CALGARYDAILY.url} target="_blank" rel="noopener" title="CalgaryDaily, our sister account on Instagram">Instagram @calgarydaily <ArrowUpRight size={15} aria-hidden="true" /></a>
            <a href="mailto:aldo@calgarywatch.ca">Say hello <ArrowUpRight size={15} aria-hidden="true" /></a>
          </p>
        </div>
      </div>
      <p className="cf-giant" aria-hidden="true">CALGARYWATCH</p>
    </footer>
  );
}
