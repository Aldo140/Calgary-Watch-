import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Ambulance, ArrowLeft, ArrowRight, ArrowUpRight, CarFront, ChevronDown, CreditCard, DoorOpen, Globe, HandHeart, MapPin,
  Pause, Phone, PhoneCall, Pill, Play, Scale, ShieldAlert, ShieldCheck, ShoppingBag, Siren, SprayCan, Store, TrafficCone,
  UserSearch, Wine, X, type LucideIcon,
} from 'lucide-react';
import { SiteLayout } from '../components/site/SiteLayout';
import { SAFETY_CONTACTS, SAFETY_FAQS, SAFETY_PATH, SAFETY_TOPICS, type SafetyTopic } from '../content/safetyTopics';
import { NEWS_FEEDS } from '../content/newsFeeds';
import { safetyPath, safetyTopic } from '../lib/safety';
import { communitiesFor, headlinesFor, type CrimeNewsFile, type SafetyHeadline } from '../lib/safetyNews';
import { calgaryDateTimeFormat } from '../lib/calgaryTz';
import news from '../generated/crime-news.json';
import { CityMap, onCityMap } from '../components/safety/CityMap';
import NotFoundPage from './NotFoundPage';
import '../styles/safety.css';

/*
 * Calgary safety desk (/safety, /safety/:slug). A night-time newsroom wire:
 * headlines that link out, grouped by day, what to do in order, and which
 * number to call. Awareness, not alarm: no scores, no ranks, no red sirens.
 * Every count on these pages is a count of newsroom headlines, and says so.
 *
 * Motion: the hero wire rotates, sections rise in as they scroll into view,
 * counts roll up and the playbook line draws. All of it is off under
 * prefers-reduced-motion, and nothing is hidden before JS runs.
 */

const NEWS = news as CrimeNewsFile;
const TZ = { timeZone: 'America/Edmonton' } as const;
const fmtDay = calgaryDateTimeFormat('en-CA', { ...TZ, month: 'short', day: 'numeric', year: 'numeric' });
const fmtKey = calgaryDateTimeFormat('en-CA', { ...TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const fmtWeekday = calgaryDateTimeFormat('en-CA', { ...TZ, weekday: 'long', month: 'short', day: 'numeric' });
const fmtTime = calgaryDateTimeFormat('en-CA', { ...TZ, hour: 'numeric', minute: '2-digit' });
const DAY = 86_400_000;

const dayKey = (t: number | string) => fmtKey.format(new Date(t));
const clock = (t: number | string) => fmtTime.format(new Date(t)).replace(/\./g, '').replace(/\s?([ap])m/i, ' $1m');
const checkedAt = NEWS.updatedAt ? Date.parse(NEWS.updatedAt) : undefined;

function dayLabel(iso: string, now: number) {
  const k = dayKey(iso);
  if (k === dayKey(now)) return 'Today';
  if (k === dayKey(now - DAY)) return 'Yesterday';
  return fmtWeekday.format(new Date(iso));
}

function ago(iso: string, now: number) {
  const m = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (m < 60) return m <= 1 ? 'just now' : `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : d < 7 ? `${d} days ago` : fmtDay.format(new Date(iso));
}

const TOPIC_ICON: Record<string, LucideIcon> = {
  'break-ins': DoorOpen, 'car-theft': CarFront, shootings: Siren, stabbings: Ambulance, assaults: ShieldAlert, robbery: Store,
  homicide: Scale, 'fraud-scams': CreditCard, drugs: Pill, 'impaired-driving': Wine, 'hit-and-run': TrafficCone,
  vandalism: SprayCan, theft: ShoppingBag, 'missing-persons': UserSearch,
};
const iconFor = (slug: string) => TOPIC_ICON[slug] ?? ShieldCheck;
const topicLabel = (slug: string) => SAFETY_TOPICS.find(t => t.slug === slug)?.label;

/** Two-letter outlet mark: "Calgary Police Service" → CPS, "CTV News Calgary" → CTV. */
function outletMark(source: string) {
  const words = source.replace(/\bCalgary\b|\bNews\b/g, '').trim().split(/\s+/).filter(Boolean);
  if (/police/i.test(source)) return 'CPS';
  if (words.length === 1) return words[0].slice(0, 4).toUpperCase();
  return words.map(w => w[0]).join('').slice(0, 3).toUpperCase();
}

/* ---------- motion helpers ---------- */

function useReducedMotion() {
  const [reduce, setReduce] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return;
    const on = () => setReduce(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return reduce;
}

/** True once the element has been on screen. Starts true when there's no observer, so nothing stays hidden. */
function useInView<T extends Element>(margin = '0px 0px -12% 0px') {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(() => typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    if (seen || !ref.current) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setSeen(true); io.disconnect(); } }, { rootMargin: margin });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [seen, margin]);
  return [ref, seen] as const;
}

function Section({ id, className = '', children, label }: { id: string; className?: string; children: ReactNode; label?: string }) {
  const [ref, seen] = useInView<HTMLElement>();
  return (
    <section ref={ref} className={`sf-sec ${className}${seen ? ' is-in' : ''}`} aria-labelledby={label ? undefined : id} aria-label={label}>
      {children}
    </section>
  );
}

function Head({ id, kicker, title, children }: { id: string; kicker: string; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="sf-head">
      <p className="sf-eyebrow">{kicker}</p>
      <h2 id={id}>{title}</h2>
      {children ? <p className="sf-sub">{children}</p> : null}
    </div>
  );
}

function CountUp({ value, run }: { value: number; run: boolean }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(value);
  const started = useRef(false);
  useEffect(() => {
    if (reduce || !run || started.current || value < 2) return;
    started.current = true;
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / 900);
      setShown(Math.round(value * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    setShown(0);
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [run, value, reduce]);
  return <>{shown}</>;
}

/* ---------- the wire (hero card that rotates through the latest headlines) ---------- */

function HeroWire({ items, now, onShow }: { items: SafetyHeadline[]; now: number; onShow?: (h: SafetyHeadline) => void }) {
  const reduce = useReducedMotion();
  const deck = items.slice(0, 6);
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hover, setHover] = useState(false);
  const running = !reduce && !paused && !hover && deck.length > 1;

  useEffect(() => {
    if (!running) return;
    const t = window.setTimeout(() => setI(n => (n + 1) % deck.length), 5200);
    return () => window.clearTimeout(t);
  }, [running, i, deck.length]);

  const shownUrl = deck[i]?.url;
  useEffect(() => { if (deck[i]) onShow?.(deck[i]); }, [shownUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!deck.length) {
    return (
      <div className="sf-wire sf-wire-empty">
        <p className="sf-wire-top"><span className="sf-live" /> The wire</p>
        <p className="sf-wire-title">Headlines from Calgary newsrooms and Calgary Police appear here as they’re published.</p>
      </div>
    );
  }

  const h = deck[i];
  return (
    <div
      className={`sf-wire${running ? ' is-running' : ''}`}
      role="region"
      aria-roledescription="carousel"
      aria-label="Latest headlines"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocusCapture={() => setHover(true)}
      onBlurCapture={() => setHover(false)}
    >
      <div className="sf-wire-behind" aria-hidden="true"><span /><span /></div>
      <div className="sf-wire-card">
        <p className="sf-wire-top">
          <span className="sf-live" aria-hidden="true" />
          <span>The wire</span>
          <span className="sf-wire-count" aria-hidden="true">{String(i + 1).padStart(2, '0')} / {String(deck.length).padStart(2, '0')}</span>
        </p>
        <a key={h.url} className="sf-wire-story" href={h.url} target="_blank" rel="noopener noreferrer">
          <span className={`sf-mark${h.police ? ' is-police' : ''}`} aria-hidden="true">{outletMark(h.source)}</span>
          <span className="sf-wire-meta">{h.source} · <time dateTime={h.publishedAt}>{ago(h.publishedAt, now)}</time></span>
          <strong className="sf-wire-title">{h.title}</strong>
          <span className="sf-wire-go">Read the story <ArrowUpRight size={15} aria-hidden="true" /></span>
        </a>
        <div className="sf-wire-foot">
          <div className="sf-wire-dots" aria-hidden="true">
            {deck.map((d, n) => <span key={d.url} className={n === i ? 'on' : n < i ? 'done' : ''}><i key={n === i ? `${i}-${running}` : undefined} /></span>)}
          </div>
          <div className="sf-wire-ctl">
            <button type="button" onClick={() => setI(n => (n - 1 + deck.length) % deck.length)} aria-label="Previous headline"><ArrowLeft size={16} /></button>
            {reduce ? null : (
              <button type="button" onClick={() => setPaused(p => !p)} aria-label={paused ? 'Play headlines' : 'Pause headlines'}>
                {paused ? <Play size={15} /> : <Pause size={15} />}
              </button>
            )}
            <button type="button" onClick={() => setI(n => (n + 1) % deck.length)} aria-label="Next headline"><ArrowRight size={16} /></button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- which number to call ---------- */

type Need = { id: string; q: string; tel: string; big: string; who: string; why: string; extra?: ReactNode };

function CallFinder({ topic }: { topic?: SafetyTopic }) {
  const { emergency, nonEmergency, crimeStoppers, antiFraud, reportOnline } = SAFETY_CONTACTS;
  const needs: Need[] = [
    { id: 'now', q: 'Someone’s in danger, or it’s happening now', tel: emergency.tel, big: '911', who: 'Emergency', why: 'Police, fire and ambulance. Stay on the line and tell them where you are.' },
    {
      id: 'over', q: 'It’s over and no one’s hurt', tel: nonEmergency.tel, big: nonEmergency.label, who: 'Calgary Police non-emergency', why: 'Get a file number for insurance, and so police can connect reports on your street.',
      extra: <a className="sf-call-alt" href={reportOnline.url} target="_blank" rel="noopener noreferrer">{topic?.online ? `${topic.online}: report online` : 'Some reports with no suspect can be filed online'} <ArrowUpRight size={14} aria-hidden="true" /></a>,
    },
    { id: 'tip', q: 'I know something, but don’t want to give my name', tel: crimeStoppers.tel, big: crimeStoppers.label, who: 'Calgary Crime Stoppers', why: 'Anonymous tips. They don’t trace calls, and you never have to testify.' },
    { id: 'scam', q: 'It’s a scam, or someone used my card', tel: antiFraud.tel, big: antiFraud.label, who: 'Canadian Anti-Fraud Centre', why: 'Call your bank first to freeze the card, then report it here and to Calgary Police non-emergency.' },
  ];
  const first = topic?.slug === 'fraud-scams' ? 'scam' : 'now';
  const [pick, setPick] = useState(first);
  const n = needs.find(x => x.id === pick) ?? needs[0];
  return (
    <div className="sf-finder">
      <div className="sf-finder-qs" role="radiogroup" aria-label="What’s happening?">
        {needs.map((x, k) => (
          <button key={x.id} type="button" role="radio" aria-checked={pick === x.id} className={pick === x.id ? 'on' : ''} onClick={() => setPick(x.id)} style={{ '--i': k } as CSSProperties}>
            <span className="sf-finder-radio" aria-hidden="true" />
            {x.q}
          </button>
        ))}
      </div>
      <div className={`sf-finder-a sf-finder-${n.id}`} aria-live="polite">
        <div key={n.id} className="sf-finder-in">
          <p className="sf-eyebrow">{n.who}</p>
          <a className="sf-finder-num" href={`tel:${n.tel}`}><PhoneCall size={26} aria-hidden="true" /> {n.big}</a>
          <p className="sf-finder-why">{n.why}</p>
          {n.extra}
        </div>
      </div>
    </div>
  );
}

/** Phones only: a “Who to call” pill that rises after the hero and opens three numbers. */
function CallDock() {
  const [show, setShow] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const on = () => setShow(window.scrollY > 520);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [open]);
  const { nonEmergency, crimeStoppers } = SAFETY_CONTACTS;
  return (
    <div className={`sf-dock${show || open ? ' is-up' : ''}${open ? ' is-open' : ''}`}>
      {open ? <button type="button" className="sf-dock-scrim" aria-label="Close" onClick={() => setOpen(false)} /> : null}
      <div className="sf-dock-sheet" id="sf-dock-sheet" hidden={!open}>
        <a href="tel:911" className="sf-dock-row is-911"><b>911</b><span>Danger now, or happening now</span><Phone size={18} aria-hidden="true" /></a>
        <a href={`tel:${nonEmergency.tel}`} className="sf-dock-row"><b>{nonEmergency.label}</b><span>Police non-emergency, when it’s over</span><Phone size={18} aria-hidden="true" /></a>
        <a href={`tel:${crimeStoppers.tel}`} className="sf-dock-row"><b>{crimeStoppers.label}</b><span>Crime Stoppers, no name needed</span><Phone size={18} aria-hidden="true" /></a>
      </div>
      <button type="button" className="sf-dock-btn" aria-expanded={open} aria-controls="sf-dock-sheet" onClick={() => setOpen(o => !o)} tabIndex={show || open ? 0 : -1}>
        {open ? <X size={18} aria-hidden="true" /> : <PhoneCall size={18} aria-hidden="true" />} {open ? 'Close' : 'Who to call'}
      </button>
    </div>
  );
}

/* ---------- headlines, grouped by day ---------- */

function Wire({ items, now, empty, showTopic = false, filter = false, step = 12 }: {
  items: SafetyHeadline[]; now: number; empty: string; showTopic?: boolean; filter?: boolean; step?: number;
}) {
  const [topic, setTopic] = useState<string>('all');
  const [limit, setLimit] = useState(step);
  const chips = useMemo(() => {
    const c = new Map<string, number>();
    for (const h of items) for (const t of h.topics) c.set(t, (c.get(t) ?? 0) + 1);
    return SAFETY_TOPICS.filter(t => c.has(t.slug)).map(t => ({ slug: t.slug, label: t.label, n: c.get(t.slug)! }));
  }, [items]);
  const list = topic === 'all' ? items : items.filter(h => h.topics.includes(topic));
  const shown = list.slice(0, limit);
  const groups: Array<{ label: string; items: SafetyHeadline[] }> = [];
  for (const h of shown) {
    const label = dayLabel(h.publishedAt, now);
    const g = groups[groups.length - 1];
    if (g?.label === label) g.items.push(h); else groups.push({ label, items: [h] });
  }

  if (!items.length) return <p className="sf-empty">{empty}</p>;
  let k = 0;
  return (
    <div className="sf-wirelist">
      {filter && chips.length > 1 ? (
        <div className="sf-chips" role="toolbar" aria-label="Filter headlines by topic">
          <button type="button" aria-pressed={topic === 'all'} onClick={() => { setTopic('all'); setLimit(step); }}>All <small>{items.length}</small></button>
          {chips.map(c => (
            <button key={c.slug} type="button" aria-pressed={topic === c.slug} onClick={() => { setTopic(c.slug); setLimit(step); }}>{c.label} <small>{c.n}</small></button>
          ))}
        </div>
      ) : null}
      <div key={topic} className="sf-days">
        {groups.map(g => (
          <div key={g.label} className="sf-day">
            <h3 className="sf-day-label"><span>{g.label}</span><small>{g.items.length} {g.items.length === 1 ? 'headline' : 'headlines'}</small></h3>
            <ol className="sf-news">
              {g.items.map(h => (
                <li key={h.url} className="sf-item" style={{ '--i': Math.min(k++, 10) } as CSSProperties}>
                  <time className="sf-item-time" dateTime={h.publishedAt}>{clock(h.publishedAt)}</time>
                  <div className="sf-item-body">
                    <a href={h.url} target="_blank" rel="noopener noreferrer" className="sf-item-link">
                      <strong>{h.title}</strong>
                      <ArrowUpRight size={18} aria-hidden="true" />
                    </a>
                    <p className="sf-meta">
                      <span className={h.police ? 'sf-src is-police' : 'sf-src'}>{h.police ? 'Police release' : h.source}</span>
                      {h.community ? <Link to={`/search?q=${encodeURIComponent(h.community)}`}><MapPin size={13} aria-hidden="true" /> {h.community}</Link> : null}
                      {showTopic ? h.topics.slice(0, 2).map(s => <Link key={s} to={`${SAFETY_PATH}/${s}`} className="sf-tag">{topicLabel(s)}</Link>) : null}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
      {list.length > limit ? (
        <button type="button" className="sf-more" onClick={() => setLimit(l => l + step)}>
          Show more headlines <small>{list.length - limit} more</small> <ChevronDown size={16} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

/* ---------- shared blocks ---------- */

function Faqs({ faqs }: { faqs: SafetyTopic['faqs'] }) {
  return (
    <Section id="sf-faq" className="sf-faq-sec">
      <Head id="sf-faq" kicker="Plain answers" title={<>Questions <em>people ask.</em></>} />
      <div className="sf-faqs">
        {faqs.map((f, k) => (
          <details key={f.question} style={{ '--i': k } as CSSProperties}>
            <summary><span>{f.question}</span><ChevronDown size={20} aria-hidden="true" /></summary>
            <p>{f.answer}</p>
          </details>
        ))}
      </div>
    </Section>
  );
}

function Sources() {
  return (
    <Section id="sf-sources" className="sf-sources-sec">
      <Head id="sf-sources" kicker="Where this comes from" title={<>{NEWS_FEEDS.length} newsrooms, <em>one wire.</em></>}>
        Each newsroom’s public feed, checked at least twice a day{checkedAt ? `, last on ${fmtDay.format(new Date(checkedAt))} at ${clock(checkedAt)}` : ''}. We keep the headline and link to the full story on their site.
      </Head>
      <ul className="sf-outlets">
        {NEWS_FEEDS.map((f, k) => (
          <li key={f.id} style={{ '--i': k } as CSSProperties}>
            <a href={f.site} target="_blank" rel="noopener noreferrer">
              <span className={`sf-mark${/police/i.test(f.name) ? ' is-police' : ''}`} aria-hidden="true">{outletMark(f.name)}</span>
              <span>{f.name}</span>
              <Globe size={14} aria-hidden="true" />
            </a>
          </li>
        ))}
      </ul>
      <p className="sf-note"><ShieldCheck size={18} aria-hidden="true" /> CalgaryWatch is an independent community-awareness site, not a police service. Headlines describe what was reported at the time; charges are allegations until proven in court.</p>
    </Section>
  );
}

function Neighbours({ topic, places }: { topic?: SafetyTopic; places: Array<{ community: string }> }) {
  return (
    <Section id="sf-where" className="sf-where-sec">
      <Head id="sf-where" kicker="Close to home" title={<>Look out <em>for each other.</em></>}>
        {places.length ? 'Communities named in these headlines. A mention isn’t a measure: it means a newsroom reported something there.' : 'See what neighbours have reported near you, with the time and source on every pin.'}
      </Head>
      {places.length ? (
        <ul className="sf-places">
          {places.map((p, k) => <li key={p.community} style={{ '--i': Math.min(k, 12) } as CSSProperties}><Link to={`/search?q=${encodeURIComponent(p.community)}`}><MapPin size={14} aria-hidden="true" /> {p.community}</Link></li>)}
        </ul>
      ) : null}
      <div className="sf-near">
        <Link to="/map" className="sf-near-card is-map">
          <span className="sf-near-art" aria-hidden="true"><i /><i /><i /><b /></span>
          <strong>Recent reports on the map <ArrowUpRight size={18} aria-hidden="true" /></strong>
          <span>Neighbours’ reports and Calgary Police releases that name a community, pinned where they happened.</span>
        </Link>
        <Link to="/check-your-community" className="sf-near-card is-cyc">
          <span className="sf-near-art" aria-hidden="true"><HandHeart size={30} /></span>
          <strong>Know your community <ArrowUpRight size={18} aria-hidden="true" /></strong>
          <span>{topic?.cityReports ?? 'What neighbours reported to the City through 311 in your community this year.'}</span>
        </Link>
      </div>
    </Section>
  );
}

function TopicRail({ current }: { current?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>('[aria-current="page"]');
    const rail = ref.current;
    if (el && rail) rail.scrollLeft = el.offsetLeft - rail.clientWidth / 2 + el.clientWidth / 2;
  }, [current]);
  return (
    <nav className="sf-rail" aria-label="Safety topics">
      <div ref={ref} className="sf-rail-track">
        <Link to={SAFETY_PATH} className="sf-rail-all"><ArrowLeft size={15} aria-hidden="true" /> All</Link>
        {SAFETY_TOPICS.map(t => {
          const Icon = iconFor(t.slug);
          return <Link key={t.slug} to={safetyPath(t)} aria-current={t.slug === current ? 'page' : undefined}><Icon size={15} aria-hidden="true" /> {t.label}</Link>;
        })}
      </div>
    </nav>
  );
}

/* ---------- topic page ---------- */

function Playbook({ steps }: { steps: string[] }) {
  const track = useRef<HTMLOListElement>(null);
  const [at, setAt] = useState(0);
  const onScroll = () => {
    const el = track.current;
    if (!el) return;
    const w = el.firstElementChild ? (el.firstElementChild as HTMLElement).offsetWidth + 12 : el.clientWidth;
    setAt(Math.min(steps.length - 1, Math.round(el.scrollLeft / w)));
  };
  const go = (n: number) => {
    const el = track.current;
    const card = el?.children[n] as HTMLElement | undefined;
    if (el && card) el.scrollTo({ left: card.offsetLeft - el.offsetLeft, behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  };
  return (
    <div className="sf-play">
      <ol ref={track} className="sf-steps" onScroll={onScroll}>
        {steps.map((s, k) => (
          <li key={s} style={{ '--i': k } as CSSProperties} className={k === at ? 'is-at' : ''}>
            <span className="sf-step-n" aria-hidden="true">{String(k + 1).padStart(2, '0')}</span>
            <p>{s}</p>
          </li>
        ))}
      </ol>
      <div className="sf-play-ctl">
        <div className="sf-play-bar" aria-hidden="true"><i style={{ transform: `scaleX(${(at + 1) / steps.length})` }} /></div>
        <span className="sf-play-of">Step {at + 1} of {steps.length}</span>
        <button type="button" onClick={() => go(Math.max(0, at - 1))} disabled={at === 0} aria-label="Previous step"><ArrowLeft size={16} /></button>
        <button type="button" onClick={() => go(Math.min(steps.length - 1, at + 1))} disabled={at === steps.length - 1} aria-label="Next step"><ArrowRight size={16} /></button>
      </div>
    </div>
  );
}

function TopicPage({ topic, now }: { topic: SafetyTopic; now: number }) {
  const all = headlinesFor(NEWS.items, topic.slug, 200);
  const items = all.slice(0, 40);
  const places = communitiesFor(all);
  const month = all.filter(h => Date.parse(h.publishedAt) >= now - 30 * DAY).length;
  const latest = all[0];
  const Icon = iconFor(topic.slug);
  const [heroRef, heroIn] = useInView<HTMLElement>('0px');
  const placeNames = places.map(p => p.community);
  const [spot, setSpot] = useState(0);
  useEffect(() => {
    if (placeNames.length < 2 || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const t = window.setInterval(() => setSpot(n => (n + 1) % placeNames.length), 3200);
    return () => window.clearInterval(t);
  }, [placeNames.length]);
  return (
    <div className="sf">
      <header ref={heroRef} className="sf-hero sf-hero-topic" aria-labelledby="sf-title">
        <div className="sf-sky" aria-hidden="true" />
        <div className="cw-wrap sf-hero-grid">
          <div className="sf-hero-copy">
            <p className="sf-kicker"><Link to={SAFETY_PATH}>Calgary safety desk</Link> <span aria-hidden="true">/</span> {topic.label}</p>
            <h1 id="sf-title">{topic.label} <span className="sf-mk">in Calgary.</span></h1>
            <p className="sf-lead">{topic.lead}</p>
            <ul className="sf-facts">
              <li><b><CountUp value={month} run={heroIn} /></b> {month === 1 ? 'headline' : 'headlines'} in the last 30 days</li>
              <li><b><CountUp value={places.length} run={heroIn} /></b> {places.length === 1 ? 'community' : 'communities'} named</li>
              {latest ? <li><b>{ago(latest.publishedAt, now)}</b> latest headline</li> : null}
            </ul>
          </div>
          <div className="sf-stage is-topic">
            <CityMap lit={placeNames} focus={placeNames[spot]} sweep={!placeNames.length} />
            <span className="sf-sticker" aria-hidden="true"><Icon size={40} strokeWidth={1.7} /></span>
            {latest ? (
              <a className="sf-badge-note" href={latest.url} target="_blank" rel="noopener noreferrer">
                <small>Latest · {latest.source}</small>
                <span className="sf-badge-t">{latest.title}</span>
              </a>
            ) : null}
            <p className="sf-stage-cap">{placeNames.length ? 'Lit: communities named in these headlines. A mention isn’t a measure.' : 'No community named in these headlines yet.'}</p>
          </div>
        </div>
      </header>

      <TopicRail current={topic.slug} />

      <div className="cw-wrap sf-body">
        <Section id="sf-steps" className="sf-do-sec">
          <Head id="sf-steps" kicker="If it happens" title={<>What <em>to do.</em></>}>In order. Swipe through on your phone.</Head>
          <div className="sf-do">
            <Playbook steps={topic.steps} />
            <div className="sf-do-call">
              <p className="sf-eyebrow">Which number?</p>
              <CallFinder topic={topic} />
            </div>
          </div>
        </Section>

        <Section id="sf-recent" className="sf-wire-sec">
          <Head id="sf-recent" kicker="The wire" title={<>Recent <em>headlines.</em></>}>From Calgary newsrooms and Calgary Police, newest first. Each opens the original story.</Head>
          <Wire items={items} now={now} step={10} empty={`No recent ${topic.noun} in the Calgary news we follow. New headlines appear here as newsrooms publish them.`} />
        </Section>

        <Neighbours topic={topic} places={places} />
        <Faqs faqs={topic.faqs} />
        <Sources />
        <p className="sf-back"><Link to={SAFETY_PATH}><ArrowLeft size={16} aria-hidden="true" /> All Calgary safety news</Link></p>
      </div>
      <CallDock />
    </div>
  );
}

/* ---------- index ---------- */

function TopicGrid({ now }: { now: number }) {
  const days = 30;
  const rows = SAFETY_TOPICS.map(t => {
    const bins = Array.from({ length: days }, () => 0);
    for (const h of NEWS.items) {
      if (!h.topics.includes(t.slug)) continue;
      const d = Math.floor((now - Date.parse(h.publishedAt)) / DAY);
      if (d >= 0 && d < days) bins[days - 1 - d] += 1;
    }
    return { t, bins, n: bins.reduce((a, b) => a + b, 0) };
  });
  return (
    <ul className="sf-grid">
      {rows.map(({ t, bins, n }, k) => {
        const Icon = iconFor(t.slug);
        const max = Math.max(1, ...bins);
        return (
          <li key={t.slug} style={{ '--i': k } as CSSProperties}>
            <Link to={safetyPath(t)}>
              <span className="sf-grid-icon" aria-hidden="true"><Icon size={22} /></span>
              <strong>{t.label}</strong>
              <small>{n ? `${n} ${n === 1 ? 'headline' : 'headlines'} · 30 days` : 'What to do and who to call'}</small>
              <span className="sf-spark" aria-hidden="true">
                {bins.map((b, d) => <i key={d} className={b ? 'on' : ''} style={{ '--h': b ? 0.25 + 0.75 * (b / max) : 0.12, '--d': d } as CSSProperties} />)}
              </span>
              <ArrowUpRight className="sf-grid-go" size={18} aria-hidden="true" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function IndexPage({ now }: { now: number }) {
  const latest = headlinesFor(NEWS.items, undefined, 60);
  const week = NEWS.items.filter(h => Date.parse(h.publishedAt) >= now - 7 * DAY).length;
  const police = NEWS.items.filter(h => h.police && Date.parse(h.publishedAt) >= now - 7 * DAY).length;
  const [heroRef, heroIn] = useInView<HTMLElement>('0px');
  const [shown, setShown] = useState<SafetyHeadline | undefined>(latest[0]);
  const weekPlaces = useMemo(() => [...new Set(NEWS.items.filter(h => h.community && Date.parse(h.publishedAt) >= now - 7 * DAY).map(h => h.community!))], [now]);
  return (
    <div className="sf">
      <header ref={heroRef} className="sf-hero" aria-labelledby="sf-title">
        <div className="sf-sky" aria-hidden="true" />
        <div className="cw-wrap sf-hero-grid">
          <div className="sf-hero-copy">
            <p className="sf-kicker"><span className="sf-live" aria-hidden="true" /> Calgary safety desk{checkedAt ? ` · checked ${clock(checkedAt)}` : ''}</p>
            <h1 id="sf-title">Calgary crime and safety <span className="sf-mk">news.</span></h1>
            <p className="sf-lead">Recent headlines from Calgary newsrooms and Calgary Police, sorted by what happened, with who to call and what neighbours can do. Know what’s going on, and look out for each other.</p>
            <ul className="sf-facts">
              <li><b><CountUp value={week} run={heroIn} /></b> headlines this week</li>
              <li><b><CountUp value={police} run={heroIn} /></b> police releases</li>
              <li><b><CountUp value={NEWS_FEEDS.length} run={heroIn} /></b> newsrooms</li>
            </ul>
          </div>
          <div className="sf-stage">
            <CityMap lit={weekPlaces} focus={shown?.community} sweep={!!shown && !onCityMap(shown.community)} />
            <HeroWire items={latest} now={now} onShow={setShown} />
          </div>
        </div>
      </header>

      <div className="cw-wrap sf-body">
        <Section id="sf-call" className="sf-call-sec">
          <Head id="sf-call" kicker="Before anything else" title={<>Which number <em>do I call?</em></>}>Pick what’s happening. Tap the number to call.</Head>
          <CallFinder />
        </Section>

        <Section id="sf-topics-h" className="sf-topics-sec">
          <Head id="sf-topics-h" kicker="By topic" title={<>What are you <em>looking for?</em></>}>Each page has recent headlines, what to do and who to call. The bars are headlines per day over the last 30 days.</Head>
          <TopicGrid now={now} />
        </Section>

        <Section id="sf-recent" className="sf-wire-sec">
          <Head id="sf-recent" kicker="The wire" title={<>Latest <em>headlines.</em></>}>Newest first, grouped by day. Each opens the original story.</Head>
          <Wire items={latest} now={now} showTopic filter empty="Headlines from Calgary newsrooms and Calgary Police appear here as they’re published." />
        </Section>

        <Neighbours places={[]} />
        <Faqs faqs={SAFETY_FAQS} />
        <Sources />
      </div>
      <CallDock />
    </div>
  );
}

export default function SafetyPage() {
  const { slug } = useParams();
  const topic = safetyTopic(slug);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);
  useEffect(() => { window.scrollTo(0, 0); }, [slug]);
  if (slug && !topic) return <NotFoundPage />;
  return <SiteLayout>{topic ? <TopicPage key={topic.slug} topic={topic} now={now} /> : <IndexPage now={now} />}</SiteLayout>;
}
