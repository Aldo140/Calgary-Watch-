import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, BadgeCheck, MailCheck, MessageSquareText, PhoneCall, Search, ShieldCheck } from 'lucide-react';
import { SiteLayout } from '../components/site/SiteLayout';
import { PageHero } from '../components/site/PageHero';
import { PickSeal } from '../components/picks/PickSeal';
import { ServiceIcon } from '../components/picks/ServiceIcon';
import { PICK_CHECKS, type PickCheck } from '../content/cwPicks';
import { discoveryRepository } from '../data/discovery';
import { inPeak, SERVICE_GROUPS, type ServiceGroup } from '../data/localServices';
import { allShelves, pickDeskPath, serviceForQuery, type Shelf } from '../lib/cwPicks';
import '../styles/picks.css';

const CONTACT = 'aldo@calgarywatch.ca';
const CHECK_KEYS = Object.keys(PICK_CHECKS) as PickCheck[];
const GROUPS = Object.keys(SERVICE_GROUPS) as ServiceGroup[];
const calgaryMonth = (d: Date) => Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton', month: 'numeric' }).format(d));
const MONTH = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton', month: 'long' });

/**
 * /picks: "who do you call?" for every everyday service, each with its Pick
 * desk, plus the public rules a reader can trust and a business can see.
 */
export default function PicksPage() {
  const shelves = useMemo(() => allShelves(discoveryRepository.list()), []);
  const [now] = useState(() => new Date());
  const month = calgaryMonth(now);
  const [q, setQ] = useState('');
  const navigate = useNavigate();
  const live = shelves.filter(s => s.live).length;
  const companies = shelves.reduce((n, s) => n + s.contenders.length, 0);
  const match = q.trim() ? serviceForQuery(q) : undefined;
  const filter = q.trim().toLowerCase();
  const shown = (s: Shelf) => !filter || s.service.id === match?.id || [s.service.label, ...s.service.trades].some(t => t.toLowerCase().includes(filter));
  const busy = shelves.filter(s => inPeak(s.service, month));

  return (
    <SiteLayout>
      <div className="bp pkh">
        <PageHero
          id="pkh-title"
          kicker="CalgaryWatch Picks"
          title={<>Who do you call? <span>We checked.</span></>}
          lead={<>For every everyday service in Calgary, a short list of local companies, and one CalgaryWatch Pick that passed seven checks we do ourselves. Neighbours who hire through us keep it honest. It can’t be bought.</>}
          ctas={<>
            <a className="bp-btn bp-btn-primary" href="#pkh-find">Find a service <ArrowRight size={18} aria-hidden="true" /></a>
            <a className="bp-btn" href="#pkh-how">How a Pick is earned</a>
          </>}
          facts={<>
            <li><b>{shelves.length}</b> services</li>
            <li><b>{companies}</b> local companies</li>
            <li><b>7</b> checks per Pick</li>
            <li><b>$0</b> to be picked</li>
          </>}
          aside={
            <div className="pkh-stamp" aria-hidden="true">
              <PickSeal state="live" size={220} year={String(now.getFullYear())} />
              <ul className="pkh-stamp-checks">
                {CHECK_KEYS.slice(0, 4).map(k => <li key={k}><BadgeCheck size={15} />{PICK_CHECKS[k]}</li>)}
                <li className="is-more">+ {CHECK_KEYS.length - 4} more checks</li>
              </ul>
            </div>
          }
        />

        <div className="cw-wrap">
          <section className="bp-section pkh-find" id="pkh-find" aria-labelledby="pkh-find-title">
            <div className="bp-head">
              <h2 id="pkh-find-title">What needs <span>doing?</span></h2>
              <p>{live ? `${live} of ${shelves.length} services have a Pick so far.` : 'Every Pick is being vetted now.'} Each desk lists who to call, what to ask, and when Calgary books it.</p>
            </div>
            <label className="pkh-search">
              <Search size={20} aria-hidden="true" />
              <span className="pkh-sr">Find a service</span>
              <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Plumber, furnace, snow, locksmith…" enterKeyHint="go"
                onKeyDown={e => { if (e.key === 'Enter' && match) navigate(pickDeskPath(match.id)); }} />
            </label>
            {!filter && busy.length ? (
              <div className="pkh-busy">
                <p><b>{MONTH.format(now)}</b> in Calgary, book these first</p>
                <ul>{busy.map((s, i) => (
                  <li key={s.service.id} style={{ ['--i' as string]: i }}>
                    <Link to={pickDeskPath(s.service.id)}>
                      <span className="pkh-busy-ico"><ServiceIcon id={s.service.id} size={18} /></span>
                      <span><b>{s.service.label}</b><small>{s.contenders.length ? `${s.contenders.length} local` : 'Desk open'}</small></span>
                    </Link>
                  </li>
                ))}</ul>
              </div>
            ) : null}
            {GROUPS.map(g => {
              const list = shelves.filter(s => s.service.group === g && shown(s));
              if (!list.length) return null;
              return (
                <div key={g} className="pkh-group">
                  <h3>{SERVICE_GROUPS[g].label}<small>{SERVICE_GROUPS[g].blurb}</small></h3>
                  <ul className="pkh-tiles">{list.map(s => <Tile key={s.service.id} s={s} busy={inPeak(s.service, month)} />)}</ul>
                </div>
              );
            })}
            {filter && !shelves.some(shown) ? (
              <p className="pkh-none">No desk for “{q}” yet. <a href={`mailto:${CONTACT}?subject=${encodeURIComponent(`A Pick desk for ${q}`)}`}>Tell us what you need</a> and we’ll add it.</p>
            ) : null}
          </section>

          <section className="bp-section" id="pkh-how" aria-labelledby="pkh-how-title">
            <div className="bp-head">
              <h2 id="pkh-how-title">How a Pick <span>is earned.</span></h2>
              <p>One company per service. Earned, dated, and lost the same way.</p>
            </div>
            <ol className="pkh-steps">
              <li className="pkh-step">
                <b>01</b><h3>We vet.</h3>
                <p>Seven checks we do ourselves, each one dated on the Pick. No forms to fill in for a badge.</p>
                <ol className="pkh-checklist">{CHECK_KEYS.map((k, i) => <li key={k}><i>{i + 1}</i>{PICK_CHECKS[k]}</li>)}</ol>
              </li>
              <li className="pkh-step">
                <b>02</b><h3>You choose.</h3>
                <p>The Pick sits above an A–Z list of other local companies. Call anyone, straight from the list. Tick one box if you’d like us to check in a week later.</p>
                <div className="pkh-mini" aria-hidden="true">
                  <span className="pkh-mini-box" /> <span>Check in with me in a week</span>
                </div>
              </li>
              <li className="pkh-step">
                <b>03</b><h3>Neighbours decide.</h3>
                <p>We read every answer. A Pick that slips, late or over the quote or no callback, hears from us first, then loses the seal. Every Pick is re-vetted every six months.</p>
                <dl className="pkh-bar">
                  <div><dt>Keeps the seal</dt><dd>4.3★ or better</dd></div>
                  <div><dt>Would hire again</dt><dd>80%+</dd></div>
                  <div><dt>Re-vetted</dt><dd>Every 6 months</dd></div>
                </dl>
              </li>
            </ol>
          </section>

          <section className="bp-section" id="privacy" aria-labelledby="pkh-privacy-title">
            <div className="bp-head">
              <h2 id="pkh-privacy-title">Your privacy, <span>in three lines.</span></h2>
              <p>The check-in is the only thing we ask for, and it’s optional.</p>
            </div>
            <ul className="pkh-promises">
              <li><PhoneCall size={22} aria-hidden="true" /><b>A tap is just a count.</b><span>When you call or open a site from a desk, we count it for that company. Never who you are.</span></li>
              <li><MailCheck size={22} aria-hidden="true" /><b>The check-in is opt-in.</b><span>One email, a week later. No list, no newsletter. Your address is deleted once you answer, or after 60 days.</span></li>
              <li><MessageSquareText size={22} aria-hidden="true" /><b>Your words, never your name.</b><span>We read every answer first. Nothing is published with your name or email, and we never pass your details to the company.</span></li>
            </ul>
          </section>

          <section className="bp-banner pkh-biz" aria-labelledby="pkh-biz-title">
            <div>
              <h2 id="pkh-biz-title">Run a Calgary trade?</h2>
              <p>Vetting is free and can’t be bought. Pass, and you get the seal on your desk and in search, a monthly count of Calgarians who reached you from CalgaryWatch, and what your customers told us, so you hear about a problem before a one-star review does. Don’t pass, and we tell you why. Try again in 90 days.</p>
            </div>
            <div className="bp-ctas">
              <a className="bp-btn bp-btn-navy" href={`mailto:${CONTACT}?subject=${encodeURIComponent('CalgaryWatch Pick vetting')}`}><ShieldCheck size={18} aria-hidden="true" /> Ask to be vetted</a>
              <Link className="bp-btn" to="/partners">How we work with businesses <ArrowUpRight size={16} aria-hidden="true" /></Link>
            </div>
          </section>
        </div>
      </div>
    </SiteLayout>
  );
}

function Tile({ s, busy }: { s: Shelf; busy: boolean }) {
  const n = s.contenders.length;
  return (
    <li>
      <Link to={pickDeskPath(s.service.id)} className={`pkh-tile${s.live ? ' is-live' : ''}`}>
        <span className="pkh-tile-ico"><ServiceIcon id={s.service.id} size={22} /></span>
        <span className="pkh-tile-copy">
          <strong>{s.service.label}</strong>
          <small>{n ? `${n} local ${n === 1 ? 'company' : 'companies'}` : s.service.trades.slice(1).join(', ')}</small>
        </span>
        <span className={`pkh-pill${s.live ? ' is-live' : ''}`}>{s.live ? <><BadgeCheck size={13} aria-hidden="true" /> Pick</> : 'Vetting'}</span>
        {busy ? <i className="pkh-tile-busy">Busy now</i> : null}
      </Link>
    </li>
  );
}
