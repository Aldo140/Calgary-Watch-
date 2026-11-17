import { useEffect, useMemo, useState } from 'react';
import { collection, doc, getDoc, limit, onSnapshot, orderBy, query, updateDoc } from 'firebase/firestore';
import { Link } from 'react-router-dom';
import { db } from '../../firebase';
import { OWNER_EDITS, OWNER_EDITS_PER_WEEK, type OwnerEdit } from '../../lib/ownerListingEdits';
import { editTime, fieldChanges, ownerEditStats, showValue, type OwnerEditRow } from '../../lib/ownerEditStats';
import { adminFirestoreActionError as firestoreActionError, isFirestorePermissionError } from '../../lib/firestoreErrors';
import { trackSubscription } from '../../lib/readEfficiency';
import { AdminButton, Chip, Panel, StatGrid, StatTile, T } from './ui';

/** Enough history for the week and month totals without paging. */
const STATS_WINDOW = 200;
type Filter = 'all' | 'new' | 'failed' | 'admin';
const when = (t: number) => t ? new Date(t).toLocaleString('en-CA', { timeZone: 'America/Edmonton', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';

export function OwnerEditsPanel() {
  const [shown, setShown] = useState(STATS_WINDOW);
  const [rows, setRows] = useState<OwnerEditRow[] | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState('');
  const [permissionDenied, setPermissionDenied] = useState(false), [attempt, setAttempt] = useState(0), [loading, setLoading] = useState(true), [actionError, setActionError] = useState('');
  const [filter, setFilter] = useState<Filter>('all'), [business, setBusiness] = useState(''), [listed, setListed] = useState(30);
  const [names, setNames] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!db) { setLoading(false); setError('Firebase is not configured. Business updates cannot be loaded.'); return; }
    setLoading(true); setError(''); setPermissionDenied(false);
    return trackSubscription('admin:owner_updates', () => onSnapshot(query(collection(db!, OWNER_EDITS), orderBy('createdAt', 'desc'), limit(shown)), snapshot => {
      setRows(snapshot.docs.map(d => ({ id: d.id, ...d.data() as OwnerEdit })) as OwnerEditRow[]); setError(''); setPermissionDenied(false); setLoading(false);
    }, e => { setError(firestoreActionError(e)); setPermissionDenied(isFirestorePermissionError(e)); setLoading(false); }));
  }, [shown, attempt]);
  // Who's editing: member names for the uids we have, fetched once each.
  useEffect(() => {
    if (!db || !rows) return;
    const missing = [...new Set(rows.map(r => r.uid))].filter(uid => uid && !(uid in names)).slice(0, 40);
    if (!missing.length) return;
    let active = true;
    void Promise.all(missing.map(uid => getDoc(doc(db!, 'users', uid)).then(s => [uid, String(s.get('displayName') || s.get('email') || '')] as const).catch(() => [uid, ''] as const)))
      .then(found => { if (active) setNames(n => ({ ...n, ...Object.fromEntries(found) })); });
    return () => { active = false; };
  }, [rows, names]);
  const now = Date.now();
  const stats = useMemo(() => rows ? ownerEditStats(rows, now) : null, [rows]); // eslint-disable-line react-hooks/exhaustive-deps
  const who = (row: Pick<OwnerEditRow, 'uid' | 'actorRole'>) => `${row.actorRole === 'admin' ? 'Admin · ' : ''}${names[row.uid] || row.uid.slice(0, 8)}`;
  const visible = (rows ?? []).filter(r => (filter === 'all' || (filter === 'new' && r.notificationPending) || (filter === 'failed' && r.status === 'failed') || (filter === 'admin' && r.actorRole === 'admin')) && (!business || r.rootId === business));
  return <Panel title="Business listing updates" subtitle={`Owner changes publish automatically, up to ${OWNER_EDITS_PER_WEEK} times a week per business. These are notifications, not approval requests.`}>
    {error ? <div role="alert" className="rounded-lg border p-3 text-sm space-y-2" style={{ borderColor: T.line, color: T.critical }}>
      <strong>Business update notifications are unavailable.</strong><p>{error}</p>
      {permissionDenied ? <p><a className="underline" href="https://github.com/Aldo140/Calgary-Watch-/actions/workflows/deploy-firebase-backend.yml" target="_blank" rel="noreferrer">Open Firebase backend deployment</a> — deploy the rules target, then retry. This does not approve any claims.</p> : null}
      <AdminButton onClick={() => setAttempt(n => n + 1)}>Retry loading updates</AdminButton>
      {rows?.length ? <p>Previously loaded updates are shown below and may be out of date.</p> : null}
    </div> : null}
    {actionError ? <p role="alert" style={{ color: T.critical }}>{actionError}</p> : null}
    {loading && !rows ? <p role="status">Loading business updates…</p> : null}

    {stats ? <section aria-label="Update totals" className="space-y-3 mb-4">
      <StatGrid>
        <StatTile label="Updates · 7 days" value={stats.week} hint={`${stats.month} in the last 30 days`} tone="signal" />
        <StatTile label="Businesses updating · 7 days" value={stats.businessesWeek} hint={`${stats.editorsWeek} ${stats.editorsWeek === 1 ? 'person' : 'people'} editing`} />
        <StatTile label="Could not apply" value={stats.failed} hint={stats.failed ? 'Tap to see the errors' : 'No failed updates'} tone={stats.failed ? 'critical' : 'neutral'} onClick={stats.failed ? () => setFilter('failed') : undefined} />
        <StatTile label="Unread" value={stats.unread} hint={`${stats.atLimit} at the ${OWNER_EDITS_PER_WEEK}-a-week limit · ${stats.admin} admin edits`} tone={stats.unread ? 'attention' : 'neutral'} onClick={stats.unread ? () => setFilter('new') : undefined} />
      </StatGrid>
      {stats.fields.length ? <div className="text-sm"><strong>Most-changed fields · 30 days</strong>
        <div className="flex flex-wrap gap-1.5 mt-1.5">{stats.fields.slice(0, 12).map(([f, n]) => <Chip key={f} tone="neutral">{f} · {n}</Chip>)}</div>
      </div> : null}
      {stats.businesses.length ? <details open className="text-sm">
        <summary className="cursor-pointer"><strong>Who’s updating</strong> · {stats.businesses.length} businesses in the last {stats.loaded} updates</summary>
        <div className="overflow-x-auto mt-2"><table className="w-full text-sm">
          <thead><tr className="text-left text-xs" style={{ color: T.muted }}><th className="py-1.5">Business</th><th className="py-1.5 text-right">This week</th><th className="py-1.5 text-right">30 days</th><th className="py-1.5">Edited by</th><th className="py-1.5">Fields</th><th className="py-1.5">Last</th></tr></thead>
          <tbody>{stats.businesses.slice(0, 25).map(b => <tr key={b.rootId} className="border-t" style={{ borderColor: T.line }}>
            <td className="py-2 pr-2"><button type="button" className="underline text-left" onClick={() => setBusiness(business === b.rootId ? '' : b.rootId)}>{b.title}</button>{b.failed ? <> <Chip tone="critical">{b.failed} failed</Chip></> : null}</td>
            <td className="py-2 text-right">{b.week}/{OWNER_EDITS_PER_WEEK}</td>
            <td className="py-2 text-right">{b.month}</td>
            <td className="py-2 pr-2">{b.editors.map(e => e.startsWith('admin:') ? `Admin · ${names[e.slice(6)] || e.slice(6, 14)}` : names[e] || e.slice(0, 8)).join(', ')}</td>
            <td className="py-2 pr-2" style={{ color: T.muted }}>{b.fields.slice(0, 6).join(', ')}{b.fields.length > 6 ? '…' : ''}</td>
            <td className="py-2 whitespace-nowrap">{when(b.last)}</td>
          </tr>)}</tbody>
        </table></div>
      </details> : null}
    </section> : null}

    <div className="flex flex-wrap gap-2 items-center mb-2" role="group" aria-label="Filter updates">
      {(['all', 'new', 'failed', 'admin'] as const).map(f => <AdminButton key={f} size="sm" tone={filter === f ? 'signal' : 'neutral'} variant={filter === f ? 'solid' : 'outline'} onClick={() => setFilter(f)}>{f === 'all' ? 'All' : f === 'new' ? 'Unread' : f === 'failed' ? 'Failed' : 'Admin edits'}</AdminButton>)}
      {business ? <AdminButton onClick={() => setBusiness('')}>Clear business filter</AdminButton> : null}
    </div>
    {!loading && !error && rows?.length === 0 ? <p>No business updates yet.</p> : null}
    {rows && !visible.length && rows.length ? <p>No updates match this filter.</p> : null}
    {visible.slice(0, listed).map(row => {
      const changes = fieldChanges(row);
      return <details key={row.id} className="border-t py-3" style={{ borderColor: T.line }} open={row.status === 'failed'}>
        <summary className="cursor-pointer flex flex-wrap gap-2 items-center">
          <strong>{row.entityTitle}</strong>
          <Chip tone={row.status === 'failed' ? 'critical' : row.status === 'applied' ? 'ok' : 'attention'}>{row.status === 'applied' ? (row.publishedAt ? 'Published' : 'Applied; awaiting release') : row.status === 'failed' ? 'Could not apply' : 'Queued'}</Chip>
          {row.notificationPending ? <Chip tone="signal">New</Chip> : null}
          <span className="text-sm" style={{ color: T.muted }}>{who(row)} · {when(editTime(row))} · {changes.length} change{changes.length === 1 ? '' : 's'}</span>
        </summary>
        <div className="space-y-2 mt-2 text-sm">
          {row.actorRole === 'admin' ? <p>Administrator edit. The business’s weekly allowance was not used.</p> : null}
          {row.status === 'failed' ? <p style={{ color: T.critical }}>{row.error}</p> : null}
          {row.publicationWarning ? <p>{row.publicationWarning}</p> : null}
          {changes.length ? <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead><tr className="text-left text-xs" style={{ color: T.muted }}><th className="py-1">Listing</th><th className="py-1">Field</th><th className="py-1">Before</th><th className="py-1">After</th></tr></thead>
            <tbody>{changes.map((c, i) => <tr key={i} className="border-t align-top" style={{ borderColor: T.line }}><td className="py-1 pr-2">{c.listing}</td><td className="py-1 pr-2"><strong>{c.field}</strong></td><td className="py-1 pr-2" style={{ color: T.muted }}>{showValue(c.before)}</td><td className="py-1">{showValue(c.after)}</td></tr>)}</tbody>
          </table></div> : null}
          <div className="flex flex-wrap gap-2 items-center">
            <Link className="underline" to={`/plans?as=${encodeURIComponent(row.subjectUid || row.uid)}`}>View member’s dashboard</Link>
            {row.notificationPending ? <AdminButton disabled={Boolean(busy)} onClick={async () => { if (!db) return; setBusy(row.id); setActionError(''); try { await updateDoc(doc(db, OWNER_EDITS, row.id), { notificationPending: false }); } catch (e) { setActionError(firestoreActionError(e)); } finally { setBusy(''); } }}>Mark read</AdminButton> : null}
          </div>
        </div>
      </details>;
    })}
    {visible.length > listed ? <AdminButton onClick={() => setListed(n => n + 30)}>Show more</AdminButton> : null}
    {!error && rows?.length === shown && visible.length <= listed ? <AdminButton disabled={loading} onClick={() => setShown(n => n + STATS_WINDOW)}>Load older updates</AdminButton> : null}
  </Panel>;
}
