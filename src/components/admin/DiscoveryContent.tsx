import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { AlertTriangle, CalendarDays, ExternalLink, Inbox, Plus, RefreshCw, Store } from 'lucide-react';
import { db } from '../../firebase';
import type { DiscoveryEntity, EntitySubmission, InventorySubmissionInput } from '../../types/discovery';
import { InventoryForm } from '../discovery/InventoryForm';
import { manageDiscovery } from '../../lib/discoveryApi';
import { AdminButton, Chip, EmptyState, FilterChip, FilterRow, Panel, T, TimeAgo, mono } from './ui';
import '../../styles/discovery.css';

type RecordRow = DiscoveryEntity & { revision: number; duplicateIds?: string[] };
type Raw = { entityId: string; input: InventorySubmissionInput; sourceId: string; sourceRecordId: string; cancelled: boolean };
type Source = { id: string; name: string; approved: boolean };
type QueuedAction = { id: string; status: 'pending' | 'applied' | 'failed'; createdAt: number; error?: string; action: { action?: string; id?: string; kind?: string } };
type Editor = { input?: InventorySubmissionInput; sourceId: string; recordId: string; submissionId?: string; cancelled?: boolean };

const STATUSES = ['pending', 'draft', 'published', 'archived'] as const;
const ACTION_LABEL = { publish: 'Verify & publish', draft: 'Unpublish', archive: 'Archive', cancel: 'Mark cancelled' } as const;
const STATUS_TONE = { pending: 'attention', draft: 'neutral', published: 'ok', archived: 'neutral' } as const;

/**
 * Events & markets moderation.
 *
 * Resident suggestions come first, because they are people waiting on us.
 * Reads are deliberately narrow: listings, pending suggestions, sources and
 * the last few queued actions — the raw source record behind a listing is
 * fetched only when that listing is opened for editing (it used to load every
 * record on every visit).
 */
export function DiscoveryContent() {
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [submissions, setSubmissions] = useState<EntitySubmission[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [queue, setQueue] = useState<QueuedAction[]>([]);
  const [filter, setFilter] = useState<(typeof STATUSES)[number]>('pending');
  const [kind, setKind] = useState<'all' | 'event' | 'market'>('all');
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [editor, setEditor] = useState<Editor | null>(null);
  const [ack, setAck] = useState(false);

  async function load() {
    if (!db) { setLoaded(true); return; }
    const database = db;
    const [events, markets, subs, srcs, actions] = await Promise.all([
      getDocs(collection(database, 'events')),
      getDocs(collection(database, 'markets')),
      getDocs(query(collection(database, 'entity_submissions'), where('status', '==', 'pending'))),
      getDocs(collection(database, 'discovery_sources')),
      getDocs(query(collection(database, 'discovery_actions'), orderBy('createdAt', 'desc'), limit(8))).catch(() => null),
    ]);
    setRecords([...events.docs, ...markets.docs].map((d) => d.data() as RecordRow));
    setSubmissions(subs.docs.map((d) => d.data() as EntitySubmission));
    setSources(srcs.docs.map((d) => d.data() as Source));
    setQueue(actions ? actions.docs.map((d) => d.data() as QueuedAction) : []);
    setLoaded(true);
  }
  useEffect(() => { void load().catch((e) => { setError(e.message); setLoaded(true); }); }, []);

  async function run(data: Record<string, unknown>) {
    setBusy(true); setError(''); setMessage('');
    try {
      const r = await manageDiscovery(data);
      await load();
      setMessage(r.queued
        ? 'Queued. The moderation job applies it within the hour, then republishes the site.'
        : 'Saved. Published changes reach the public site after the next verified export and release.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
      throw e;
    } finally {
      setBusy(false);
    }
  }
  const act = (data: Record<string, unknown>) => void run(data).catch(() => {});

  async function openRecord(r: RecordRow) {
    if (!db) return;
    setError('');
    const snap = await getDocs(query(collection(db, 'discovery_source_records'), where('entityId', '==', r.id), limit(1))).catch(() => null);
    const source = snap?.docs[0]?.data() as Raw | undefined;
    if (source) setEditor({ input: source.input, sourceId: source.sourceId, recordId: source.sourceRecordId, cancelled: source.cancelled });
    else setError('The original source record for this listing is missing, so it can’t be edited here.');
  }

  const counts = useMemo(() => Object.fromEntries(STATUSES.map((s) => [s, records.filter((r) => r.status === s && (kind === 'all' || r.kind === kind)).length])) as Record<string, number>, [records, kind]);
  const shown = records.filter((r) => r.status === filter && (kind === 'all' || r.kind === kind)).sort((a, b) => (a.title > b.title ? 1 : -1));
  const approvedSources = sources.filter((s) => s.approved);
  const pendingQueue = queue.filter((q) => q.status === 'pending').length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <AdminButton tone="signal" onClick={() => setEditor({ sourceId: approvedSources[0]?.id || '', recordId: crypto.randomUUID() })}><Plus size={15} /> Add a listing</AdminButton>
        <AdminButton variant="outline" tone="neutral" disabled={busy} onClick={() => void load().catch((e) => setError(e.message))}><RefreshCw size={14} /> Refresh</AdminButton>
        {pendingQueue ? <Chip tone="attention">{pendingQueue} change{pendingQueue > 1 ? 's' : ''} queued</Chip> : null}
        <span className="text-xs" style={{ color: T.muted }}>Verification expires after 14 days. A source change sends a listing back to review.</span>
      </div>

      {error ? <p role="alert" className="rounded-xl border px-4 py-3 text-sm font-semibold" style={{ color: T.critical, borderColor: `${T.critical}40`, background: `${T.critical}0D` }}><AlertTriangle size={14} className="inline mr-1.5" />{error}</p> : null}
      {message ? <p role="status" className="rounded-xl border px-4 py-3 text-sm font-semibold" style={{ color: T.ok, borderColor: `${T.ok}40`, background: `${T.ok}0D` }}>{message}</p> : null}

      {editor ? (
        <Panel title={editor.submissionId ? 'Review a resident’s suggestion' : 'Edit listing'} subtitle="Check every field against the organizer’s own page before saving." action={<AdminButton size="sm" variant="ghost" onClick={() => setEditor(null)}>Close</AdminButton>}>
          <div className="p-4 space-y-3 cw-admin-form">
            <label className="block text-xs font-semibold" style={{ color: T.muted }}>
              Verified source
              <select className="mt-1 block w-full h-10 rounded-lg border px-3 text-sm" style={{ borderColor: T.line, color: T.ink }} value={editor.sourceId} onChange={(e) => setEditor({ ...editor, sourceId: e.target.value })}>
                <option value="">Choose an approved source</option>
                {approvedSources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            {!approvedSources.length ? <p className="text-sm" style={{ color: T.attention }}>No approved sources yet. Run the reviewed-source import before saving listings.</p> : null}
            <InventoryForm
              key={editor.recordId}
              initial={editor.input}
              busy={busy}
              label={editor.submissionId ? 'Approve to pending review' : 'Save to pending review'}
              onSave={async (input) => {
                await run({ action: editor.submissionId ? 'review-submission' : 'save', input, sourceId: editor.sourceId, recordId: editor.recordId, id: editor.submissionId, cancelled: editor.cancelled });
                setEditor(null);
              }}
            />
          </div>
        </Panel>
      ) : null}

      <Panel title="Suggested by residents" subtitle="People waiting to hear back. Check the source, then approve or reject." action={submissions.length ? <Chip tone="attention">{submissions.length} waiting</Chip> : undefined}>
        {!loaded ? <p className="p-4 text-sm" style={{ color: T.muted }}>Loading…</p>
          : submissions.length ? (
            <ul className="divide-y" style={{ borderColor: T.line }}>
              {submissions.map((s) => (
                <li key={s.id} className="p-4 flex flex-col gap-2 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold" style={{ color: T.ink }}>{s.input.title}</p>
                    <p className="text-xs line-clamp-2" style={{ color: T.muted }}>{s.input.summary}</p>
                    <p className="mt-1 text-[0.7rem]" style={{ fontFamily: mono, color: T.muted }}>
                      {s.input.kind} · <TimeAgo ts={Date.parse(s.createdAt)} /> · <a href={s.input.sourceUrl} target="_blank" rel="noreferrer" className="underline">source <ExternalLink size={10} className="inline" /></a>
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <AdminButton size="sm" tone="signal" onClick={() => setEditor({ input: s.input, sourceId: '', recordId: `submission-${s.id}`, submissionId: s.id })}>Check & approve</AdminButton>
                    <AdminButton size="sm" variant="outline" tone="critical" disabled={busy} onClick={() => act({ action: 'review-submission', id: s.id, reject: true })}>Reject</AdminButton>
                  </div>
                </li>
              ))}
            </ul>
          ) : <EmptyState icon={<Inbox size={20} />} title="No suggestions waiting" body="When residents share an event or market from /submit, it lands here." />}
      </Panel>

      <Panel title="Listings" subtitle="Imported from organizer feeds and saved here">
        <div className="px-4 pt-3 space-y-2">
          <FilterRow>
            {STATUSES.map((s) => <FilterChip key={s} active={filter === s} onClick={() => setFilter(s)} count={counts[s]}>{s[0].toUpperCase() + s.slice(1)}</FilterChip>)}
          </FilterRow>
          <FilterRow>
            {(['all', 'event', 'market'] as const).map((k) => <FilterChip key={k} active={kind === k} onClick={() => setKind(k)}>{k === 'all' ? 'Everything' : k === 'event' ? 'Events' : 'Markets'}</FilterChip>)}
          </FilterRow>
          {filter === 'pending' && shown.some((r) => r.duplicateIds?.length) ? (
            <label className="flex items-center gap-2 text-xs font-semibold py-1" style={{ color: T.attention }}>
              <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /> I’ve checked the possible duplicates flagged below.
            </label>
          ) : null}
        </div>
        {shown.length ? (
          <ul className="divide-y mt-2" style={{ borderColor: T.line }}>
            {shown.map((r) => (
              <li key={r.id} className="p-4">
                <div className="flex flex-wrap items-start gap-3">
                  <span className="mt-0.5 h-8 w-8 shrink-0 grid place-items-center rounded-lg" style={{ background: '#EEF3FA', color: T.signal }}>{r.kind === 'event' ? <CalendarDays size={15} /> : <Store size={15} />}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold" style={{ color: T.ink }}>{r.title}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <Chip tone={STATUS_TONE[r.status as keyof typeof STATUS_TONE] ?? 'neutral'}>{r.status}</Chip>
                      {r.kind === 'event' && r.cancelled ? <Chip tone="critical">Cancelled</Chip> : null}
                      <span className="text-[0.7rem]" style={{ fontFamily: mono, color: T.muted }}>verified {r.verifiedAt ? r.verifiedAt.slice(0, 10) : 'never'} · fetched {r.fetchedAt ? r.fetchedAt.slice(0, 10) : '—'}</span>
                      {r.sources.map((s) => <a key={s.url} href={s.url} target="_blank" rel="noreferrer" className="text-[0.7rem] underline" style={{ color: T.signal }}>{s.name}</a>)}
                    </div>
                    {r.duplicateIds?.length ? <p className="mt-1.5 text-xs" style={{ color: T.attention }}>Possible duplicate of {r.duplicateIds.map((id) => records.find((e) => e.id === id)?.title || id).join(', ')}</p> : null}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5 sm:pl-11">
                  <AdminButton size="sm" variant="outline" tone="neutral" disabled={busy} onClick={() => void openRecord(r)}>Edit</AdminButton>
                  {(['publish', 'draft', 'archive', 'cancel'] as const).filter((a) => !(a === 'publish' && r.status === 'published') && !(a === 'draft' && r.status === 'draft')).map((a) => (
                    <AdminButton key={a} size="sm" tone={a === 'publish' ? 'ok' : a === 'cancel' ? 'critical' : 'neutral'} variant={a === 'publish' ? 'solid' : 'outline'}
                      disabled={busy || (a === 'publish' && !!r.duplicateIds?.length && !ack)}
                      onClick={() => act({ kind: r.kind, id: r.id, revision: r.revision, action: a, acknowledgeDuplicates: ack })}>
                      {ACTION_LABEL[a]}
                    </AdminButton>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        ) : <EmptyState icon={<CalendarDays size={20} />} title={loaded ? `No ${filter} listings` : 'Loading…'} />}
      </Panel>

      {queue.length ? (
        <Panel title="Recent queued changes" subtitle="Applied hourly by the moderation job when the Cloud Function isn’t deployed">
          <ul className="divide-y" style={{ borderColor: T.line }}>
            {queue.map((q) => (
              <li key={q.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <Chip tone={q.status === 'applied' ? 'ok' : q.status === 'failed' ? 'critical' : 'attention'}>{q.status}</Chip>
                <span className="flex-1 min-w-0 truncate" style={{ color: T.ink }}>{q.action.action ?? 'moderate'}{q.action.kind ? ` ${q.action.kind}` : ''}{q.error ? ` — ${q.error}` : ''}</span>
                <TimeAgo ts={q.createdAt} />
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}
