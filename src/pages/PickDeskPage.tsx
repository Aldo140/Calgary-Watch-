import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowDown, ArrowUpRight, BookOpenCheck, Share2, Lightbulb, MessageCircleQuestion, ShieldCheck, UserPlus } from 'lucide-react';
import { SiteLayout } from '../components/site/SiteLayout';
import '../styles/brand-page.css';
import { PickBoard } from '../components/picks/PickBoard';
import { PickSeal } from '../components/picks/PickSeal';
import { ServiceIcon } from '../components/picks/ServiceIcon';
import { discoveryRepository } from '../data/discovery';
import { inPeak, LOCAL_SERVICES } from '../data/localServices';
import { bestPath } from '../lib/bestOf';
import { askFor, pickDeskPath, shelfFor } from '../lib/cwPicks';
import { deskFaq, deskIndexable, seoNounInline } from '../lib/pickSeo';
import NotFoundPage from './NotFoundPage';
import '../styles/picks.css';

const CONTACT = 'aldo@calgarywatch.ca';
const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const calgaryMonth = (d: Date) => Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton', month: 'numeric' }).format(d));

/**
 * /picks/:service: one service as a decision. The Pick (or its open slot),
 * every local company A–Z one tap from a call, what to ask on the phone, and
 * when Calgary books it. The page a search for "plumber" opens into.
 */
export default function PickDeskPage() {
  const { service: id = '' } = useParams();
  const shelf = useMemo(() => shelfFor(id, discoveryRepository.list()), [id]);
  if (!shelf) return <NotFoundPage />;
  const { service: s } = shelf;
  const now = new Date();
  const month = calgaryMonth(now);
  const busy = inPeak(s, month);
  const n = shelf.contenders.length;
  const recommend = `mailto:${CONTACT}?subject=${encodeURIComponent(`Recommending a Calgary ${s.trades[0]}`)}&body=${encodeURIComponent('Name and website:\n\nWhat they did for you, and when:\n')}`;
  const others = LOCAL_SERVICES.filter(o => o.id !== s.id).sort((a, b) => Number(inPeak(b, month)) - Number(inPeak(a, month)));

  return (
    <SiteLayout>
      <div className="bp pkd">
        <section className="bp-hero pkd-hero" aria-labelledby="pkd-title">
          <div className="cw-wrap pkd-hero-grid">
            <div>
              <nav className="pkd-crumbs" aria-label="Breadcrumb"><Link to="/picks">Who to call</Link><span aria-hidden="true">/</span>{s.label}</nav>
              <div className="pkd-title">
                <span className="pkd-ico" aria-hidden="true"><ServiceIcon id={s.id} size={26} /></span>
                <h1 id="pkd-title">{deskIndexable(shelf) ? <>Best {seoNounInline(s)}</> : s.label} <span>in Calgary.</span></h1>
              </div>
              <p className="pkd-lead">{n ? `${n} local ${n === 1 ? 'company' : 'companies'}, each checked against its own site.` : 'The list is being built.'} One tap to call. Nobody pays to be here.</p>
              <ul className="pkd-chips">
                {busy ? <li className="is-busy"><i aria-hidden="true" /> Busy in {MONTH_NAMES[month - 1]}</li> : null}
                <li className={shelf.live ? 'is-live' : ''}>{shelf.live ? <>Pick: {shelf.live.contender.name}</> : <>Pick: vetting 0/7</>}</li>
                <li><ShareDesk label={s.label} /></li>
              </ul>
            </div>
            <div className="pkd-hero-seal" aria-hidden="true">
              <PickSeal state={shelf.live ? 'live' : 'open'} checks={0} size={176} year={shelf.live?.pick.checks.pledge.slice(0, 4)} />
            </div>
          </div>
        </section>

        <DeskTabs n={n} />

        <div className="cw-wrap pkd-layout">
          <section className="pkd-main" id="pkd-list" aria-label={`${s.label} in Calgary`}>
            <PickBoard shelf={shelf} via="desk" />
          </section>

          <aside className="pkd-side">
            <section className="pkd-card is-dark" id="pkd-ask-card" aria-labelledby="pkd-ask">
              <p className="bp-eyebrow"><MessageCircleQuestion size={14} aria-hidden="true" /> On the phone</p>
              <h2 id="pkd-ask">Ask these three.</h2>
              <ol className="pkd-ask">{askFor(s).map((q, i) => <li key={q}><i>{i + 1}</i>{q}</li>)}</ol>
            </section>

            <section className="pkd-card" id="pkd-year-card" aria-labelledby="pkd-year">
              <p className="bp-eyebrow">When Calgary books it</p>
              <h2 id="pkd-year">{s.peak.length ? (busy ? 'Busy right now.' : 'Book ahead of the rush.') : 'Steady all year.'}</h2>
              <ol className="pkd-months" aria-label="Busiest months">
                {MONTHS.map((m, i) => (
                  <li key={i} className={`${s.peak.includes(i + 1) ? 'is-peak' : ''}${i + 1 === month ? ' is-now' : ''}`} title={MONTH_NAMES[i]}>
                    <span aria-hidden="true">{m}</span><span className="pkd-sr">{MONTH_NAMES[i]}{s.peak.includes(i + 1) ? ', busy' : ''}</span>
                  </li>
                ))}
              </ol>
              <p className="pkd-tip"><Lightbulb size={16} aria-hidden="true" /><span>{s.tip}</span></p>
            </section>

            <section className="pkd-card" aria-labelledby="pkd-more">
              <p className="bp-eyebrow">Help the list</p>
              <h2 id="pkd-more">Know a good one?</h2>
              <p>Tell us who did good work for you. We check them against their own site before they go on the list.</p>
              <div className="pkd-links">
                <a href={recommend}><UserPlus size={16} aria-hidden="true" /> Recommend a company</a>
                <a href={`mailto:${CONTACT}?subject=${encodeURIComponent(`CalgaryWatch Pick vetting: ${s.label}`)}`}><ShieldCheck size={16} aria-hidden="true" /> Ask to be vetted</a>
                {shelf.bestSlug ? <Link to={bestPath({ slug: shelf.bestSlug })}><BookOpenCheck size={16} aria-hidden="true" /> Sources for this list</Link> : null}
                <Link to="/picks#pkh-how">How Picks work <ArrowUpRight size={14} aria-hidden="true" /></Link>
              </div>
            </section>
          </aside>
        </div>

        <div className="cw-wrap">
          <section className="bp-section pkd-faq" aria-labelledby="pkd-faq">
            <div className="bp-head"><h2 id="pkd-faq">Questions <span>Calgarians ask.</span></h2></div>
            <div className="pkd-faq-list">
              {deskFaq(shelf).map((x, i) => (
                <details key={x.q} open={i === 0}>
                  <summary>{x.q}</summary>
                  <p>{x.a}</p>
                </details>
              ))}
            </div>
          </section>
        </div>

        <div className="cw-wrap">
          <section className="bp-section pkd-others" aria-labelledby="pkd-others">
            <div className="bp-head"><h2 id="pkd-others">Something <span>else?</span></h2><Link className="bp-link" to="/picks">Every service</Link></div>
            <ul>
              {others.map(o => (
                <li key={o.id}>
                  <Link to={pickDeskPath(o.id)}><ServiceIcon id={o.id} size={16} />{o.label}{inPeak(o, month) ? <i>Busy</i> : null}</Link>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </SiteLayout>
  );
}

/** Neighbours ask each other "who do you use?". One tap sends them the desk. */
function ShareDesk({ label }: { label: string }) {
  const [done, setDone] = useState(false);
  const share = async () => {
    const url = window.location.href.split('#')[0];
    const text = `${label} in Calgary, checked by CalgaryWatch`;
    try {
      if (navigator.share) { await navigator.share({ title: text, url }); return; }
      await navigator.clipboard.writeText(url);
      setDone(true);
      setTimeout(() => setDone(false), 1800);
    } catch { /* dismissed */ }
  };
  return <button type="button" className="pkd-share" onClick={() => void share()}><Share2 size={17} aria-hidden="true" /> {done ? 'Link copied' : 'Send to a neighbour'}</button>;
}

const TABS = [['pkd-list', 'Who to call'], ['pkd-ask-card', 'What to ask'], ['pkd-year-card', 'When to book']] as const;

/** Phones: a sticky segmented bar whose highlight follows the section in view and slides between tabs. */
function DeskTabs({ n }: { n: number }) {
  const [on, setOn] = useState(0);
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const els = TABS.map(([id]) => document.getElementById(id)).filter((e): e is HTMLElement => !!e);
    const io = new IntersectionObserver(entries => {
      const seen = entries.filter(e => e.isIntersecting).map(e => TABS.findIndex(([id]) => id === e.target.id));
      if (seen.length) setOn(Math.min(...seen));
    }, { rootMargin: '-140px 0px -55% 0px' });
    els.forEach(e => io.observe(e));
    return () => io.disconnect();
  }, []);
  return (
    <nav className="pkd-tabs" aria-label="On this page" style={{ ['--on' as string]: on }}>
      <span className="pkd-tabs-pill" aria-hidden="true" />
      {TABS.map(([id, label], i) => (
        <a key={id} href={`#${id}`} aria-current={on === i ? 'true' : undefined} onClick={() => setOn(i)}>{label}{i === 0 ? <b>{n}</b> : null}</a>
      ))}
    </nav>
  );
}
