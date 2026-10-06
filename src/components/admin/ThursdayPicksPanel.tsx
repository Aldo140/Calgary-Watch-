import { useEffect, useMemo, useState } from 'react';
import { collection, getCountFromServer, getDocs, limit, query, where } from 'firebase/firestore';
import { AlertTriangle, CalendarHeart, Eye, Mail, MapPin, Users } from 'lucide-react';
import { db } from '../../firebase';
import { digestWeekKey } from '../../lib/digest';
import { eventsConsentRefusal } from '../../lib/eventsDigest';
import { normalizeInterests } from '../../lib/eventPicks';
import type { UserProfile } from '../../hooks/useAdminData';
import { Chip, EmptyState, Figure, Panel, StatGrid, StatTile, T, mono } from './ui';

type Raw = Record<string, unknown> & { uid: string };

const CASES = [
  { file: 'thursday-first.html', label: 'First email', who: 'Every reader’s first Thursday', note: 'Opens with a short hello, then their picks. Offers Monday if they don’t get it.' },
  { file: 'thursday.html', label: 'Picks + reminders', who: 'A reader who said “I’m going”', note: 'Reminders first, then up to eight picks matched to their interests, nearest given a head start.' },
  { file: 'thursday-fallback.html', label: 'Nothing matched', who: 'Interests with no listings this week', note: 'Says so plainly, then up to five things that are on. Never an empty email.' },
  { file: 'thursday-going-only.html', label: 'Reminder only', who: 'Nothing new, but going to something', note: 'Just the reminder.' },
  { file: 'thursday-no-area.html', label: 'No home area', who: 'Picks without a neighbourhood', note: 'No distances, and a one-line prompt to add their area.' },
  { file: 'digest.html', label: 'Monday, Monday-only', who: 'Monday reader not on Thursday', note: 'The Monday brief with one Thursday offer at the bottom.' },
  { file: 'digest-both.html', label: 'Monday, both lists', who: 'Reader on both lists', note: 'The Monday brief with no offers.' },
] as const;

/**
 * Thursday picks, from the admin side: who is on which list, who will
 * actually receive Thursday's email and why anyone won't, what this week's
 * run did, and the exact email for every case the sender can produce.
 */
export function ThursdayPicksPanel({ mondayProfiles }: { mondayProfiles: UserProfile[] }) {
  const [thursday, setThursday] = useState<Raw[] | null>(null);
  const [accounts, setAccounts] = useState<number | undefined>();
  const [pendingUnsubs, setPendingUnsubs] = useState<number | undefined>();
  const [ledger, setLedger] = useState<Array<{ status?: string; mode?: string; first?: boolean }> | null>(null);
  const [preview, setPreview] = useState<(typeof CASES)[number]['file']>('thursday-first.html');
  const [html, setHtml] = useState('');
  const week = digestWeekKey(Date.now());

  useEffect(() => {
    if (!db) { setThursday([]); setLedger([]); return; }
    const database = db;
    getDocs(query(collection(database, 'users'), where('eventsDigestOptIn', '==', true), limit(1000)))
      .then((s) => setThursday(s.docs.map((d) => ({ ...d.data(), uid: d.id }))))
      .catch(() => setThursday([]));
    getCountFromServer(collection(database, 'users')).then((s) => setAccounts(s.data().count)).catch(() => {});
    getCountFromServer(query(collection(database, 'events_digest_unsubscribes'), where('processedAt', '==', null))).then((s) => setPendingUnsubs(s.data().count)).catch(() => {});
    getDocs(query(collection(database, 'events_digest_sends'), where('weekKey', '==', week), limit(1000)))
      .then((s) => setLedger(s.docs.map((d) => d.data())))
      .catch(() => setLedger([]));
  }, [week]);

  useEffect(() => {
    let live = true;
    setHtml('');
    fetch(`${import.meta.env.BASE_URL}email-previews/${preview}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.text() : Promise.reject()))
      .then((t) => { if (live) setHtml(t); })
      .catch(() => { if (live) setHtml(''); });
    return () => { live = false; };
  }, [preview]);

  const m = useMemo(() => {
    const mon = new Set(mondayProfiles.map((p) => p.uid));
    const thu = thursday ?? [];
    const both = thu.filter((p) => mon.has(p.uid)).length;
    const refusals = new Map<string, number>();
    let eligible = 0, noArea = 0, noInterests = 0, first = 0;
    for (const p of thu) {
      const r = eventsConsentRefusal({
        uid: p.uid, email: p.email as string | undefined, eventsDigestOptIn: p.eventsDigestOptIn === true,
        eventsDigestOptInAt: typeof p.eventsDigestOptInAt === 'number' ? p.eventsDigestOptInAt : null, eventInterests: normalizeInterests(p.eventInterests),
      });
      if (r) { refusals.set(r, (refusals.get(r) ?? 0) + 1); continue; }
      eligible += 1;
      if (!(p.neighborhood || p.inferredNeighborhood)) noArea += 1;
      if (!normalizeInterests(p.eventInterests).length) noInterests += 1;
      if (!p.eventsWelcomeSentAt) first += 1;
    }
    const neither = accounts !== undefined ? Math.max(0, accounts - mon.size - thu.length + both) : undefined;
    return { both, mondayOnly: mon.size - both, thursdayOnly: thu.length - both, neither, eligible, refusals, noArea, noInterests, first };
  }, [mondayProfiles, thursday, accounts]);

  const sent = (ledger ?? []).filter((l) => l.status === 'sent');
  const byMode = sent.reduce<Record<string, number>>((acc, l) => { const k = l.mode ?? 'picks'; acc[k] = (acc[k] ?? 0) + 1; return acc; }, {});
  const active = CASES.find((c) => c.file === preview)!;

  return (
    <div className="space-y-4">
      <Panel title="Who gets which email" subtitle="Every account falls into exactly one of these. Each email offers the other list only to people not on it.">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-px" style={{ background: T.line }}>
          {[
            { label: 'Both emails', value: thursday ? m.both : undefined, note: 'Monday + Thursday, no offers', tone: 'ok' as const },
            { label: 'Monday only', value: thursday ? m.mondayOnly : undefined, note: 'Sees the Thursday offer', tone: 'signal' as const },
            { label: 'Thursday only', value: thursday ? m.thursdayOnly : undefined, note: 'Sees the Monday offer', tone: 'signal' as const },
            { label: 'Neither', value: m.neither, note: 'Account, no email', tone: 'neutral' as const },
          ].map((c) => (
            <div key={c.label} className="p-4" style={{ background: T.card }}>
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.08em]" style={{ color: T.muted }}>{c.label}</p>
              <div className="mt-2"><Figure value={c.value} size="lg" tone={c.tone} /></div>
              <p className="mt-1.5 text-[0.7rem]" style={{ color: T.muted }}>{c.note}</p>
            </div>
          ))}
        </div>
      </Panel>

      <StatGrid>
        <StatTile label="Will get Thursday’s email" value={thursday ? m.eligible : undefined} tone="ok" hint={`Before skips for empty weeks · week ${week}`} />
        <StatTile label="First Thursday email" value={thursday ? m.first : undefined} hint="Gets the hello version" />
        <StatTile label="No home area" value={thursday ? m.noArea : undefined} tone={m.noArea ? 'attention' : 'neutral'} hint="Picks without distances; asked to add one" />
        <StatTile label="Opt-outs waiting" value={pendingUnsubs} tone={pendingUnsubs ? 'attention' : 'neutral'} hint="Honoured at the start of the next run" />
      </StatGrid>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Won’t be sent, and why" subtitle="Opted in, but the sender refuses until this is fixed">
          {thursday === null ? <p className="p-4 text-sm" style={{ color: T.muted }}>Loading…</p>
            : m.refusals.size || m.noInterests ? (
              <ul className="divide-y" style={{ borderColor: T.line }}>
                {[...m.refusals.entries()].map(([r, n]) => (
                  <li key={r} className="flex items-center gap-3 px-4 py-2.5 text-sm"><AlertTriangle size={14} style={{ color: T.attention }} /><span className="flex-1" style={{ color: T.ink }}>{({ 'no-consent-timestamp': 'No opt-in date on record', 'no-email': 'No email address', 'invalid-email': 'Email address looks invalid', 'not-opted-in': 'Not opted in' } as Record<string, string>)[r] ?? r}</span><Figure value={n} size="sm" /></li>
                ))}
                {m.noInterests ? <li className="flex items-center gap-3 px-4 py-2.5 text-sm"><CalendarHeart size={14} style={{ color: T.muted }} /><span className="flex-1" style={{ color: T.ink }}>No interests (gets “a bit of everything”)</span><Figure value={m.noInterests} size="sm" /></li> : null}
              </ul>
            ) : <EmptyState icon={<Mail size={20} />} title="Everyone opted in can be mailed" />}
        </Panel>
        <Panel title={`This week’s run · ${week}`} subtitle="From the Thursday send ledger">
          {ledger === null ? <p className="p-4 text-sm" style={{ color: T.muted }}>Loading…</p>
            : sent.length ? (
              <div className="p-4 space-y-3">
                <div className="flex items-baseline gap-2"><Figure value={sent.length} size="lg" tone="ok" /><span className="text-sm" style={{ color: T.muted }}>sent{sent.filter((l) => l.first).length ? ` · ${sent.filter((l) => l.first).length} first emails` : ''}</span></div>
                <div className="flex flex-wrap gap-1.5">{Object.entries(byMode).map(([k, n]) => <Chip key={k} tone={k === 'picks' ? 'ok' : 'neutral'}>{({ picks: 'Picks', fallback: 'Nothing matched', 'going-only': 'Reminder only' } as Record<string, string>)[k] ?? k} <b style={{ fontFamily: mono }}>{n}</b></Chip>)}</div>
                <p className="text-xs" style={{ color: T.muted }}>Readers with nothing on at all were skipped, not sent an empty email.</p>
              </div>
            ) : <EmptyState icon={<Users size={20} />} title="Not sent yet this week" body="Thursday picks go out Thursdays at 8:00 a.m. Calgary time. Run the workflow by hand for a dry run." />}
        </Panel>
      </div>

      <Panel title="Every email, every case" subtitle="The production template with sample data. Real sends use each reader’s interests, area and plans." padded={false}>
        <div className="p-3 sm:p-4 flex gap-1.5 overflow-x-auto" style={{ background: T.surface }}>
          {CASES.map((c) => (
            <button key={c.file} type="button" aria-pressed={c.file === preview} onClick={() => setPreview(c.file)} className="shrink-0 rounded-lg border px-3 py-2 text-left" style={{ background: c.file === preview ? T.card : 'transparent', borderColor: c.file === preview ? T.signal : T.line, minWidth: '10rem' }}>
              <span className="block text-xs font-bold" style={{ color: c.file === preview ? T.signal : T.ink }}>{c.label}</span>
              <span className="block text-[0.66rem]" style={{ color: T.muted }}>{c.who}</span>
            </button>
          ))}
        </div>
        <div className="px-4 py-3 border-y text-xs flex flex-wrap items-center gap-2" style={{ borderColor: T.line, color: T.muted }}>
          {active.file.startsWith('digest') ? <Chip tone="signal"><MapPin size={11} /> Monday</Chip> : <Chip tone="ok"><CalendarHeart size={11} /> Thursday</Chip>}
          <span className="flex-1">{active.note}</span>
          <a href={`${import.meta.env.BASE_URL}email-previews/${active.file}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-bold" style={{ color: T.ink }}><Eye size={13} /> Full size</a>
        </div>
        <div className="p-3 sm:p-5" style={{ background: T.surface }}>
          <div className="mx-auto max-w-[42rem] overflow-hidden rounded-xl border bg-white" style={{ borderColor: T.line }}>
            {html ? <iframe srcDoc={html} title={`${active.label} email preview`} className="block h-[46rem] w-full" sandbox="" /> : <p className="p-8 text-center text-sm" style={{ color: T.muted }}>Previews are built with the site. Run <code>npm run build</code> (or the deploy) to refresh them.</p>}
          </div>
        </div>
      </Panel>
    </div>
  );
}
