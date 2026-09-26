/**
 * Operations: the @calgarydaily post queue (CalgaryWatch's sister account; there
 * is no separate CalgaryWatch Instagram), how the account is doing, and the
 * agent's health. The GitHub Actions jobs in scripts/ops/ draft, render and
 * publish. Listing posts that pass the brand rules publish automatically; news,
 * opinion and anything with a warning wait for a person here.
 */

import { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, orderBy, query, limit, setDoc, updateDoc } from 'firebase/firestore';
import { AlertTriangle, CheckCircle2, ExternalLink, Image as ImageIcon, Link2, RefreshCw, Send, XCircle } from 'lucide-react';

import { useAuth } from '@/src/components/FirebaseProvider';
import { db } from '@/src/firebase';
import type { BrandId, OpsHealth, OpsPerformance, OpsPost, PerformanceRow, PostStatus } from '@/src/types/ops';
import { AdminButton, Chip, EmptyState, Field, FilterChip, FilterRow, Panel, SkeletonRows, T, TimeAgo, display, inputClass, inputStyle, mono, type Tone } from './ui';

type View = 'review' | 'scheduled' | 'published' | 'corrections' | 'other';
const VIEWS: Record<View, { label: string; statuses: PostStatus[] }> = {
  review: { label: 'Needs review', statuses: ['drafted'] },
  scheduled: { label: 'Scheduled', statuses: ['approved'] },
  published: { label: 'Published', statuses: ['published'] },
  corrections: { label: 'Corrections', statuses: ['needs-correction'] },
  other: { label: 'Other', statuses: ['requested', 'redraft', 'failed', 'expired', 'rejected'] },
};
const STATUS_TONE: Partial<Record<PostStatus, Tone>> = {
  drafted: 'attention', approved: 'signal', published: 'ok', 'needs-correction': 'critical', failed: 'critical', requested: 'neutral', redraft: 'neutral',
};
const BRAND_LABEL: Record<BrandId, string> = { calgarywatch: 'CalgaryWatch', calgarydaily: 'CalgaryDaily' };

const when = (ms: number | null | undefined) => ms ? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(ms)) : '—';
/** datetime-local works in the browser's zone; admins are in Calgary, and the label says so. */
const toLocalInput = (ms: number) => { const d = new Date(ms); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };

function PostCard({ post }: { post: OpsPost }) {
  const { user } = useAuth();
  const [caption, setCaption] = useState(post.caption);
  const [alt, setAlt] = useState(post.altText);
  const [at, setAt] = useState(toLocalInput(post.scheduledFor ?? post.suggestedFor ?? Date.now() + 3_600_000));
  const [note, setNote] = useState(post.note ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { setCaption(post.caption); setAlt(post.altText); }, [post.caption, post.altText]);

  const editable = ['drafted', 'approved', 'failed', 'expired', 'rejected'].includes(post.status);
  const dirty = caption !== post.caption || alt !== post.altText;

  async function save(patch: Partial<OpsPost>) {
    if (!db || !user) return;
    setBusy(true); setError('');
    try {
      await updateDoc(doc(db, 'ops_queue', post.id), { caption, altText: alt, note, ...patch, reviewedByEmail: user.email ?? null, reviewedAt: Date.now(), updatedAt: Date.now() });
    } catch (e) { setError(e instanceof Error ? e.message : 'Save failed'); } finally { setBusy(false); }
  }

  return (
    <article className="grid gap-4 md:grid-cols-[260px_1fr] p-4 border-b last:border-b-0" style={{ borderColor: T.line }}>
      <div>
        {post.imageUrl
          ? <a href={post.imageUrl} target="_blank" rel="noreferrer"><img src={post.imageUrl} alt={post.altText} className="w-full rounded-lg border" style={{ borderColor: T.line, aspectRatio: '4 / 5', objectFit: 'cover' }} /></a>
          : <div className="w-full rounded-lg grid place-items-center" style={{ aspectRatio: '4 / 5', background: T.surface, color: T.muted }}><ImageIcon size={22} /></div>}
        {(post.imageUrls?.length ?? 0) > 1 && (
          <div className="mt-2">
            <p className="text-[0.68rem] font-semibold mb-1" style={{ color: T.muted }}>Carousel · {post.imageUrls!.length} slides</p>
            <div className="grid grid-cols-5 gap-1">
              {post.imageUrls!.map((u, i) => (
                <a key={u} href={u} target="_blank" rel="noreferrer" title={`Slide ${i + 1}`}>
                  <img src={u} alt={`Slide ${i + 1}`} className="w-full rounded border" style={{ borderColor: T.line, aspectRatio: '4 / 5', objectFit: 'cover' }} />
                </a>
              ))}
            </div>
          </div>
        )}
        {post.permalink && <a href={post.permalink} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold" style={{ color: T.signal }}>View on Instagram <ExternalLink size={12} /></a>}
      </div>

      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip tone={post.brand === 'calgarydaily' ? 'attention' : 'signal'}>{BRAND_LABEL[post.brand]}</Chip>
          <Chip>{post.template}</Chip>
          <Chip tone={STATUS_TONE[post.status] ?? 'neutral'}>{post.status}</Chip>
          {post.sponsored && <Chip tone="attention">Featured partner</Chip>}
          <Chip mono>{post.draftedBy === 'claude' ? 'Drafted by Claude' : 'Template draft'}</Chip>
          <span className="text-xs" style={{ color: T.muted }}>updated <TimeAgo ts={post.updatedAt} /></span>
        </div>

        {[...(post.warnings ?? []), ...(post.error ? [post.error] : []), ...(post.correction ? [post.correction] : [])].map((w, i) => (
          <p key={i} className="flex gap-1.5 text-xs leading-snug rounded-lg px-2.5 py-2" style={{ color: w === post.error || w === post.correction ? T.critical : T.attention, background: `${w === post.error || w === post.correction ? T.critical : T.attention}10` }}>
            <AlertTriangle size={14} className="shrink-0 mt-px" /> {w}
          </p>
        ))}

        <details className="text-xs rounded-lg border px-3 py-2" style={{ borderColor: T.line, color: T.muted }}>
          <summary className="cursor-pointer font-semibold" style={{ color: T.ink }}>Facts it was written from ({post.sourceUrls?.length ?? 0} source{post.sourceUrls?.length === 1 ? '' : 's'})</summary>
          <pre className="whitespace-pre-wrap mt-2 leading-relaxed" style={{ fontFamily: mono }}>{post.facts || post.requestUrl}</pre>
          <div className="flex flex-wrap gap-2 mt-2">{post.sourceUrls?.map(u => <a key={u} href={u} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold" style={{ color: T.signal }}><Link2 size={12} />{new URL(u).hostname}</a>)}</div>
        </details>

        <Field label={`Caption (${caption.length}/2200)`}>
          <textarea value={caption} onChange={e => setCaption(e.target.value)} disabled={!editable || busy} rows={7} className="w-full rounded-lg border p-3 text-sm leading-relaxed" style={inputStyle} />
        </Field>
        <Field label="Alt text">
          <textarea value={alt} onChange={e => setAlt(e.target.value)} disabled={!editable || busy} rows={2} className="w-full rounded-lg border p-3 text-sm" style={inputStyle} />
        </Field>

        {editable && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Publish at (Calgary time)">
              <input type="datetime-local" value={at} onChange={e => setAt(e.target.value)} className={inputClass} style={inputStyle} />
            </Field>
            <Field label="Note for a redraft">
              <input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. lead with the free entry" className={inputClass} style={inputStyle} />
            </Field>
          </div>
        )}
        {error && <p role="alert" className="text-xs" style={{ color: T.critical }}>{error}</p>}

        <div className="flex flex-wrap gap-2">
          {editable && post.status !== 'approved' && (
            <AdminButton tone="ok" disabled={busy || !caption.trim()} onClick={() => save({ status: 'approved', scheduledFor: new Date(at).getTime(), error: null, attempts: 0 })}>
              <CheckCircle2 size={15} /> Approve for {when(new Date(at).getTime())}
            </AdminButton>
          )}
          {post.status === 'approved' && (
            <>
              <AdminButton tone="signal" disabled={busy} onClick={() => save({ status: 'approved', scheduledFor: new Date(at).getTime() })}><Send size={15} /> Reschedule to {when(new Date(at).getTime())}</AdminButton>
              <AdminButton variant="outline" disabled={busy} onClick={() => save({ status: 'drafted', scheduledFor: null })}>Unschedule</AdminButton>
            </>
          )}
          {editable && dirty && <AdminButton variant="outline" tone="signal" disabled={busy} onClick={() => save({})}>Save edits</AdminButton>}
          {editable && <AdminButton variant="outline" disabled={busy} onClick={() => save({ status: 'redraft' })} title="The next run writes and renders a new draft, using your note"><RefreshCw size={14} /> Redraft</AdminButton>}
          {editable && post.status !== 'rejected' && <AdminButton variant="outline" tone="critical" disabled={busy} onClick={() => save({ status: 'rejected' })}><XCircle size={14} /> Reject</AdminButton>}
          {post.status === 'needs-correction' && (
            <AdminButton tone="ok" disabled={busy} onClick={async () => {
              if (!db || !user) return;
              await updateDoc(doc(db, 'ops_queue', post.id), { status: 'published', correction: null, reviewedByEmail: user.email ?? null, reviewedAt: Date.now(), updatedAt: Date.now() });
            }}>I fixed it on Instagram</AdminButton>
          )}
        </div>
        {post.status === 'approved' && <p className="text-xs" style={{ color: T.muted }}>Publishes at the first hourly run after {when(post.scheduledFor)}.</p>}
      </div>
    </article>
  );
}

function BriefForm() {
  const { user } = useAuth();
  const [brand, setBrand] = useState<BrandId>('calgarydaily');
  const [url, setUrl] = useState('');
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState('');
  async function submit() {
    if (!db || !user) return;
    const id = `brief-${Date.now()}`;
    try {
      await setDoc(doc(db, 'ops_queue', id), { id, brand, status: 'requested', template: 'update', requestUrl: url.trim(), note: note.trim(), fingerprint: `${brand}|brief|${url.trim()}`.slice(0, 300), createdAt: Date.now(), updatedAt: Date.now(), reviewedByEmail: user.email ?? null });
      setUrl(''); setNote(''); setMsg('Queued. The next hourly run drafts it for review.');
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Could not queue'); }
  }
  return (
    <Panel title="Draft a post from a page" subtitle="Paste a City of Calgary notice, organizer page or news source. The agent reads only that page, drafts, and waits for you.">
      <div className="grid gap-3 md:grid-cols-[160px_1fr_1fr_auto] items-end">
        <Field label="Account">
          <select value={brand} onChange={e => setBrand(e.target.value as BrandId)} className={inputClass} style={inputStyle}>
            <option value="calgarydaily">CalgaryDaily</option>
          </select>
        </Field>
        <Field label="Source URL (https)"><input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://newsroom.calgary.ca/…" className={inputClass} style={inputStyle} /></Field>
        <Field label="Angle (optional)"><input value={note} onChange={e => setNote(e.target.value)} maxLength={1000} className={inputClass} style={inputStyle} /></Field>
        <AdminButton tone="signal" disabled={!/^https:\/\/.{4,}/.test(url.trim())} onClick={submit}>Queue brief</AdminButton>
      </div>
      {msg && <p className="text-xs mt-2" style={{ color: T.muted }}>{msg}</p>}
    </Panel>
  );
}

export function OpsHealthPanel() {
  const [health, setHealth] = useState<OpsHealth | null>(null);
  useEffect(() => db ? onSnapshot(doc(db, 'ops_health', 'latest'), s => setHealth(s.exists() ? s.data() as OpsHealth : null), () => setHealth(null)) : undefined, []);
  return (
    <Panel title="Agent health" subtitle={health ? `Checked ${when(health.checkedAt)}` : 'Written by the daily operations run'}>
      {!health ? <p className="text-sm" style={{ color: T.muted }}>No health report yet. It appears after the first daily run (Operations Daily workflow).</p> : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {health.items.map(i => (
            <li key={i.id} className="flex gap-2 text-sm">
              <span style={{ color: i.ok ? T.ok : T.attention }}>{i.ok ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}</span>
              <span><strong style={{ color: T.ink }}>{i.label}</strong> <span style={{ color: T.muted }}>{i.detail}</span></span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function PerfTable({ title, rows }: { title: string; rows: PerformanceRow[] }) {
  if (!rows.length) return null;
  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: T.muted, fontFamily: mono }}>{title}</h4>
      <table className="w-full text-sm">
        <thead><tr style={{ color: T.muted }}><th className="text-left font-medium py-1">Kind</th><th className="text-right font-medium">Posts</th><th className="text-right font-medium">Avg reach</th><th className="text-right font-medium">Saves + shares</th></tr></thead>
        <tbody>{rows.map((r, i) => (
          <tr key={r.key} className="border-t" style={{ borderColor: T.line }}>
            <td className="py-1" style={{ color: T.ink, fontWeight: i === 0 && rows.length > 1 ? 700 : 400 }}>{r.label}</td>
            <td className="text-right" style={{ fontFamily: mono }}>{r.posts}</td>
            <td className="text-right" style={{ fontFamily: mono }}>{r.avgReach}</td>
            <td className="text-right" style={{ fontFamily: mono }}>{r.avgSavesShares}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

/** What's working: written by the daily run from Instagram's own numbers (scripts/ops/jobs/insights.ts). */
export function PerformancePanel() {
  const [perf, setPerf] = useState<OpsPerformance | null>(null);
  useEffect(() => db ? onSnapshot(doc(db, 'ops_health', 'performance'), s => setPerf(s.exists() ? s.data() as OpsPerformance : null), () => setPerf(null)) : undefined, []);
  const days = perf ? Object.keys(perf.followers).sort() : [];
  const latest = days.at(-1);
  const weekAgo = days.filter(d => latest && d <= new Date(Date.parse(latest) - 7 * 86_400_000).toISOString().slice(0, 10)).at(-1);
  const change = perf && latest && weekAgo ? perf.followers[latest] - perf.followers[weekAgo] : 0;
  return (
    <Panel title="How @calgarydaily is doing" subtitle={perf ? `Last 30 days · updated ${when(perf.updatedAt)}` : 'Written by the daily run from Instagram insights'}>
      {!perf ? <p className="text-sm" style={{ color: T.muted }}>No numbers yet. They appear after the next daily run.</p> : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            {latest && <span><strong style={{ color: T.ink, fontFamily: mono }}>{perf.followers[latest].toLocaleString('en-CA')}</strong> <span style={{ color: T.muted }}>followers{weekAgo ? ` (${change >= 0 ? '+' : ''}${change} this week)` : ''}</span></span>}
            {perf.avgDelayMinutes !== null && <span style={{ color: perf.avgDelayMinutes > 30 ? T.attention : T.muted }}>Automatic posts went out {perf.avgDelayMinutes} min after their slot on average</span>}
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <PerfTable title="Format" rows={perf.byFormat} />
            <PerfTable title="Post type" rows={perf.byKind} />
            <PerfTable title="Time of day" rows={perf.bySlot} />
          </div>
          {perf.top.length > 0 && (
            <ol className="text-sm space-y-1 list-decimal pl-5">
              {perf.top.map(t => <li key={t.permalink}><a href={t.permalink} target="_blank" rel="noreferrer" style={{ color: T.signal }}>{t.headline}</a> <span style={{ color: T.muted }}>· {t.format} · {t.reach} reached · {t.savesShares} saves and shares</span></li>)}
            </ol>
          )}
        </div>
      )}
    </Panel>
  );
}

export function OpsWorkspace() {
  const [posts, setPosts] = useState<OpsPost[] | null>(null);
  const [error, setError] = useState('');
  const [view, setView] = useState<View>('review');

  useEffect(() => {
    if (!db) return;
    return onSnapshot(query(collection(db, 'ops_queue'), orderBy('updatedAt', 'desc'), limit(300)),
      s => setPosts(s.docs.map(d => d.data() as OpsPost)),
      e => setError(e.message.includes('permission') ? 'The operations rules are not deployed yet. Run "Deploy Firebase Backend" with target rules.' : e.message));
  }, []);

  const counts = useMemo(() => Object.fromEntries((Object.keys(VIEWS) as View[]).map(v => [v, (posts ?? []).filter(p => VIEWS[v].statuses.includes(p.status)).length])), [posts]);
  const shown = (posts ?? [])
    .filter(p => VIEWS[view].statuses.includes(p.status))
    .sort((a, b) => view === 'scheduled' ? (a.scheduledFor ?? 0) - (b.scheduledFor ?? 0) : view === 'review' ? (a.suggestedFor ?? 0) - (b.suggestedFor ?? 0) : b.updatedAt - a.updatedAt);

  return (
    <div className="space-y-4">
      <OpsHealthPanel />
      <PerformancePanel />
      <BriefForm />
      <Panel title="Instagram queue · @calgarydaily" subtitle="Drafted each morning from verified listings. Listing posts that pass the brand rules are scheduled automatically; everything else waits for you." padded={false}>
        <div className="px-4 pt-3 space-y-2">
          <FilterRow>
            {(Object.keys(VIEWS) as View[]).map(v => <FilterChip key={v} active={view === v} onClick={() => setView(v)} count={counts[v]}>{VIEWS[v].label}</FilterChip>)}
          </FilterRow>
        </div>
        {error ? <p role="alert" className="p-4 text-sm" style={{ color: T.critical }}>{error}</p>
          : !posts ? <div className="p-4"><SkeletonRows /></div>
          : !shown.length ? <EmptyState title={`Nothing in ${VIEWS[view].label.toLowerCase()}`} body={view === 'review' ? 'New drafts arrive after the daily run (about 7 am).' : undefined} />
          : <div>{shown.map(p => <PostCard key={p.id} post={p} />)}</div>}
      </Panel>
      <p className="text-xs" style={{ color: T.muted, fontFamily: display }}>Accounts post at most their daily limit; images are brand templates, never photos. Brand rules live in brand/*.json.</p>
    </div>
  );
}
