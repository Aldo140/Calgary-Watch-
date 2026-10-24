import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Search } from 'lucide-react';
import { SiteLayout } from '../components/site/SiteLayout';
import { useAuth } from '../components/FirebaseProvider';
import { discoveryRepository } from '../data/discovery';
import { organizationForEmail } from '../lib/orgMatch';
import '../styles/plans.css';
import '../styles/claim.css';

const KIND_LABEL: Record<string, string> = { business: 'Organization', market: 'Market', event: 'Event' };
const fold = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * /claim: where organizers start when they didn't come from one of our
 * emails. Organizer accounts are made on a listing's claim page, so this
 * only finds the page. Organizations and markets come first, because one
 * claim there covers every event under it.
 */
export default function ClaimFinderPage() {
  const { user } = useAuth();
  const [q, setQ] = useState('');
  useEffect(() => { document.title = 'Claim your organization | CalgaryWatch'; }, []);
  const all = useMemo(() => discoveryRepository.list().filter(e => !e.developmentOnly && e.status === 'published' && ['business', 'market', 'event'].includes(e.kind)), []);
  const suggested = useMemo(() => organizationForEmail(user?.email, all), [user?.email, all]);
  const needle = fold(q.trim());
  const results = needle.length < 2 ? [] : all
    .filter(e => fold(`${e.title} ${'organizer' in e ? e.organizer ?? '' : ''}`).includes(needle))
    .sort((a, b) => (a.kind === 'event' ? 1 : 0) - (b.kind === 'event' ? 1 : 0) || a.title.localeCompare(b.title))
    .slice(0, 12);

  return (
    <SiteLayout>
      <div className="cw-plans cl-page">
        <header className="cw-wrap cl-head">
          <p className="pl-eyebrow">For venues, markets and organizers · free</p>
          <h1 className="cl-title">Claim your <em>organization.</em></h1>
          <p className="cl-lead">Find your listing, then fill in one short form. That makes your free organizer account and sends your claim together. A person checks it before you can edit.</p>
        </header>
        <div className="cw-wrap cl-finder">
          {suggested ? <Link className="cl-finder-hit" data-suggested="true" to={`/claim/${encodeURIComponent(suggested.id)}`}><span><small>Matches your email</small><strong>{suggested.title}</strong></span><ArrowUpRight size={18} aria-hidden="true" /></Link> : null}
          <label className="pl-field"><span>Your organization, market or event</span>
            <span className="cl-finder-search"><Search size={18} aria-hidden="true" /><input type="search" autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="e.g. Vertigo Theatre" /></span>
          </label>
          <ul className="cl-finder-list" aria-live="polite">
            {results.map(e => <li key={e.id}><Link className="cl-finder-hit" to={`/claim/${encodeURIComponent(e.id)}`}><span><small>{KIND_LABEL[e.kind]}</small><strong>{e.title}</strong></span><ArrowUpRight size={18} aria-hidden="true" /></Link></li>)}
          </ul>
          {needle.length >= 2 && !results.length ? <p className="pl-fine">Nothing by that name yet. <Link to="/submit">Send us your events</Link> or email <a href="mailto:aldo@calgarywatch.ca">aldo@calgarywatch.ca</a> and we’ll set up your page.</p> : null}
        </div>
      </div>
    </SiteLayout>
  );
}
