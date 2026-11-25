import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { Link } from 'react-router-dom';
import { MousePointerClick } from 'lucide-react';
import { db } from '../../firebase';
import { discoveryRepository } from '../../data/discovery';
import { entityPath } from '../../lib/discovery';
import { SEARCH_CLICK, readClickRecords, reachedBusiness, summarizeClicks, type ActionCounts, type SearchClickRecord } from '../../lib/searchClicks';
import { EmptyState, Panel, StatGrid, StatTile, T, mono } from './ui';

/** Newest-first cap on one read; product_events has no ts index for search_click, so the window is applied here. */
const READ_CAP = 3000;

interface Listing { title: string; path?: string }
function listingIndex(): Map<string, Listing> {
  const m = new Map<string, Listing>();
  try {
    for (const e of [...discoveryRepository.list(), ...discoveryRepository.claimable()]) {
      const path = entityPath(e);
      const l = { title: e.title, path };
      m.set(e.id, l); m.set(path, l);
    }
  } catch (error) { console.warn('[admin search] Listing names unavailable', error); }
  return m;
}

/**
 * "Did searches reach businesses?" Under the search totals: for each term,
 * what people opened and whether they then called, visited the website or
 * asked for directions; for each business, how many leads it got and from
 * which words. That's the proof of value for a Featured niche. Read once per
 * window or Refresh, like the totals.
 */
export function SearchReachPanel({ days, attempt, searches }: { days: number; attempt: number; searches: ReadonlyArray<{ q: string; ts: number }> | null }) {
  const [clicks, setClicks] = useState<SearchClickRecord[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!db) { setClicks([]); return; }
    let live = true;
    setClicks(null); setError('');
    getDocs(query(collection(db, 'product_events'), where('name', '==', SEARCH_CLICK), limit(READ_CAP)))
      .then(snap => { if (live) { const since = Date.now() - days * 86_400_000; setClicks(readClickRecords(snap.docs.map(d => d.data())).filter(c => c.ts >= since)); } })
      .catch(e => { if (live) setError(e instanceof Error ? e.message : 'Could not load search clicks.'); });
    return () => { live = false; };
  }, [days, attempt]);

  const names = useMemo(listingIndex, []);
  const resolve = (ref: string) => { const l = names.get(ref); return l?.path ?? ref; };
  const summary = useMemo(() => summarizeClicks(clicks ?? [], searches ?? [], resolve), [clicks, searches, names]); // eslint-disable-line react-hooks/exhaustive-deps

  const fromSearch = (clicks ?? []).filter(c => c.q);
  const opens = fromSearch.filter(c => c.act === 'open').length;
  const leads = fromSearch.filter(c => c.act !== 'open' && c.act !== 'claim').length;
  const termsWithLead = summary.terms.filter(t => reachedBusiness(t.counts) > 0).length;
  const searchedTerms = new Set((searches ?? []).map(s => s.q)).size;

  if (error) return <Panel title="Couldn’t load search clicks"><p className="p-4 text-sm" style={{ color: T.critical }}>{error}</p></Panel>;
  return (
    <>
      <StatGrid>
        <StatTile label="Opened from search" value={clicks ? opens : null} hint={`Last ${days} days`} />
        <StatTile label="Leads from search" value={clicks ? leads : null} hint="Calls, website visits, directions, emails" tone={leads ? 'ok' : 'neutral'} />
        <StatTile label="Terms that led to a lead" value={clicks ? termsWithLead : null} hint={searchedTerms ? `Of ${searchedTerms} searched terms` : undefined} />
        <StatTile label="All profile leads" value={clicks ? (clicks.filter(c => c.from === 'profile' && c.act !== 'claim').length) : null} hint="From search or anywhere else" />
      </StatGrid>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Did searches reach businesses?" subtitle="Per search term: what people opened, then called, visited or got directions to. Anonymous.">
          {clicks === null ? <p className="p-4 text-sm" style={{ color: T.muted }}>Loading…</p>
            : summary.terms.length ? <ol className="divide-y" style={{ borderColor: T.line }}>{summary.terms.slice(0, 30).map(t => (
              <li key={t.q} className="px-4 py-2.5">
                <div className="flex items-baseline gap-2">
                  <Link to={`/search?q=${encodeURIComponent(t.q)}`} target="_blank" className="min-w-0 flex-1 truncate text-sm font-semibold hover:underline" style={{ color: T.ink }}>{t.q}</Link>
                  <span className="text-[0.68rem] tabular-nums" style={{ fontFamily: mono, color: T.muted }}>{t.searches} {t.searches === 1 ? 'search' : 'searches'} · {t.listings} {t.listings === 1 ? 'listing' : 'listings'}</span>
                </div>
                <Counts c={t.counts} />
              </li>))}</ol>
            : <EmptyState icon={<MousePointerClick size={20} />} title="No clicks yet" body="Clicks on search results, and the calls and website visits that follow, appear here." />}
        </Panel>
        <Panel title="Businesses people reached" subtitle="Per listing: opens and leads, and the searches that sent them. Use it when selling a Featured niche.">
          {clicks === null ? <p className="p-4 text-sm" style={{ color: T.muted }}>Loading…</p>
            : summary.listings.length ? <ol className="divide-y" style={{ borderColor: T.line }}>{summary.listings.slice(0, 30).map(l => {
              const named = names.get(l.key);
              return (
                <li key={l.key} className="px-4 py-2.5">
                  <div className="flex items-baseline gap-2">
                    {named?.path ? <Link to={named.path} target="_blank" className="min-w-0 flex-1 truncate text-sm font-semibold hover:underline" style={{ color: T.ink }}>{named.title}</Link>
                      : <span className="min-w-0 flex-1 truncate text-sm font-semibold" style={{ color: T.ink }}>{l.key}</span>}
                    <span className="text-[0.68rem] tabular-nums" style={{ fontFamily: mono, color: T.muted }}>{l.fromSearch} from search</span>
                  </div>
                  <Counts c={l.counts} />
                  {l.terms.length ? <p className="mt-0.5 truncate text-[0.68rem]" style={{ color: T.muted }}>Searched as: {l.terms.slice(0, 4).map(t => `${t.q} (${t.n})`).join(', ')}</p> : null}
                </li>);
            })}</ol>
            : <EmptyState icon={<MousePointerClick size={20} />} title="No businesses reached yet" body="Each business shows here once someone opens it or calls from CalgaryWatch." />}
        </Panel>
      </div>
    </>
  );
}

const LABEL: Array<[keyof ActionCounts, string]> = [['open', 'opened'], ['call', 'called'], ['site', 'website'], ['directions', 'directions'], ['email', 'emailed'], ['claim', 'claim']];
function Counts({ c }: { c: ActionCounts }) {
  const parts = LABEL.filter(([k]) => c[k] > 0);
  return (
    <p className="mt-0.5 text-[0.7rem] tabular-nums" style={{ fontFamily: mono, color: reachedBusiness(c) ? T.signal : T.muted }}>
      {parts.map(([k, label]) => `${c[k]} ${label}`).join(' · ')}
    </p>
  );
}
