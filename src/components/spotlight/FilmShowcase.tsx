import { Clapperboard, ExternalLink, Film, Mail, Play } from 'lucide-react';
import type { ShowcaseFilm } from '../../content/spotlights';
import '../../styles/film-showcase.css';

/**
 * Reusable showcase for independent films and the people who made them: a
 * festival lineup, a local premiere, a filmmaker's profile. Each card shows
 * only the fields the film carries, so an unsourced runtime or synopsis is
 * simply absent rather than guessed. With no films it renders an honest empty
 * state with a way for filmmakers to get in touch.
 */
export function FilmShowcase({ id, heading, kicker, films, emptyTitle, emptyBody, contact, onLink }: {
  id: string;
  heading: string;
  kicker?: string;
  films: readonly ShowcaseFilm[];
  emptyTitle?: string;
  emptyBody?: string;
  /** Mailto for filmmakers; shown in the empty state and under a lineup. */
  contact?: { href: string; label: string; note: string };
  /** Called with a short link id when an outbound link is tapped, for analytics. */
  onLink?: (linkId: string) => void;
}) {
  return (
    <section className="fs" aria-labelledby={id}>
      <header className="fs-head">
        {kicker ? <p className="fs-kicker">{kicker}</p> : null}
        <h2 id={id}>{heading}</h2>
      </header>
      {films.length ? (
        <ul className="fs-grid">
          {films.map((f, i) => <FilmCard key={`${f.title}-${i}`} film={f} index={i} onLink={onLink} />)}
        </ul>
      ) : (
        <div className="fs-empty">
          <div className="fs-empty-reel" aria-hidden="true">
            {[0, 1, 2].map(i => <span key={i}><Film size={22} /></span>)}
          </div>
          <div>
            <h3>{emptyTitle ?? 'The lineup isn’t public yet.'}</h3>
            <p>{emptyBody ?? 'Each film will get a card here with its title, the people who made it, a short synopsis, a still, its genre and runtime, and where to watch the trailer.'}</p>
          </div>
        </div>
      )}
      {contact ? (
        <p className="fs-call">
          <span>{contact.note}</span>
          <a className="fs-btn" href={contact.href} onClick={() => onLink?.('filmmaker-email')}><Mail size={16} aria-hidden="true" /> {contact.label}</a>
        </p>
      ) : null}
    </section>
  );
}

const LINK_ICON = { trailer: Play, youtube: Play, vimeo: Play } as const;

export function FilmCard({ film, index, onLink }: { film: ShowcaseFilm; index: number; onLink?: (linkId: string) => void }) {
  const directors = film.team.filter(p => /direct/i.test(p.role));
  const crew = film.team.filter(p => !/direct/i.test(p.role));
  const meta = [film.genre, film.runtimeMinutes ? `${film.runtimeMinutes} min` : undefined, film.year ? String(film.year) : undefined, film.origin].filter(Boolean);
  return (
    <li className="fs-card">
      <figure className={`fs-art${film.image?.kind === 'poster' ? ' is-poster' : ''}`}>
        {film.image ? (
          <>
            <img src={film.image.src} alt={film.image.alt} loading="lazy" />
            <figcaption>{film.image.credit}</figcaption>
          </>
        ) : (
          <div className="fs-slate" aria-hidden="true">
            <Clapperboard size={30} />
            <span>Reel {String(index + 1).padStart(2, '0')}</span>
            <b>No still yet</b>
          </div>
        )}
      </figure>
      <div className="fs-body">
        {meta.length ? <p className="fs-meta">{meta.join(' · ')}</p> : null}
        <h3>{film.title}</h3>
        {directors.length ? <p className="fs-by">Directed by {directors.map((p, i) => <span key={p.name}>{i ? ', ' : ''}{p.url ? <a href={p.url} target="_blank" rel="noopener noreferrer">{p.name}</a> : p.name}</span>)}</p> : null}
        {film.synopsis ? <p className="fs-syn">{film.synopsis}</p> : null}
        {crew.length ? (
          <dl className="fs-crew">
            {crew.map(p => <div key={`${p.role}-${p.name}`}><dt>{p.role}</dt><dd>{p.url ? <a href={p.url} target="_blank" rel="noopener noreferrer">{p.name}</a> : p.name}</dd></div>)}
          </dl>
        ) : null}
        {film.links?.length ? (
          <p className="fs-links">
            {film.links.map(l => {
              const Icon = LINK_ICON[l.kind as keyof typeof LINK_ICON] ?? ExternalLink;
              return <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" onClick={() => onLink?.(`film-${l.kind}`)}><Icon size={15} aria-hidden="true" /> {l.label}</a>;
            })}
          </p>
        ) : null}
        <p className="fs-src">Source: {film.source}</p>
      </div>
    </li>
  );
}
