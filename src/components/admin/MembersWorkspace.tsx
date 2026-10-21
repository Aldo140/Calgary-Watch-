import {useAdminView} from '../../hooks/useAdminView';
import {WorkspaceTabs} from './WorkspaceTabs';
import {adminFirestoreActionError} from '../../lib/firestoreErrors';
import { useEffect, useMemo, useState } from 'react';
import { collection, getCountFromServer, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import inventory from '../../generated/discovery-index.json';
import { Link } from 'react-router-dom';
import { CalendarHeart, Mail, MapPin, Ticket, Users } from 'lucide-react';
import { db } from '../../firebase';
import { discoveryRepository } from '../../data/discovery';
import { EVENT_INTERESTS, normalizeInterests, pickWhen } from '../../lib/eventPicks';
import { entityPath } from '../../lib/discovery';
import { RSVPS } from '../../lib/plans';
import { SUPPLY_DAYS, interestSupply, tallyAreas, tallyPlans, type Planned } from '../../lib/memberInsights';
import type { DiscoveryEntity } from '../../types/discovery';
import { Chip, EmptyState, Figure, Panel, StatGrid, StatTile, T, TimeAgo, mono } from './ui';
import type { AdminData } from '../../hooks/useAdminData';
import { MembersDirectory } from './MembersDirectory';

type Counts = { accounts?: number; monday?: number; thursday?: number; withArea?: number; suggestions?: number };
const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton', month: 'short', day: 'numeric' });

/** Every listing the export knows, including ones that have ended or aged out, so old plans keep their names. */
const exported = new Map((inventory.entities as Array<{ id: string; title: string }>).map((e) => [e.id, e]));

/**
 * Members & plans: who signed up for what, what they're into, and which
 * events they're planning to go to. Totals are server-side counts (one read
 * per thousand accounts), the interest mix comes from Thursday subscribers,
 * and "most planned" is the public going tally. Nothing here is per-person
 * RSVP data; that stays private to each resident.
 */
export function MembersWorkspace({ d, onOpen }: { d: AdminData; onOpen: (section: string) => void }) {
  const [view,setView]=useAdminView(['directory','insights'] as const,'directory');
  const [readErrors,setReadErrors]=useState<Record<string,string>>({});
  const fail=(name:string,e:unknown)=>setReadErrors(p=>({...p,[name]:adminFirestoreActionError(e)}));
  const [counts, setCounts] = useState<Counts>({});
  const [thursday, setThursday] = useState<Array<{ eventInterests?: unknown; neighborhood?: string; inferredNeighborhood?: string }> | null>(null);
  const [planned, setPlanned] = useState<{ upcoming: Planned[]; past: Planned[] } | null>(null);

  useEffect(() => {
    if (!db||view!=='insights') return;
    const database = db;
    const users = collection(database, 'users');
    // Server-side counts are cheapest, but a browser or rules hiccup must not
    // leave the tiles blank: a failed count falls back to the data below.
    const count = (q: Parameters<typeof getCountFromServer>[0]) => getCountFromServer(q).then((s) => s.data().count).catch((e) => { console.warn('[members] count failed, using loaded data', e); return undefined; });
    void Promise.all([
      count(users),
      count(query(users, where('weeklyDigestOptIn', '==', true))),
      count(query(users, where('eventsDigestOptIn', '==', true))),
      Promise.resolve(undefined),
      // A capped read stands in for the pending-suggestions count when it fails.
      getCountFromServer(query(collection(database, 'entity_submissions'), where('status', '==', 'pending')))
        .then((s) => s.data().count)
        .catch(() => getDocs(query(collection(database, 'entity_submissions'), where('status', '==', 'pending'), limit(100))).then((s) => s.size).catch(() => undefined)),
    ]).then(([accounts, monday, thursday, withArea, suggestions]) => setCounts({ accounts, monday, thursday, withArea, suggestions }));
    getDocs(query(users, where('eventsDigestOptIn', '==', true), limit(500)))
      .then((s) => setThursday(s.docs.map((x) => x.data())))
      .catch(e=>fail('Reader interests',e));
    getDocs(query(collection(database, RSVPS), orderBy('start', 'desc'), limit(1000)))
      .then((s) => setPlanned(tallyPlans(s.docs.map((x) => x.data()))))
      .catch(e=>fail('Event plans',e));
  }, [view]);

  const interestMix = useMemo(() => {
    const tally = new Map<string, number>();
    for (const p of thursday ?? []) for (const i of normalizeInterests(p.eventInterests)) tally.set(i, (tally.get(i) ?? 0) + 1);
    return EVENT_INTERESTS.map((i) => ({ ...i, n: tally.get(i.id) ?? 0 })).sort((a, b) => b.n - a.n);
  }, [thursday]);
  const maxInterest = Math.max(1, ...interestMix.map((i) => i.n));

  const homes = useMemo(() => tallyAreas(d.users), [d.users]);

  const entities = discoveryRepository.list();
  const supply = useMemo(() => interestSupply(entities, discoveryRepository.occurrences()), [entities]);
  const titleOf = (id: string) => { const live = entities.find((x) => x.id === id); return { live, title: live?.title ?? exported.get(id)?.title }; };
  // Every tile has a fallback from data admin already holds, so none stays blank.
  const allUsersLoaded = d.usersLoaded && d.users.length < 200 && d.users.length >= d.totalUsers;
  const shown = {
    accounts: counts.accounts ?? (allUsersLoaded ? d.totalUsers : undefined),
    monday: counts.monday ?? (d.digestSubscribersLoaded ? d.digestSubscribers.length : undefined),
    thursday: counts.thursday ?? (thursday && thursday.length<500?thursday.length:undefined),
    withArea: counts.withArea ?? (allUsersLoaded ? d.users.filter((u) => (u.neighborhood || u.inferredNeighborhood || '').trim()).length : undefined),
    suggestions: counts.suggestions,
  };
  const pct = (n?: number) => (n !== undefined && shown.accounts ? Math.round((n / shown.accounts) * 100) : undefined);

  return (
    <div className="space-y-4">
      <WorkspaceTabs label="Member tools" value={view} onChange={setView} items={[{id:'directory',label:'Member directory',description:'Accounts, organizations and dashboards'},{id:'insights',label:'Audience insights',description:'Subscriptions, interests and plans'}]} />
      {view==='directory'?<MembersDirectory />:<>
      {Object.entries(readErrors).map(([name,error])=><p role="alert" key={name}>{name}: {error}</p>)}
      <StatGrid>
        <StatTile label="Accounts" value={shown.accounts} hint={shown.withArea !== undefined ? `${shown.withArea} with a home area (${pct(shown.withArea)}%)` : undefined} />
        <StatTile label="Monday email" value={shown.monday} tone="signal" hint={pct(shown.monday) !== undefined ? `${pct(shown.monday)}% of accounts` : undefined} onClick={() => onOpen('planner')} />
        <StatTile label="Event picks" value={shown.thursday} tone="signal" hint={pct(shown.thursday) !== undefined ? `${pct(shown.thursday)}% of accounts` : undefined} />
        <StatTile label="Event suggestions waiting" value={shown.suggestions} tone={shown.suggestions ? 'attention' : 'neutral'} hint="Review in Events & markets" onClick={() => onOpen('content')} />
      </StatGrid>



      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <Panel title="What event-picks readers are into" subtitle={`Readers who chose each interest, against listings that match it in the next ${SUPPLY_DAYS} days`}>
          {readErrors['Reader interests']?<p>Reader interests could not be loaded.</p>:thursday === null ? <p className="p-4 text-sm" style={{ color: T.muted }}>Loading…</p>
            : !thursday.length ? <EmptyState icon={<CalendarHeart size={20} />} title="No Thursday readers yet" body="Interests appear here as people sign up on Your CalgaryWatch." />
            : (
              <>
              <ul className="p-4 space-y-2.5">
                <li className="grid grid-cols-[8.5rem_1fr_2.5rem_4.5rem] items-center gap-3 text-[0.65rem] uppercase tracking-wide" style={{ fontFamily: mono, color: T.muted }} aria-hidden="true">
                  <span>Interest</span><span /><span className="text-right">Readers</span><span className="text-right">Listed</span>
                </li>
                {interestMix.map((i) => {
                  const listed = supply.get(i.id) ?? 0;
                  // Wanted by someone, but too little on the calendar to fill a Thursday email.
                  const thin = i.n > 0 && listed < 5;
                  return (
                    <li key={i.id} className="grid grid-cols-[8.5rem_1fr_2.5rem_4.5rem] items-center gap-3">
                      <span className="text-[0.8rem] font-semibold truncate" style={{ color: T.ink }}>{i.label}</span>
                      <span className="h-2 rounded-full" style={{ background: `${T.signal}1A` }}>
                        <span className="block h-full rounded-full" style={{ width: `${(i.n / maxInterest) * 100}%`, background: T.signal }} />
                      </span>
                      <span className="text-right text-xs tabular-nums" style={{ fontFamily: mono, color: T.muted }}>{i.n}</span>
                      <span className="text-right text-xs tabular-nums" style={{ fontFamily: mono, color: thin ? T.attention : T.muted }} title={thin ? 'Fewer than 5 matching listings in the window' : undefined}>{listed}{thin ? ' · thin' : ''}</span>
                    </li>
                  );
                })}
              </ul>
              {thursday.length < 30 ? <p className="px-4 pb-4 text-xs" style={{ color: T.muted }}>Only {thursday.length} {thursday.length === 1 ? 'reader has' : 'readers have'} picked interests, so one sign-up moves this order. Read it as a hint, not a ranking.</p> : null}
              </>
            )}
        </Panel>

        <Panel title="Most planned" subtitle="“I’m going” taps, coming up first">
          {readErrors['Event plans']?<p>Event plans could not be loaded.</p>:planned === null ? <p className="p-4 text-sm" style={{ color: T.muted }}>Loading…</p>
            : !planned.upcoming.length && !planned.past.length ? <EmptyState icon={<Ticket size={20} />} title="No plans yet" body="Totals appear once residents tap “I’m going” on events." />
            : (
              <div>
                {planned.upcoming.length ? <PlanList rows={planned.upcoming.slice(0, 8)} titleOf={titleOf} /> : <p className="px-4 pt-4 text-sm" style={{ color: T.muted }}>Nothing coming up has a plan on it yet.</p>}
                {planned.past.length ? (
                  <>
                    <p className="px-4 pt-4 pb-1 text-[0.65rem] uppercase tracking-wide" style={{ fontFamily: mono, color: T.muted }}>Already happened · {planned.past.reduce((n, p) => n + p.count, 0)} plans on {planned.past.length} {planned.past.length === 1 ? 'listing' : 'listings'}</p>
                    <PlanList rows={planned.past.slice(0, 4)} titleOf={titleOf} past />
                  </>
                ) : null}
              </div>
            )}
        </Panel>
      </div>

      <Panel title="Where members live" subtitle={`Home areas across the ${d.users.length} most recent accounts, matched to Calgary communities`}>
        {homes.areas.length ? (
          <div className="p-4 space-y-3">
            <ul className="flex flex-wrap gap-2" aria-label="By quadrant">
              {homes.quadrants.map(([q, n]) => <li key={q}><Chip tone="signal">{q} <b style={{ fontFamily: mono }}>{n}</b></Chip></li>)}
            </ul>
            <ul className="flex flex-wrap gap-2" aria-label="By community">
              {homes.areas.slice(0, 16).map(([a, n]) => <li key={a}><Chip tone="neutral"><MapPin size={11} /> {a} <b style={{ fontFamily: mono }}>{n}</b></Chip></li>)}
            </ul>
            {homes.addresses || homes.unmatched ? (
              <p className="text-xs" style={{ color: T.muted }}>
                {homes.addresses ? `${homes.addresses} typed a street address as their area; it isn’t shown here, and their emails now place it as an address. ` : ''}
                {homes.unmatched ? `${homes.unmatched} didn’t match a Calgary community name.` : ''}
              </p>
            ) : null}
          </div>
        ) : <EmptyState icon={<MapPin size={20} />} title="No home areas yet" />}
      </Panel>
      </>}
    </div>
  );
}

function PlanList({ rows, titleOf, past = false }: { rows: Planned[]; titleOf: (id: string) => { live?: DiscoveryEntity; title?: string }; past?: boolean }) {
  return (
    <ol className="divide-y" style={{ borderColor: T.line }}>
      {rows.map((p, n) => {
        const { live, title } = titleOf(p.id);
        const when = Number.isFinite(Date.parse(p.start)) ? (past ? `Was ${dayFmt.format(new Date(p.start))}` : pickWhen(p.start)) : '';
        return (
          <li key={p.id} className="flex items-center gap-3 px-4 py-2.5" style={past ? { opacity: 0.7 } : undefined}>
            <span className="w-5 text-xs tabular-nums" style={{ fontFamily: mono, color: T.muted }}>{String(n + 1).padStart(2, '0')}</span>
            <div className="min-w-0 flex-1">
              {live && !past ? <Link to={entityPath(live)} target="_blank" className="block text-sm font-semibold truncate hover:underline" style={{ color: T.ink }}>{live.title}</Link>
                : <span className="block text-sm font-semibold truncate" style={{ color: title ? T.ink : T.muted }}>{title ?? 'Listing no longer in the export'}</span>}
              {when ? <span className="text-[0.7rem]" style={{ fontFamily: mono, color: T.muted }}>{when}</span> : null}
            </div>
            <Figure value={p.count} size="sm" tone="signal" />
          </li>
        );
      })}
    </ol>
  );
}
