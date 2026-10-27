import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, BadgeCheck, CalendarCheck, ClipboardList, Lock, Megaphone, Store } from 'lucide-react';
import type { DiscoveryEntity, Market, MarketOccurrence } from '../../types/discovery';
import { entityPath } from '../../lib/discovery';
import { organizationClaimPath } from '../../lib/claimOrganization';
import { isOwnerVerified } from '../../lib/verified';
import { dayNum, monthDay, monthShort, season, shortName, upcoming, weekdayShort } from '../../lib/marketDays';

/** A market's live dates from today on: how many, first and last. */
function run(market: Market, occurrences: readonly MarketOccurrence[], now: Date) {
  const dates = upcoming(market, occurrences, now).filter(o => !o.cancelled);
  return dates.length ? { first: dates[0], last: dates[dates.length - 1], count: dates.length } : null;
}

/**
 * "Sell at a market": every market with dates ahead, soonest first, each with
 * its own vendor application. Vendors get one place to find a stall; the
 * organizer gets applications in Market HQ instead of an inbox.
 */
export function SellBoard({ markets, occurrences, now }: { markets: readonly Market[]; occurrences: readonly MarketOccurrence[]; now: Date }) {
  const [more, setMore] = useState(false);
  const calls = useMemo(() => markets
    .map(m => ({ m, r: run(m, occurrences, now) }))
    .filter((x): x is { m: Market; r: NonNullable<ReturnType<typeof run>> } => !!x.r)
    .sort((a, b) => Date.parse(a.r.first.start) - Date.parse(b.r.first.start)), [markets, occurrences, now]);
  if (!calls.length) return null;
  const totalDates = calls.reduce((n, c) => n + c.r.count, 0);

  return (
    <section className="mk-sell" data-reveal aria-labelledby="mk-sell-title">
      <div className="mk-sell-head">
        <p className="mk-sell-stamp"><Megaphone size={15} aria-hidden="true" /> Vendors wanted</p>
        <h2 id="mk-sell-title">Sell at a <mark>Calgary market.</mark></h2>
        <p className="mk-sell-lead">{calls.length} markets and {totalDates} market days ahead. Pick one, send a two-minute application, and the organizer reviews it in Market HQ.</p>
        <p className="mk-sell-fine"><Lock size={13} aria-hidden="true" /> Your phone and email stay private. Approved vendors show in the market’s lineup here.</p>
      </div>
      <ol className={`mk-sell-list${more ? ' is-all' : ''}`}>
        {calls.map(({ m, r }) => {
          const first = new Date(r.first.start);
          const verified = isOwnerVerified(m);
          const kind = season(m);
          return (
            <li key={m.id} className={verified ? 'is-verified' : undefined}>
              <span className="mk-sell-stub" aria-hidden="true"><small>{weekdayShort.format(first)}</small><b>{dayNum.format(first)}</b><small>{monthShort.format(first)}</small></span>
              <span className="mk-sell-body">
                <small>{r.count === 1 ? 'One day' : `${r.count} dates · to ${monthDay.format(new Date(r.last.start))}`}{kind ? ` · ${kind}` : ''}</small>
                <Link to={entityPath(m)}><strong>{shortName(m)}</strong></Link>
                <span>{m.neighbourhood || 'Calgary'}{verified ? <em><BadgeCheck size={13} aria-hidden="true" /> Organizer on CalgaryWatch</em> : null}</span>
              </span>
              <Link className="mk-sell-go" to={`/apply/${encodeURIComponent(m.id)}`} aria-label={`Apply to sell at ${m.title}`}>Apply <ArrowUpRight size={16} aria-hidden="true" /></Link>
            </li>
          );
        })}
      </ol>
      {calls.length > 8 ? <button type="button" className="mk-sell-more" onClick={() => setMore(v => !v)} aria-expanded={more}>{more ? 'Show fewer' : `See all ${calls.length} markets`}</button> : null}
    </section>
  );
}

/**
 * For the people who run them: pick your market, and the button is the next
 * step (claim it, or open Market HQ once verified). The proof is the list
 * above, where verified markets already carry the badge.
 */
export function OrganizerPanel({ markets, all }: { markets: readonly Market[]; all: readonly DiscoveryEntity[] }) {
  const sorted = useMemo(() => [...markets].sort((a, b) => a.title.localeCompare(b.title)), [markets]);
  const [id, setId] = useState('');
  const picked = sorted.find(m => m.id === id);
  const verified = picked ? isOwnerVerified(picked) : false;
  const claimed = markets.filter(isOwnerVerified).length;

  return (
    <section className="mk-org" data-reveal aria-labelledby="mk-org-title">
      <div className="mk-org-copy">
        <p className="mk-band-tag">For organizers</p>
        <h2 id="mk-org-title">Run one of these markets? Make this page work for you.</h2>
        <ul className="mk-org-perks">
          <li><BadgeCheck size={20} aria-hidden="true" /><span><strong>A Verified badge on this list.</strong> Shoppers see the dates came from you.</span></li>
          <li><ClipboardList size={20} aria-hidden="true" /><span><strong>Vendor applications in one place.</strong> Review, approve and message vendors in Market HQ.</span></li>
          <li><CalendarCheck size={20} aria-hidden="true" /><span><strong>Your weekly lineup, public.</strong> Who’s coming shows on your page and in our event picks.</span></li>
        </ul>
      </div>
      <div className="mk-org-card">
        <p className="mk-org-count"><b>{claimed}</b> of {markets.length} markets claimed so far. Free.</p>
        <label htmlFor="mk-org-pick">Which market is yours?</label>
        <select id="mk-org-pick" value={id} onChange={e => setId(e.target.value)}>
          <option value="">Pick your market</option>
          {sorted.map(m => <option key={m.id} value={m.id}>{m.title}{isOwnerVerified(m) ? ' (verified)' : ''}</option>)}
        </select>
        {picked ? (
          verified
            ? <Link className="mk-btn mk-btn-sun mk-wide" to={`/organizer/${encodeURIComponent(picked.id)}`}><Store size={17} aria-hidden="true" /> Open Market HQ</Link>
            : <Link className="mk-btn mk-btn-sun mk-wide" to={organizationClaimPath(picked, all)}><BadgeCheck size={17} aria-hidden="true" /> Claim {shortName(picked)}</Link>
        ) : <span className="mk-btn mk-wide is-idle" aria-hidden="true">Pick a market first</span>}
        <p className="mk-org-alt">Not listed? <Link to="/submit?type=market">Add your market</Link> · <Link to="/for-markets">How Market HQ works <ArrowRight size={13} aria-hidden="true" /></Link></p>
      </div>
    </section>
  );
}
