import { Link } from 'react-router-dom';
import { ArrowUpRight, Check, MapPin } from 'lucide-react';
import type { Business, DiscoveryEntity, Market, MarketOccurrence, Neighbourhood } from '../../types/discovery';
import { entityPath, LOCAL_CATEGORIES } from '../../lib/discovery';
import { LOCAL_NOTES, type LocalNote } from '../../data/localNotes';
import { ShopArt } from './ListingArt';

const when = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton', weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

const QUADRANT_BOX: Record<string, [number, number]> = { NW: [0, 0], NE: [1, 0], SW: [0, 1], SE: [1, 1] };

function quadrantOf(b: Business, hoods: Neighbourhood[]) {
  const n = (b.neighbourhood ?? '').toLowerCase();
  return hoods.find(h => { const t = h.title.toLowerCase(); return n && (t === n || t.startsWith(n) || n.startsWith(t)); })?.quadrant;
}

/** Real next date of a market held at this place, if the notes name one. */
function marketHere(note: LocalNote | undefined, markets: Market[], occurrences: readonly MarketOccurrence[]) {
  if (!note?.marketMatch) return undefined;
  const market = markets.find(m => `${m.title} ${m.venue ?? ''}`.toLowerCase().includes(note.marketMatch!));
  if (!market) return undefined;
  const next = occurrences.filter(o => o.marketId === market.id && !o.cancelled && Date.parse(o.end) > Date.now()).sort((a, b) => Date.parse(a.start) - Date.parse(b.start))[0];
  return next ? { market, start: next.start } : undefined;
}

function isoWeek(d: Date) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  return Math.ceil(((t.getTime() - Date.UTC(t.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7);
}

function Stamp({ partner }: { partner?: boolean }) {
  return partner
    ? <span className="cw-loc-stamp cw-loc-stamp-partner">Featured partner</span>
    : <span className="cw-loc-stamp" aria-label="CalgaryWatch pick"><small>CalgaryWatch</small>Pick</span>;
}

/**
 * Local: CalgaryWatch's own list of independent places. Picks are editorial and never
 * sold; a paid placement is always labelled "Featured partner" and never stamped a pick.
 */
export function LocalBoard({ items, all, occurrences, category }: { items: DiscoveryEntity[]; all: DiscoveryEntity[]; occurrences: readonly MarketOccurrence[]; category?: string }) {
  const hoods = all.filter((e): e is Neighbourhood => e.kind === 'neighbourhood');
  const markets = all.filter((e): e is Market => e.kind === 'market');
  const places = items.filter((e): e is Business => e.kind === 'business')
    .sort((a, b) => Number(b.partner) - Number(a.partner) || Number(b.editorialSelection) - Number(a.editorialSelection) || a.title.localeCompare(b.title));
  const picks = places.filter(p => p.editorialSelection && !p.partner);
  const feature = !category && picks.length ? picks[isoWeek(new Date()) % picks.length] : undefined;
  const featureNote = feature ? LOCAL_NOTES[feature.id] : undefined;
  const featureMarket = marketHere(featureNote, markets, occurrences);
  const book = places.filter(p => p !== feature);
  const quads = new Set(places.map(p => quadrantOf(p, hoods)).filter(Boolean));
  const areas = new Set(places.map(p => p.neighbourhood).filter(Boolean));

  return (
    <div className="cw-loc">
      <header className="cw-loc-hero">
        <p className="cw-loc-kicker">CalgaryWatch Local</p>
        <h1>The places Calgarians <span>keep to themselves.</span></h1>
        <p className="cw-loc-lead">Independent spots we think are worth crossing the city for, with how to do each one like a local. Picked by us, never sold.</p>
        <p className="cw-loc-stats">
          <b>{places.length}</b> {places.length === 1 ? 'place' : 'places'} · <b>{areas.size}</b> {areas.size === 1 ? 'neighbourhood' : 'neighbourhoods'}{quads.size ? <> · <b>{quads.size}</b> of 4 quadrants</> : null}
        </p>
        <nav className="cw-loc-cats" aria-label="Filter local places">
          <Link to="/local" aria-current={!category ? 'page' : undefined}>Everything</Link>
          {LOCAL_CATEGORIES.map(c => <Link key={c} to={`/local/${c}`} aria-current={category === c ? 'page' : undefined}>{c[0].toUpperCase() + c.slice(1)}</Link>)}
        </nav>
      </header>

      {feature ? (
        <section className="cw-loc-feature" aria-labelledby="loc-feature">
          <div className="cw-loc-feature-art">
            <ShopArt id={feature.id} title={feature.title} tags={feature.tags} categories={feature.categories} />
            <Stamp />
            <span className="cw-loc-tape" aria-hidden="true" />
          </div>
          <div className="cw-loc-feature-copy">
            <p className="cw-loc-eyebrow">Pick of the week</p>
            {featureNote ? <p className="cw-loc-pickline">{featureNote.pick}</p> : null}
            <h2 id="loc-feature">{feature.title}</h2>
            <p className="cw-loc-note">{featureNote?.note ?? feature.summary}</p>
            {featureNote?.dontMiss.length ? (
              <div className="cw-loc-dontmiss">
                <p>Don’t miss</p>
                <ul>{featureNote.dontMiss.map(d => <li key={d}><Check size={16} aria-hidden="true" />{d}</li>)}</ul>
              </div>
            ) : null}
            <p className="cw-loc-meta"><MapPin size={16} aria-hidden="true" />{feature.neighbourhood ? `${feature.neighbourhood} · ` : ''}{feature.address}{featureNote?.since ? ` · ${featureNote.since}` : ''}</p>
            {featureMarket ? (
              <Link className="cw-loc-crosslink" to={entityPath(featureMarket.market)}>
                <span>Also here</span>{featureMarket.market.title}, next {when.format(new Date(featureMarket.start))} <ArrowUpRight size={16} />
              </Link>
            ) : null}
            <Link className="cw-loc-btn" to={entityPath(feature)}>See the place <ArrowUpRight size={18} /></Link>
          </div>
        </section>
      ) : null}

      {book.length ? (
        <section className="cw-loc-book" aria-labelledby="loc-book">
          <div className="cw-loc-section-head">
            <h2 id="loc-book">{category ? `${category[0].toUpperCase() + category.slice(1)}, the locals’ way` : 'The little black book'}</h2>
            <p>Every place is checked against its own official site before it goes in.</p>
          </div>
          <ul className="cw-loc-grid">
            {book.map((p, i) => {
              const note = LOCAL_NOTES[p.id];
              const quad = quadrantOf(p, hoods);
              return (
                <li key={p.id} className="cw-loc-card" style={{ ['--tilt' as string]: `${i % 2 ? 0.8 : -0.8}deg` }}>
                  <Link to={entityPath(p)}>
                    <span className="cw-loc-card-art">
                      <ShopArt id={p.id} title={p.title} tags={p.tags} categories={p.categories} />
                      {p.partner || p.editorialSelection ? <Stamp partner={p.partner} /> : null}
                    </span>
                    <span className="cw-loc-card-body">
                      {note ? <small className="cw-loc-pickline">{note.pick}</small> : null}
                      <strong>{p.title}</strong>
                      <span className="cw-loc-note">{note?.note ?? p.summary}</span>
                      {note?.dontMiss.length ? <span className="cw-loc-chips">{note.dontMiss.slice(0, 3).map(d => <i key={d}>{d}</i>)}</span> : null}
                      <span className="cw-loc-where"><MapPin size={14} aria-hidden="true" />{p.neighbourhood}{quad ? ` · ${quad}` : ''}{note?.since ? ` · ${note.since}` : ''}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : !feature ? <p className="cw-loc-empty">Nothing in this category yet. <Link to="/submit">Know a place we should add?</Link></p> : null}

      {!category && places.length > 1 ? (
        <section className="cw-loc-map" aria-labelledby="loc-map">
          <div className="cw-loc-section-head">
            <h2 id="loc-map">One in every corner of the city</h2>
            <p>Centre Street splits east from west; the Bow and Centre Avenue split north from south.</p>
          </div>
          <div className="cw-loc-quads">
            {(['NW', 'NE', 'SW', 'SE'] as const).map(q => {
              const here = places.filter(p => quadrantOf(p, hoods) === q);
              return (
                <div key={q} className={`cw-loc-quad cw-loc-quad-${q.toLowerCase()}${here.length ? ' has' : ''}`} style={{ gridColumn: QUADRANT_BOX[q][0] + 1, gridRow: QUADRANT_BOX[q][1] + 1 }}>
                  <b>{q}</b>
                  {here.map(p => (
                    <Link key={p.id} to={entityPath(p)} className="cw-loc-pin">
                      <MapPin size={18} aria-hidden="true" />
                      <span>{p.title.split(/\s+[—–-]\s+/)[0]}<small>{p.neighbourhood}</small></span>
                    </Link>
                  ))}
                </div>
              );
            })}
            <span className="cw-loc-bow" aria-hidden="true" />
          </div>
        </section>
      ) : null}

      <section className="cw-loc-pitch" aria-labelledby="loc-pitch">
        <div>
          <p className="cw-loc-eyebrow">For Calgary businesses</p>
          <h2 id="loc-pitch">Run a place Calgarians should know about?</h2>
          <p>Every place here gets an illustrated storefront, a pin on the city map, insider notes, and links to its own events and markets.</p>
        </div>
        <div className="cw-loc-paths">
          <div>
            <h3>Get picked</h3>
            <p className="cw-loc-price">Free</p>
            <p>Tell us about it. We check your details against your official site and write it up. Picks can’t be bought.</p>
            <Link className="cw-loc-btn cw-loc-btn-light" to="/submit">Suggest a place <ArrowUpRight size={18} /></Link>
          </div>
          <div>
            <h3>Featured partner</h3>
            <p className="cw-loc-price">Paid</p>
            <p>A top spot on this page with the same storefront treatment, always labelled “Featured partner” and kept separate from our picks.</p>
            <a className="cw-loc-btn" href="mailto:aldo@calgarywatch.ca?subject=Featured%20partner%20on%20CalgaryWatch%20Local">Talk to us <ArrowUpRight size={18} /></a>
          </div>
        </div>
      </section>
    </div>
  );
}
