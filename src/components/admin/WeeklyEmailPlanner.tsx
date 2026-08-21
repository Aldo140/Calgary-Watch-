import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  collection, doc, getDoc, onSnapshot, query, runTransaction, where, writeBatch,
} from 'firebase/firestore';
import {
  AlertTriangle, BookOpenText, CalendarDays, Check, History, Loader2, MailCheck,
  Newspaper, RefreshCw, Send, ShieldCheck, Trash2,
} from 'lucide-react';

import { useAuth } from '@/src/components/FirebaseProvider';
import { db } from '@/src/firebase';
import {
  CONTRIBUTION_STYLE_COPY,
  DIGEST_CONTRIBUTION_STYLES,
  DIGEST_TEMPLATE_PURPOSES,
  upcomingDigestWeeks,
  type DigestContribution,
  type DigestContributionStyle,
} from '@/src/lib/digestPlanner';
import {
  AdminButton, Chip, Field, Panel, StatusDot, T, display, inputClass, inputStyle, mono,
} from './ui';

const MAX_BODY = 2400;
const MIN_BODY = 20;

const TEMPLATE_ICONS = {
  welcome: BookOpenText,
  weekly: Newspaper,
  'admin-proof': ShieldCheck,
} as const;

type SaveState = 'idle' | 'loading' | 'saving' | 'saved' | 'error' | 'conflict';
type MessageTone = 'neutral' | 'ok' | 'attention' | 'critical';
type TestStatus = 'pending' | 'sending' | 'retrying' | 'sent' | 'partial' | 'failed';

type TestRequest = {
  id: string;
  planWeekKey: string;
  action?: 'preview' | 'cancelled';
  status: TestStatus;
  submittedAt: number;
  submittedByEmail?: string;
  processedAt?: number | null;
  error?: string | null;
  recipients?: Array<{ email: string; ok: boolean; providerId?: string; error?: string }>;
};

type Draft = {
  headline: string;
  body: string;
  style: DigestContributionStyle;
  baseRevision: number;
};

class PlannerConflictError extends Error {}

const draftKey = (weekKey: string) => `cw_weekly_email_draft_${weekKey}`;
const signature = (headline: string, body: string, style: DigestContributionStyle) =>
  JSON.stringify([headline, body, style]);

function formatTime(value: number | undefined): string {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Edmonton', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  }).format(new Date(value));
}

function safeDraft(value: string | null): Draft | null {
  if (!value) return null;
  try {
    const draft = JSON.parse(value) as Partial<Draft>;
    if (
      typeof draft.headline !== 'string' || typeof draft.body !== 'string' ||
      typeof draft.baseRevision !== 'number' ||
      !DIGEST_CONTRIBUTION_STYLES.includes(draft.style as DigestContributionStyle)
    ) return null;
    return draft as Draft;
  } catch {
    return null;
  }
}

function DeliveryStatus({ request }: { request: TestRequest | undefined }) {
  if (!request) {
    return <span className="text-xs" style={{ color: T.muted }}>No test has been sent for this edition.</span>;
  }
  const action = request.action === 'cancelled' ? 'Cancellation notice' : 'Test email';
  const config: Record<TestStatus, { tone: 'neutral' | 'attention' | 'critical' | 'ok'; label: string }> = {
    pending: { tone: 'attention', label: `${action} queued` },
    sending: { tone: 'attention', label: `${action} sending` },
    retrying: { tone: 'attention', label: `${action} retrying` },
    sent: { tone: 'ok', label: request.action === 'cancelled' ? 'Admins notified' : 'Delivered to every admin' },
    partial: { tone: 'critical', label: 'Some admin tests failed' },
    failed: { tone: 'critical', label: `${action} failed` },
  };
  const shown = config[request.status] ?? config.pending;
  return (
    <div className="flex min-w-0 items-center gap-2" aria-live="polite">
      <StatusDot tone={shown.tone} pulse={['pending', 'sending', 'retrying'].includes(request.status)} />
      <div className="min-w-0">
        <p className="truncate text-xs font-semibold" style={{ color: shown.tone === 'critical' ? T.critical : T.ink }}>
          {shown.label}
        </p>
        <p className="truncate text-[0.68rem]" style={{ color: T.muted }}>
          {formatTime(request.processedAt ?? request.submittedAt)}
          {request.submittedByEmail ? ` · requested by ${request.submittedByEmail}` : ''}
        </p>
      </div>
    </div>
  );
}

function OpeningPreview({
  style, headline, paragraphs, weekKey,
}: {
  style: DigestContributionStyle;
  headline: string;
  paragraphs: string[];
  weekKey: string;
}) {
  const copy = CONTRIBUTION_STYLE_COPY[style];
  const content = (
    <>
      <p className="text-lg font-bold leading-snug" style={{ fontFamily: display, color: '#F4EEE3' }}>
        {headline.trim() || copy.label}
      </p>
      <div className="mt-2 space-y-2 text-[0.82rem] leading-relaxed" style={{ color: '#DCD3C4' }}>
        {paragraphs.length
          ? paragraphs.map((paragraph, index) => <p key={index} className="whitespace-pre-line">{paragraph}</p>)
          : <p style={{ color: '#A6B8AE' }}>Your optional opening note will appear here.</p>}
      </div>
    </>
  );

  if (style === 'news-brief') {
    return (
      <div className="rounded-sm border p-4" style={{ background: '#17251F', borderColor: '#2C443B' }}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-[0.62rem] font-bold uppercase tracking-[0.14em]" style={{ color: '#E0AC63' }}>{copy.emailLabel}</p>
          <p className="text-[0.62rem]" style={{ color: '#A6B8AE', fontFamily: mono }}>{weekKey}</p>
        </div>
        {content}
      </div>
    );
  }

  if (style === 'personal-story') {
    return (
      <div className="border-y px-1 py-4" style={{ borderColor: '#3A5A4E' }}>
        <p className="mb-3 text-[0.62rem] font-bold uppercase tracking-[0.14em]" style={{ color: '#E0AC63' }}>{copy.emailLabel}</p>
        {content}
        <p className="mt-4 text-[0.72rem] font-semibold" style={{ color: '#A6B8AE' }}>From the Calgary Watch team</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border p-4" style={{ background: '#17251F', borderColor: '#2C443B' }}>
      <p className="mb-2 text-[0.62rem] font-bold uppercase tracking-[0.14em]" style={{ color: '#E0AC63' }}>{copy.emailLabel}</p>
      {content}
    </div>
  );
}

export function WeeklyEmailPlanner() {
  const { user } = useAuth();
  const weeks = useMemo(() => upcomingDigestWeeks(Date.now(), 8), []);
  const [plans, setPlans] = useState<Record<string, DigestContribution>>({});
  const [selectedWeek, setSelectedWeek] = useState(weeks[0]?.weekKey ?? '');
  const [loadedPlan, setLoadedPlan] = useState<DigestContribution | null>(null);
  const [headline, setHeadline] = useState('');
  const [body, setBody] = useState('');
  const [style, setStyle] = useState<DigestContributionStyle>('neighbour-note');
  const [saveState, setSaveState] = useState<SaveState>('loading');
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState<MessageTone>('neutral');
  const [testRequests, setTestRequests] = useState<TestRequest[]>([]);

  const selected = weeks.find((week) => week.weekKey === selectedWeek) ?? weeks[0];
  const loadedRevision = loadedPlan?.revision ?? 0;
  const baseline = signature(loadedPlan?.headline ?? '', loadedPlan?.body ?? '', loadedPlan?.style ?? 'neighbour-note');
  const dirty = saveState !== 'loading' && signature(headline, body, style) !== baseline;
  const remoteRevision = plans[selectedWeek]?.revision ?? 0;
  const hasRemoteChange = saveState !== 'loading' && remoteRevision !== loadedRevision;
  const bodyLength = body.trim().length;
  const validBody = bodyLength >= MIN_BODY && body.length <= MAX_BODY;
  const canSubmit = !!db && !!user && !!selected && validBody && dirty && !hasRemoteChange && saveState !== 'saving';
  const latestTest = testRequests[0];

  useEffect(() => {
    if (!db) return;
    return onSnapshot(collection(db, 'weekly_email_plans'), (snapshot) => {
      const next: Record<string, DigestContribution> = {};
      snapshot.docs.forEach((item) => {
        const value = item.data() as DigestContribution;
        if (value.status === 'published') next[item.id] = value;
      });
      setPlans(next);
    }, (error) => {
      console.error('Could not load weekly email plans:', error);
      setMessage('Saved editions could not be loaded. Check the connection before writing.');
      setMessageTone('critical');
      setSaveState('error');
    });
  }, []);

  useEffect(() => {
    if (!db || !selectedWeek) return;
    const tests = query(collection(db, 'digest_test_requests'), where('planWeekKey', '==', selectedWeek));
    return onSnapshot(tests, (snapshot) => {
      const rows = snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as TestRequest));
      rows.sort((a, b) => (b.submittedAt ?? 0) - (a.submittedAt ?? 0));
      setTestRequests(rows);
    }, (error) => {
      console.error('Could not load planner delivery status:', error);
      setTestRequests([]);
    });
  }, [selectedWeek]);

  async function loadWeek(weekKey: string, discardDraft = false) {
    if (!db) return;
    setSaveState('loading');
    setMessage('');
    try {
      const snapshot = await getDoc(doc(db, 'weekly_email_plans', weekKey));
      const plan = snapshot.exists() ? snapshot.data() as DigestContribution : null;
      const revision = plan?.revision ?? 0;
      const stored = discardDraft ? null : safeDraft(sessionStorage.getItem(draftKey(weekKey)));
      const draft = stored?.baseRevision === revision ? stored : null;
      if (stored && !draft) sessionStorage.removeItem(draftKey(weekKey));

      setLoadedPlan(plan);
      setHeadline(draft?.headline ?? plan?.headline ?? '');
      setBody(draft?.body ?? plan?.body ?? '');
      setStyle(draft?.style ?? plan?.style ?? 'neighbour-note');
      setSaveState('idle');
      if (draft) {
        setMessage('Unsaved work from this tab was restored.');
        setMessageTone('attention');
      }
    } catch (error) {
      console.error('Could not load this email week:', error);
      setSaveState('error');
      setMessage('This edition could not be loaded. Nothing you type will be scheduled until it reconnects.');
      setMessageTone('critical');
    }
  }

  useEffect(() => { void loadWeek(selectedWeek); }, []);

  useEffect(() => {
    if (!selectedWeek || saveState === 'loading') return;
    if (dirty) {
      const draft: Draft = { headline, body, style, baseRevision: loadedRevision };
      sessionStorage.setItem(draftKey(selectedWeek), JSON.stringify(draft));
    } else {
      sessionStorage.removeItem(draftKey(selectedWeek));
    }
  }, [body, dirty, headline, loadedRevision, saveState, selectedWeek, style]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  async function changeWeek(nextWeek: string) {
    if (nextWeek === selectedWeek) return;
    if (dirty && !window.confirm('Leave this edition? Your unscheduled draft will stay in this browser tab.')) return;
    setSelectedWeek(nextWeek);
    setTestRequests([]);
    await loadWeek(nextWeek);
  }

  async function reloadRemote() {
    if (dirty && !window.confirm('Replace your draft with the latest saved version?')) return;
    await loadWeek(selectedWeek, true);
  }

  function testPayload(plan: DigestContribution, action: 'preview' | 'cancelled' = 'preview') {
    return {
      action,
      planWeekKey: plan.weekKey,
      headline: plan.headline,
      body: plan.body,
      style: plan.style,
      revision: plan.revision ?? 1,
      submittedByUid: user!.uid,
      submittedByEmail: user!.email ?? '',
      submittedAt: Date.now(),
      status: 'pending',
      processedAt: null,
    };
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit || !db || !user || !selected) return;
    setSaveState('saving');
    setMessage('');

    const now = Date.now();
    const testRef = doc(collection(db, 'digest_test_requests'));
    const auditRef = doc(collection(db, 'admin_audit_logs'));
    const planRef = doc(db, 'weekly_email_plans', selected.weekKey);

    try {
      let savedPlan: DigestContribution | null = null;
      await runTransaction(db, async (transaction) => {
        const current = await transaction.get(planRef);
        const server = current.exists() ? current.data() as DigestContribution : null;
        const serverRevision = server?.revision ?? 0;
        if (serverRevision !== loadedRevision) throw new PlannerConflictError();

        savedPlan = {
          weekKey: selected.weekKey,
          weekStart: selected.weekStart,
          headline: headline.trim(),
          body: body.trim(),
          style,
          status: 'published',
          authorUid: user.uid,
          authorEmail: user.email ?? '',
          authorName: user.displayName ?? '',
          createdAt: server?.createdAt ?? now,
          updatedAt: now,
          revision: serverRevision + 1,
        };
        transaction.set(planRef, savedPlan);
        transaction.set(testRef, testPayload(savedPlan));
        transaction.set(auditRef, {
          action: server ? 'weekly_email_plan_update' : 'weekly_email_plan_create',
          targetCollection: 'weekly_email_plans', targetId: selected.weekKey,
          adminUid: user.uid, adminEmail: user.email ?? '', timestamp: now,
          changes: { revision: savedPlan.revision, style, headline: savedPlan.headline, bodyLength: savedPlan.body.length },
          metadata: { testRequestId: testRef.id },
        });
      });

      setLoadedPlan(savedPlan);
      setHeadline(savedPlan!.headline);
      setBody(savedPlan!.body);
      sessionStorage.removeItem(draftKey(selected.weekKey));
      setSaveState('saved');
      setMessage('Scheduled. Test delivery has started for every admin.');
      setMessageTone('ok');
    } catch (error) {
      if (error instanceof PlannerConflictError) {
        setSaveState('conflict');
        setMessage('Another admin changed this edition while you were writing. Review their version before publishing yours.');
        setMessageTone('critical');
      } else {
        console.error('Could not save weekly email plan:', error);
        setSaveState('error');
        setMessage('Nothing was scheduled. Your draft is still safe in this tab.');
        setMessageTone('critical');
      }
    }
  }

  async function resendTest() {
    if (!db || !user || !loadedPlan || dirty || hasRemoteChange || saveState === 'saving') return;
    setSaveState('saving');
    const testRef = doc(collection(db, 'digest_test_requests'));
    const auditRef = doc(collection(db, 'admin_audit_logs'));
    try {
      const batch = writeBatch(db);
      batch.set(testRef, testPayload(loadedPlan));
      batch.set(auditRef, {
        action: 'weekly_email_plan_retest', targetCollection: 'weekly_email_plans', targetId: selectedWeek,
        adminUid: user.uid, adminEmail: user.email ?? '', timestamp: Date.now(),
        changes: { revision: loadedRevision }, metadata: { testRequestId: testRef.id },
      });
      await batch.commit();
      setSaveState('saved');
      setMessage('A fresh test is on its way to every admin.');
      setMessageTone('ok');
    } catch (error) {
      console.error('Could not resend planner test:', error);
      setSaveState('error');
      setMessage('The saved note is unchanged, but the new test could not be queued.');
      setMessageTone('critical');
    }
  }

  async function unschedule() {
    if (!db || !user || !loadedPlan || dirty || hasRemoteChange) return;
    if (!window.confirm(`Remove the opening note from ${selected?.label}? The standard weekly email will still send.`)) return;
    setSaveState('saving');
    const planRef = doc(db, 'weekly_email_plans', selectedWeek);
    const testRef = doc(collection(db, 'digest_test_requests'));
    const auditRef = doc(collection(db, 'admin_audit_logs'));
    try {
      await runTransaction(db, async (transaction) => {
        const current = await transaction.get(planRef);
        const server = current.exists() ? current.data() as DigestContribution : null;
        if (!server || (server.revision ?? 0) !== loadedRevision) throw new PlannerConflictError();
        transaction.delete(planRef);
        transaction.set(testRef, testPayload(server, 'cancelled'));
        transaction.set(auditRef, {
          action: 'weekly_email_plan_delete', targetCollection: 'weekly_email_plans', targetId: selectedWeek,
          adminUid: user.uid, adminEmail: user.email ?? '', timestamp: Date.now(),
          changes: { removedRevision: loadedRevision }, metadata: { notificationRequestId: testRef.id },
        });
      });
      sessionStorage.removeItem(draftKey(selectedWeek));
      setLoadedPlan(null);
      setHeadline(''); setBody(''); setStyle('neighbour-note');
      setSaveState('saved');
      setMessage('Opening note removed. The normal weekly brief remains scheduled, and every admin is being notified.');
      setMessageTone('ok');
    } catch (error) {
      if (error instanceof PlannerConflictError) {
        setSaveState('conflict');
        setMessage('This edition changed before it could be removed. Load the latest version and review it first.');
      } else {
        console.error('Could not unschedule weekly email note:', error);
        setSaveState('error');
        setMessage('The opening note is still scheduled. It could not be removed.');
      }
      setMessageTone('critical');
    }
  }

  const toneColor: Record<MessageTone, string> = {
    neutral: T.muted, ok: T.ok, attention: T.attention, critical: T.critical,
  };
  const previewParagraphs = body.trim() ? body.trim().split(/\n\s*\n/) : [];

  return (
    <div className="space-y-4">
      <section className="rounded-xl border bg-white px-4 py-3" style={{ borderColor: T.line }} aria-label="Selected email edition">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg" style={{ background: `${T.signal}12`, color: T.signal }}>
              <CalendarDays size={18} />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-bold" style={{ color: T.ink }}>{selected?.label}</p>
                {loadedPlan ? <Chip tone="ok"><Check size={11} /> Scheduled</Chip> : <Chip>Standard brief only</Chip>}
                {dirty && <Chip tone="attention">Unsaved draft</Chip>}
              </div>
              <p className="mt-0.5 text-xs" style={{ color: T.muted }}>
                {loadedPlan
                  ? `Revision ${loadedRevision} · edited by ${loadedPlan.authorName || loadedPlan.authorEmail || 'an admin'} · ${formatTime(loadedPlan.updatedAt)}`
                  : 'No optional opening note. The regular personalized digest will still send.'}
              </p>
            </div>
          </div>
          <div className="w-full lg:w-[19rem]">
            <label className="sr-only" htmlFor="planner-week">Choose email week</label>
            <select id="planner-week" className={inputClass} style={inputStyle} value={selectedWeek} onChange={(event) => void changeWeek(event.target.value)}>
              {weeks.map((week, index) => (
                <option key={week.weekKey} value={week.weekKey}>
                  {plans[week.weekKey] ? 'Scheduled · ' : ''}{index === 0 ? 'Next · ' : ''}{week.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border bg-white" style={{ borderColor: T.line }} aria-labelledby="template-routing-title">
        <div className="border-b px-4 py-3" style={{ borderColor: T.line }}>
          <h2 id="template-routing-title" className="text-sm font-bold" style={{ color: T.ink }}>Template routing</h2>
          <p className="mt-0.5 text-xs" style={{ color: T.muted }}>Each format has one job. Weekly edits never alter the subscriber welcome letter.</p>
        </div>
        <dl className="divide-y md:grid md:grid-cols-3 md:divide-x md:divide-y-0" style={{ borderColor: T.line }}>
          {DIGEST_TEMPLATE_PURPOSES.map((template) => {
            const Icon = TEMPLATE_ICONS[template.id];
            const active = template.id === 'weekly';
            return (
              <div key={template.id} className="flex gap-3 p-4" style={{ background: active ? `${T.signal}0A` : T.card }}>
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg" style={{ background: active ? `${T.signal}16` : T.surface, color: active ? T.signal : T.muted }}>
                  <Icon size={15} />
                </span>
                <div className="min-w-0">
                  <dt className="flex flex-wrap items-center gap-2 text-xs font-bold" style={{ color: T.ink }}>
                    {template.label}{active && <Chip tone="signal">Editing</Chip>}
                  </dt>
                  <dd className="mt-0.5 text-[0.68rem] font-semibold" style={{ color: active ? T.signal : T.muted }}>{template.timing}</dd>
                  <dd className="mt-1 text-[0.7rem] leading-snug" style={{ color: T.muted }}>{template.purpose}</dd>
                </div>
              </div>
            );
          })}
        </dl>
      </section>

      {hasRemoteChange && (
        <div className="flex items-start justify-between gap-4 rounded-xl border p-4" style={{ background: `${T.critical}0A`, borderColor: `${T.critical}55` }} role="alert">
          <div className="flex min-w-0 gap-3">
            <AlertTriangle className="mt-0.5 shrink-0" size={18} style={{ color: T.critical }} />
            <div>
              <p className="text-sm font-bold" style={{ color: T.ink }}>A newer version was saved</p>
              <p className="mt-0.5 max-w-2xl text-xs leading-relaxed" style={{ color: T.muted }}>Your draft has not been overwritten. Load the saved version before scheduling, then reapply anything you still need.</p>
            </div>
          </div>
          <AdminButton variant="outline" tone="critical" size="sm" onClick={() => void reloadRemote()}><RefreshCw size={13} /> Load latest</AdminButton>
        </div>
      )}

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.08fr)_minmax(350px,0.92fr)]">
        <Panel title="Weekly opening note" subtitle="Optional. It appears only in the recurring weekly brief, before the automated neighbourhood briefing." action={saveState === 'loading' ? <Chip tone="attention"><Loader2 size={11} className="motion-safe:animate-spin" /> Loading</Chip> : undefined}>
          <form className="space-y-5" onSubmit={submit}>
            <fieldset>
              <legend className="text-xs font-semibold" style={{ color: T.ink }}>Editorial format</legend>
              <p className="mb-2 mt-0.5 text-[0.7rem]" style={{ color: T.muted }}>Choose by purpose. This changes the note's structure, not the underlying weekly template.</p>
              <div className="grid gap-2 sm:grid-cols-3">
                {DIGEST_CONTRIBUTION_STYLES.map((option) => {
                  const active = option === style;
                  const copy = CONTRIBUTION_STYLE_COPY[option];
                  return (
                    <button key={option} type="button" aria-pressed={active} onClick={() => setStyle(option)} disabled={saveState === 'loading' || saveState === 'saving'} className="rounded-xl p-3 text-left transition-colors duration-200 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2" style={{ border: `1px solid ${active ? T.signal : T.line}`, background: active ? `${T.signal}0D` : T.card, outlineColor: T.signal }}>
                      <span className="flex items-center justify-between gap-2 text-xs font-bold" style={{ color: active ? T.signal : T.ink }}>{copy.label}{active && <Check size={13} />}</span>
                      <span className="mt-1 block text-[0.7rem] leading-snug" style={{ color: T.muted }}>{copy.description}</span>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <Field label="Headline (optional)">
              <input className={inputClass} style={inputStyle} maxLength={100} value={headline} disabled={saveState === 'loading' || saveState === 'saving'} onChange={(event) => setHeadline(event.target.value)} placeholder="What should readers take away?" />
              <p className="mt-1.5 text-[0.7rem]" style={{ color: T.muted }}>This labels the opening note. Subscriber subject lines remain personalized to their area.</p>
            </Field>

            <Field label="Your contribution">
              <textarea className="w-full min-h-52 resize-y rounded-xl border px-3.5 py-3 text-sm leading-relaxed outline-none transition-colors duration-200 focus:border-slate-500 disabled:opacity-60" style={inputStyle} maxLength={MAX_BODY} value={body} disabled={saveState === 'loading' || saveState === 'saving'} onChange={(event) => setBody(event.target.value)} placeholder="Write the note readers should see before their weekly briefing…" aria-describedby="planner-count planner-guidance planner-validation" />
              <div className="mt-1.5 flex items-start justify-between gap-3 text-[0.7rem]" style={{ color: T.muted }}>
                <span id="planner-guidance">Use a blank line for a new paragraph. Email-safe formatting is automatic.</span>
                <span id="planner-count" className="shrink-0 tabular-nums" style={{ fontFamily: mono, color: body.length > MAX_BODY * 0.9 ? T.attention : T.muted }}>{body.length}/{MAX_BODY}</span>
              </div>
              <p id="planner-validation" className="mt-1 min-h-4 text-[0.7rem]" style={{ color: bodyLength > 0 && bodyLength < MIN_BODY ? T.attention : T.muted }}>
                {bodyLength > 0 && bodyLength < MIN_BODY ? `${MIN_BODY - bodyLength} more characters needed.` : 'Aim for one to three short paragraphs.'}
              </p>
            </Field>

            <div className="border-t pt-4" style={{ borderColor: T.line }}>
              <div className="flex flex-wrap items-center gap-2">
                <AdminButton type="submit" tone="signal" disabled={!canSubmit}>{saveState === 'saving' ? <><Loader2 size={14} className="motion-safe:animate-spin" /> Working…</> : <><Send size={14} /> Schedule & test</>}</AdminButton>
                {loadedPlan && <AdminButton variant="outline" size="sm" onClick={() => void resendTest()} disabled={dirty || hasRemoteChange || saveState === 'saving'}><RefreshCw size={13} /> Send test again</AdminButton>}
                {loadedPlan && <AdminButton variant="ghost" tone="critical" size="sm" onClick={() => void unschedule()} disabled={dirty || hasRemoteChange || saveState === 'saving'}><Trash2 size={13} /> Remove note</AdminButton>}
              </div>
              <div className="mt-3 flex min-h-8 items-center gap-2">
                {message && <p role="status" className="text-xs leading-snug" style={{ color: toneColor[messageTone] }}>{message}</p>}
                {!message && dirty && <p className="text-xs" style={{ color: T.muted }}>Draft kept in this tab until you schedule or close it.</p>}
              </div>
            </div>
          </form>
        </Panel>

        <div className="space-y-4 xl:sticky xl:top-24">
          <Panel title="Inbox preview" subtitle="A close representation of the opening subscribers will receive." action={<MailCheck size={16} style={{ color: T.signal }} />} padded={false}>
            <div className="p-3 sm:p-5" style={{ background: '#0E1A17' }}>
              <div className="mx-auto max-w-[34rem]" style={{ color: '#DCD3C4' }}>
                <div className="flex items-center justify-between border-b-2 pb-3" style={{ borderColor: '#E0AC63' }}>
                  <div className="flex items-center gap-2.5">
                    <img src="/images/email/logo.png" width="40" height="40" alt="" className="h-10 w-10 object-contain" />
                    <div><p className="text-[0.68rem] font-bold tracking-[0.16em]" style={{ color: '#F4EEE3' }}>CALGARY WATCH</p><p className="mt-1 text-[0.65rem]" style={{ color: '#A6B8AE' }}>{selected?.label}</p></div>
                  </div>
                  <span className="text-[0.65rem]" style={{ color: '#A6B8AE' }}>{selected?.weekKey}</span>
                </div>
                <div className="py-5">
                  <OpeningPreview style={style} headline={headline} paragraphs={previewParagraphs} weekKey={selected?.weekKey ?? ''} />
                  <div className="pt-6">
                    <p className="text-xl font-bold" style={{ fontFamily: display, color: '#F4EEE3' }}>Morning, neighbour.</p>
                    <p className="mt-2 text-[0.78rem] leading-relaxed" style={{ color: '#A6B8AE' }}>The regular location-based summary, weekly comparison and report list continue below.</p>
                    <div className="mt-4 rounded-md p-3" style={{ background: '#17251F', border: '1px solid #2C443B' }}><div className="flex items-center justify-between text-[0.65rem] font-bold uppercase tracking-[0.12em]" style={{ color: '#E0AC63' }}><span>This week</span><span style={{ color: '#A6B8AE' }}>Your area</span></div></div>
                  </div>
                </div>
              </div>
            </div>
          </Panel>

          <Panel title="Admin proof delivery" subtitle="A private branded proof follows every publish, retest and removal." action={<History size={15} style={{ color: T.muted }} />}>
            <DeliveryStatus request={latestTest} />
            {latestTest?.error && <p className="mt-2 rounded-lg px-3 py-2 text-[0.7rem] leading-relaxed" style={{ background: `${T.critical}0A`, color: T.critical }}>{latestTest.error}</p>}
            {testRequests.length > 1 && (
              <details className="mt-3 border-t pt-3" style={{ borderColor: T.line }}>
                <summary className="cursor-pointer text-xs font-semibold" style={{ color: T.signal }}>Earlier activity ({testRequests.length - 1})</summary>
                <div className="mt-3 space-y-3">{testRequests.slice(1, 4).map((request) => <DeliveryStatus key={request.id} request={request} />)}</div>
              </details>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
