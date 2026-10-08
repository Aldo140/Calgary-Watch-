import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Check, Clock, Footprints, MapPin, Navigation, Share2, Sun, Wallet } from 'lucide-react';
import type { DiscoveryEntity, Guide, MarketOccurrence } from '../../types/discovery';
import { entityPath } from '../../lib/discovery';
import { upcomingOccurrences } from '../../lib/discoveryCalendar';
import { calgaryDateTimeFormat } from '../../lib/calgaryTz';
import { GuideCover } from './GuideCover';
import { featuredGuide, mapSearchUrl, routeUrl } from '../../lib/guides';
import '../../styles/guides.css';

const day = calgaryDateTimeFormat('en-CA', { timeZone: 'America/Edmonton', weekday: 'short', month: 'short', day: 'numeric' });
const updated = calgaryDateTimeFormat('en-CA', { timeZone: 'America/Edmonton', month: 'long', day: 'numeric', year: 'numeric' });

function Facts({ guide, compact }: { guide: Guide; compact?: boolean }) {
  const f = guide.facts;
  if (!f) return null;
  if (compact) return <p className="gd-mini-facts">{f.time} · {f.cost}</p>;
  const rows: [typeof Clock, string, string][] = [[Clock, 'Time', f.time], [Footprints, 'Distance', f.distance], [Wallet, 'Cost', f.cost], [Sun, 'When', f.season]];
  return (
    <dl className="gd-facts">
      {rows.map(([Icon, label, value]) => (
        <div key={label}><dt><Icon size={14} aria-hidden="true" />{label}</dt><dd>{value}</dd></div>
      ))}
    </dl>
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
    <button type="button" className="gd-ghost" onClick={share}>
      {copied ? <Check size={18} aria-hidden="true" /> : <Share2 size={18} aria-hidden="true" />}{copied ? 'Link copied' : 'Send to a friend'}
    </button>
  );
}

/** What a stop links to on CalgaryWatch: a market's next date, or the listing itself. */
function StopLink({ entity, occurrences }: { entity?: DiscoveryEntity; occurrences: readonly MarketOccurrence[] }) {
  if (!entity) return null;
  if (entity.kind === 'market') {
    const next = upcomingOccurrences(occurrences, entity.id).find(o => !o.cancelled);
    return <Link className="gd-stop-link" to={entityPath(entity)}>{next ? <>Next: <b>{day.format(new Date(next.start))}</b></> : 'See dates'} <ArrowUpRight size={14} aria-hidden="true" /></Link>;
  }
  return <Link className="gd-stop-link" to={entityPath(entity)}>On CalgaryWatch <ArrowUpRight size={14} aria-hidden="true" /></Link>;
}

function GuideCard({ guide, number }: { guide: Guide; number: number }) {
  return (
    <li>
      <Link className="gd-card" to={entityPath(guide)}>
        <span className="gd-card-art">
          <GuideCover guide={guide} number={number} />
          <span className="gd-card-play" aria-hidden="true"><ArrowUpRight size={20} /></span>
        </span>
        <strong>{guide.title}</strong>
        <span className="gd-card-sum">{guide.summary}</span>
        <Facts guide={guide} compact />
      </Link>
    </li>
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
        <p className="gd-eyebrow"><span className="gd-dot" aria-hidden="true" />CalgaryWatch Guides</p>
        <h1 className="gd-headline">One good day <span>at a time.</span></h1>
        <p className="gd-lede">Self-guided days out, written by people who live here. {guides.length} guides, {stops} stops, no sign-up and no paid placements.</p>
      </header>

      {lead && (
        <section className="gd-feature" aria-labelledby="gd-feature-title" style={lead.cover ? { ['--from' as string]: lead.cover.from, ['--to' as string]: lead.cover.to } : undefined}>
          <GuideCover guide={lead} size="hero" number={guides.indexOf(lead) + 1} />
          <div className="gd-feature-copy">
            <p className="gd-eyebrow">New guide</p>
            <h2 id="gd-feature-title">{lead.title}</h2>
            <p className="gd-feature-sum">{lead.summary}</p>
            <Facts guide={lead} />
            <Link className="gd-play" to={entityPath(lead)}>Open the guide <ArrowUpRight size={18} aria-hidden="true" /></Link>
          </div>
        </section>
      )}

      {shelf.length > 0 && (
        <section className="gd-shelf" aria-labelledby="gd-shelf-title">
          <h2 id="gd-shelf-title" className="gd-h2">More days out</h2>
          <ol className="gd-cards">{shelf.map(g => <GuideCard key={g.id} guide={g} number={guides.indexOf(g) + 1} />)}</ol>
        </section>
      )}

      <aside className="gd-pitch">
        <h2>Know a day you would send a friend on?</h2>
        <p>Tell us the route. If we walk it and love it, it becomes a guide with your name on it.</p>
        <a className="gd-ghost" href="mailto:aldo@calgarywatch.ca?subject=A%20guide%20idea%20for%20CalgaryWatch">Pitch a guide <ArrowUpRight size={18} aria-hidden="true" /></a>
      </aside>
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
  const style = guide.cover ? { ['--from' as string]: guide.cover.from, ['--to' as string]: guide.cover.to } : undefined;
  const changed = Date.parse(guide.updatedAt);

  return (
    <article className="gd gd-detail" style={style}>
      <header className="gd-hero">
        <nav className="gd-crumbs" aria-label="Breadcrumb"><Link to="/">Home</Link><span aria-hidden="true">/</span><Link to="/guides">Guides</Link></nav>
        <div className="gd-hero-row">
          <GuideCover guide={guide} size="hero" number={allGuides.indexOf(guide) + 1} />
          <div className="gd-hero-copy">
            <p className="gd-eyebrow">Guide{stops.length ? ` · ${stops.length} stops` : ''}</p>
            <h1 className="gd-title">{guide.title}</h1>
            <p className="gd-hero-sum">{guide.summary}</p>
            <p className="gd-byline"><img src="/icon.svg" alt="" width="20" height="20" />CalgaryWatch{Number.isFinite(changed) ? ` · Updated ${updated.format(changed)}` : ''}</p>
          </div>
        </div>
        <div className="gd-actions">
          {walk && <a className="gd-play" href={walk} target="_blank" rel="noopener noreferrer"><Navigation size={18} aria-hidden="true" />Walk it in Maps</a>}
          {!walk && stops.length > 0 && <a className="gd-play" href="#gd-stops"><MapPin size={18} aria-hidden="true" />See the stops</a>}
          <ShareButton title={guide.title} />
        </div>
        <Facts guide={guide} />
      </header>

      <div className="gd-body">
        <p className="gd-intro">{guide.introduction}</p>

        {stops.length > 0 ? (
          <section aria-labelledby="gd-stops-title">
            <div className="gd-stops-head" id="gd-stops">
              <h2 id="gd-stops-title" className="gd-h2">{guide.route ? 'The route' : 'The list'}</h2>
              <span>{guide.route ? 'In walking order' : 'Pick one, or make a weekend of it'}</span>
            </div>
            <ol className="gd-stops">
              {stops.map((s, i) => (
                <li key={s.name} className={s.detour ? 'is-detour' : undefined}>
                  <span className="gd-stop-num" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
                  <div className="gd-stop-main">
                    <h3>{s.name}</h3>
                    <p className="gd-stop-area"><MapPin size={13} aria-hidden="true" />{s.area}{s.detour ? <em>Detour</em> : null}</p>
                    <p className="gd-stop-note">{s.note}</p>
                    {s.tip && <p className="gd-stop-tip"><b>Tip</b>{s.tip}</p>}
                    <div className="gd-stop-links">
                      <a href={mapSearchUrl(s.mapQuery)} target="_blank" rel="noopener noreferrer">Map <ArrowUpRight size={14} aria-hidden="true" /></a>
                      <StopLink entity={s.entityId ? byId.get(s.entityId) : undefined} occurrences={occurrences} />
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        {guide.tips?.length ? (
          <aside className="gd-tips" aria-labelledby="gd-tips-title">
            <h2 id="gd-tips-title" className="gd-h2">Before you go</h2>
            <ul>{guide.tips.map(t => <li key={t}>{t}</li>)}</ul>
          </aside>
        ) : null}

        {linked.length > 0 && (
          <section aria-labelledby="gd-linked-title">
            <h2 id="gd-linked-title" className="gd-h2">Nearby on CalgaryWatch</h2>
            <ul className="gd-linked">{linked.map(e => <li key={e.id}><Link to={entityPath(e)}><b>{e.title}</b><span>{guide.entries.find(en => en.entityId === e.id)?.note || e.summary}</span><ArrowUpRight size={16} aria-hidden="true" /></Link></li>)}</ul>
          </section>
        )}

        <section className="gd-how" aria-labelledby="gd-how-title">
          <h2 id="gd-how-title" className="gd-h2">How we picked</h2>
          <p>{guide.methodology}</p>
          {guide.sponsorshipDisclosure && <p>Sponsored: {guide.sponsorshipDisclosure}</p>}
          {guide.sources.length > 0 && <p className="gd-sources">Sources: {guide.sources.map((s, i) => <span key={s.url}>{i > 0 && ' · '}<a href={s.url} target="_blank" rel="noopener noreferrer">{s.name}</a></span>)}</p>}
          <p><a href={`mailto:aldo@calgarywatch.ca?subject=${encodeURIComponent(`Correction: ${guide.title}`)}`}>Something changed? Tell us</a></p>
        </section>

        {more.length > 0 && (
          <section aria-labelledby="gd-more-title">
            <div className="gd-stops-head">
              <h2 id="gd-more-title" className="gd-h2">More guides</h2>
              <Link to="/guides">All guides <ArrowUpRight size={15} aria-hidden="true" /></Link>
            </div>
            <ol className="gd-cards is-row">{more.map(g => <GuideCard key={g.id} guide={g} number={allGuides.indexOf(g) + 1} />)}</ol>
          </section>
        )}
      </div>
    </article>
  );
}
