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

        <div className="cw-wrap hx-disclose">
          <p><b>About this spotlight.</b> {s.disclosure}</p>
        </div>

        <div className="cw-wrap hx-layout">
          <nav className="hx-toc" aria-label="In this spotlight">
            <p>Shot list</p>
            <ol>
              <li><a href="#festival">The festival</a></li>
              <li><a href="#origins">Where it came from</a></li>
              <li><a href="#experience">This year</a></li>
              <li><a href="#films">The films</a></li>
              <li><a href="#go">How to go</a></li>
              <li><a href="#next">What’s next</a></li>
              <li><a href="#friday">After Friday</a></li>
            </ol>
          </nav>

          <div className="hx-main">
            <Scene n={1} id="festival" look="slate" kicker="EXT. CALGARY — OCTOBER" label="The festival" title={<>A Halloween festival, <span>in short form.</span></>}>
              <div className="hx-prose">
                <p>HEX After Dark is a curated Halloween film festival from HEX Entertainment, the Calgary company behind the HEX Halloween &amp; Entertainment Expo.<Cite s={s} id="hex" /> On its submission page it calls itself the largest Halloween film festival in Western Canada, and says it exists to showcase independent filmmakers and a shared love of Halloween.<Cite s={s} id="filmfreeway" /></p>
                <p>It takes Halloween, horror, sci-fi and fantasy films, and says it generally doesn’t accept films made with AI. Its awards include Best Short Film, Best Sci-Fi or Fantasy Film and Best Horror Film.<Cite s={s} id="filmfreeway" /> The festival is organized by {s.organizer.name}.</p>
              </div>
            </Scene>

            <Scene n={2} id="origins" look="vhs" kicker={<><b>▶ PLAY</b> <span>OCT. 11 2019 · BMO CENTRE</span></>} label="Where it came from" title={<>Born in <span>a haunted expo.</span></>}>
              <div className="hx-prose">
                <p>HEX started in 2019 as Calgary’s first Halloween and entertainment expo, October 11 to 14 at the BMO Centre on Stampede Park. It brought back ScreamFest’s haunted houses after a year off, which owner Mike Sheppard described as a blend of the haunt and a comic-style expo.<Cite s={s} id="global-2019" /> Admission included the expo’s screening room and film festival.<Cite s={s} id="livewire-2019" /></p>
                <p>The festival has moved around since. In 2022 it screened in Burnaby, at Cineplex Cinemas Metropolis, during the Burnaby Halloween Festival.<Cite s={s} id="burnaby-2022" /> Last year it took over the Flanagan Theatre at The GRAND for one night, Monday, October 27, 2025, in three blocks: <em>Horror in the North</em> at 6:30 p.m., <em>Blood and Reels</em> at 8:30 p.m. and <em>The Best of Hex After Dark</em> at 10:30 p.m.<Cite s={s} id="grand-2025" /> Tickets were $10, or $20 for a pass to all three,<Cite s={s} id="showpass-2025" /> and CTV News Calgary covered the night.<Cite s={s} id="ctv-2025" /></p>
              </div>
              <EditionStrip items={[
                { year: '2019', where: 'BMO Centre', what: 'Inside the first HEX expo' },
                { year: '2022', where: 'Cineplex Metropolis', what: 'Burnaby Halloween Festival' },
                { year: '2025', where: 'The GRAND', what: 'Flanagan Theatre, three blocks' },
                { year: '2026', where: 'ScreamFest', what: 'In the bar, every night' },
              ]} />
            </Scene>

            <Scene n={3} id="experience" look="marquee" kicker="Now playing" label="This year" title={<>Horror, <span>between the haunted houses.</span></>}>
              <div className="hx-prose">
                <p>This October the festival is back with ScreamFest. Its submission page lists the 2026 run as October 10 to 31, alongside ScreamFest, with an official weekend of October 22 to 25.<Cite s={s} id="filmfreeway" /></p>
                <p>The festival has told CalgaryWatch the films play in the bar at ScreamFest on every night it’s open, and that because the programme is all shorts, every film can screen each night. They’re included with ScreamFest admission.</p>
              </div>
              <Letterboard
                rows={[['Where', 'The bar at ScreamFest · GMC Stadium, Stampede Park'], ['When', 'ScreamFest nights · 7 p.m. to midnight'], ['Cost', 'Included with ScreamFest admission']]}
                open={['Still to confirm', 'Screening times and the 2026 film list. We’ll add both when the festival shares them.']}
              />
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
              emptyTitle="This year’s lineup isn’t public yet."
              emptyBody="We’ve asked the festival for its 2026 titles, the filmmakers behind them and permission to show stills. Each film will get a card here with its title, director and team, a short synopsis, a still or poster, its genre and runtime, and links to its trailer and socials. We won’t fill this in from guesses."
              contact={{ href: `mailto:${SPOTLIGHT_CONTACT}?subject=${encodeURIComponent('My film at Hex After Dark')}`, label: 'Tell us about your film', note: s.showcase.callForFilmmakers }}
              onLink={id => trackSpotlightLink(s, id)}
            />
          </div>
        </div>

        <div className="cw-wrap hx-layout">
          <div className="hx-toc-spacer" aria-hidden="true" />
          <div className="hx-main">
            <Scene n={4} id="go" look="box" kicker="Box office" label="How to go" title={<>Your ticket <span>to the bar.</span></>}>
              <div className="hx-ticket">
                <div className="hx-ticket-main">
                  <p className="hx-ticket-eyebrow">Admit one · Hex After Dark at ScreamFest</p>
                  <dl>
                    <div><dt><CalendarDays size={16} aria-hidden="true" /> Nights</dt><dd>{nights.length ? nights.map(nightLabel).join(' · ') : 'This year’s run has ended'}<span>{nightsLine(nights)}</span></dd></div>
                    <div><dt><Clock size={16} aria-hidden="true" /> Hours</dt><dd>{s.venue.hours}<span>Film times not published</span></dd></div>
                    <div><dt><MapPin size={16} aria-hidden="true" /> Where</dt><dd>{s.venue.name}<span>{s.venue.address}</span></dd></div>
                    <div><dt><Ticket size={16} aria-hidden="true" /> Admission</dt><dd>Included with ScreamFest admission<span>Packages vary; check ScreamFest’s booking page</span></dd></div>
                  </dl>
                  <p className="hx-ticket-note">The films play in ScreamFest’s bar. ScreamFest recommends the event for ages 12 and up, and October 22 was adults-only; check its age rules for the bar before bringing anyone under 18.</p>
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
              <div className="hx-teaser" aria-hidden="true">
                <p className="hx-teaser-top">From the festival that played The GRAND in 2025</p>
                <p className="hx-teaser-big">Back at<span>The GRAND</span></p>
                <p className="hx-teaser-date">Next year · If the funding comes through</p>
              </div>
              <div className="hx-prose">
                <p className="hx-attrib"><b>{s.organizer.name}</b> has told CalgaryWatch he hopes to bring Hex After Dark back to The GRAND next year, if the festival secures grant funding.</p>
                <p>There’s no date or booking for that yet, and it depends on funding the festival is still looking for.</p>
                <p>We’ll share with Cameron how many people read this spotlight and how many tapped through to the festival and ScreamFest’s tickets. Those are counts only: nothing about who you are.</p>
              </div>
            </Scene>

            <Scene n={6} id="friday" look="polaroid" kicker="Developing…" label="After Friday" take={s.review.status === 'published' ? 2 : 1} title={<>We’re going <span>on October 30.</span></>}>
              {s.review.status === 'published' ? null : <Polaroids />}
              {s.review.status === 'published' && s.review.body.length ? (
                <div className="hx-prose">
                  {s.review.body.map(p => <p key={p}>{p}</p>)}
                </div>
              ) : (
                <div className="hx-soon">
                  <p>On Friday we’re visiting Hex After Dark. Two things will be added here afterwards:</p>
                  <ul>
                    <li><b>Our review</b> of the night, written from what we actually saw.</li>
                    <li><b>A conversation with {s.interview.with}</b> about how the festival began, how films are chosen, what makes it different and what it would take to return to a theatre, in his own words.</li>
                  </ul>
                  <p className="hx-soon-fine">Until then, everything on this page is either linked to a public source or something the festival told us directly, and it says which.</p>
                </div>
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
