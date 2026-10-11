import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Bell, MapPin, Phone, Signpost, Siren } from 'lucide-react';
import { INCIDENT_CATEGORIES } from '../../constants';
import { useLatestReports, type LatestReports } from '../../hooks/useLatestReports';
import { fetchCommunityBoundaries, type CommunityBoundary } from '../../lib/communityLookup';
import { calgaryDateTimeFormat } from '../../lib/calgaryTz';
import { formatRelativeTime } from '../../lib/format';
import {
  communityByName, reportsForIntent, showsCitywide, streetLookupUrls, summarizeStreetRows, wantsReports,
  type CommunityMatch, type SearchIntent, type StreetAnswer, type StreetGuess, type Topic,
} from '../../lib/searchIntent';
import type { Incident } from '../../types';
import '../../styles/search.css';

/**
 * Ready-made answers above the listings: the neighbourhood someone typed, the
 * street and the community it's in, or what's been reported for "yesterday
 * police". Only what's real is shown; when there's nothing, it says so.
 */

const CPS_NEWS = 'https://newsroom.calgary.ca/police-news-releases/';
const day = calgaryDateTimeFormat('en-CA', { timeZone: 'America/Edmonton', month: 'short', day: 'numeric' });
const categoryLabel = (c: string) => INCIDENT_CATEGORIES.find(x => x.value === c)?.label ?? c;
const categoryColor = (c: string) => INCIDENT_CATEGORIES.find(x => x.value === c)?.color ?? '#00c2e0';

export function SearchAnswers({ intent, now }: { intent: SearchIntent; now: number }) {
  const reports = useLatestReports(wantsReports(intent) || !!intent.street);
  const boundaries = useBoundaries(intent.communities.length > 0);
  if (!intent.communities.length && !intent.street && !showsCitywide(intent)) return null;
  return (
    <div className="cw-answers" aria-label="Answers for your search">
      {intent.street && <StreetCard street={intent.street} reports={reports} now={now} />}
      {intent.communities.map(c => <CommunityCard key={c.slug} match={c} intent={intent} reports={reports} boundaries={boundaries} now={now} />)}
      {showsCitywide(intent) && <CitywideCard intent={intent} reports={reports} now={now} />}
    </div>
  );
}

function useBoundaries(enabled: boolean): CommunityBoundary[] | undefined {
  const [b, setB] = useState<CommunityBoundary[]>();
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    fetchCommunityBoundaries().then(x => { if (live && x.length) setB(x); });
    return () => { live = false; };
  }, [enabled]);
  return b;
}

/* ── Neighbourhood ─────────────────────────────────────────────── */

function CommunityCard({ match, intent, reports, boundaries, now }: { match: CommunityMatch; intent: SearchIntent; reports: LatestReports; boundaries?: CommunityBoundary[]; now: number }) {
  const { community, slug } = match;
  const answer = useMemo(() => reportsForIntent(reports.incidents, { ...intent, communities: [match] }, now, boundaries, 6), [reports.incidents, intent, match, now, boundaries]);
  const topicNote = intent.topics.length ? topicLabel(intent.topics) : 'reports';
  return (
    <section className="cw-answer cw-answer-hood">
      <div className="cw-answer-head">
        <p className="cw-answer-eyebrow"><MapPin size={15} aria-hidden="true" /> Neighbourhood{match.via === 'typo' ? ' · closest match' : ''}</p>
        <h2>{community.name}<span>{community.quadrant === 'Centre' ? 'Centre' : community.quadrant}</span></h2>
        <p className="cw-answer-lead">What neighbours, police and the City have posted about {community.name}, newest first.</p>
        <div className="cw-answer-actions">
          <Link className="cw-answer-primary" to={`/map?area=${slug}`}>See {community.name} on the live map <ArrowUpRight size={16} aria-hidden="true" /></Link>
          <Link to={`/check-your-community?c=${slug}`}>A year of reports to the City</Link>
          <Link to="/map?settings=alerts"><Bell size={15} aria-hidden="true" /> Alerts for my area</Link>
        </div>
      </div>
      <ReportList title={`${answer.widened && answer.reports.length ? 'Latest' : answer.window.label}: ${topicNote} in ${community.name}`} answer={answer} reports={reports} now={now}
        empty={`Nothing has been posted about ${community.name}${reports.oldest ? ` since ${day.format(reports.oldest)}` : ''}. Quiet is good news.`}
        widenedNote={`Nothing ${answer.window.label.toLowerCase()}. The latest from ${community.name}:`} />
    </section>
  );
}

/* ── Street ────────────────────────────────────────────────────── */

type StreetState = { status: 'loading' | 'ready' | 'none'; answer?: StreetAnswer };

function useStreet(street: StreetGuess): StreetState {
  const [state, setState] = useState<StreetState>({ status: 'loading' });
  const key = JSON.stringify(street);
  useEffect(() => {
    const ctrl = new AbortController();
    setState({ status: 'loading' });
    (async () => {
      for (const url of streetLookupUrls(street)) {
        const res = await fetch(url, { signal: ctrl.signal });
        const rows = res.ok ? await res.json() : [];
        const answer = Array.isArray(rows) ? summarizeStreetRows(rows, street) : null;
        if (answer) { setState({ status: 'ready', answer }); return; }
      }
      setState({ status: 'none' });
    })().catch(() => { if (!ctrl.signal.aborted) setState({ status: 'none' }); });
    return () => ctrl.abort();
    // `key` stands in for the street object, which is rebuilt every render.
  }, [key]);
  return state;
}

function StreetCard({ street, reports, now }: { street: StreetGuess; reports: LatestReports; now: number }) {
  const { status, answer } = useStreet(street);
  const found = answer ? communityByName(answer.community) : undefined;
  const hood = found ?? street.likely;
  const name = found?.community.name ?? answer?.community ?? street.likely?.community.name;
  const corrected = answer && !answer.street.toUpperCase().startsWith(street.name);
  const houseLabel = street.houseNumber ? `${street.houseNumber} ` : '';
  return (
    <section className="cw-answer cw-answer-street">
      <div className="cw-answer-head">
        <p className="cw-answer-eyebrow"><Signpost size={15} aria-hidden="true" /> Street{corrected ? ` · closest match for “${street.typed}”` : ''}</p>
        <h2>{houseLabel}{answer?.street ?? street.typed}</h2>
        <p className="cw-answer-lead" aria-live="polite">
          {status === 'loading' ? <>Looking it up in the City’s address register…</>
            : answer ? <>is in <b>{name}</b>{answer.quadrant ? ` (${answer.quadrant})` : ''}, {answer.addresses} {answer.addresses === 1 ? 'address' : 'addresses'} on the City’s register.</>
            : name ? <>Streets named like this are in <b>{name}</b>. We couldn’t confirm the exact street, so check the spelling.</>
            : <>We couldn’t find that street on the City’s address register. Check the spelling, or try the neighbourhood name.</>}
        </p>
        {hood && (
          <div className="cw-answer-actions">
            <Link className="cw-answer-primary" to={`/search?q=${encodeURIComponent(hood.community.name.toLowerCase())}`}>Reports in {hood.community.name} <ArrowUpRight size={16} aria-hidden="true" /></Link>
            <Link to={`/map?area=${hood.slug}`}>Open the live map there</Link>
            <Link to={`/check-your-community?c=${hood.slug}`}>A year of reports to the City</Link>
          </div>
        )}
      </div>
      {hood && <StreetReports hood={hood} reports={reports} now={now} />}
    </section>
  );
}

function StreetReports({ hood, reports, now }: { hood: CommunityMatch; reports: LatestReports; now: number }) {
  const answer = useMemo(() => reportsForIntent(reports.incidents, { communities: [hood], time: null, topics: [], street: null, question: false }, now, undefined, 3), [reports.incidents, hood, now]);
  return <ReportList title={`Lately in ${hood.community.name}`} answer={answer} reports={reports} now={now} empty={`Nothing posted about ${hood.community.name} lately.`} widenedNote={`The latest from ${hood.community.name}:`} compact />;
}

/* ── Citywide: "yesterday police", "lockdowns" ─────────────────── */

const EXPLAIN: Partial<Record<Topic, string>> = {
  helicopter: 'A police helicopter (HAWCS) circling usually means officers are searching for someone or following a vehicle. When police share what it was, it shows up here.',
  lockdown: 'Schools go into lockdown or hold-and-secure when police ask them to. Police and the school boards post when it’s lifted.',
  police: 'CalgaryWatch doesn’t hear police radio. What we can show is what police, the City and neighbours have posted, newest first.',
};

function CitywideCard({ intent, reports, now }: { intent: SearchIntent; reports: LatestReports; now: number }) {
  const answer = useMemo(() => reportsForIntent(reports.incidents, intent, now, undefined, 8), [reports.incidents, intent, now]);
  const safety = intent.topics.some(t => t === 'police' || t === 'helicopter' || t === 'lockdown' || t === 'crime' || t === 'fire');
  const explain = intent.topics.map(t => EXPLAIN[t]).find(Boolean) ?? (intent.question && safety ? EXPLAIN.police : undefined);
  const what = intent.topics.length ? topicLabel(intent.topics) : 'Everything reported';
  return (
    <section className="cw-answer cw-answer-city">
      <div className="cw-answer-head">
        <p className="cw-answer-eyebrow"><Siren size={15} aria-hidden="true" /> Across Calgary</p>
        <h2>{what}<span>{answer.window.label}</span></h2>
        {explain && <p className="cw-answer-lead">{explain}</p>}
        <div className="cw-answer-actions">
          <Link className="cw-answer-primary" to="/map">Open the live map <ArrowUpRight size={16} aria-hidden="true" /></Link>
          {safety && <a href={CPS_NEWS} target="_blank" rel="noopener noreferrer">Police news releases ↗</a>}
        </div>
        {safety && <p className="cw-answer-help"><Phone size={14} aria-hidden="true" />Emergency or crime in progress: <a href="tel:911">911</a>. Anything else: <a href="tel:4032661234">403-266-1234</a>.</p>}
      </div>
      <ReportList title={answer.widened && answer.reports.length ? 'Latest' : answer.window.label} answer={answer} reports={reports} now={now}
        empty={`Nothing like this has been posted${reports.oldest ? ` since ${day.format(reports.oldest)}` : ''}.`}
        widenedNote={`Nothing posted ${answer.window.label.toLowerCase()}. The most recent:`} />
    </section>
  );
}

function topicLabel(topics: Topic[]): string {
  const t = topics.filter(x => x !== 'news');
  if (!t.length) return 'Everything reported';
  if (t.some(x => x === 'police' || x === 'helicopter' || x === 'lockdown' || x === 'crime')) return 'Police and safety';
  return ({ fire: 'Fire and emergencies', traffic: 'Traffic and roads', outage: 'Power and utilities', weather: 'Weather' } as Record<string, string>)[t[0]] ?? 'Reports';
}

/* ── Shared list ───────────────────────────────────────────────── */

function ReportList({ title, answer, reports, now, empty, widenedNote, compact = false }: {
  title: string; answer: ReturnType<typeof reportsForIntent>; reports: LatestReports; now: number; empty: string; widenedNote: string; compact?: boolean;
}) {
  return (
    <div className={`cw-answer-reports${compact ? ' is-compact' : ''}`}>
      <h3>{title}</h3>
      {reports.status === 'idle' || reports.status === 'loading' ? <ul className="cw-answer-skeleton" aria-label="Loading reports"><li /><li /><li /></ul>
        : reports.status === 'error' ? <p className="cw-answer-empty">Couldn’t load reports just now. The live map has everything.</p>
        : !answer.reports.length ? <p className="cw-answer-empty">{empty}</p>
        : <>
          {answer.widened && <p className="cw-answer-note">{widenedNote}</p>}
          <ol>{answer.reports.map(r => <ReportRow key={r.id} r={r} now={now} />)}</ol>
        </>}
    </div>
  );
}

function ReportRow({ r, now }: { r: Incident; now: number }) {
  return (
    <li>
      <Link to={`/map?i=${encodeURIComponent(r.id)}`}>
        <i style={{ background: categoryColor(r.category) }} aria-hidden="true" />
        <span>
          <b>{r.title}</b>
          <small>{[categoryLabel(r.category), r.neighborhood, r.source_name, formatRelativeTime(r.timestamp, now)].filter(Boolean).join(' · ')}</small>
        </span>
      </Link>
    </li>
  );
}
