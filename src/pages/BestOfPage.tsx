import { Link, useParams } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, BadgeCheck, ExternalLink, MapPin, Navigation } from 'lucide-react';
import { SiteLayout } from '../components/site/SiteLayout';
import { BRAND_MARK } from '../components/guides/GuideCover';
import { BEST_CATEGORIES, type BestCategory, type BestFact, type BestPlace } from '../content/bestOf';
import { bestCategory, bestPath, directionsUrl, formatPublished, isRanked, publishersOf, rankPlaces, sourceOf, sourcesFor } from '../lib/bestOf';
import NotFoundPage from './NotFoundPage';
import '../styles/best-of.css';

const CONTACT = 'aldo@calgarywatch.ca';
const mail = (subject: string) => `mailto:${CONTACT}?subject=${encodeURIComponent(subject)}`;

function Motif({ motif }: { motif: BestCategory['motif'] }) {
  switch (motif) {
    case 'bowl': return (
      <g>
        <path className="bo-m-soft" d="M70 40c-10 14 10 22 0 36M100 32c-10 16 10 26 0 42M130 40c-10 14 10 22 0 36" />
        <path className="bo-m-line" d="M150 30 112 92M164 36 122 94" />
        <path className="bo-m-fill" d="M34 96h132c0 34-28 58-66 58S34 130 34 96Z" />
        <path className="bo-m-cut" d="M44 108h112" />
      </g>
    );
    case 'slice': return (
      <g>
        <path className="bo-m-fill" d="M40 44c40-16 84-16 124 0L102 168Z" />
        <path className="bo-m-cut" d="M40 44c40-16 84-16 124 0" />
        {[[82, 66], [118, 70], [100, 98], [92, 128], [128, 104]].map(([x, y]) => <circle key={`${x}${y}`} className="bo-m-dot" cx={x} cy={y} r="9" />)}
      </g>
    );
    case 'window': return (
      <g>
        <rect className="bo-m-frame" x="44" y="30" width="112" height="132" rx="4" />
        <path className="bo-m-line" d="M100 30v132M44 96h112" />
        <path className="bo-m-soft" d="M56 50l26-12M58 64l40-20M112 112l30-14M116 126l26-12" />
        <path className="bo-m-fill" d="M128 150l40-40 10 10-40 40Z" />
        <path className="bo-m-line" d="M152 126l22 22" />
      </g>
    );
    case 'truck': return (
      <g>
        <path className="bo-m-fill" d="M26 70h96v62H26Z" />
        <path className="bo-m-fill" d="M122 90h30l20 22v20h-50Z" />
        <path className="bo-m-cut" d="M132 96h18l12 14h-30Z" />
        <circle className="bo-m-wheel" cx="56" cy="136" r="13" /><circle className="bo-m-wheel" cx="146" cy="136" r="13" />
        <path className="bo-m-soft" d="M40 58l14-18 12 14 16-22 14 26" />
      </g>
    );
  }
}

function Cover({ c, hero = false }: { c: BestCategory; hero?: boolean }) {
  return (
    <div className={`bo-cover${hero ? ' is-hero' : ''}`} style={{ ['--from' as string]: c.from, ['--to' as string]: c.to, ['--ink' as string]: c.ink }} aria-hidden="true">
      <svg viewBox="0 0 200 200" preserveAspectRatio="xMidYMid slice"><g transform="translate(40 10) scale(.8)"><Motif motif={c.motif} /></g></svg>
      <span className="bo-cover-mark"><img src={BRAND_MARK} alt="" width="40" height="40" loading="lazy" />Best of Calgary</span>
      <span className="bo-cover-word">{c.coverWord}</span>
    </div>
  );
}

function heading(c: BestCategory) {
  return c.kind === 'food' ? <>Best {c.noun} <mark>in Calgary.</mark></> : <>{c.label} <mark>in Calgary,</mark> compared.</>;
}

function basis(c: BestCategory): string {
  if (isRanked(c)) return 'Ranked by how many independent guides and awards name each place';
  if (c.kind === 'service') return 'No independent rankings exist yet, so this list is A–Z';
  return 'Each named by a 2026 guide; equal billing, so A–Z';
}

function FactLine({ fact }: { fact: BestFact }) {
  const src = fact.self ? undefined : sourceOf(fact.source);
  return (
    <li>
      {fact.text}{' '}
      <a className="bo-cite" href={src?.url ?? fact.source} target="_blank" rel="noopener noreferrer">
        {fact.self ? 'their site' : `${src?.publisher}, ${formatPublished(src?.published ?? '')}`}
      </a>
    </li>
  );
}

function PlaceRow({ c, place, rank }: { c: BestCategory; place: BestPlace; rank: number }) {
  const publishers = publishersOf(place);
  return (
    <li className="bo-row">
      <span className="bo-rank" aria-label={`Number ${rank}`}>{rank}</span>
      <div className="bo-row-body">
        <h3>
          {place.name}
          {place.verified ? <span className="bo-verified"><BadgeCheck size={16} aria-hidden="true" /> Verified</span> : null}
        </h3>
        {place.area || place.address ? <p className="bo-where"><MapPin size={14} aria-hidden="true" /> {[place.address, place.area && !place.address?.includes(place.area) ? place.area : undefined].filter(Boolean).join(' · ')}</p> : null}
        {publishers.length ? (
          <p className="bo-named">Named by {place.namedBy.map(id => sourceOf(id)).filter(Boolean).map(s => (
            <a key={s!.id} href={s!.url} target="_blank" rel="noopener noreferrer">{s!.publisher} {s!.published.slice(0, 4)}</a>
          ))}</p>
        ) : null}
        {place.facts.length ? <ul className="bo-facts">{place.facts.map(f => <FactLine key={f.text} fact={f} />)}</ul> : null}
        <div className="bo-actions">
          {place.website ? <a className="bo-btn bo-btn-hi" href={place.website} target="_blank" rel="noopener noreferrer">Website <ExternalLink size={15} aria-hidden="true" /></a> : null}
          <a className={`bo-btn${place.website ? '' : ' bo-btn-hi'}`} href={directionsUrl(place)} target="_blank" rel="noopener noreferrer">{c.kind === 'food' ? 'Directions' : 'Find on map'} <Navigation size={15} aria-hidden="true" /></a>
        </div>
      </div>
    </li>
  );
}

function OwnerBand({ c }: { c?: BestCategory }) {
  return (
    <section className="bo-band" aria-labelledby="bo-owner">
      <div>
        <h2 id="bo-owner">Run one of these? <mark>Get verified.</mark></h2>
        <p>Verified owners get the badge, sort first in their list, and can correct anything here. It’s free, and a place can’t pay to move up.</p>
      </div>
      <div className="bo-band-ctas">
        <a className="bo-btn bo-btn-hi" href={mail(`Verify my business${c ? ` on Best ${c.noun} in Calgary` : ''}`)}>Verify my business <ArrowUpRight size={16} aria-hidden="true" /></a>
        <a className="bo-btn" href={mail(`Suggest a place${c ? ` for ${c.noun}` : ''}`)}>Suggest a place, with a source</a>
        <Link className="bo-btn" to="/local">Browse Local <ArrowRight size={16} aria-hidden="true" /></Link>
      </div>
    </section>
  );
}

function CategoryView({ c }: { c: BestCategory }) {
  const places = rankPlaces(c.places);
  const sources = sourcesFor(c);
  const others = BEST_CATEGORIES.filter(o => o.slug !== c.slug);
  return (
    <>
      <section className="bo-hero bo-hero-cat" aria-labelledby="bo-title" style={{ ['--from' as string]: c.from, ['--to' as string]: c.to }}>
        <div className="bo-wrap bo-hero-grid">
          <Cover c={c} hero />
          <div>
            <p className="bo-kicker"><Link to="/best">Best of Calgary</Link> · {c.label}</p>
            <h1 id="bo-title">{heading(c)}</h1>
            <p className="bo-lead">{c.lead}</p>
            <p className="bo-meta"><b>{places.length} {c.kind === 'food' ? 'spots' : 'companies'}</b> · {basis(c)} · Updated {formatPublished(c.updated)}</p>
          </div>
        </div>
      </section>

      <nav className="bo-wrap bo-chips" aria-label="Other lists">
        <Link to="/best" className="bo-chip">All lists</Link>
        {BEST_CATEGORIES.map(o => <Link key={o.slug} to={bestPath(o)} className={`bo-chip${o.slug === c.slug ? ' is-on' : ''}`} aria-current={o.slug === c.slug ? 'page' : undefined}>{o.label}</Link>)}
      </nav>

      <div className="bo-wrap bo-layout">
        <section aria-labelledby="bo-list-title">
          <h2 id="bo-list-title" className="bo-sr">The list</h2>
          <ol className={`bo-list${isRanked(c) ? '' : ' is-az'}`}>{places.map((p, i) => <PlaceRow key={p.name} c={c} place={p} rank={i + 1} />)}</ol>
        </section>

        <aside className="bo-side">
          <section className="bo-card bo-how" aria-labelledby="bo-how-title">
            <h2 id="bo-how-title">How this list works</h2>
            {c.kind === 'food' ? (
              <p>We didn’t taste-test. A place is here because an independent food guide or award named it, and the order is how many different publishers did, then A–Z. Each fact links to where it was published.</p>
            ) : (
              <p>We haven’t hired these companies, and no independent guide ranks Calgary {c.noun} yet. So it’s A–Z, and every line is what the company says on its own website. When neighbours’ recommendations and verified owners come in, they’ll set the order.</p>
            )}
            <p>Nobody paid to be here or to move up. Paid placements, if they ever exist, will be labelled. <Link to="/partners">How we work with businesses</Link></p>
          </section>

          <section className="bo-card" aria-labelledby="bo-tips-title">
            <h2 id="bo-tips-title">{c.kind === 'food' ? 'Before you go' : 'Before you book'}</h2>
            <ul className="bo-tips">{c.tips.map(t => <li key={t}>{t}</li>)}</ul>
          </section>

          {sources.length ? (
            <section className="bo-card" aria-labelledby="bo-src-title">
              <h2 id="bo-src-title">Sources</h2>
              <ul className="bo-sources">
                {sources.map(s => <li key={s.id}><a href={s.url} target="_blank" rel="noopener noreferrer"><b>{s.publisher}</b> {s.title}</a> <small>{formatPublished(s.published)}</small></li>)}
              </ul>
            </section>
          ) : null}
        </aside>
      </div>

      <div className="bo-wrap">
        <OwnerBand c={c} />
        <section className="bo-more" aria-labelledby="bo-more-title">
          <h2 id="bo-more-title">More Best of Calgary</h2>
          <ul className="bo-shelf">{others.map(o => <ShelfCard key={o.slug} c={o} />)}</ul>
        </section>
      </div>
    </>
  );
}

function ShelfCard({ c }: { c: BestCategory }) {
  return (
    <li>
      <Link to={bestPath(c)} className="bo-shelf-card">
        <Cover c={c} />
        <strong>{c.kind === 'food' ? `Best ${c.noun}` : c.label}</strong>
        <small>{c.places.length} {c.kind === 'food' ? 'spots' : 'companies'} · {isRanked(c) ? 'ranked by citations' : 'A–Z'}</small>
      </Link>
    </li>
  );
}

function IndexView() {
  const food = BEST_CATEGORIES.filter(c => c.kind === 'food');
  const services = BEST_CATEGORIES.filter(c => c.kind === 'service');
  return (
    <>
      <section className="bo-hero" aria-labelledby="bo-title">
        <div className="bo-wrap bo-hero-index">
          <div>
            <p className="bo-kicker">Best of Calgary · new</p>
            <h1 id="bo-title">The best of Calgary. <mark>Cited, never bought.</mark></h1>
            <p className="bo-lead">Where to get pho and pizza, and who to call for windows and junk. Every place is here because someone independent named it or because it publishes what it does. Every fact links to its source.</p>
          </div>
          <div className="bo-hero-stack" aria-hidden="true">
            {BEST_CATEGORIES.map((c, i) => <div key={c.slug} className="bo-stack-item" style={{ ['--i' as string]: i }}><Cover c={c} /></div>)}
          </div>
        </div>
      </section>

      <div className="bo-wrap">
        <div className="bo-split">
        <section className="bo-section" aria-labelledby="bo-eat">
          <div className="bo-head"><h2 id="bo-eat">Eat</h2><p>Ranked by how many food guides and awards name each spot.</p></div>
          <ul className="bo-shelf">{food.map(c => <ShelfCard key={c.slug} c={c} />)}</ul>
        </section>
        <section className="bo-section" aria-labelledby="bo-home">
          <div className="bo-head"><h2 id="bo-home">Get it done</h2><p>Local companies side by side, A–Z, in their own words, with what to ask before you book.</p></div>
          <ul className="bo-shelf">{services.map(c => <ShelfCard key={c.slug} c={c} />)}</ul>
        </section>
        </div>

        <section className="bo-section" aria-labelledby="bo-rules">
          <div className="bo-head"><h2 id="bo-rules">Three rules</h2></div>
          <ol className="bo-rules">
            <li><b>1</b><strong>Only what others published.</strong><span>Food guides, awards, and the businesses’ own sites. Two lists from one outlet count once.</span></li>
            <li><b>2</b><strong>A source on every fact.</strong><span>Tap the grey link beside a fact to see where it came from.</span></li>
            <li><b>3</b><strong>No paying to rank.</strong><span>Verified owners get a badge and can fix their details. Nobody can buy a spot.</span></li>
          </ol>
        </section>

        <OwnerBand />
      </div>
    </>
  );
}

/** /best and /best/:slug: "Best ___ in Calgary" lists built only from cited facts. */
export default function BestOfPage() {
  const { slug } = useParams();
  const c = bestCategory(slug);
  if (slug && !c) return <NotFoundPage />;
  return (
    <SiteLayout>
      <div className="bo">{c ? <CategoryView c={c} /> : <IndexView />}</div>
    </SiteLayout>
  );
}
