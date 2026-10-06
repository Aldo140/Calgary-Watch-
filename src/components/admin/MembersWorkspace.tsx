import { useEffect, useMemo, useState } from 'react';
import { collection, getCountFromServer, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { Link } from 'react-router-dom';
import { CalendarHeart, Mail, MapPin, Ticket, Users } from 'lucide-react';
import { db } from '../../firebase';
import { discoveryRepository } from '../../data/discovery';
import { EVENT_INTERESTS, normalizeInterests, pickWhen } from '../../lib/eventPicks';
import { entityPath } from '../../lib/discovery';
import { Chip, EmptyState, Figure, Panel, StatGrid, StatTile, T, TimeAgo, mono } from './ui';
import type { AdminData } from '../../hooks/useAdminData';

type Counts = { accounts?: number; monday?: number; thursday?: number; withArea?: number; suggestions?: number };

/**
 * Members & plans: who signed up for what, what they're into, and which
 * events they're planning to go to. Totals are server-side counts (one read
 * per thousand accounts), the interest mix comes from Thursday subscribers,
 * and "most planned" is the public going tally. Nothing here is per-person
 * RSVP data; that stays private to each resident.
 */
export function MembersWorkspace({ d, onOpen }: { d: AdminData; onOpen: (section: string) => void }) {
  const [counts, setCounts] = useState<Counts>({});
  const [thursday, setThursday] = useState<Array<{ eventInterests?: unknown; neighborhood?: string; inferredNeighborhood?: string }> | null>(null);
  const [planned, setPlanned] = useState<Array<{ id: string; count: number }> | null>(null);

  useEffect(() => {
    if (!db) { setThursday([]); setPlanned([]); return; }
    const database = db;
    const users = collection(database, 'users');
    const count = (q: Parameters<typeof getCountFromServer>[0]) => getCountFromServer(q).then((s) => s.data().count).catch(() => undefined);
    void Promise.all([
      count(users),
      count(query(users, where('weeklyDigestOptIn', '==', true))),
      count(query(users, where('eventsDigestOptIn', '==', true))),
      count(query(users, where('piiConsentAt', '>', 0))),
      count(query(collection(database, 'entity_submissions'), where('status', '==', 'pending'))),
    ]).then(([accounts, monday, thursday, withArea, suggestions]) => setCounts({ accounts, monday, thursday, withArea, suggestions }));
    getDocs(query(users, where('eventsDigestOptIn', '==', true), limit(500)))
      .then((s) => setThursday(s.docs.map((x) => x.data())))
      .catch(() => setThursday([]));
    getDocs(query(collection(database, 'event_rsvp_counts'), orderBy('count', 'desc'), limit(12)))
      .then((s) => setPlanned(s.docs.map((x) => ({ id: x.id, count: Number(x.data().count) || 0 })).filter((x) => x.count > 0)))
      .catch(() => setPlanned([]));
  }, []);

  const interestMix = useMemo(() => {
    const tally = new Map<string, number>();
    for (const p of thursday ?? []) for (const i of normalizeInterests(p.eventInterests)) tally.set(i, (tally.get(i) ?? 0) + 1);
    return EVENT_INTERESTS.map((i) => ({ ...i, n: tally.get(i.id) ?? 0 })).sort((a, b) => b.n - a.n);
  }, [thursday]);
  const maxInterest = Math.max(1, ...interestMix.map((i) => i.n));

  const areas = useMemo(() => {
    const tally = new Map<string, number>();
    for (const u of d.users) {
      const a = (u.neighborhood || u.inferredNeighborhood || '').trim();
      if (a) tally.set(a, (tally.get(a) ?? 0) + 1);
    }
    return [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [d.users]);

  const entities = discoveryRepository.list();
  const recent = [...d.users].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)).slice(0, 8);
  const pct = (n?: number) => (n !== undefined && counts.accounts ? Math.round((n / counts.accounts) * 100) : undefined);

  return (
    <div className="space-y-4">
      <StatGrid>
        <StatTile label="Accounts" value={counts.accounts} hint={counts.withArea !== undefined ? `${counts.withArea} with a home area (${pct(counts.withArea)}%)` : undefined} />
        <StatTile label="Monday email" value={counts.monday} tone="signal" hint={pct(counts.monday) !== undefined ? `${pct(counts.monday)}% of accounts` : undefined} onClick={() => onOpen('planner')} />
        <StatTile label="Thursday picks" value={counts.thursday} tone="signal" hint={pct(counts.thursday) !== undefined ? `${pct(counts.thursday)}% of accounts` : undefined} />
        <StatTile label="Event suggestions waiting" value={counts.suggestions} tone={counts.suggestions ? 'attention' : 'neutral'} hint="Review in Events & markets" onClick={() => onOpen('content')} />
      </StatGrid>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <Panel title="What Thursday readers are into" subtitle="Interests chosen by people who get the picks email">
          {thursday === null ? <p className="p-4 text-sm" style={{ color: T.muted }}>Loading…</p>
            : !thursday.length ? <EmptyState icon={<CalendarHeart size={20} />} title="No Thursday readers yet" body="Interests appear here as people sign up on Your CalgaryWatch." />
            : (
              <ul className="p-4 space-y-2.5">
                {interestMix.map((i) => (
                  <li key={i.id} className="grid grid-cols-[8.5rem_1fr_2.5rem] items-center gap-3">
                    <span className="text-[0.8rem] font-semibold truncate" style={{ color: T.ink }}>{i.label}</span>
                    <span className="h-2 rounded-full" style={{ background: `${T.signal}1A` }}>
                      <span className="block h-full rounded-full" style={{ width: `${(i.n / maxInterest) * 100}%`, background: T.signal }} />
                    </span>
                    <span className="text-right text-xs tabular-nums" style={{ fontFamily: mono, color: T.muted }}>{i.n}</span>
                  </li>
                ))}
              </ul>
            )}
        </Panel>

        <Panel title="Most planned" subtitle="Public “I’m going” totals">
          {planned === null ? <p className="p-4 text-sm" style={{ color: T.muted }}>Loading…</p>
            : !planned.length ? <EmptyState icon={<Ticket size={20} />} title="No plans yet" body="Totals appear once residents tap “I’m going” on events." />
            : (
              <ol className="divide-y" style={{ borderColor: T.line }}>
                {planned.map((p, n) => {
                  const e = entities.find((x) => x.id === p.id);
                  return (
                    <li key={p.id} className="flex items-center gap-3 px-4 py-2.5">
                      <span className="w-5 text-xs tabular-nums" style={{ fontFamily: mono, color: T.muted }}>{String(n + 1).padStart(2, '0')}</span>
                      <div className="min-w-0 flex-1">
                        {e ? <Link to={entityPath(e)} target="_blank" className="block text-sm font-semibold truncate hover:underline" style={{ color: T.ink }}>{e.title}</Link>
                          : <span className="block text-sm font-semibold truncate" style={{ color: T.muted }}>Past or unpublished listing</span>}
                        {e && e.kind === 'event' ? <span className="text-[0.7rem]" style={{ fontFamily: mono, color: T.muted }}>{pickWhen(e.start)}</span> : null}
                      </div>
                      <Figure value={p.count} size="sm" tone="signal" />
                    </li>
                  );
                })}
              </ol>
            )}
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Where members live" subtitle={`Home areas across the ${d.users.length} most recent accounts`}>
          {areas.length ? (
            <ul className="p-4 flex flex-wrap gap-2">
              {areas.map(([a, n]) => <li key={a}><Chip tone="neutral"><MapPin size={11} /> {a} <b style={{ fontFamily: mono }}>{n}</b></Chip></li>)}
            </ul>
          ) : <EmptyState icon={<MapPin size={20} />} title="No home areas yet" />}
        </Panel>
        <Panel title="Newest members" subtitle="And which emails they chose">
          {recent.length ? (
            <ul className="divide-y" style={{ borderColor: T.line }}>
              {recent.map((u) => {
                const raw = u as typeof u & { eventsDigestOptIn?: boolean };
                return (
                  <li key={u.uid} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="h-8 w-8 shrink-0 grid place-items-center rounded-full text-xs font-bold" style={{ background: '#EEF3FA', color: T.signal }}>{(u.displayName || '?').slice(0, 1)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold truncate" style={{ color: T.ink }}>{u.displayName || 'Unnamed'}</p>
                      <p className="text-[0.7rem]" style={{ color: T.muted }}><TimeAgo ts={u.createdAt} />{(u.neighborhood || u.inferredNeighborhood) ? ` · ${u.neighborhood || u.inferredNeighborhood}` : ''}</p>
                    </div>
                    <span className="flex gap-1">
                      {u.weeklyDigestOptIn ? <Chip tone="signal"><Mail size={11} /> Mon</Chip> : null}
                      {raw.eventsDigestOptIn ? <Chip tone="ok"><Mail size={11} /> Thu</Chip> : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : <EmptyState icon={<Users size={20} />} title="No members yet" />}
        </Panel>
      </div>
    </div>
  );
}
