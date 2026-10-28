import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowDown, ArrowUpRight, CalendarDays, Clock, ExternalLink, MapPin, Ticket } from 'lucide-react';
import { SiteLayout } from '../components/site/SiteLayout';
import { FilmShowcase } from '../components/spotlight/FilmShowcase';
import { discoveryRepository } from '../data/discovery';
import { entityPath } from '../lib/discovery';
import { calgaryDateTimeFormat } from '../lib/calgaryTz';
import { nightLabel, nightsLine, spotlightBySlug, trackSpotlightLink, trackSpotlightRead, upcomingNights } from '../lib/spotlights';
import { SPOTLIGHT_CONTACT, type ShowcaseFilm, type Spotlight, type SpotlightSource } from '../content/spotlights';
import NotFoundPage from './NotFoundPage';
import '../styles/spotlight.css';

const longDate = calgaryDateTimeFormat('en-CA', { timeZone: 'America/Edmonton', month: 'long', day: 'numeric', year: 'numeric' });
const dateOf = (iso: string) => longDate.format(new Date(`${iso}T12:00:00-06:00`));

/**
 * Development only: `?demo=films` fills the showcase with one clearly labelled
 * sample so the filled card can be reviewed. Never in a build.
 */
function demoFilms(films: readonly ShowcaseFilm[]): readonly ShowcaseFilm[] {
  if (!import.meta.env.DEV || typeof window === 'undefined' || new URLSearchParams(window.location.search).get('demo') !== 'films') return films;
  return [{
    title: 'Sample Film (layout preview)', genre: 'Horror short', runtimeMinutes: 12, year: 2026, origin: 'Calgary',
    team: [{ name: 'Director Name', role: 'Director' }, { name: 'Writer Name', role: 'Writer' }, { name: 'Producer Name', role: 'Producer' }],
    synopsis: 'Placeholder synopsis for reviewing the card layout in development. Not a real film.',
    links: [{ label: 'Trailer', url: 'https://example.com/', kind: 'trailer' }, { label: 'Instagram', url: 'https://example.com/', kind: 'instagram' }],
    source: 'Development sample only',
  }, { title: 'Second Sample', team: [{ name: 'Another Director', role: 'Director' }], source: 'Development sample only' }];
}

/** A cited fact: the claim, then a superscript link to where it comes from. */
function Cite({ s, id }: { s: Spotlight; id: string }) {
  const n = s.sources.findIndex(x => x.id === id);
  const src = s.sources[n];
  if (!src) return null;
  return <sup className="hx-cite"><a href={`#src-${src.id}`} aria-label={`Source ${n + 1}: ${src.publisher}`}>{n + 1}</a></sup>;
}

/** The clapperboard that opens every scene. Its stick snaps shut when the scene rolls into view. */
function Slate({ scene, take = 1 }: { scene: string; take?: number }) {
  return (
    <div className="hx-slate" aria-hidden="true">
      <div className="hx-slate-stick"><span /></div>
      <div className="hx-slate-board">
        <p className="hx-slate-row"><small>Prod.</small><b>HEX After Dark</b></p>
        <div className="hx-slate-grid">
          <p><small>Scene</small><b>{scene}</b></p>
          <p><small>Take</small><b>{take}</b></p>
          <p><small>Roll</small><b>2026</b></p>
        </div>
        <p className="hx-slate-row hx-slate-slug"><small>Date</small><b>Oct 2026</b></p>
      </div>
    </div>
  );
}

type Look = 'slate' | 'vhs' | 'marquee' | 'box' | 'teaser' | 'polaroid';

/**
 * One chapter. Each has its own look so the page doesn't repeat itself: only
 * the opening chapter gets the clapperboard, the history plays off a VHS tape,
 * this year is on a lightbox marquee, and so on. `kicker` sits above the heading.
 */
function Scene({ n, id, look, kicker, label, title, children, take }: { n: number; id: string; look: Look; kicker: ReactNode; label: string; title: ReactNode; children: ReactNode; take?: number }) {
  return (
    <section id={id} className={`hx-reel is-${look}`} aria-labelledby={`${id}-h`} data-roll>
      {look === 'slate' ? <><Slate scene={String(n).padStart(2, '0')} take={take} /><span className="hx-cutflash" aria-hidden="true" /></> : null}
      <div className="hx-shot">
        <p className="hx-reel-no"><span>Chapter {n}</span> {label}</p>
        <p className={`hx-kick is-${look}`} aria-hidden="true">{kicker}</p>
        <h2 id={`${id}-h`}>{title}</h2>
        {children}
      </div>
    </section>
  );
}

/** Where the festival has played, as frames on a strip of film. */
function EditionStrip({ items }: { items: { year: string; where: string; what: string }[] }) {
  return (
    <ol className="hx-strip" aria-label="Where HEX After Dark has played">
      {items.map(i => <li key={i.year}><b>{i.year}</b><span>{i.where}</span><small>{i.what}</small></li>)}
    </ol>
  );
}

/** The cinema letterboard: plastic letters on a lit board, bulbs chasing round the edge. */
function Letterboard({ rows, open }: { rows: [string, string][]; open: [string, string] }) {
  return (
    <div className="hx-board">
      <span className="hx-board-bulbs" aria-hidden="true">{Array.from({ length: 18 }, (_, i) => <i key={i} style={{ ['--i' as string]: i }} />)}</span>
      <dl className="hx-board-in">
        {rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
        <div className="is-open"><dt>{open[0]}</dt><dd>{open[1]}</dd></div>
      </dl>
    </div>
  );
}

/** Empty polaroids for Friday's photos. They stay blank until we have real ones. */
function Polaroids() {
  return (
    <div className="hx-polaroids" aria-hidden="true">
      {['The bar', 'The screen', 'The crowd'].map((t, i) => <figure key={t} style={{ ['--r' as string]: `${[-5, 2, 6][i]}deg` }}><span /><figcaption>{t} · Oct 30</figcaption></figure>)}
    </div>
  );
}

const motionOk = () => typeof window !== 'undefined' && !!window.matchMedia && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * The film leader: 3, 2, 1, then a hard cut to the title card. Once per tab,
 * never with reduced motion, never in the prerendered HTML, and skippable.
 */
function Leader() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    let seen = false;
    try { seen = sessionStorage.getItem('hx-leader') === '1'; sessionStorage.setItem('hx-leader', '1'); } catch { /* private mode: play it */ }
    if (seen || !motionOk()) return;
    setShow(true);
    const t = window.setTimeout(() => setShow(false), 2700);
    return () => window.clearTimeout(t);
  }, []);
  if (!show) return null;
  return (
    <div className="hx-leader" role="presentation">
      <svg className="hx-leader-dial" viewBox="0 0 200 200" aria-hidden="true">
        <circle className="hx-leader-ring" cx="100" cy="100" r="86" />
        <circle className="hx-leader-ring is-in" cx="100" cy="100" r="70" />
        <circle className="hx-leader-sweep" cx="100" cy="100" r="43" pathLength="100" />
        <path className="hx-leader-cross" d="M100 0v200M0 100h200" />
      </svg>
      <p className="hx-leader-n" aria-hidden="true"><span>3</span><span>2</span><span>1</span></p>
      <span className="hx-leader-flash" aria-hidden="true" />
      <button type="button" className="hx-leader-skip" onClick={() => setShow(false)}>Skip intro</button>
    </div>
  );
}

/** Marks each `[data-roll]` scene as it comes into view, so its slate claps once. */
function useRolls(on: boolean) {
  useEffect(() => {
    if (!on || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(entries => {
      for (const e of entries) if (e.isIntersecting) { (e.target as HTMLElement).dataset.rolled = ''; io.unobserve(e.target); }
    }, { threshold: 0.18, rootMargin: '0px 0px -8% 0px' });
    document.querySelectorAll('.hx [data-roll]').forEach(el => io.observe(el));
    return () => io.disconnect();
  }, [on]);
}

function Sources({ sources }: { sources: SpotlightSource[] }) {
  return (
    <ol className="hx-sources">
      {sources.map(src => (
        <li key={src.id} id={`src-${src.id}`}>
          <a href={src.url} target="_blank" rel="noopener noreferrer">{src.publisher}: {src.label} <ExternalLink size={13} aria-hidden="true" /></a>
        </li>
      ))}
    </ol>
  );
}

export default function SpotlightPage() {
  const { slug } = useParams();
  const s = spotlightBySlug(slug);
  const entities = discoveryRepository.list();
  const nights = useMemo(() => (s ? upcomingNights(s, entities) : []), [s, entities]);
  const screamfest = useMemo(() => entities.find(e => e.kind === 'business' && e.id === 'biz-screamfest'), [entities]);
  const profile = useMemo(() => (s?.profileId ? entities.find(e => e.id === s.profileId) : undefined), [s, entities]);

  // Scenes start hidden only once we know they'll be revealed: never in prerendered HTML or with reduced motion.
  const [anim, setAnim] = useState(false);
  useEffect(() => setAnim(motionOk() && typeof IntersectionObserver !== 'undefined'), []);
  useRolls(anim && !!s);

  useEffect(() => {
    if (!s || typeof IntersectionObserver === 'undefined') return;
    const marks: [string, 'middle' | 'end'][] = [['films', 'middle'], ['links', 'end']];
    const io = new IntersectionObserver(entries => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const depth = marks.find(([id]) => id === e.target.id)?.[1];
        if (depth) { trackSpotlightRead(s, depth); io.unobserve(e.target); }
      }
    }, { threshold: 0.2 });
    for (const [id] of marks) { const el = document.getElementById(id); if (el) io.observe(el); }
    return () => io.disconnect();
  }, [s]);

  if (!s) return <NotFoundPage />;

  const out = (linkId: string) => () => trackSpotlightLink(s, linkId);
  const tickets = s.links.find(l => l.id === 'tickets')!;
  const films = demoFilms(s.showcase.films);
  const answered = s.interview.questions.filter(q => q.answer);
  const nextNight = nights[0];

  return (
    <SiteLayout>
      <article className="hx" data-anim={anim ? '' : undefined}>
        <Leader />
        <header className="hx-hero">
          <span className="hx-beam" aria-hidden="true" />
          <span className="hx-grain" aria-hidden="true" />
          <span className="hx-scratch" aria-hidden="true" />
          <span className="hx-sprockets is-l" aria-hidden="true" />
          <span className="hx-sprockets is-r" aria-hidden="true" />
          <p className="hx-bar hx-bar-top"><span>CalgaryWatch Spotlight</span><span>{s.partnerLabel}</span></p>
          <div className="cw-wrap hx-frame">
            <p className="hx-presents">CalgaryWatch presents</p>
            <h1>
              <span className="hx-t1">The Dark Side of</span>
              <span className="hx-t2" data-text="Calgary Cinema">Calgary Cinema</span>
              <span className="hx-h1-sub">Inside Hex After Dark</span>
            </h1>
            <p className="hx-dek">{s.dek}</p>
            <div className="hx-ctas">
              <a className="hx-btn hx-btn-hi" href={tickets.url} target="_blank" rel="noopener noreferrer" onClick={out('tickets')}><Ticket size={18} aria-hidden="true" /> {tickets.label}</a>
              <a className="hx-btn" href="#go">How to go <ArrowDown size={17} aria-hidden="true" /></a>
            </div>
            <ul className="hx-nights" aria-label="Nights left">
              {nights.length ? nights.slice(0, 4).map(n => <li key={n.id}>{nightLabel(n)}</li>) : <li className="is-over">This year’s run has ended</li>}
            </ul>
          </div>
          <p className="hx-bar hx-bar-bottom">
            <span>By <b>CalgaryWatch</b> · <time dateTime={s.published}>{dateOf(s.published)}</time>{s.updated !== s.published ? <> · Updated <time dateTime={s.updated}>{dateOf(s.updated)}</time></> : null}</span>
            <span>{s.card.line}</span>
          </p>
        </header>

        <div className="cw-wrap hx-layout">
          <div className="hx-main">
            <Scene n={1} id="festival" look="slate" kicker="EXT. CALGARY — OCTOBER" label="The festival" title={<>The largest Halloween film festival <span>in Western Canada.</span></>}>
              <p className="hx-line">In its own words.<Cite s={s} id="filmfreeway" /> From HEX Entertainment, the team behind the HEX Halloween &amp; Entertainment Expo.<Cite s={s} id="hex" /> Organized by {s.organizer.name}.</p>
              <ul className="hx-tags" aria-label="What it screens">
                {['Halloween', 'Horror', 'Sci-fi', 'Fantasy', 'Indie shorts', 'No AI films'].map(x => <li key={x}>{x}</li>)}
              </ul>
            </Scene>

            <Scene n={2} id="origins" look="vhs" kicker={<><b>▶ PLAY</b> <span>OCT. 11 2019 · BMO CENTRE</span></>} label="Where it came from" title={<>Born in <span>a haunted expo.</span></>}>
              <p className="hx-line">First screened inside Calgary’s first HEX expo, the one that brought ScreamFest back.<Cite s={s} id="global-2019" /><Cite s={s} id="livewire-2019" /></p>
              <EditionStrip items={[
                { year: '2019', where: 'BMO Centre', what: 'The first HEX expo' },
                { year: '2022', where: 'Burnaby', what: 'Cineplex Metropolis' },
                { year: '2025', where: 'The GRAND', what: 'Flanagan Theatre' },
                { year: '2026', where: 'ScreamFest', what: 'In the bar' },
              ]} />
              <p className="hx-src-line">2022<Cite s={s} id="burnaby-2022" /> · 2025<Cite s={s} id="grand-2025" /><Cite s={s} id="ctv-2025" /></p>
            </Scene>

            <Scene n={3} id="experience" look="marquee" kicker="Now playing" label="This year" title={<>Shorts, <span>between the haunted houses.</span></>}>
              <Letterboard
                rows={[['Where', 'The bar at ScreamFest'], ['When', 'Every ScreamFest night'], ['Run', 'Oct 10 – 31'], ['Cost', 'Included with admission']]}
                open={['Film list', 'Coming soon']}
              />
              <p className="hx-src-line">Run dates<Cite s={s} id="filmfreeway" /> · Every short screens each night, per the festival</p>
            </Scene>
          </div>
        </div>

        <div id="films" className="hx-band" data-roll>
          <span className="hx-band-light" aria-hidden="true" />
          <div className="cw-wrap">
            <FilmShowcase
              id="hx-films-h"
              kicker={`Hex After Dark ${s.showcase.season}`}
              heading={s.showcase.heading}
              films={films}
              emptyTitle="Lineup coming soon."
              emptyBody="Titles, filmmakers and stills land here once the festival shares them."
              contact={{ href: `mailto:${SPOTLIGHT_CONTACT}?subject=${encodeURIComponent('My film at Hex After Dark')}`, label: 'Tell us about your film', note: s.showcase.callForFilmmakers }}
              onLink={id => trackSpotlightLink(s, id)}
            />
          </div>
        </div>

        <div className="cw-wrap hx-layout">
          <div className="hx-main">
            <Scene n={4} id="go" look="box" kicker="Box office" label="How to go" title={<>Your ticket <span>to the bar.</span></>}>
              <div className="hx-ticket">
                <div className="hx-ticket-main">
                  <p className="hx-ticket-eyebrow">Admit one · Hex After Dark at ScreamFest</p>
                  <dl>
                    <div><dt><CalendarDays size={16} aria-hidden="true" /> Nights</dt><dd>{nights.length ? nights.map(nightLabel).join(' · ') : 'This year’s run has ended'}<span>{nightsLine(nights)}</span></dd></div>
                    <div><dt><Clock size={16} aria-hidden="true" /> Hours</dt><dd>{s.venue.hours}<span>Film times not published</span></dd></div>
                    <div><dt><MapPin size={16} aria-hidden="true" /> Where</dt><dd>{s.venue.name}<span>{s.venue.address}</span></dd></div>
                    <div><dt><Ticket size={16} aria-hidden="true" /> Admission</dt><dd>Included with ScreamFest admission</dd></div>
                  </dl>
                  <p className="hx-ticket-note">In the bar. Check ScreamFest’s age rules before bringing anyone under 18.</p>
                </div>
                <div className="hx-ticket-stub">
                  <p className="hx-stub-mark" aria-hidden="true"><span>Admit one</span>{s.card.mark}<small>{nights.length ? nightsLine(nights) : 'See you next year'}</small></p>
                  <a className="hx-btn hx-btn-hi" href={tickets.url} target="_blank" rel="noopener noreferrer" onClick={out('tickets')}>Get tickets <ArrowUpRight size={17} aria-hidden="true" /></a>
                  <a className="hx-btn" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.venue.mapQuery)}`} target="_blank" rel="noopener noreferrer" onClick={out('directions')}>Directions <MapPin size={16} aria-hidden="true" /></a>
                  {nextNight ? <Link className="hx-stub-link" to={entityPath(nextNight)}>ScreamFest on CalgaryWatch</Link> : screamfest ? <Link className="hx-stub-link" to={entityPath(screamfest)}>ScreamFest on CalgaryWatch</Link> : null}
                </div>
              </div>
            </Scene>

            <Scene n={5} id="next" look="teaser" kicker="Coming soon?" label="What’s next" title={<>Back to <span>the big screen?</span></>}>
              <div className="hx-teaser">
                <p className="hx-teaser-top">Hex After Dark</p>
                <p className="hx-teaser-big">Back at<span>The GRAND</span></p>
                <p className="hx-teaser-date">Next year · Tentatively</p>
              </div>
            </Scene>

            <Scene n={6} id="friday" look="polaroid" kicker="Developing…" label="After Friday" take={s.review.status === 'published' ? 2 : 1} title={<>We’re going <span>on October 30.</span></>}>
              {s.review.status === 'published' ? null : <Polaroids />}
              {s.review.status === 'published' && s.review.body.length ? (
                <div className="hx-prose">
                  {s.review.body.map(p => <p key={p}>{p}</p>)}
                </div>
              ) : (
                <p className="hx-line">Our review of the night and a conversation with {s.interview.with}, after Friday.</p>
              )}
              {answered.length ? (
                <dl className="hx-qa">
                  {answered.map(q => <div key={q.question}><dt>{q.question}</dt><dd>{q.answer}</dd></div>)}
                </dl>
              ) : null}
            </Scene>

            <section id="links" className="hx-reel hx-credits" aria-labelledby="links-h" data-roll>
              <p className="hx-end" aria-hidden="true">The End<span>?</span></p>
              <p className="hx-reel-no"><span>Credits</span> Official links and sources</p>
              <h2 id="links-h">Go <span>straight to the source.</span></h2>
              <ul className="hx-links">
                {s.links.map(l => (
                  <li key={l.id}>
                    <a href={l.url} target="_blank" rel="noopener noreferrer" onClick={out(l.id)} className={l.primary ? 'is-primary' : undefined}>
                      <b>{l.label}</b>{l.note ? <span>{l.note}</span> : null}<ArrowUpRight size={18} aria-hidden="true" />
                    </a>
                  </li>
                ))}
              </ul>
              <h3 className="hx-src-h">Sources</h3>
              <Sources sources={s.sources} />
              <p className="hx-disclose-end">{s.disclosure} Spotted something wrong? <a href={`mailto:${SPOTLIGHT_CONTACT}?subject=${encodeURIComponent(`Correction: ${s.name} spotlight`)}`}>Tell us</a>.</p>
            </section>

            <nav className="hx-more" aria-label="More from CalgaryWatch">
              <Link to="/events">Everything on in Calgary this week <ArrowUpRight size={16} aria-hidden="true" /></Link>
              <Link to="/date-night">Date night ideas <ArrowUpRight size={16} aria-hidden="true" /></Link>
              {profile ? <Link to={entityPath(profile)}>{profile.title} on CalgaryWatch Local <ArrowUpRight size={16} aria-hidden="true" /></Link> : null}
              <Link to="/local">The people behind what’s on <ArrowUpRight size={16} aria-hidden="true" /></Link>
            </nav>
          </div>
        </div>
      </article>
    </SiteLayout>
  );
}
