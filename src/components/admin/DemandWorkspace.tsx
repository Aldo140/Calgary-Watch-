import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { Link } from 'react-router-dom';
import { Search, SearchX } from 'lucide-react';
import { db } from '../../firebase';
import { SEARCH_DEMAND, summarizeDemand, type DemandRow } from '../../lib/searchDemand';
import { describeAnswer, parseSearchIntent } from '../../lib/searchIntent';
import { AdminButton, Chip, EmptyState, Panel, StatGrid, StatTile, T, mono } from './ui';

const WINDOWS = [7, 30, 90] as const;

/**
 * Search demand: what people typed into CalgaryWatch search, grouped.
 * "Found nothing" is the business list: events, places and topics people
 * want that the site doesn't carry yet. Read once per window change
 * (capped at 2,000 rows), never live, to stay inside the free read quota.
 */
export function DemandWorkspace() {
  const [days, setDays] = useState<(typeof WINDOWS)[number]>(30);
  const [rows, setRows] = useState<Array<{ q: string; results: number; ts: number }> | null>(null);
  const [error, setError] = useState('');
  const [attempt,setAttempt]=useState(0);

  useEffect(() => {
    if (!db) { setRows([]); return; }
    let live = true;
    setRows(null); setError('');
    getDocs(query(collection(db, SEARCH_DEMAND), where('ts', '>=', Date.now() - days * 86_400_000), orderBy('ts', 'desc'), limit(2000)))
      .then((snap) => { if (live) setRows(snap.docs.map((d) => d.data() as { q: string; results: number; ts: number })); })
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
        <span className="text-xs" style={{ color: T.muted }}>Anonymous: the words and the result count only.</span>
      </div>
      {error ? <Panel title="Couldn’t load searches"><AdminButton variant="outline" onClick={()=>setAttempt(n=>n+1)}>Retry searches</AdminButton><p className="p-4 text-sm" style={{ color: T.critical }}>{error} If this says permission denied, deploy the Firestore rules (Deploy Firebase Backend → rules).</p></Panel> : null}
      {!error&&<>
      <StatGrid>
        <StatTile label="Searches" value={rows ? total : null} hint={`Last ${days} days`} />
        <StatTile label="Distinct terms" value={rows ? terms.length : null} />
        <StatTile label="Found nothing" value={rows ? misses.length : null} tone={misses.length ? 'attention' : 'neutral'} hint={`Of ${terms.length} terms, the latest search had no results`} />
        <StatTile label="Hit rate" value={rows && total ? Math.round((1 - (rows.filter((r) => r.results === 0).length / total)) * 100) : null} unit="%" />
      </StatGrid>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Looked for, not found" subtitle="What to list next. Each is a real search that came back empty.">
          {rows === null ? <p className="p-4 text-sm" style={{ color: T.muted }}>Loading…</p>
            : misses.length ? <TermList rows={misses.slice(0, 25)} miss />
            : <EmptyState icon={<SearchX size={20} />} title="Nothing missed" body="Every recent search found at least one listing." />}
        </Panel>
        <Panel title="Most searched" subtitle="Open a term to see what a resident sees.">
          {rows === null ? <p className="p-4 text-sm" style={{ color: T.muted }}>Loading…</p>
            : terms.length ? <TermList rows={terms.slice(0, 25)} />
            : <EmptyState icon={<Search size={20} />} title="No searches yet" body="Searches appear here once people use the site search." />}
        </Panel>
      </div>
      </>}
    </div>
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
      {rows.map((r) => {
        // Searches recorded before search understood neighbourhoods, streets and
        // "yesterday police" stay at 0 found; say what the same words get today.
        const now = r.lastResults === 0 ? describeAnswer(parseSearchIntent(r.q)) : null;
        return (
          <li key={r.q} className="flex items-center gap-3 px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <Link to={`/search?q=${encodeURIComponent(r.q)}`} target="_blank" className="text-sm font-semibold hover:underline" style={{ color: T.ink }}>{r.q}</Link>
              <div className="mt-1 h-1.5 rounded-full" style={{ background: `${miss ? T.attention : T.signal}1F` }}>
                <div className="h-full rounded-full" style={{ width: `${(r.searches / max) * 100}%`, background: miss ? T.attention : T.signal }} />
              </div>
              {now ? <p className="mt-1 text-[0.68rem]" style={{ color: T.muted }}>Answered now: {now}</p> : null}
            </div>
            <span className="w-20 text-right text-[0.68rem] tabular-nums" style={{ fontFamily: mono, color: T.muted }}>{r.searches} {r.searches === 1 ? 'search' : 'searches'}</span>
            <span className="w-20 text-right">
              {r.lastResults === 0
                ? <Chip tone={now ? 'ok' : 'attention'}>{now ? 'answered' : 'no results'}</Chip>
                : <span className="text-[0.68rem] tabular-nums" style={{ fontFamily: mono, color: T.muted }}>{r.lastResults} {r.lastResults === 1 ? 'result' : 'results'}</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
