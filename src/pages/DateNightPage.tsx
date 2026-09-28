import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, MapPin, Quote } from 'lucide-react';
import { SiteLayout } from '../components/site/SiteLayout';
import { discoveryRepository } from '../data/discovery';
import { entityPath } from '../lib/discovery';
import { eveningsThisWeek, resolvePicks, type ResolvedPick } from '../lib/dateNight';
import { DATE_FREE_IDEAS } from '../content/dateNight';
import '../styles/date-night.css';

const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton', ...o });
const dow = fmt({ weekday: 'short' });
const dnum = fmt({ day: 'numeric' });
const mon = fmt({ month: 'short' });
const clock = fmt({ hour: 'numeric', minute: '2-digit' });
const longDay = fmt({ weekday: 'long', month: 'long', day: 'numeric' });
const shortDay = fmt({ month: 'short', day: 'numeric' });

const VIBE_COLOR: Record<string, string> = {
  'Dinner and a show': '#ffdf4f', 'Laugh together': '#00c2e0', 'Dress up': '#f4b8d0',
  'Something festive': '#ff8a65', 'Loud night out': '#b9a4ff', 'Quiet and bookish': '#bdf1f9',
};

function venueOf(e: ResolvedPick['entity']): string {
  return ('venue' in e && e.venue) || ('address' in e && e.address ? e.address.replace(/, Calgary, AB$/, '') : '');
}

function Tickets() {
  return (
    <svg className="dn-art" viewBox="0 0 360 300" aria-hidden="true" focusable="false">
      <circle cx="286" cy="62" r="34" className="dn-moon" />
      <circle cx="302" cy="52" r="30" className="dn-moon-cut" />
      {[[40, 40], [120, 22], [210, 70], [330, 130], [70, 110]].map(([x, y], i) => <path key={i} className="dn-star" d={`M${x},${y - 7}L${x + 2},${y - 2}L${x + 7},${y}L${x + 2},${y + 2}L${x},${y + 7}L${x - 2},${y + 2}L${x - 7},${y}L${x - 2},${y - 2}Z`} />)}
      <path className="dn-skyline-far" d="M0,300V250H18V232H40V246H62V222H90V244H112V236H138V250H170V228H196V246H230V238H260V252H300V240H326V256H360V300Z" />
      <path className="dn-skyline" d="M0,300V262H24V240H52V262H70V226H104V262H120V250H148V270H250V244H276V230H306V262H318V254H346V268H360V300Z" />
      <g className="dn-tower">
        <path d="M331,270V150" />
        <path className="dn-tower-pod" d="M318,150H344L340,138H322Z" />
        <path d="M331,138V112" />
        <circle cx="331" cy="110" r="2.5" className="dn-tower-light" />
      </g>
      {[[30, 250], [40, 258], [80, 236], [92, 246], [82, 254], [284, 240], [294, 252], [262, 256], [130, 258]].map(([x, y], i) => <rect key={i} x={x} y={y} width="4" height="4" className="dn-window" />)}
      <g transform="rotate(-11 150 160)" className="dn-ticket dn-ticket-a">
        <path d="M60,110H240V142A14,14 0 0 0 240,170V202H60V170A14,14 0 0 0 60,142Z" />
        <path className="dn-perf" d="M190,114V198" />
        <text x="76" y="140">ADMIT</text><text x="76" y="172" className="dn-big">TWO</text>

      </g>
      <g transform="rotate(7 200 190)" className="dn-ticket dn-ticket-b">
        <path d="M120,150H300V182A14,14 0 0 0 300,210V242H120V210A14,14 0 0 0 120,182Z" />
        <path className="dn-perf" d="M250,154V238" />
        <text x="136" y="180">CALGARY</text><text x="136" y="212" className="dn-big">7:30</text>
        <circle cx="274" cy="198" r="9" className="dn-heart" />
      </g>
    </svg>
  );
}

function PickCard({ pick }: { pick: ResolvedPick }) {
  const e = pick.entity;
  const next = new Date(pick.next);
  const soon = Date.parse(pick.next) - Date.now() < 7 * 86_400_000;
  return (
    <li className="dn-pick" style={{ ['--v' as string]: VIBE_COLOR[pick.vibe] ?? '#ffdf4f' }}>
      <Link to={entityPath(e)} className="dn-pick-link">
        <span className="dn-stub" aria-hidden="true">
          <small>{pick.onNow ? 'On now' : dow.format(next)}</small>
          <b>{pick.onNow ? '●' : dnum.format(next)}</b>
          <small>{pick.onNow ? '' : mon.format(next)}</small>
        </span>
        <span className="dn-pick-body">
          <span className="dn-pick-top">
            <em className="dn-vibe">{pick.vibe}</em>
            {soon ? <em className="dn-soon">This week</em> : null}
          </span>
          <h3>{e.title}</h3>
          <span className="dn-meta">
            <MapPin size={14} aria-hidden="true" /> {venueOf(e)}
            {' · '}{pick.onNow && pick.until ? `until ${shortDay.format(new Date(pick.until))}` : `${longDay.format(next)}${e.kind === 'event' ? `, ${clock.format(next)}` : ''}`}
            {!pick.onNow && pick.until ? ` · until ${shortDay.format(new Date(pick.until))}` : ''}
          </span>
          <span className="dn-take"><strong>Why it works: </strong>{pick.take}</span>
          {pick.quote ? <span className="dn-quote"><Quote size={14} aria-hidden="true" /><span>“{pick.quote.text}” <cite>— {pick.quote.by}</cite></span></span> : null}
          {pick.tip ? <span className="dn-tip"><b>Make a night of it</b> {pick.tip}</span> : null}
          <span className="dn-go">Details and tickets <ArrowUpRight size={15} aria-hidden="true" /></span>
        </span>
      </Link>
    </li>
  );
}

/**
 * /date-night: our picks for a night out for two, drawn from real listings, plus what
 * else is on in the evenings this week and a few ideas that need no tickets.
 */
export default function DateNightPage() {
  const now = Date.now();
  const entities = discoveryRepository.list();
  const picks = useMemo(() => resolvePicks(entities, discoveryRepository.occurrences(), now), [entities]); // eslint-disable-line react-hooks/exhaustive-deps
  const more = useMemo(() => eveningsThisWeek(entities, now, new Set(picks.map(p => p.entity.id))), [entities, picks]); // eslint-disable-line react-hooks/exhaustive-deps
  const hoodPath = (name?: string) => {
    const hood = name ? entities.find(e => e.kind === 'neighbourhood' && e.title === name) : undefined;
    return hood ? entityPath(hood) : undefined;
  };

  return (
    <SiteLayout>
      <div className="dn">
        <section className="dn-hero" aria-labelledby="dn-title">
          <div className="cw-wrap dn-hero-grid">
            <div>
              <p className="dn-kicker">Date night · Calgary</p>
              <h1 id="dn-title">Date night in <mark>Calgary.</mark></h1>
              <p className="dn-lead">Real plans for two, from the organizers’ own listings: a show, a festival night, somewhere to dress up for. Every date and time is checked at the source. The picks are ours and never paid for.</p>
              <div className="dn-jump">
                <a href="#dn-picks">Our picks</a>
                <a href="#dn-week">Evenings this week</a>
                <a href="#dn-free">No tickets needed</a>
              </div>
            </div>
            <Tickets />
          </div>
        </section>

        <section className="cw-wrap dn-sec" id="dn-picks" aria-labelledby="dn-picks-title">
          <div className="dn-head">
            <h2 id="dn-picks-title">Our picks, <mark>soonest first.</mark></h2>
            <p>Each one links to the full listing and the organizer’s tickets. When a date passes it comes off this page by itself.</p>
          </div>
          {picks.length ? <ol className="dn-picks">{picks.map(p => <PickCard key={p.entity.id} pick={p} />)}</ol>
            : <p className="dn-empty">Our next picks are being checked. In the meantime, see <Link to="/events">everything on this week</Link>.</p>}
        </section>

        <section className="cw-wrap dn-sec" id="dn-week" aria-labelledby="dn-week-title">
          <div className="dn-head">
            <h2 id="dn-week-title">Also on, <mark>evenings this week.</mark></h2>
            <p>Arts and nights out starting at 5 pm or later, straight from the listings. Not picks, just what’s on.</p>
          </div>
          {more.length ? (
            <ul className="dn-week">
              {more.map(e => (
                <li key={e.id}>
                  <Link to={entityPath(e)}>
                    <time dateTime={e.start}><b>{dow.format(new Date(e.start))}</b> {clock.format(new Date(e.start))}</time>
                    <span><strong>{e.title}</strong><small>{('venue' in e && e.venue) || e.address.replace(/, Calgary, AB$/, '')}</small></span>
                    <ArrowUpRight size={16} aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : <p className="dn-empty">Nothing else listed for evenings this week yet. <Link to="/events">See all events</Link>.</p>}
        </section>

        <section className="cw-wrap dn-sec" id="dn-free" aria-labelledby="dn-free-title">
          <div className="dn-head">
            <h2 id="dn-free-title">No tickets <mark>needed.</mark></h2>
            <p>For the nights you’d rather just walk and talk.</p>
          </div>
          <ul className="dn-free">
            {DATE_FREE_IDEAS.map(idea => (
              <li key={idea.title}>
                <Link to={hoodPath(idea.neighbourhood) ?? idea.to}>
                  <h3>{idea.title}</h3>
                  <p>{idea.body}</p>
                  <span>{idea.cta} <ArrowUpRight size={15} aria-hidden="true" /></span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="cw-wrap dn-sec dn-how">
          <p><strong>How we pick.</strong> Picks are CalgaryWatch’s own opinion, written from each listing and its official source. We don’t sell picks or write about visits we didn’t make. If a business ever pays to appear, it’s labelled Featured partner. <Link to="/partners">How we work with businesses</Link>.</p>
        </section>
      </div>
    </SiteLayout>
  );
}
