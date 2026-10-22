import {useAdminView} from '../../hooks/useAdminView';
import {SubmissionHistory} from './SubmissionHistory';
import {moderationPublicationNote} from '../../lib/moderationPublication';
import {adminSubmissionInput} from '../../lib/adminContentRecords';
import {adminObject,adminText,adminTimestamp} from '../../lib/adminRecord';
import {discoveryRepository} from '../../data/discovery';
import {adminInventory,matchesAdminInventory,normalizeAdminInventoryRow,type AdminInventoryRow} from '../../lib/adminInventory';
import {entityPath} from '../../lib/discovery';
import {Link} from 'react-router-dom';
import { firestoreActionError } from '@/src/lib/firestoreErrors';
import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { AlertTriangle, CalendarDays, ExternalLink, Inbox, Plus, RefreshCw, Store } from 'lucide-react';
import { db } from '../../firebase';
import type { DiscoveryEntity, EntitySubmission, InventorySubmissionInput } from '../../types/discovery';
import { InventoryForm } from '../discovery/InventoryForm';
import { manageDiscovery } from '../../lib/discoveryApi';
import { AdminButton, Chip, EmptyState, FilterChip, FilterRow, Panel, T, TimeAgo, mono } from './ui';
import '../../styles/discovery.css';

type RecordRow = AdminInventoryRow;
type Raw = { entityId: string; input: InventorySubmissionInput; sourceId: string; sourceRecordId: string; cancelled: boolean };
type Source = { id: string; name: string; approved: boolean; hosts: string[] };
type QueuedAction = { id: string; status: 'pending' | 'applied' | 'failed'; createdAt: number; error?: string; action: { action?: string; id?: string; kind?: string; title?: string }; result?: {stage?:string;id?:string;entityId?:string}; payload:Record<string,unknown> };
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
  const[search,setSearch]=useState('');
  const [submissionView,setSubmissionView]=useAdminView(['pending','history'] as const,'pending','submissions');
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [submissions, setSubmissions] = useState<Array<EntitySubmission & {invalidInput?:boolean}>>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [queue, setQueue] = useState<QueuedAction[]>([]);
  const [filter, setFilter] = useState<(typeof STATUSES)[number]>('pending');
  const [kind, setKind] = useState<'all' | 'event' | 'market' | 'business'>('all');
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  // Only a failed read hides the lists; a failed save shows in the banner and keeps them.
  const [loadError, setLoadError] = useState('');
  const [message, setMessage] = useState('');
  const [editor, setEditor] = useState<Editor | null>(null);
  const [ack, setAck] = useState(false);
  const [checkedSource,setCheckedSource]=useState(false);
  const [reviewDuplicates,setReviewDuplicates]=useState(false);
  const [queueError,setQueueError]=useState('');
  const [shownCount,setShownCount]=useState(24);
  useEffect(()=>{setCheckedSource(false);setReviewDuplicates(false);},[editor?.recordId]);
  useEffect(()=>setShownCount(24),[search,filter,kind]);

  async function load() {
    if (!db) { setLoaded(true); return; }
    const database = db;setLoadError('');
    const [events, markets, subs, srcs] = await Promise.all([
      getDocs(collection(database, 'events')),
      getDocs(collection(database, 'markets')),
      getDocs(query(collection(database, 'entity_submissions'), where('status', '==', 'pending'))),
      getDocs(collection(database, 'discovery_sources')),
    ]);
    setRecords(adminInventory([...events.docs.map(d=>normalizeAdminInventoryRow(d.data(),d.id,'event')),...markets.docs.map(d=>normalizeAdminInventoryRow(d.data(),d.id,'market'))],discoveryRepository.list()));
    setSubmissions(subs.docs.map(d=>{const raw=d.data(),input=adminSubmissionInput(raw.input);return {id:d.id,submittedBy:adminText(raw.submittedBy),status:'pending',createdAt:adminText(raw.createdAt),invalidInput:!input,input:input??{title:'Unreadable submission',summary:'This record has no supported event or market input. Review the source record before approving.'}} as EntitySubmission&{invalidInput?:boolean};}));
    setSources(srcs.docs.map(d=>{const raw=d.data();return {id:d.id,name:adminText(raw.name,d.id),approved:raw.approved===true,hosts:Array.isArray(raw.hosts)?raw.hosts.filter((h:unknown)=>typeof h==='string'):[]};}));
    setLoaded(true);
  }
  useEffect(() => { void load().catch((e) => { setLoadError(firestoreActionError(e)); setLoaded(true); }); }, []);

  useEffect(()=>{
    if(!db)return;let stop:(()=>void)|undefined;let previous=new Set<string>();
    const subscribe=()=>{stop?.();stop=undefined;if(document.hidden)return;
      stop=onSnapshot(query(collection(db!,'discovery_actions'),orderBy('createdAt','desc'),limit(25)),snapshot=>{
        setQueueError('');
        const next=snapshot.docs.map(d=>{const raw=d.data(),action=adminObject(raw.action),input=adminObject(action.input),result=adminObject(raw.result);return {id:d.id,status:adminText(raw.status,'pending'),createdAt:adminTimestamp(raw.createdAt)??0,error:adminText(raw.error),action:{action:adminText(action.action,'moderate'),kind:adminText(action.kind),id:adminText(action.id),title:adminText(input.title)},result:{stage:adminText(result.stage),id:adminText(result.id),entityId:adminText(result.entityId)},payload:action} as QueuedAction;});
        const completed=next.some(q=>previous.has(q.id)&&q.status!=='pending');previous=new Set(next.filter(q=>q.status==='pending').map(q=>q.id));setQueue(next);
        if(completed)void load().catch(e=>setLoadError(firestoreActionError(e)));
      },e=>setQueueError(firestoreActionError(e)));
    };subscribe();document.addEventListener('visibilitychange',subscribe);return()=>{stop?.();document.removeEventListener('visibilitychange',subscribe);};
  },[]);

  async function run(data: Record<string, unknown>) {
    setBusy(true); setError(''); setMessage('');
    try {
      const r = await manageDiscovery(data);
      await load().catch((e) => setLoadError(firestoreActionError(e)));
      setMessage(r.queued
        ? 'Decision queued. This page tracks processing automatically. The listing worker runs about every 15 minutes; GitHub schedules can be delayed; a successful website release is still required before the change is public.'
        : 'Saved. Published changes reach the public site after the next verified export and release.');
    } catch (e) {
      setError(firestoreActionError(e));
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
    if (source && adminSubmissionInput(source.input)) setEditor({ input: adminSubmissionInput(source.input), sourceId: source.sourceId, recordId: source.sourceRecordId, cancelled: source.cancelled });
    else setError('The original source record is missing or has an unsupported format. Restore it before editing this listing.');
  }

  const counts = useMemo(() => Object.fromEntries(STATUSES.map((s) => [s, records.filter((r) => r.status === s && (kind === 'all' || r.kind === kind)).length])) as Record<string, number>, [records, kind]);
  const shown = records.filter((r) => r.status === filter && (kind === 'all' || r.kind === kind) && matchesAdminInventory(r,search)).sort((a, b) => (a.title > b.title ? 1 : -1));
  const approvedSources = sources.filter((s) => s.approved);
  const pendingQueue = queue.filter((q) => q.status === 'pending').length;
  const queuedTargets=new Set(queue.filter(q=>q.status==='pending').map(q=>q.action.id));
  const staleQueue=queue.some(q=>q.status==='pending'&&Date.now()-q.createdAt>3600000);
  const openSubmission=(s:EntitySubmission)=>{let host='';try{host=new URL(s.input.sourceUrl).hostname;}catch{}const source=approvedSources.find(source=>source.hosts.includes(host));setEditor({input:s.input,sourceId:source?.id??'__official',recordId:`submission-${s.id}`,submissionId:s.id});};

  function retryDecision(action:QueuedAction) {
    if (['review-submission','publish-submission'].includes(action.action.action??'') && action.payload.reject!==true) {
      const submission=submissions.find(s=>s.id===action.action.id);
      if (!submission) {setError('This submission is no longer waiting for review. Refresh the listings before retrying.');return;}
      if (submission.invalidInput) {setError('This submission has an unsupported format. Review its source before retrying.');return;}
      setCheckedSource(false);setReviewDuplicates(false);setError('');
      setMessage('Review the current submission and confirm its official source before approving again.');
      openSubmission(submission);
      return;
    }
    act(action.payload);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <AdminButton tone="signal" onClick={() => setEditor({ sourceId: approvedSources[0]?.id || '', recordId: crypto.randomUUID() })}><Plus size={15} /> Add a listing</AdminButton>
        <AdminButton variant="outline" tone="neutral" disabled={busy} onClick={() => { setError(''); void load().catch((e) => setLoadError(firestoreActionError(e))); }}><RefreshCw size={14} /> Refresh</AdminButton>
        {pendingQueue ? <Chip tone="attention">{pendingQueue} change{pendingQueue > 1 ? 's' : ''} queued</Chip> : null}
        <span className="text-xs" style={{ color: T.muted }}>Verification expires after 14 days. A source change sends a listing back to review.</span>
      </div>

      {queueError?<p role="alert" className="rounded-xl border p-4 text-sm" style={{color:T.critical}}>Queue status unavailable: {queueError}. Refresh before repeating a decision.</p>:null}
      {staleQueue?<p role="status" className="rounded-xl border p-4 text-sm" style={{color:T.attention}}>Some decisions have waited over an hour. They have not been confirmed as processed. Check the <a className="underline" href="https://github.com/Aldo140/Calgary-Watch-/actions/workflows/listing-decisions.yml" target="_blank" rel="noreferrer">listing decision worker</a> and <a className="underline" href="https://github.com/Aldo140/Calgary-Watch-/actions/workflows/deploy-firebase.yml" target="_blank" rel="noreferrer">website deployment</a> before resubmitting.</p>:null}
      {error ? <p role="alert" className="rounded-xl border px-4 py-3 text-sm font-semibold" style={{ color: T.critical, borderColor: `${T.critical}40`, background: `${T.critical}0D` }}><AlertTriangle size={14} className="inline mr-1.5" />{error}</p> : null}
      {message ? <p role="status" className="rounded-xl border px-4 py-3 text-sm font-semibold" style={{ color: T.ok, borderColor: `${T.ok}40`, background: `${T.ok}0D` }}>{message}</p> : null}

      {editor ? (
        <Panel title={editor.submissionId ? 'Review a resident’s suggestion' : 'Edit listing'} subtitle="Check every field against the organizer’s own page before saving." action={<AdminButton size="sm" variant="ghost" onClick={() => setEditor(null)}>Close</AdminButton>}>
          <div className="p-4 space-y-3 cw-admin-form">
            <label className="block text-xs font-semibold" style={{ color: T.muted }}>
              Verified source
              <select className="mt-1 block w-full h-10 rounded-lg border px-3 text-sm" style={{ borderColor: T.line, color: T.ink }} value={editor.sourceId} onChange={(e) => setEditor({ ...editor, sourceId: e.target.value })}>
                <option value="">Choose an approved source</option>{editor.submissionId?<option value="__official">Verify the organizer’s official page supplied below</option>:null}
                {approvedSources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            {!approvedSources.length ? <p className="text-sm" style={{ color: T.attention }}>{editor.submissionId?'No matching source configured? Confirm the official organizer page below.':'No approved sources yet. Run the reviewed-source import before saving listings.'}</p> : null}
            {editor.submissionId?<div className="space-y-3 rounded-lg border p-3 text-sm" style={{borderColor:T.line}}><p>Approval verifies and publishes this listing in one review. It becomes public after the next successful website release.</p><label className="flex items-start gap-2"><input type="checkbox" checked={checkedSource} onChange={e=>setCheckedSource(e.target.checked)}/><span>I checked the dates, venue, admission and official organizer link.{editor.sourceId==='__official'?' I confirm this is the organizer’s official source and approve it for these checks.':''}</span></label><label className="flex items-start gap-2"><input type="checkbox" checked={reviewDuplicates} onChange={e=>setReviewDuplicates(e.target.checked)}/><span>I checked for an existing listing. If duplicate warnings are found, publish this as a separate listing.</span></label></div>:null}
            <InventoryForm
              key={editor.recordId}
              initial={editor.input}
              busy={busy}
              label={editor.submissionId ? 'Verify & approve for publication' : 'Save to pending review'}
              onSave={async (input) => {
                if(editor.submissionId&&!checkedSource)throw Error('Check the official organizer page and confirm the review before approving.');
                if(editor.submissionId&&queuedTargets.has(editor.submissionId))throw Error('A decision for this submission is already queued. Wait for it to finish.');
                await run({ action: editor.submissionId ? 'publish-submission' : 'save', input, sourceId: editor.sourceId==='__official'?undefined:editor.sourceId, confirmOfficialSource:editor.submissionId&&editor.sourceId==='__official', acknowledgeDuplicates:reviewDuplicates, recordId: editor.recordId, id: editor.submissionId, cancelled: editor.cancelled });
                setEditor(null);
              }}
            />
          </div>
        </Panel>
      ) : null}

      <div className="flex flex-wrap gap-2" aria-label="Submission views"><AdminButton variant={submissionView==='pending'?'solid':'outline'} onClick={()=>setSubmissionView('pending')}>Pending submissions ({submissions.length})</AdminButton><AdminButton variant={submissionView==='history'?'solid':'outline'} onClick={()=>setSubmissionView('history')}>Submission history</AdminButton></div>
      {submissionView==='history'?<SubmissionHistory/>:<Panel title="Submissions to review" subtitle="Events and markets from organizers and residents. Check the official source, then approve for publication." action={submissions.length ? <Chip tone="attention">{submissions.length} waiting</Chip> : undefined}>
        {loadError?<p className="p-4">Suggestions could not be confirmed. Refresh to try again.</p>:!loaded ? <p className="p-4 text-sm" style={{ color: T.muted }}>Loading…</p>
          : submissions.length ? (
            <ul className="divide-y" style={{ borderColor: T.line }}>
              {submissions.map((s) => (
                <li key={s.id} className="p-4 flex flex-col gap-2 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold" style={{ color: T.ink }}>{s.input.title}</p>
                    {queuedTargets.has(s.id)?<p className="mt-1 text-xs font-semibold" style={{color:T.attention}}>Decision queued · waiting for processing</p>:null}
                    <p className="text-xs line-clamp-2" style={{ color: T.muted }}>{s.input.summary}</p>
                    <p className="mt-1 text-[0.7rem]" style={{ fontFamily: mono, color: T.muted }}>
                      {s.input.kind} · <TimeAgo ts={s.createdAt} /> · <a href={s.input.sourceUrl} target="_blank" rel="noreferrer" className="underline">source <ExternalLink size={10} className="inline" /></a>
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <AdminButton size="sm" tone="signal" disabled={busy||s.invalidInput||queuedTargets.has(s.id)} onClick={() => openSubmission(s)}>Check & approve</AdminButton>
                    <AdminButton size="sm" variant="outline" tone="critical" disabled={busy||queuedTargets.has(s.id)} onClick={() => act({ action: 'review-submission', id: s.id, reject: true })}>Reject</AdminButton>
                  </div>
                </li>
              ))}
            </ul>
          ) : <EmptyState icon={<Inbox size={20} />} title="No suggestions waiting" body="When residents share an event or market from /submit, it lands here." />}
      </Panel>}

      <Panel title="Listings" subtitle="Backend inventory plus published listings from this release. Published-only records link to their organization editor.">
        <div className="px-4 pt-3 space-y-2">
          <label className="block text-xs font-semibold">Search listings<input aria-label="Search listings" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Name, organizer or source" className="block w-full border rounded-lg p-3 mt-1" /></label>
          <FilterRow>
            {STATUSES.map((s) => <FilterChip key={s} active={filter === s} onClick={() => setFilter(s)} count={counts[s]}>{s[0].toUpperCase() + s.slice(1)}</FilterChip>)}
          </FilterRow>
          <FilterRow>
            {(['all', 'event', 'market','business'] as const).map((k) => <FilterChip key={k} active={kind === k} onClick={() => setKind(k)}>{k === 'all' ? 'Everything' : k === 'event' ? 'Events' : k==='business'?'Organizations & businesses':'Markets'}</FilterChip>)}
          </FilterRow>
          {filter === 'pending' && shown.some((r) => r.duplicateIds?.length) ? (
            <label className="flex items-center gap-2 text-xs font-semibold py-1" style={{ color: T.attention }}>
              <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /> I’ve checked the possible duplicates flagged below.
            </label>
          ) : null}
        </div>
        {loadError?<p className="p-4">Inventory could not be refreshed. Existing data may be out of date.</p>:shown.length ? (
          <ul className="divide-y mt-2" style={{ borderColor: T.line }}>
            {shown.slice(0,shownCount).map((r) => (
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
                    {'start' in r&&r.start?<p className="mt-2 text-xs" style={{color:T.ink}}>Starts {r.start.slice(0,16).replace('T',' ')} · {r.venue||r.address}</p>:null}
                    {r.moderationUnavailable?<p role="status" className="text-xs mt-2" style={{color:T.attention}}>Incomplete listing metadata. Open Edit to review its source before moderating.</p>:null}
                    {r.duplicateIds?.length ? <p className="mt-1.5 text-xs" style={{ color: T.attention }}>Possible duplicate of {r.duplicateIds.map((id) => records.find((e) => e.id === id)?.title || id).join(', ')}</p> : null}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5 sm:pl-11">
                  <Link to={r.slug?entityPath(r):`/claim/${encodeURIComponent(r.id)}`} className="inline-flex items-center px-3 py-2 font-semibold text-xs underline">Public listing</Link>
                  {r.snapshotOnly?<><Chip>Published release</Chip><Link to={`/claim/${encodeURIComponent(r.id)}`} className="inline-flex items-center px-3 py-2 font-semibold text-xs underline">Open management access</Link></>:<>
                  <AdminButton size="sm" variant="outline" tone="neutral" disabled={busy} onClick={() => void openRecord(r)}>Edit</AdminButton>
                  {(['publish', 'draft', 'archive', 'cancel'] as const).filter((a) => !(a === 'publish' && r.status === 'published') && !(a === 'draft' && r.status === 'draft')).map((a) => (
                    <AdminButton key={a} size="sm" tone={a === 'publish' ? 'ok' : a === 'cancel' ? 'critical' : 'neutral'} variant={a === 'publish' ? 'solid' : 'outline'}
                      disabled={busy || queuedTargets.has(r.id) || r.moderationUnavailable || (a === 'publish' && !!r.duplicateIds?.length && !ack)}
                      onClick={() => act({ kind: r.kind, id: r.id, revision: r.revision, action: a, acknowledgeDuplicates: ack })}>
                      {ACTION_LABEL[a]}
                    </AdminButton>
                  ))}</>}
                </div>
              </li>
            ))}
          </ul>
        ) : <EmptyState icon={<CalendarDays size={20} />} title={loaded ? `No ${filter} listings` : 'Loading…'} />}
      </Panel>

      {shown.length>shownCount?<button type="button" className="rounded-lg border px-4 py-3 text-sm font-semibold" style={{borderColor:T.line}} onClick={()=>setShownCount(n=>n+24)}>Show more listings ({Math.min(shownCount,shown.length)} of {shown.length})</button>:null}
      {queue.length ? (
        <Panel title="Recent queued changes" subtitle="Queued → processed → website release. Processing alone does not confirm that a change is public.">
          <ul className="divide-y" style={{ borderColor: T.line }}>
            {queue.map((q) => (
              <li key={q.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <Chip tone={q.status === 'applied' ? 'ok' : q.status === 'failed' ? 'critical' : 'attention'}>{q.status==='pending'?'Waiting for worker':q.status==='applied'?'Processed':'Failed'}</Chip>
                <span className="flex-1 min-w-0 truncate" style={{ color: T.ink }}>{q.action.title||records.find(r=>r.id===q.action.id)?.title||q.action.action||'Listing decision'}{q.status==='failed'&&q.error ? ` — ${q.error}` : ''}{moderationPublicationNote(q,discoveryRepository.list())?` · ${moderationPublicationNote(q,discoveryRepository.list())}`:''}</span>
                <TimeAgo ts={q.createdAt} />
                {q.status==='failed'?<AdminButton size="sm" variant="outline" disabled={busy} onClick={()=>retryDecision(q)}>Retry decision</AdminButton>:null}
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}
