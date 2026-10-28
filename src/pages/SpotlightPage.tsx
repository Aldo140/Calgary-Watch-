import { useEffect, useMemo, type ReactNode } from 'react';
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

function Reel({ n, id, label, title, children, tone }: { n: number; id: string; label: string; title: ReactNode; children: ReactNode; tone?: 'dark' }) {
  return (
    <section id={id} className={`hx-reel${tone ? ` is-${tone}` : ''}`} aria-labelledby={`${id}-h`}>
      <p className="hx-reel-no"><span>Reel {String(n).padStart(2, '0')}</span> {label}</p>
      <h2 id={`${id}-h`}>{title}</h2>
      <div className="hx-prose">{children}</div>
    </section>
  );
}

function Marquee() {
  return (
    <svg className="hx-art" viewBox="0 0 420 400" role="img" aria-label="Drawing: a cinema marquee reading Hex After Dark, Now showing, short horror, in the bar at ScreamFest">
      <defs>
        <linearGradient id="hx-beam" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#ffdf4f" stopOpacity=".55" />
          <stop offset="1" stopColor="#ffdf4f" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path className="hx-art-beam" d="M210 392 40 40h340Z" fill="url(#hx-beam)" />
      <rect className="hx-art-board" x="38" y="44" width="344" height="212" rx="14" />
      {Array.from({ length: 16 }, (_, i) => <circle key={`t${i}`} className="hx-bulb" style={{ animationDelay: `${(i % 4) * 0.25}s` }} cx={58 + i * 20.3} cy="62" r="5" />)}
      {Array.from({ length: 16 }, (_, i) => <circle key={`b${i}`} className="hx-bulb" style={{ animationDelay: `${((i + 2) % 4) * 0.25}s` }} cx={58 + i * 20.3} cy="238" r="5" />)}
      <text className="hx-art-small" x="210" y="98" textAnchor="middle">NOW SHOWING</text>
      <text className="hx-art-big" x="210" y="152" textAnchor="middle">HEX</text>
      <text className="hx-art-mid" x="210" y="190" textAnchor="middle">AFTER DARK</text>
      <text className="hx-art-small" x="210" y="218" textAnchor="middle">SHORT HORROR · IN THE BAR</text>
      <path className="hx-art-post" d="M96 256v120M324 256v120" />
      <g className="hx-art-strip" transform="rotate(-8 210 320)">
        <rect x="70" y="296" width="280" height="54" rx="4" />
        {Array.from({ length: 12 }, (_, i) => <rect key={`p${i}`} className="hx-art-hole" x={80 + i * 22.5} y="300" width="10" height="7" rx="2" />)}
        {Array.from({ length: 12 }, (_, i) => <rect key={`q${i}`} className="hx-art-hole" x={80 + i * 22.5} y="339" width="10" height="7" rx="2" />)}
        {[0, 1, 2, 3].map(i => <rect key={`f${i}`} className="hx-art-frame" x={80 + i * 67} y="311" width="58" height="24" rx="2" />)}
      </g>
      <path className="hx-art-bat" d="M330 118c8-6 14-6 18 0 4-6 10-6 18 0-6 0-9 4-10 8-3-3-6-3-8 0-2-3-5-3-8 0-1-4-4-8-10-8Z" />
      <path className="hx-art-bat is-b" d="M60 118c6-4 10-4 13 0 3-4 7-4 13 0-4 0-7 3-7 6-2-2-4-2-6 0-2-2-4-2-6 0 0-3-3-6-7-6Z" />
    </svg>
  );
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
      <article className="hx">
        <header className="hx-hero">
          <span className="hx-grain" aria-hidden="true" />
          <div className="cw-wrap hx-hero-grid">
            <div className="hx-hero-copy">
              <p className="hx-kicker"><span>CalgaryWatch Spotlight</span> {s.partnerLabel}</p>
              <h1>
                The Dark Side of <mark>Calgary Cinema</mark><span className="hx-h1-sub">Inside Hex After Dark</span>
              </h1>
              <p className="hx-dek">{s.dek}</p>
              <p className="hx-byline">By <b>CalgaryWatch</b> · <time dateTime={s.published}>{dateOf(s.published)}</time>{s.updated !== s.published ? <> · Updated <time dateTime={s.updated}>{dateOf(s.updated)}</time></> : null}</p>
              <div className="hx-ctas">
                <a className="hx-btn hx-btn-hi" href={tickets.url} target="_blank" rel="noopener noreferrer" onClick={out('tickets')}><Ticket size={18} aria-hidden="true" /> {tickets.label}</a>
                <a className="hx-btn" href="#go">How to go <ArrowDown size={17} aria-hidden="true" /></a>
              </div>
              <ul className="hx-nights" aria-label="Nights left">
                {nights.length ? nights.slice(0, 4).map(n => <li key={n.id}>{nightLabel(n)}</li>) : <li className="is-over">This year’s run has ended</li>}
              </ul>
            </div>
            <div className="hx-hero-art"><Marquee /></div>
          </div>
        </header>

        <div className="cw-wrap hx-disclose">
          <p><b>About this spotlight.</b> {s.disclosure}</p>
        </div>

        <div className="cw-wrap hx-layout">
          <nav className="hx-toc" aria-label="In this spotlight">
            <p>In this spotlight</p>
            <ol>
              <li><a href="#festival">The festival</a></li>
              <li><a href="#experience">Horror in the bar</a></li>
              <li><a href="#why">Why it matters</a></li>
              <li><a href="#films">The films</a></li>
              <li><a href="#go">How to go</a></li>
              <li><a href="#next">What’s next</a></li>
              <li><a href="#friday">After Friday</a></li>
            </ol>
          </nav>

          <div className="hx-main">
            <Reel n={1} id="festival" label="The festival" title={<>Short films, <span>made to scare you.</span></>}>
              <p className="hx-first">Hex After Dark is a festival of short horror films, organized by {s.organizer.name}. Its submission page asks for Halloween, horror, sci-fi and fantasy work under an hour long, and says it generally doesn’t accept films made with AI.<Cite s={s} id="filmfreeway" /> The same page bills it as the largest Halloween film festival in Western Canada.</p>
              <p>This October it’s somewhere you might not expect: the bar at ScreamFest, the haunted-house night out at Stampede Park. The shorts play on ScreamFest’s operating nights, and the festival has told us they’re included with ScreamFest admission.</p>
              <p>It hasn’t always lived there. Last year it took over the Flanagan Theatre at The GRAND on 1 Street SW for one Monday night, October 27, 2025, in three programmes: <em>Horror in the North</em>, eight new Canadian horror shorts; <em>Blood and Reels</em>, eight international submissions; and <em>The Best of Hex After Dark</em>, a showcase of past favourites.<Cite s={s} id="grand-2025" /> In 2022 it screened in Burnaby, at Cineplex Cinemas Metropolis, during the Burnaby Halloween Festival.<Cite s={s} id="burnaby-2022" /></p>
            </Reel>

            <Reel n={2} id="experience" label="The experience" title={<>Horror, <span>between the haunted houses.</span></>}>
              <p>A short film has a few minutes to do what a feature does in two hours: build a world, make you care about someone in it, then pull the floor out. Horror suits the form. A good short scare doesn’t need a second act, just a room that’s paying attention.</p>
              <p>At ScreamFest that room is the bar, with the haunted houses outside. You don’t buy a separate film ticket: if you’re at ScreamFest, the films are part of the night.</p>
              <ul className="hx-checklist" aria-label="What we know so far">
                <li><b>Where</b> The bar at ScreamFest, GMC Stadium, Stampede Park</li>
                <li><b>When</b> ScreamFest nights, which run 7 p.m. to midnight</li>
                <li><b>Cost</b> Included with ScreamFest admission</li>
                <li className="is-open"><b>Still to confirm</b> Screening times and the 2026 film list. We’ll add both here when the festival shares them.</li>
              </ul>
            </Reel>

            <Reel n={3} id="why" label="Why it matters" title={<>Where Calgary’s <span>next filmmakers</span> find a crowd.</>}>
              <p>Most filmmakers start with shorts, and most shorts never get a cinema run. A festival screening is often the only time a short plays to a room of strangers, which is the one thing a filmmaker can’t get from a link.</p>
              <p>Calgary has its big festivals, from the Calgary International Film Festival to the Calgary Underground Film Festival. Genre nights like Hex After Dark do something different: they put a first-time filmmaker’s short in front of people who came for exactly that kind of film.</p>
              <p>That matters to a city that wants people to make things here. The cheapest way to help is the obvious one: go, stay for the credits, and follow the filmmakers whose work gets to you.</p>
            </Reel>
          </div>
        </div>

        <div id="films" className="hx-band">
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
            <section id="go" className="hx-reel" aria-labelledby="go-h">
              <p className="hx-reel-no"><span>Reel 04</span> How to go</p>
              <h2 id="go-h">Your ticket <span>to the bar.</span></h2>
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
                  <p className="hx-stub-mark" aria-hidden="true">{s.card.mark}<small>{nights.length ? nightsLine(nights) : 'See you next year'}</small></p>
                  <a className="hx-btn hx-btn-hi" href={tickets.url} target="_blank" rel="noopener noreferrer" onClick={out('tickets')}>Get tickets <ArrowUpRight size={17} aria-hidden="true" /></a>
                  <a className="hx-btn" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.venue.mapQuery)}`} target="_blank" rel="noopener noreferrer" onClick={out('directions')}>Directions <MapPin size={16} aria-hidden="true" /></a>
                  {nextNight ? <Link className="hx-stub-link" to={entityPath(nextNight)}>ScreamFest on CalgaryWatch</Link> : screamfest ? <Link className="hx-stub-link" to={entityPath(screamfest)}>ScreamFest on CalgaryWatch</Link> : null}
                </div>
              </div>
            </section>

            <Reel n={5} id="next" label="What’s next" title={<>Back to <span>the big screen?</span></>}>
              <p className="hx-attrib"><b>{s.organizer.name}</b> has told CalgaryWatch he hopes to bring Hex After Dark back to The GRAND next year, if the festival secures grant funding.</p>
              <p>That’s his ambition, not an announcement: there’s no date or booking we know of, and it depends on funding the festival doesn’t have yet. Grant applications usually ask for evidence that people care. Turning up this week, and following the festival, is the kind of evidence that counts.</p>
              <p>We’ll share with Cameron how many people read this spotlight and how many tapped through to the festival and ScreamFest’s tickets. Those are counts only: nothing about who you are.</p>
            </Reel>

            <section id="friday" className="hx-reel" aria-labelledby="friday-h">
              <p className="hx-reel-no"><span>Coming soon</span> After Friday</p>
              <h2 id="friday-h">We’re going <span>on October 30.</span></h2>
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
            </section>

            <section id="links" className="hx-reel" aria-labelledby="links-h">
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
              <Link to="/local">The people behind what’s on <ArrowUpRight size={16} aria-hidden="true" /></Link>
            </nav>
          </div>
        </div>
      </article>
    </SiteLayout>
  );
}
