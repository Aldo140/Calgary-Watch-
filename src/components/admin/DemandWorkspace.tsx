import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { Link } from 'react-router-dom';
import { RefreshCw, Search, SearchX } from 'lucide-react';
import { db } from '../../firebase';
import { SEARCH_DEMAND, summarizeDemand, readDemandRecords, type DemandRow } from '../../lib/searchDemand';
import { bareStreetGuess, describeAnswer, parseSearchIntent } from '../../lib/searchIntent';
import { lookupStreet } from '../../hooks/useStreetLookup';
import { searchListings } from '../../lib/listingSearch';
import { discoveryRepository } from '../../data/discovery';
import { trackSubscription } from '../../lib/readEfficiency';
import { AdminButton, Chip, EmptyState, Panel, StatGrid, StatTile, T, TimeAgo, mono } from './ui';

const WINDOWS = [7, 30, 90] as const;
/** Rows in the live "Latest searches" list: one read each when the page opens, then one per new search. */
const LATEST = 20;
const clock = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton', hour: 'numeric', minute: '2-digit' });

/**
 * Search demand: what people typed into CalgaryWatch search, grouped.
 * "Found nothing" is the business list: events, places and topics people
 * want that the site doesn't carry yet. The totals are read once per window
 * change or Refresh (capped at 2,000 rows) to stay inside the free read
 * quota, and say when they were read; "Latest searches" is live.
 */
export function DemandWorkspace() {
  const [days, setDays] = useState<(typeof WINDOWS)[number]>(30);
  const [rows, setRows] = useState<Array<{ q: string; results: number; ts: number }> | null>(null);
  const [error, setError] = useState('');
  const [ignored,setIgnored]=useState(0);
  const [attempt,setAttempt]=useState(0);
  const [readAt, setReadAt] = useState<number | null>(null);
  const [allTerms, setAllTerms] = useState(false);

  useEffect(() => {
    if (!db) { setRows([]); return; }
    let live = true;
    setRows(null); setError('');
    getDocs(query(collection(db, SEARCH_DEMAND), where('ts', '>=', Date.now() - days * 86_400_000), orderBy('ts', 'desc'), limit(2000)))
      .then((snap) => { if (live) {const parsed=readDemandRecords(snap.docs.map(d=>d.data()));setRows(parsed.rows);setIgnored(parsed.ignored);setReadAt(Date.now());} })
      .catch((e) => { if (live) { setError(e instanceof Error ? e.message : 'Could not load searches.'); } });
    return () => { live = false; };
  }, [days,attempt]);

  const terms = useMemo(() => summarizeDemand(rows ?? []), [rows]);
  const misses = terms.filter((t) => t.lastResults === 0);
  const total = rows?.length ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {WINDOWS.map((w) => (
          <AdminButton key={w} size="sm" tone="signal" variant={w === days ? 'solid' : 'outline'} onClick={() => setDays(w)}>Last {w} days</AdminButton>
        ))}
        <AdminButton size="sm" variant="ghost" title="Re-read the totals" disabled={rows === null} onClick={() => setAttempt(n => n + 1)}><RefreshCw size={14} />Refresh</AdminButton>
        <span className="text-xs" style={{ color: T.muted }}>
          {readAt ? `Totals as of ${clock.format(readAt)}; Refresh to include newer searches. ` : ''}Anonymous: the words and the result count only.
        </span>
      </div>
      {error ? <Panel title="Couldn’t load searches"><AdminButton variant="outline" onClick={()=>setAttempt(n=>n+1)}>Retry searches</AdminButton><p className="p-4 text-sm" style={{ color: T.critical }}>{error} If this says permission denied, deploy the Firestore rules (Deploy Firebase Backend → rules).</p></Panel> : null}
      {ignored>0&&!error?<p role="status" className="admin-read-warning">{ignored} invalid or unsupported search records were excluded. Totals below use valid records only.</p>:null}
      {!error&&<>
      <StatGrid>
        <StatTile label="Searches" value={rows ? total : null} hint={`Last ${days} days`} />
        <StatTile label="Distinct terms" value={rows ? terms.length : null} />
        <StatTile label="Found nothing" value={rows ? misses.length : null} tone={misses.length ? 'attention' : 'neutral'} hint={`Of ${terms.length} terms, the latest search had no results`} />
        <StatTile label="Hit rate" value={rows && total ? Math.round((1 - (rows.filter((r) => r.results === 0).length / total)) * 100) : null} unit="%" />
      </StatGrid>
      <LatestSearches />
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Looked for, not found" subtitle="What to list next. Each is a real search that came back empty.">
          {rows === null ? <p className="p-4 text-sm" style={{ color: T.muted }}>Loading…</p>
            : misses.length ? <TermList rows={misses.slice(0, 25)} miss />
            : <EmptyState icon={<SearchX size={20} />} title={total?"Nothing missed":"No searches yet"} body={total?"Every recent search found at least one listing.":"Searches appear here once people use the site search."} />}
        </Panel>
        <Panel title="Most searched" subtitle="Open a term to see what a resident sees."
          action={terms.length > 25 ? <AdminButton size="sm" variant="ghost" onClick={() => setAllTerms(v => !v)}>{allTerms ? 'Top 25' : `All ${terms.length}`}</AdminButton> : undefined}>
          {rows === null ? <p className="p-4 text-sm" style={{ color: T.muted }}>Loading…</p>
            : terms.length ? <TermList rows={allTerms ? terms : terms.slice(0, 25)} />
            : <EmptyState icon={<Search size={20} />} title="No searches yet" body="Searches appear here once people use the site search." />}
        </Panel>
      </div>
      </>}
    </div>
  );
}

/**
 * The newest searches as they happen, so a search made a minute ago shows
 * here without a reload, even when it's too rare to make the ranked lists.
 */
function LatestSearches() {
  const [rows, setRows] = useState<Array<{ q: string; results: number; ts: number }> | null>(null);
  useEffect(() => {
    if (!db) { setRows([]); return; }
    const database = db;
    return trackSubscription('demand:latest', () => onSnapshot(query(collection(database, SEARCH_DEMAND), orderBy('ts', 'desc'), limit(LATEST)),
      (snap) => setRows(readDemandRecords(snap.docs.map(d => d.data())).rows),
      () => setRows([])));
  }, []);
  return (
    <Panel title="Latest searches" subtitle="Live. Each search a reader made, newest first." padded={false}>
      {rows === null ? <p className="p-4 text-sm" style={{ color: T.muted }}>Loading…</p>
        : rows.length ? (
          <ol className="divide-y" style={{ borderColor: T.line }}>
            {rows.map((r, i) => (
              <li key={`${r.ts}-${i}`} className="flex items-center gap-3 px-4 py-2">
                <Link to={`/search?q=${encodeURIComponent(r.q)}`} target="_blank" className="min-w-0 flex-1 truncate text-sm font-semibold hover:underline" style={{ color: T.ink }}>{r.q}</Link>
                <span className="text-[0.68rem] tabular-nums" style={{ fontFamily: mono, color: r.results ? T.muted : T.attention }}>{r.results ? `${r.results} ${r.results === 1 ? 'result' : 'results'}` : 'no results'}</span>
                <span className="w-16 text-right"><TimeAgo ts={r.ts} /></span>
              </li>
            ))}
          </ol>
        ) : <EmptyState icon={<Search size={20} />} title="No searches yet" body="Searches appear here once people use the site search." />}
    </Panel>
  );
}

/**
 * One row per term. The search count and the result count used to sit side by
 * side as a bare number and "0 found", which read as one figure: a term
 * searched once with nothing found looked like "10 found". Each number now
 * carries its own word.
 */
function TermList({ rows, miss = false }: { rows: DemandRow[]; miss?: boolean }) {
  const max = Math.max(...rows.map((r) => r.searches), 1);
  return (
    <ol className="divide-y" style={{ borderColor: T.line }}>
      {rows.map((r) => <TermRow key={r.q} r={r} max={max} miss={miss} />)}
    </ol>
  );
}

function TermRow({ r, max, miss }: { r: DemandRow; max: number; miss: boolean }) {
  // Searches recorded before search understood neighbourhoods, streets and
  // "yesterday police" stay at 0 found; say what the same words get today.
  const preview = useMemo(() => {
    if (r.lastResults !== 0) return { now: null, street: null };
    try {
      const intent = parseSearchIntent(r.q);
      let now = describeAnswer(intent);
      // Or a listing that exists now ("atp" finds Alberta Theatre Projects).
      if (!now) { const found = searchListings(discoveryRepository.list(), discoveryRepository.occurrences(), r.q); const hit = found.partial ? undefined : Object.values(found.groups).flat()[0]; if (hit) now = hit.title; }
      return { now, street: now ? null : bareStreetGuess(intent, r.q) };
    } catch (error) { console.warn('[admin search] Answer preview unavailable', error); return { now: null, street: null }; }
  }, [r.q, r.lastResults]);
  // "madigan" alone: search now tries the City's address register, so check it here too.
  const [street, setStreet] = useState<string | null>(null);
  useEffect(() => {
    if (!preview.street) return;
    let live = true;
    lookupStreet(preview.street).then(a => { if (live && a) setStreet(`${a.street}, ${a.community}`); });
    return () => { live = false; };
  }, [preview.street]);
  const now = preview.now ?? street;
  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <div className="min-w-0 flex-1">
        <Link to={`/search?q=${encodeURIComponent(r.q)}`} target="_blank" className="text-sm font-semibold hover:underline" style={{ color: T.ink }}>{r.q}</Link>
        <div className="mt-1 h-1.5 rounded-full" style={{ background: `${miss ? T.attention : T.signal}1F` }}>
          <div className="h-full rounded-full" style={{ width: `${(r.searches / max) * 100}%`, background: miss ? T.attention : T.signal }} />
        </div>
        {now ? <p className="mt-1 text-[0.68rem]" style={{ color: T.muted }}>Answered now: {now}</p>
        : r.lastResults === 0 ? <p className="mt-1 text-[0.68rem]" style={{ color: T.muted }}>If it’s a real Calgary organization with no profile, add one (docs/search-gap-profiles.md). <a href={`https://www.google.com/search?q=${encodeURIComponent(`"${r.q}" Calgary`)}`} target="_blank" rel="noopener noreferrer" className="underline">Look it up ↗</a></p>
        : null}
      </div>
      <span className="w-20 text-right text-[0.68rem] tabular-nums" style={{ fontFamily: mono, color: T.muted }}>{r.searches} {r.searches === 1 ? 'search' : 'searches'}</span>
      <span className="w-20 text-right">
        {r.lastResults === 0
          ? <Chip tone={now ? 'ok' : 'attention'}>{now ? 'answered' : 'no results'}</Chip>
          : <span className="text-[0.68rem] tabular-nums" style={{ fontFamily: mono, color: T.muted }}>{r.lastResults} {r.lastResults === 1 ? 'result' : 'results'}</span>}
      </span>
    </li>
  );
}
