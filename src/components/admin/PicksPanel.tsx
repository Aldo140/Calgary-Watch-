/**
 * CalgaryWatch Picks, admin side (docs/cw-picks.md): who Calgarians reached
 * from each Pick desk (anonymous counts), the check-ins waiting to go out, and
 * the answers that came back. Loaded on demand, never live, to keep reads low.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { Copy, ExternalLink, RefreshCw, Star } from 'lucide-react';
import { db } from '@/src/firebase';
import { discoveryRepository } from '@/src/data/discovery';
import { serviceById } from '@/src/data/localServices';
import { PICK_FOLLOWUPS, PICK_REVIEWS, pickDeskPath, shelfFor, type PickReview } from '@/src/lib/cwPicks';
import { PICKS } from '@/src/content/cwPicks';
import { contactLine, tallyPickContacts, type PickContactEvent } from '@/src/lib/pickReport';
import { adminFirestoreActionError } from '@/src/lib/firestoreErrors';
import { PickVettingDesk } from './PickVettingDesk';
import { AdminButton, Chip, EmptyState, FilterChip, FilterRow, Panel, SkeletonRows, T, mono } from './ui';

type Followup = { list?: string; place?: string; placeName?: string; status?: string; dueAt?: number; createdAt?: number };
const WINDOWS = [7, 30, 90] as const;

export function PicksPanel() {
  const [events, setEvents] = useState<PickContactEvent[] | null>(null);
  const [followups, setFollowups] = useState<Followup[] | null>(null);
  const [reviews, setReviews] = useState<Array<PickReview & { id: string }> | null>(null);
  const [days, setDays] = useState<(typeof WINDOWS)[number]>(30);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');
  const load = useCallback(async () => {
    // Dev preview with no Firebase: render empty so the layout can be reviewed.
    if (!db) { setEvents([]); setFollowups([]); setReviews([]); return; }
    setError('');
    try {
      const [ev, fu, rv] = await Promise.all([
        getDocs(query(collection(db, 'product_events'), where('name', '==', 'pick_contact'), limit(3000))),
        getDocs(query(collection(db, PICK_FOLLOWUPS), limit(500))),
        getDocs(query(collection(db, PICK_REVIEWS), limit(300))),
      ]);
      setEvents(ev.docs.map(d => d.data() as PickContactEvent));
      // Emails are never read into the panel: only list, company and status.
      setFollowups(fu.docs.map(d => { const x = d.data(); return { list: x.list, place: x.place, placeName: x.placeName, status: x.status, dueAt: x.dueAt, createdAt: x.createdAt }; }));
      setReviews(rv.docs.map(d => ({ ...(d.data() as PickReview), id: d.id })).sort((a, b) => b.createdAt - a.createdAt));
    } catch (e) {
      setError(String(e).includes('permission') ? 'The Picks rules are not deployed yet. Run "Deploy Firebase Backend" with target rules.' : adminFirestoreActionError(e));
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const entities = useMemo(() => discoveryRepository.list(), []);
  const tally = useMemo(() => events ? tallyPickContacts(events, { days, entities }) : [], [events, days, entities]);
  const busiest = useMemo(() => new Map(tally.map(s => [s.id, { contacts: s.contacts, top: s.companies[0]?.name }])), [tally]);
  const total = tally.reduce((n, s) => n + s.contacts, 0);
  const checkIns = tally.reduce((n, s) => n + s.checkIns, 0);
  const status = (followups ?? []).reduce<Record<string, number>>((m, f) => { const k = f.status ?? 'pending'; m[k] = (m[k] ?? 0) + 1; return m; }, {});
  const answered = reviews?.filter(r => r.hired === 'yes') ?? [];
  const avg = answered.length ? answered.reduce((n, r) => n + (r.stars ?? 0), 0) / answered.length : 0;
  const copy = (text: string) => { void navigator.clipboard?.writeText(text); setCopied(text); setTimeout(() => setCopied(''), 1600); };

  if (error) return <Panel title="CalgaryWatch Picks"><p role="alert" className="text-sm" style={{ color: T.critical }}>{error}</p><AdminButton variant="outline" onClick={() => void load()}>Retry</AdminButton></Panel>;
  if (!events || !followups || !reviews) return <Panel title="CalgaryWatch Picks"><SkeletonRows /></Panel>;

  const live = Object.keys(PICKS).length;
  return (
    <div className="space-y-4">
      <Panel title="CalgaryWatch Picks" subtitle="Anonymous taps on Call and Website from the Pick desks, search and Best lists. These numbers are what a business hears from us: true counts, never a promise." action={
        <div className="flex items-center gap-2">
          <FilterRow>{WINDOWS.map(w => <FilterChip key={w} active={days === w} onClick={() => setDays(w)}>{w} days</FilterChip>)}</FilterRow>
          <AdminButton variant="outline" onClick={() => void load()}><RefreshCw size={14} /> Refresh</AdminButton>
        </div>
      }>
        <dl className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[['Contacts', total], ['Asked for a check-in', checkIns], ['Check-ins waiting', status.pending ?? 0], ['Answers in', reviews.length], ['Live Picks', `${live} of 20`]].map(([k, v]) => (
            <div key={k as string} className="rounded-xl border p-3" style={{ borderColor: T.line }}>
              <dt className="text-xs" style={{ color: T.muted }}>{k}</dt>
              <dd className="text-2xl font-bold" style={{ fontFamily: mono }}>{v}</dd>
            </div>
          ))}
        </dl>
        {answered.length ? <p className="text-sm mt-3" style={{ color: T.muted }}>Hired through us: {answered.length}, average {avg.toFixed(1)}★, {Math.round(100 * answered.filter(r => r.again).length / answered.length)}% would hire again.</p> : null}
      </Panel>

      <PickVettingDesk entities={entities} busiest={busiest} />

      <Panel title="Who Calgarians reached" subtitle="Busiest desk first. The top company on a desk without a Pick is the one to vet first. Copy a line for outreach." padded={false}>
        {!tally.length ? <EmptyState title={`No contacts in the last ${days} days`} body="Taps show up here as soon as readers call or open a site from a desk." /> : (
          <ul>{tally.map(s => {
            const shelf = shelfFor(s.id, entities);
            return (
              <li key={s.id} className="px-4 py-3 border-t" style={{ borderColor: T.line }}>
                <div className="flex flex-wrap items-center gap-2">
                  <strong>{s.label}</strong><Chip tone="signal" mono>{s.contacts}</Chip>
                  {shelf?.live ? <Chip tone="ok">Pick: {shelf.live.contender.name}</Chip> : <Chip tone="attention">No Pick yet</Chip>}
                  <span className="text-xs" style={{ color: T.muted }}>{Object.entries(s.bySource).map(([k, v]) => `${v} via ${k}`).join(' · ')}</span>
                  <Link className="text-xs inline-flex items-center gap-1 ml-auto" style={{ color: T.signal }} to={pickDeskPath(s.id)}>Desk <ExternalLink size={12} /></Link>
                </div>
                <ol className="mt-2 grid gap-1">{s.companies.slice(0, 6).map((c, i) => (
                  <li key={c.key} className="flex flex-wrap items-center gap-2 text-sm">
                    <span style={{ fontFamily: mono, color: T.muted }}>{String(i + 1).padStart(2, '0')}</span>
                    <span className="font-semibold">{c.name}</span>
                    <span style={{ color: T.muted }}>{c.calls} calls · {c.sites} sites{c.checkIns ? ` · ${c.checkIns} check-ins` : ''}</span>
                    {i === 0 && !shelf?.live ? <Chip tone="attention">Vet first</Chip> : null}
                    <button type="button" className="ml-auto text-xs inline-flex items-center gap-1" style={{ color: T.signal }} onClick={() => copy(contactLine(c, days))}>
                      <Copy size={12} /> {copied === contactLine(c, days) ? 'Copied' : 'Copy line'}
                    </button>
                  </li>
                ))}</ol>
              </li>
            );
          })}</ul>
        )}
      </Panel>

      <Panel title="What neighbours said" subtitle="Every answer, newest first. Read before anything is used; answers decide whether a Pick keeps its seal." padded={false}>
        {!reviews.length ? <EmptyState title="No answers yet" body={`${status.sent ?? 0} check-in emails sent so far. The first answers arrive about a week after the first opt-ins.`} /> : (
          <ul>{reviews.map(r => (
            <li key={r.id} className="px-4 py-3 border-t text-sm" style={{ borderColor: T.line }}>
              <div className="flex flex-wrap items-center gap-2">
                <strong>{shelfFor(r.list, entities)?.contenders.find(c => c.key === r.place)?.name ?? r.place}</strong>
                <span style={{ color: T.muted }}>{serviceById(r.list)?.label ?? r.list}</span>
                {r.hired === 'yes' ? <Chip tone={(r.stars ?? 0) >= 4 ? 'ok' : (r.stars ?? 0) >= 3 ? 'attention' : 'critical'}><Star size={11} /> {r.stars}</Chip> : <Chip>{r.hired === 'no' ? 'Went elsewhere' : 'Not yet'}</Chip>}
                {r.hired === 'yes' ? <span style={{ color: T.muted }}>{[r.onTime === false && 'late', r.onPrice === false && 'over quote', r.again === false && 'wouldn’t rehire'].filter(Boolean).join(' · ') || 'on time, on quote, would rehire'}</span> : null}
                <span className="ml-auto text-xs" style={{ color: T.muted }}>{new Date(r.createdAt).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}</span>
              </div>
              {r.text ? <p className="mt-1">“{r.text}”</p> : null}
            </li>
          ))}</ul>
        )}
      </Panel>
    </div>
  );
}
