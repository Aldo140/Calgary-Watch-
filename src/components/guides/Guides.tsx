import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Check, List, MapPin, Navigation, Share2 } from 'lucide-react';
import type { DiscoveryEntity, Guide, MarketOccurrence } from '../../types/discovery';
import { entityPath } from '../../lib/discovery';
import { upcomingOccurrences } from '../../lib/discoveryCalendar';
import { calgaryDateTimeFormat } from '../../lib/calgaryTz';
import { BRAND_MARK, GuideCover } from './GuideCover';
import { featuredGuide, mapSearchUrl, routeUrl } from '../../lib/guides';
import '../../styles/guides.css';

const day = calgaryDateTimeFormat('en-CA', { timeZone: 'America/Edmonton', weekday: 'short', month: 'short', day: 'numeric' });
const updated = calgaryDateTimeFormat('en-CA', { timeZone: 'America/Edmonton', month: 'long', day: 'numeric', year: 'numeric' });

const coverVars = (g: Guide) => g.cover ? { ['--from' as string]: g.cover.from, ['--to' as string]: g.cover.to } : undefined;

/** The playlist-style byline: who made it, then the numbers that matter. */
function Byline({ guide }: { guide: Guide }) {
  const f = guide.facts;
  const stops = guide.stops?.length;
  return (
    <p className="gd-byline">
      <img src={BRAND_MARK} alt="" width="24" height="24" />
      <b>CalgaryWatch</b>
      {stops ? <span>{stops} stops</span> : null}
      {f && <span>{f.time}</span>}
      {f && <span>{f.cost}</span>}
    </p>
  );
}

function ShareButton({ title }: { title: string }) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) { await navigator.share({ title, url }); return; }
      await navigator.clipboard.writeText(url);
      setCopied(true); window.setTimeout(() => setCopied(false), 1800);
    } catch { /* dismissed */ }
  };
  return (
    <button type="button" className="gd-icon-btn" onClick={share} aria-label={copied ? 'Link copied' : 'Send to a friend'} title="Send to a friend">
      {copied ? <Check size={22} aria-hidden="true" /> : <Share2 size={22} aria-hidden="true" />}
    </button>
  );
}

/** What a stop links to on CalgaryWatch: a market's next date, or the listing itself. */
function StopLink({ entity, occurrences }: { entity?: DiscoveryEntity; occurrences: readonly MarketOccurrence[] }) {
  if (!entity) return null;
  if (entity.kind === 'market') {
    const next = upcomingOccurrences(occurrences, entity.id).find(o => !o.cancelled);
    return <Link className="gd-stop-link" to={entityPath(entity)}>{next ? <>Next: <b>{day.format(new Date(next.start))}</b></> : 'See dates'}</Link>;
  }
  return <Link className="gd-stop-link" to={entityPath(entity)}>On CalgaryWatch</Link>;
}

function GuideCard({ guide, number }: { guide: Guide; number: number }) {
  return (
    <li>
      <Link className="gd-card" to={entityPath(guide)}>
        <span className="gd-card-art">
          <GuideCover guide={guide} number={number} />
          <span className="gd-card-play" aria-hidden="true"><ArrowUpRight size={22} strokeWidth={2.5} /></span>
        </span>
        <strong>{guide.title}</strong>
        <span className="gd-card-sum">{guide.facts ? `${guide.facts.time} · ${guide.facts.cost}` : guide.summary}</span>
      </Link>
    </li>
  );
}

/** "Pitch a guide", drawn as a browse tile with the CalgaryWatch mark tipped into the corner. */
function PitchTile() {
  return (
    <a className="gd-pitch" href="mailto:aldo@calgarywatch.ca?subject=A%20guide%20idea%20for%20CalgaryWatch">
      <span className="gd-pitch-copy">
        <strong>Know a day you’d send a friend on?</strong>
        <span>Tell us the route. If we walk it and love it, it becomes a guide with your name on it.</span>
        <em>Pitch a guide <ArrowUpRight size={16} aria-hidden="true" /></em>
      </span>
      <img src={BRAND_MARK} alt="" width="200" height="200" loading="lazy" />
    </a>
  );
}

/** /guides: CalgaryWatch's self-guided days out, as a shelf of covers. */
export function GuidesBoard({ guides }: { guides: readonly Guide[] }) {
  const lead = featuredGuide(guides);
  const shelf = guides.filter(g => g !== lead);
  const stops = guides.reduce((n, g) => n + (g.stops?.length ?? 0), 0);
  return (
    <div className="gd gd-index">
      <header className="gd-index-hero">
        <p className="gd-eyebrow"><img src={BRAND_MARK} alt="" width="22" height="22" />CalgaryWatch Guides<span className="gd-dot" aria-hidden="true">•</span></p>
        <h1 className="gd-headline">One good day<span>at a time.</span></h1>
        <p className="gd-lede">Self-guided days out, written by people who live here. {guides.length} guides, {stops} stops, no sign-up and no paid placements.</p>
      </header>

      {lead && (
        <Link className="gd-feature" to={entityPath(lead)} style={coverVars(lead)}>
          <GuideCover guide={lead} size="hero" number={guides.indexOf(lead) + 1} />
          <span className="gd-feature-copy">
            <span className="gd-tag">New guide</span>
            <strong className="gd-feature-title">{lead.title}</strong>
            <span className="gd-feature-sum">{lead.summary}</span>
            <Byline guide={lead} />
            <span className="gd-play-row"><span className="gd-play" aria-hidden="true"><ArrowUpRight size={26} strokeWidth={2.5} /></span>Open the guide</span>
          </span>
        </Link>
      )}

      {shelf.length > 0 && (
        <section className="gd-shelf" aria-labelledby="gd-shelf-title">
          <h2 id="gd-shelf-title" className="gd-h2">More days out</h2>
          <ol className="gd-cards">{shelf.map(g => <GuideCard key={g.id} guide={g} number={guides.indexOf(g) + 1} />)}</ol>
        </section>
      )}

      <section className="gd-shelf"><PitchTile /></section>
    </div>
  );
}

/** /guides/:slug — the route as a tracklist, with a map link for every stop. */
export function GuideDetail({ guide, all, occurrences }: { guide: Guide; all: readonly DiscoveryEntity[]; occurrences: readonly MarketOccurrence[] }) {
  const byId = new Map(all.map(e => [e.id, e]));
  const stops = guide.stops ?? [];
  const walk = guide.route ? routeUrl(stops) : undefined;
  const allGuides = all.filter((e): e is Guide => e.kind === 'guide');
  const more = guide.relatedGuideIds.map(id => byId.get(id)).filter((e): e is Guide => e?.kind === 'guide');
  const linked = guide.entries.map(en => byId.get(en.entityId)).filter((e): e is DiscoveryEntity => !!e && !stops.some(s => s.entityId === e.id));
  const changed = Date.parse(guide.updatedAt);
  const before = [
    ...(guide.facts ? [`${guide.facts.distance}. ${guide.facts.season}`] : []),
    ...(guide.tips ?? []),
  ];

  return (
    <article className="gd gd-detail" style={coverVars(guide)}>
      <header className="gd-hero">
        <nav className="gd-crumbs" aria-label="Breadcrumb"><Link to="/guides">← All guides</Link></nav>
        <div className="gd-hero-row">
          <GuideCover guide={guide} size="hero" number={allGuides.indexOf(guide) + 1} />
          <div className="gd-hero-copy">
            <p className="gd-tag">Guide</p>
            <h1 className="gd-title">{guide.title}</h1>
            <p className="gd-hero-sum">{guide.summary}</p>
            <Byline guide={guide} />
          </div>
        </div>
      </header>

      <div className="gd-bar">
        {walk
          ? <a className="gd-play-row" href={walk} target="_blank" rel="noopener noreferrer"><span className="gd-play"><Navigation size={24} fill="currentColor" aria-hidden="true" /></span>Walk the route</a>
          : stops.length > 0 && <a className="gd-play-row" href="#gd-stops"><span className="gd-play"><List size={26} aria-hidden="true" /></span>See the list</a>}
        <ShareButton title={guide.title} />
      </div>

      <div className="gd-body">
        <p className="gd-intro">{guide.introduction}</p>

        {stops.length > 0 ? (
          <section aria-labelledby="gd-stops-title">
            <h2 id="gd-stops-title" className="gd-sr">{guide.route ? 'The route' : 'The list'}</h2>
            <div className="gd-track-head" id="gd-stops" aria-hidden="true">
              <span>#</span><span>{guide.route ? 'Stop, in walking order' : 'Market'}</span><span>Map</span>
            </div>
            <ol className="gd-stops">
              {stops.map((s, i) => (
                <li key={s.name} className={s.detour ? 'is-detour' : undefined}>
                  <span className="gd-stop-num" aria-hidden="true">{i + 1}</span>
                  <div className="gd-stop-main">
                    <h3>{s.name}</h3>
                    <p className="gd-stop-area">{s.detour ? <em>Detour</em> : null}{s.area}</p>
                    <p className="gd-stop-note">{s.note}</p>
                    {s.tip && <p className="gd-stop-tip"><b>Tip</b> {s.tip}</p>}
                    <StopLink entity={s.entityId ? byId.get(s.entityId) : undefined} occurrences={occurrences} />
                  </div>
                  <a className="gd-icon-btn is-small" href={mapSearchUrl(s.mapQuery)} target="_blank" rel="noopener noreferrer" aria-label={`${s.name} on the map`} title="Open in Maps">
                    <MapPin size={18} aria-hidden="true" />
                  </a>
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        {before.length > 0 && (
          <aside className="gd-about" aria-labelledby="gd-about-title">
            <img src={BRAND_MARK} alt="" width="72" height="72" loading="lazy" />
            <div>
              <h2 id="gd-about-title" className="gd-h2">Before you go</h2>
              <ul>{before.map(t => <li key={t}>{t}</li>)}</ul>
            </div>
          </aside>
        )}

        {linked.length > 0 && (
          <section aria-labelledby="gd-linked-title">
            <h2 id="gd-linked-title" className="gd-h2">Nearby on CalgaryWatch</h2>
            <ul className="gd-linked">{linked.map(e => <li key={e.id}><Link to={entityPath(e)}><b>{e.title}</b><span>{guide.entries.find(en => en.entityId === e.id)?.note || e.summary}</span><ArrowUpRight size={16} aria-hidden="true" /></Link></li>)}</ul>
          </section>
        )}

        {more.length > 0 && (
          <section aria-labelledby="gd-more-title">
            <div className="gd-shelf-head">
              <h2 id="gd-more-title" className="gd-h2">More from CalgaryWatch</h2>
              <Link to="/guides">Show all</Link>
            </div>
            <ol className="gd-cards is-row">{more.map(g => <GuideCard key={g.id} guide={g} number={allGuides.indexOf(g) + 1} />)}</ol>
          </section>
        )}

        <footer className="gd-small">
          {Number.isFinite(changed) && <p>Updated {updated.format(changed)}</p>}
          <p>{guide.methodology}</p>
          {guide.sponsorshipDisclosure && <p>Sponsored: {guide.sponsorshipDisclosure}</p>}
          {guide.sources.length > 0 && <p>Sources: {guide.sources.map((s, i) => <span key={s.url}>{i > 0 && ' · '}<a href={s.url} target="_blank" rel="noopener noreferrer">{s.name}</a></span>)}</p>}
          <p><a href={`mailto:aldo@calgarywatch.ca?subject=${encodeURIComponent(`Correction: ${guide.title}`)}`}>Something changed? Tell us</a></p>
        </footer>
      </div>
    </article>
  );
}
