import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowUpRight, BadgeCheck, Coffee, Drama, Globe, HeartHandshake, Navigation, Phone, Search, ShoppingBag, Store, Trees, Wrench, X,
  type LucideIcon,
} from 'lucide-react';
import type { Business } from '../../types/discovery';
import { entityPath } from '../../lib/discovery';
import { isOwnerVerified } from '../../lib/verified';
import { LOCAL_NOTES } from '../../data/localNotes';
import { inPeak, LOCAL_SERVICES, offersService } from '../../data/localServices';

/**
 * The Calgary White Pages: every Local listing as one phone book. Sections,
 * alphabetical entries, a call / site / directions row on each, and the
 * trades we haven't filled yet shown as open lines anyone can recommend into.
 * Picks and Verified are earned; "Featured partner" is paid and always says so.
 */

interface Section { id: string; label: string; blurb: string; icon: LucideIcon; match: string[] }

export const WP_SECTIONS: Section[] = [
  { id: 'services', label: 'Services', blurb: 'Trades, fixes and the people you call', icon: Wrench, match: ['services'] },
  { id: 'food', label: 'Food & drink', blurb: 'Coffee, bakeries and where to eat', icon: Coffee, match: ['food'] },
  { id: 'shopping', label: 'Shops', blurb: 'Independent shops worth the trip', icon: ShoppingBag, match: ['shopping'] },
  { id: 'arts', label: 'Arts & theatre', blurb: 'Stages, galleries and classes', icon: Drama, match: ['arts'] },
  { id: 'markets', label: 'Markets & makers', blurb: 'The people behind the markets', icon: Store, match: ['markets'] },
  { id: 'out', label: 'Out & about', blurb: 'Family days, community and day trips', icon: Trees, match: ['community', 'family', 'heritage', 'recreation', 'day-trip', 'holiday', 'nightlife'] },
];

/** The section a place is filed under: its own first category that has one. */
export function sectionOf(p: Pick<Business, 'categories'> & { tags?: string[] }): string {
  // Community associations and BIAs are neighbours, not trades.
  if (p.tags?.includes('community') && p.categories[0] === 'services') return 'out';
  for (const c of p.categories) {
    const s = WP_SECTIONS.find(x => x.match.includes(c));
    if (s) return s.id;
  }
  return 'out';
}

const directions = (p: Business) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${p.title}, ${p.address}`)}`;
const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`;
const letterOf = (title: string) => (title.replace(/^(the|a)\s+/i, '').match(/[a-z0-9]/i)?.[0] ?? '#').toUpperCase();
const sortKey = (title: string) => title.replace(/^(the|a)\s+/i, '').toLowerCase();
/** Entries shown per section before "See all". */
const PAGE = 4;
const calgaryMonth = (d: Date) => Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton', month: 'numeric' }).format(d));

function Entry({ p, section }: { p: Business; section: string }) {
  const note = LOCAL_NOTES[p.id];
  const verified = isOwnerVerified(p);
  const area = p.neighbourhood?.trim();
  const line = note?.pick ?? p.summary;
  return (
    <li className={`wp-entry${p.partner ? ' is-partner' : ''}`}>
      <span className={`wp-mono wp-tone-${section}`} aria-hidden="true">{letterOf(p.title)}</span>
      <div className="wp-entry-body">
        <Link to={entityPath(p)} className="wp-name">
          <strong>{p.title}</strong>
          <span className="wp-leader" aria-hidden="true" />
          <span className="wp-area">{area || 'Calgary'}</span>
        </Link>
        {line ? <p className="wp-line">{line}</p> : null}
        <div className="wp-foot">
          {p.partner ? <span className="wp-badge wp-badge-partner">Featured partner</span> : null}
          {p.editorialSelection && !p.partner ? <span className="wp-badge wp-badge-pick">Our pick</span> : null}
          {verified ? <span className="wp-badge wp-badge-verified"><BadgeCheck size={12} aria-hidden="true" />Verified</span> : null}
          <span className="wp-acts">
            {p.phone ? <a href={telHref(p.phone)} aria-label={`Call ${p.title}`} title={p.phone}><Phone size={16} aria-hidden="true" /></a> : null}
            {p.website ? <a href={p.website} target="_blank" rel="noopener noreferrer" aria-label={`${p.title} website`}><Globe size={16} aria-hidden="true" /></a> : null}
            {p.address ? <a href={directions(p)} target="_blank" rel="noopener noreferrer" aria-label={`Directions to ${p.title}`}><Navigation size={16} aria-hidden="true" /></a> : null}
          </span>
        </div>
      </div>
    </li>
  );
}

/** Trades with no listing yet, printed as open lines: the gap is the ask. */
function OpenLines({ places, month }: { places: Business[]; month: number }) {
  const [all, setAll] = useState(false);
  const lines = LOCAL_SERVICES.map(s => ({ s, n: places.filter(p => offersService(p, s)).length }))
    .sort((a, b) => Number(inPeak(b.s, month)) - Number(inPeak(a.s, month)) || a.s.label.localeCompare(b.s.label));
  return (
    <div className="wp-open">
      <p className="wp-open-head"><b>Open lines.</b> Trades we haven’t filled yet. Know a good one? Your recommendation is free and fills the line.</p>
      <ul>
        {(all ? lines : lines.slice(0, 6)).map(({ s, n }) => (
          <li key={s.id}>
            <Link to={n ? `/local/services#svc-${s.id}` : `/local/recommend?service=${s.id}`} className={n ? 'is-filled' : undefined}>
              <span>{s.label}</span>
              {inPeak(s, month) ? <i className="wp-busy">Busy now</i> : null}
              <span className="wp-leader" aria-hidden="true" />
              <em>{n ? `${n} listed` : 'Recommend one'}</em>
            </Link>
          </li>
        ))}
      </ul>
      {lines.length > 6 ? <button type="button" className="wp-more" onClick={() => setAll(v => !v)} aria-expanded={all}>{all ? 'Show fewer' : `See all ${lines.length} trades`}</button> : null}
    </div>
  );
}

export function WhitePages({ places, everyPlace, category, now = new Date() }: { places: Business[]; everyPlace: Business[]; category?: string; now?: Date }) {
  const [q, setQ] = useState('');
  const [opened, setOpened] = useState<Record<string, boolean>>({});
  const month = calgaryMonth(now);
  const year = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton', year: 'numeric' }).format(now);
  const needle = q.trim().toLowerCase();

  const sorted = useMemo(() => [...places].sort((a, b) => Number(b.partner) - Number(a.partner) || sortKey(a.title).localeCompare(sortKey(b.title))), [places]);
  const hits = needle
    ? sorted.filter(p => [p.title, p.neighbourhood, p.summary, ...p.tags, ...p.categories, ...(p.services ?? [])].filter(Boolean).join(' ').toLowerCase().includes(needle))
    : sorted;
  const serviceHits = needle ? LOCAL_SERVICES.filter(s => [s.label, ...s.trades].join(' ').toLowerCase().includes(needle)) : [];

  // On a category page everything sits in that one section; otherwise each place is filed once.
  const sections = category
    ? WP_SECTIONS.filter(s => s.match.includes(category)).map(s => ({ ...s, rows: hits }))
    : WP_SECTIONS.map(s => ({ ...s, rows: hits.filter(p => sectionOf(p) === s.id) }));
  const shown = sections.filter(s => s.rows.length || (s.id === 'services' && !needle));

  return (
    <section className="wp" aria-labelledby="wp-title">
      <div className="cw-wrap">
        <div className="wp-book">
          <header className="wp-mast">
            <p className="wp-runner"><span>Calgary White Pages</span><span>{year} edition</span><span>Free to list · free to recommend</span></p>
            <h2 id="wp-title">The Calgary <mark>White Pages.</mark></h2>
            <p className="wp-lead">
              Remember looking someone up in the phone book? This is that, just better. Every name here is checked against the business’s own site,
              filed by what they do and where they are, and the best ones come recommended by Calgarians who’ve used them.
            </p>
            <ul className="wp-better" aria-label="What makes it better">
              <li><b>Checked</b>Against their own site, not copied from a list.</li>
              <li><b>Nobody pays to rank</b>Paid spots always say “Featured partner”.</li>
              <li><b>Neighbour-recommended</b>The gems come from people like you.</li>
            </ul>
          </header>

          <div className="wp-tools">
            <label className="wp-search">
              <Search size={18} aria-hidden="true" />
              <span className="sr-only">Search the White Pages</span>
              <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Find a name, trade or neighbourhood" enterKeyHint="search" />
              {q ? <button type="button" onClick={() => setQ('')} aria-label="Clear search"><X size={16} aria-hidden="true" /></button> : null}
            </label>
            {!category && !needle ? (
              <nav className="wp-tabs" aria-label="Jump to a section">
                {shown.map(s => <a key={s.id} href={`#wp-${s.id}`}><s.icon size={15} aria-hidden="true" />{s.label}<i>{s.rows.length || ''}</i></a>)}
              </nav>
            ) : null}
          </div>

          {needle && !hits.length && !serviceHits.length ? (
            <p className="wp-none">Nothing under “{q.trim()}” yet. <Link to={`/local/recommend?name=${encodeURIComponent(q.trim())}`}>Recommend one and we’ll look them up <ArrowUpRight size={14} aria-hidden="true" /></Link></p>
          ) : null}

          {serviceHits.length ? (
            <div className="wp-section" id="wp-trades">
              <h3 className="wp-section-head"><Wrench size={18} aria-hidden="true" />Trades<small>matching “{q.trim()}”</small></h3>
              <ul className="wp-entries">
                {serviceHits.map(s => {
                  const n = everyPlace.filter(p => offersService(p, s)).length;
                  return (
                    <li key={s.id} className="wp-entry wp-entry-trade">
                      <span className="wp-mono wp-tone-services" aria-hidden="true">{s.label[0]}</span>
                      <div className="wp-entry-body">
                        <Link to={`/local/services#svc-${s.id}`} className="wp-name"><strong>{s.label}</strong><span className="wp-leader" aria-hidden="true" /><span className="wp-area">{n ? `${n} listed` : 'Open line'}</span></Link>
                        <p className="wp-line">{s.tip}</p>
                      <div className="wp-foot"><span className="wp-acts"><Link to={`/local/recommend?service=${s.id}`} aria-label={`Recommend a ${s.trades[0]}`}><HeartHandshake size={16} aria-hidden="true" /></Link></span></div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          {shown.map(s => (
            <div key={s.id} className={`wp-section wp-section-${s.id}`} id={`wp-${s.id}`}>
              <h3 className="wp-section-head"><span className={`wp-section-ico wp-tone-${s.id}`}><s.icon size={18} aria-hidden="true" /></span>{s.label}<small>{s.blurb}</small></h3>
              {s.rows.length ? <ul className="wp-entries">{(opened[s.id] || needle || category ? s.rows : s.rows.slice(0, PAGE)).map(p => <Entry key={p.id} p={p} section={s.id} />)}</ul> : null}
              {!needle && !category && s.rows.length > PAGE ? (
                <button type="button" className="wp-more" aria-expanded={Boolean(opened[s.id])} onClick={() => setOpened(o => ({ ...o, [s.id]: !o[s.id] }))}>
                  {opened[s.id] ? 'Show fewer' : `See all ${s.rows.length} in ${s.label}`}
                </button>
              ) : null}
              {s.id === 'services' && !needle ? <OpenLines places={everyPlace} month={month} /> : null}
            </div>
          ))}

          <aside className="wp-recommend" aria-labelledby="wp-rec">
            <div>
              <p className="wp-runner"><span>Know a gem?</span></p>
              <h3 id="wp-rec">Recommend someone. <em>It’s free, and it’s theirs to keep.</em></h3>
              <p>The plumber who showed up on time, the tailor who saved your suit. Tell us who they are. We check them against their own site and, if they’re good, they go in the White Pages for free, with a note that a neighbour sent them.</p>
            </div>
            <Link className="lx-btn" to="/local/recommend">Recommend a business <ArrowUpRight size={18} aria-hidden="true" /></Link>
          </aside>
        </div>
      </div>
    </section>
  );
}
