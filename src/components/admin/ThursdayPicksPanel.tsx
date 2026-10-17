import {adminFirestoreActionError} from '../../lib/firestoreErrors';
import { useEffect, useMemo, useState } from 'react';
import { collection, getCountFromServer, getDocs, limit, query, where } from 'firebase/firestore';
import { AlertTriangle, CalendarHeart, Eye, Mail, MapPin, Users } from 'lucide-react';
import { db } from '../../firebase';
import { consentRefusal, digestWeekKey } from '../../lib/digest';
import { eventsConsentRefusal } from '../../lib/eventsDigest';
import { normalizeInterests } from '../../lib/eventPicks';
import type { UserProfile } from '../../hooks/useAdminData';
import { Chip, EmptyState, Figure, Panel, StatGrid, StatTile, T, mono } from './ui';

type Raw = Record<string, unknown> & { uid: string };

export interface ThursdayData {
  errors?:string[];
  thursday: Raw[] | null;
  accounts?: number;
  pendingUnsubs?: number;
  ledger: Array<{ status?: string; mode?: string; first?: boolean }> | null;
  week: string;
}

/**
 * The Thursday list, read once for the whole planner: the segment overview
 * and the readers view both need it, and two components reading the same
 * thousand profiles would double the cost for nothing.
 */
export function useThursdayData(fixture?: Raw[]): ThursdayData {
  const[readErrors,setReadErrors]=useState<Record<string,string>>({});
  const fail=(name:string,e:unknown)=>setReadErrors(p=>({...p,[name]:`${name}: ${adminFirestoreActionError(e)}`}));
  const [thursday, setThursday] = useState<Raw[] | null>(null);
  const [accounts, setAccounts] = useState<number | undefined>();
  const [pendingUnsubs, setPendingUnsubs] = useState<number | undefined>();
  const [ledger, setLedger] = useState<Array<{ status?: string; mode?: string; first?: boolean }> | null>(null);
  const week = digestWeekKey(Date.now());

  useEffect(() => {
    if (!db) { setThursday(fixture ?? []); setLedger([]); return; }
    const database = db;setReadErrors({});
    getDocs(query(collection(database, 'users'), where('eventsDigestOptIn', '==', true), limit(1000)))
      .then((s) => setThursday(s.docs.map((d) => ({ ...d.data(), uid: d.id }))))
      .catch(e=>fail('Event-picks readers',e));
    getCountFromServer(collection(database, 'users')).then((s) => setAccounts(s.data().count)).catch(e=>fail('Account count',e));
    getCountFromServer(query(collection(database, 'events_digest_unsubscribes'), where('processedAt', '==', null))).then((s) => setPendingUnsubs(s.data().count)).catch(e=>fail('Pending unsubscribes',e));
    getDocs(query(collection(database, 'events_digest_sends'), where('weekKey', '==', week), limit(1000)))
      .then((s) => setLedger(s.docs.map((d) => d.data())))
      .catch(e=>fail('Event-picks delivery log',e));
  }, [week, fixture]);

  return { thursday, accounts, pendingUnsubs, ledger, week, errors:Object.values(readErrors) };
}

/**
 * Thursday picks, from the admin side: who is on which list, who will
 * actually receive Thursday's email and why anyone won't, and what this
 * week's run did. Every Thursday email itself lives in the planner's
 * "Every email" gallery.
 */
export function ThursdayPicksPanel({ mondayProfiles, data }: { mondayProfiles: UserProfile[]; data: ThursdayData }) {
  const { thursday, accounts, pendingUnsubs, ledger, week } = data;

  const m = useMemo(() => {
    const mon = new Set(mondayProfiles.map((p) => p.uid));
    // Readers Monday can mail. If they are on Thursday too, Monday's email
    // covers both lists (the combined week, or the welcome as their one
    // hello), and the Thursday sender skips them.
    const mondayMailable = new Set(mondayProfiles.filter((p) => !consentRefusal(p)).map((p) => p.uid));
    const thu = thursday ?? [];
    const both = thu.filter((p) => mon.has(p.uid)).length;
    const refusals = new Map<string, number>();
    let eligible = 0, covered = 0, noArea = 0, noInterests = 0, first = 0;
    for (const p of thu) {
      const r = eventsConsentRefusal({
        uid: p.uid, email: p.email as string | undefined, eventsDigestOptIn: p.eventsDigestOptIn === true,
        eventsDigestOptInAt: typeof p.eventsDigestOptInAt === 'number' ? p.eventsDigestOptInAt : null, eventInterests: normalizeInterests(p.eventInterests),
      });
      if (r) { refusals.set(r, (refusals.get(r) ?? 0) + 1); continue; }
      if (mondayMailable.has(p.uid)) { covered += 1; continue; }
      eligible += 1;
      if (!(p.neighborhood || p.inferredNeighborhood)) noArea += 1;
      if (!normalizeInterests(p.eventInterests).length) noInterests += 1;
      if (!p.eventsWelcomeSentAt) first += 1;
    }
    const neither = accounts !== undefined ? Math.max(0, accounts - mon.size - thu.length + both) : undefined;
    return { both, mondayOnly: mon.size - both, thursdayOnly: thu.length - both, neither, eligible, covered, refusals, noArea, noInterests, first };
  }, [mondayProfiles, thursday, accounts]);

  const sent = (ledger ?? []).filter((l) => l.status === 'sent');
  const byMode = sent.reduce<Record<string, number>>((acc, l) => { const k = l.mode ?? 'picks'; acc[k] = (acc[k] ?? 0) + 1; return acc; }, {});

  if(data.errors?.length)return <Panel title="Reader data could not be loaded">{data.errors.map(error=><p key={error} role="alert">{error}</p>)}</Panel>;
  return (
    <div className="space-y-4">
      <Panel title="Who is on which list" subtitle="Every account falls into exactly one of these. People on both lists get one email a week, on Monday. Each email offers the other list only to people not on it.">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-px" style={{ background: T.line }}>
          {[
            { label: 'Both lists', value: thursday ? m.both : undefined, note: 'One Monday email, no Thursday', tone: 'ok' as const },
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
        <StatTile label="Will get a Thursday email" value={thursday ? m.eligible : undefined} tone="ok" hint={m.covered ? `Thursday-only readers. The ${m.covered} on both lists get their picks in Monday’s email instead` : `Thursday-only readers, before skips for empty weeks · ${week}`} />
        <StatTile label="First Thursday email" value={thursday ? m.first : undefined} hint="Thursday-only readers get the hello version. Both-list readers get their hello on Monday" />
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

    </div>
  );
}
