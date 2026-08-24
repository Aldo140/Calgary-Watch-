import { useEffect, useMemo, useState } from 'react';
import {
  collection, doc, limit, onSnapshot, orderBy, query, updateDoc, writeBatch,
} from 'firebase/firestore';
import {
  Archive, Check, Inbox, Mail, MailOpen, Paperclip, RefreshCw, Search, Send, UserRound,
} from 'lucide-react';

import { useAuth } from '@/src/components/FirebaseProvider';
import { db } from '@/src/firebase';
import { AdminButton, Chip, Panel, StatusDot, T, display, inputClass, inputStyle, mono } from './ui';

type ReplyStatus = 'unread' | 'open' | 'handled' | 'archived';

type DigestReply = {
  id: string;
  providerId: string;
  from: string;
  to: string[];
  subject: string;
  text: string;
  receivedAt: number;
  attachments: Array<{ id: string; filename: string; contentType: string; size: number | null }>;
  automated?: boolean;
  status: ReplyStatus;
  subscriberUid?: string | null;
  subscriberEmail?: string | null;
  subscriberName?: string | null;
  weekKey?: string | null;
  deliveryKind?: string | null;
  originalSubject?: string | null;
  note?: string;
  handledByEmail?: string | null;
  handledAt?: number | null;
};

type ReplyHealth = {
  status?: 'ok' | 'error' | 'disabled';
  checkedAt?: number;
  lastSuccessAt?: number;
  error?: string | null;
  inboundAddress?: string | null;
  recordCount?: number | null;
};

const statusCopy: Record<ReplyStatus, string> = {
  unread: 'Unread', open: 'Open', handled: 'Handled', archived: 'Archived',
};

function dateTime(value: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Edmonton', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  }).format(new Date(value));
}

function fileSize(value: number | null): string {
  if (!value) return '';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function HealthStrip({ health }: { health: ReplyHealth | null }) {
  const status = health?.status ?? 'idle';
  const tone = status === 'ok' ? 'ok' : status === 'error' ? 'critical' : status === 'disabled' ? 'attention' : 'neutral';
  const title = status === 'ok'
    ? `Replies route to ${health?.inboundAddress}`
    : status === 'disabled'
      ? 'Admin reply sync needs one Resend setting'
      : status === 'error'
        ? 'Reply sync needs attention'
        : 'Waiting for the first reply sync';
  const detail = status === 'ok'
    ? `Checked ${health?.checkedAt ? dateTime(health.checkedAt) : 'recently'} · new mail appears here within about 10 minutes.`
    : status === 'disabled'
      ? 'Copy your Resend Receiving address into the DIGEST_INBOUND_ADDRESS repository variable. Until then, replies still go to the monitored fallback mailbox.'
      : health?.error ?? 'The scheduled sync has not reported yet.';
  return (
    <div className="flex items-start gap-3 border-b px-4 py-3 sm:px-5" style={{ borderColor: T.line, background: status === 'error' ? `${T.critical}08` : status === 'disabled' ? `${T.attention}0A` : T.surface }}>
      <span className="pt-1"><StatusDot tone={tone} pulse={status === 'idle'} /></span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold" style={{ color: T.ink }}>{title}</p>
        <p className="mt-0.5 max-w-[72ch] text-[0.7rem] leading-relaxed" style={{ color: T.muted }}>{detail}</p>
      </div>
      {status === 'disabled' && (
        <a href="https://resend.com/emails/receiving" target="_blank" rel="noopener noreferrer" className="shrink-0 text-xs font-bold hover:underline" style={{ color: T.signal }}>Open Resend</a>
      )}
    </div>
  );
}

export function DigestReplyInbox() {
  const { user } = useAuth();
  const [replies, setReplies] = useState<DigestReply[]>([]);
  const [health, setHealth] = useState<ReplyHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'active' | 'unread' | 'handled' | 'archived'>('active');
  const [search, setSearch] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!db) return;
    const repliesQuery = query(collection(db, 'digest_replies'), orderBy('receivedAt', 'desc'), limit(100));
    const stopReplies = onSnapshot(repliesQuery, (snapshot) => {
      const rows = snapshot.docs.map((row) => ({ id: row.id, ...row.data() } as DigestReply));
      setReplies(rows);
      setSelectedId((current) => current && rows.some((row) => row.id === current) ? current : rows[0]?.id ?? null);
      setLoading(false);
      setLoadError('');
    }, (error) => {
      console.error('Could not load digest replies:', error);
      setLoadError('Replies could not be loaded. Check the admin rules deployment and connection.');
      setLoading(false);
    });
    const stopHealth = onSnapshot(doc(db, 'ingestion_health', 'resend_inbound'), (snapshot) => {
      setHealth(snapshot.exists() ? snapshot.data() as ReplyHealth : null);
    });
    return () => { stopReplies(); stopHealth(); };
  }, []);

  const selected = replies.find((reply) => reply.id === selectedId) ?? null;
  useEffect(() => { setNote(selected?.note ?? ''); }, [selected?.id, selected?.note]);

  const unread = replies.filter((reply) => reply.status === 'unread').length;
  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return replies.filter((reply) => {
      const inFilter = filter === 'active'
        ? reply.status === 'unread' || reply.status === 'open'
        : reply.status === filter;
      if (!inFilter) return false;
      if (!needle) return true;
      return [reply.from, reply.subject, reply.text, reply.subscriberName, reply.subscriberEmail, reply.weekKey]
        .some((value) => String(value ?? '').toLowerCase().includes(needle));
    });
  }, [filter, replies, search]);

  async function updateReply(reply: DigestReply, patch: Record<string, unknown>, action: string) {
    if (!db || !user || saving) return;
    setSaving(true);
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'digest_replies', reply.id), { ...patch, updatedAt: Date.now() });
      const audit = doc(collection(db, 'admin_audit_logs'));
      batch.set(audit, {
        action, targetCollection: 'digest_replies', targetId: reply.id,
        adminUid: user.uid, adminEmail: user.email ?? '', timestamp: Date.now(),
        changes: patch, metadata: { providerId: reply.providerId },
      });
      await batch.commit();
    } finally {
      setSaving(false);
    }
  }

  async function selectReply(reply: DigestReply) {
    setSelectedId(reply.id);
    if (reply.status === 'unread' && db && user) {
      await updateDoc(doc(db, 'digest_replies', reply.id), {
        status: 'open', openedAt: Date.now(), updatedAt: Date.now(),
      }).catch((error) => console.error('Could not mark reply open:', error));
    }
  }

  return (
    <Panel
      title="Reader replies"
      subtitle="Private responses to welcome letters and weekly briefs"
      action={<div className="flex items-center gap-2"><Chip tone={unread ? 'attention' : 'ok'}>{unread} unread</Chip><Inbox size={16} style={{ color: T.muted }} /></div>}
      padded={false}
    >
      <HealthStrip health={health} />
      <div className="border-b px-3 py-3 sm:px-4" style={{ borderColor: T.line }}>
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-[14rem] flex-1">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" style={{ color: T.muted }} />
            <span className="sr-only">Search replies</span>
            <input className={`${inputClass} pl-9`} style={inputStyle} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search sender, subject or message" />
          </label>
          <div className="flex flex-wrap gap-1" aria-label="Reply status filter">
            {(['active', 'unread', 'handled', 'archived'] as const).map((value) => (
              <AdminButton key={value} size="sm" variant={filter === value ? 'outline' : 'ghost'} tone={filter === value ? 'signal' : 'neutral'} onClick={() => setFilter(value)}>
                {value === 'active' ? 'Needs action' : value[0].toUpperCase() + value.slice(1)}
              </AdminButton>
            ))}
          </div>
        </div>
      </div>

      {loadError ? (
        <div className="px-5 py-12 text-center"><p className="text-sm font-bold" style={{ color: T.critical }}>{loadError}</p></div>
      ) : loading ? (
        <div className="space-y-2 p-4" aria-label="Loading replies">{[0, 1, 2].map((row) => <div key={row} className="h-16 motion-safe:animate-pulse rounded-lg" style={{ background: T.surface }} />)}</div>
      ) : replies.length === 0 ? (
        <div className="px-5 py-14 text-center">
          <MailOpen size={28} className="mx-auto" style={{ color: T.muted }} />
          <h3 className="mt-3 text-sm font-bold" style={{ color: T.ink }}>No reader replies yet</h3>
          <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed" style={{ color: T.muted }}>When someone replies to a Calgary Watch email, their message will appear here with its subscriber and edition when those can be matched.</p>
        </div>
      ) : (
        <div className="grid min-h-[32rem] lg:grid-cols-[21rem_minmax(0,1fr)]">
          <div className="border-b lg:border-b-0 lg:border-r" style={{ borderColor: T.line }}>
            {visible.length === 0 ? <p className="px-4 py-10 text-center text-xs" style={{ color: T.muted }}>No replies match this view.</p> : (
              <ul className="max-h-[42rem] overflow-y-auto divide-y" style={{ borderColor: T.line }}>
                {visible.map((reply) => {
                  const active = reply.id === selected?.id;
                  return (
                    <li key={reply.id}>
                      <button type="button" onClick={() => void selectReply(reply)} className="w-full px-4 py-3 text-left transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-[-2px]" style={{ background: active ? `${T.signal}0D` : '#fff', outlineColor: T.signal }}>
                        <div className="flex items-center gap-2">
                          <StatusDot tone={reply.status === 'unread' ? 'attention' : reply.status === 'handled' ? 'ok' : 'neutral'} />
                          <p className={`min-w-0 flex-1 truncate text-xs ${reply.status === 'unread' ? 'font-bold' : 'font-semibold'}`} style={{ color: T.ink }}>{reply.subscriberName || reply.from}</p>
                          <time className="shrink-0 text-[0.63rem]" style={{ color: T.muted, fontFamily: mono }}>{dateTime(reply.receivedAt)}</time>
                        </div>
                        <p className={`mt-1 truncate text-xs ${reply.status === 'unread' ? 'font-semibold' : ''}`} style={{ color: T.ink }}>{reply.subject}</p>
                        <p className="mt-1 truncate text-[0.68rem]" style={{ color: T.muted }}>{reply.text || 'Attachment-only message'}</p>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {selected ? (
            <article className="min-w-0 p-4 sm:p-5">
              <header className="border-b pb-4" style={{ borderColor: T.line }}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Chip tone={selected.status === 'handled' ? 'ok' : selected.status === 'unread' ? 'attention' : 'neutral'}>{statusCopy[selected.status]}</Chip>
                      {selected.automated && <Chip tone="attention">Automatic response</Chip>}
                      {selected.deliveryKind && <Chip>{selected.deliveryKind === 'welcome' ? 'Welcome letter' : 'Weekly brief'}</Chip>}
                      {selected.weekKey && <span className="text-[0.68rem]" style={{ color: T.muted, fontFamily: mono }}>{selected.weekKey}</span>}
                    </div>
                    <h3 className="mt-3 text-lg font-bold leading-snug" style={{ color: T.ink, fontFamily: display }}>{selected.subject}</h3>
                    <p className="mt-1 text-xs" style={{ color: T.muted }}>From <strong style={{ color: T.ink }}>{selected.subscriberName || selected.from}</strong> · {selected.from} · {dateTime(selected.receivedAt)}</p>
                    {selected.originalSubject && <p className="mt-1 text-[0.68rem]" style={{ color: T.muted }}>In reply to: {selected.originalSubject}</p>}
                  </div>
                  <a href={`mailto:${selected.from}?subject=${encodeURIComponent(selected.subject.startsWith('Re:') ? selected.subject : `Re: ${selected.subject}`)}`} className="inline-flex min-h-9 items-center gap-2 rounded-lg px-3 text-xs font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2" style={{ background: T.signal, outlineColor: T.signal }}><Send size={13} /> Reply</a>
                </div>
              </header>

              <div className="py-5">
                <p className="max-w-[72ch] whitespace-pre-wrap break-words text-sm leading-relaxed" style={{ color: T.ink }}>{selected.text || 'This reply contains no plain-text message.'}</p>
                {selected.attachments?.length > 0 && (
                  <div className="mt-5 border-t pt-4" style={{ borderColor: T.line }}>
                    <p className="flex items-center gap-2 text-xs font-bold" style={{ color: T.ink }}><Paperclip size={13} /> Attachments ({selected.attachments.length})</p>
                    <ul className="mt-2 space-y-1.5">{selected.attachments.map((attachment) => <li key={attachment.id} className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-xs" style={{ background: T.surface }}><span className="min-w-0 truncate font-semibold">{attachment.filename}</span><span className="shrink-0" style={{ color: T.muted }}>{fileSize(attachment.size)}</span></li>)}</ul>
                    <p className="mt-2 text-[0.66rem]" style={{ color: T.muted }}>Files are listed but never opened or downloaded automatically.</p>
                  </div>
                )}
              </div>

              <div className="border-t pt-4" style={{ borderColor: T.line }}>
                <label className="text-xs font-bold" style={{ color: T.ink }}>Internal note</label>
                <textarea className={`${inputClass} mt-2 min-h-20 resize-y`} style={inputStyle} maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add context for the other administrator…" />
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <AdminButton size="sm" variant="outline" disabled={saving || note === (selected.note ?? '')} onClick={() => void updateReply(selected, { note }, 'digest_reply_note')}><RefreshCw size={13} /> Save note</AdminButton>
                  {selected.status !== 'handled' && <AdminButton size="sm" tone="ok" disabled={saving} onClick={() => void updateReply(selected, { status: 'handled', handledAt: Date.now(), handledByUid: user?.uid ?? '', handledByEmail: user?.email ?? '' }, 'digest_reply_handled')}><Check size={13} /> Mark handled</AdminButton>}
                  {selected.status === 'handled' && <AdminButton size="sm" variant="outline" disabled={saving} onClick={() => void updateReply(selected, { status: 'open', handledAt: null, handledByUid: '', handledByEmail: '' }, 'digest_reply_reopened')}><Mail size={13} /> Reopen</AdminButton>}
                  {selected.status !== 'archived' && <AdminButton size="sm" variant="ghost" disabled={saving} onClick={() => void updateReply(selected, { status: 'archived', handledAt: selected.handledAt ?? Date.now(), handledByUid: user?.uid ?? '', handledByEmail: user?.email ?? '' }, 'digest_reply_archived')}><Archive size={13} /> Archive</AdminButton>}
                </div>
                {selected.handledByEmail && <p className="mt-2 flex items-center gap-1.5 text-[0.68rem]" style={{ color: T.muted }}><UserRound size={11} /> Last handled by {selected.handledByEmail}</p>}
              </div>
            </article>
          ) : <div className="hidden place-items-center lg:grid"><p className="text-xs" style={{ color: T.muted }}>Choose a reply to read it.</p></div>}
        </div>
      )}
    </Panel>
  );
}
