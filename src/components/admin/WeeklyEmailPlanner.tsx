import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  collection, doc, getDoc, onSnapshot, query, runTransaction, where, writeBatch,
} from 'firebase/firestore';
import {
  AlertTriangle, Bell, Bold, BookOpenText, CalendarDays, Check, Copy, Eye, FileText, Heading3,
  HelpCircle, History, Inbox, LayoutDashboard, Link2, List, Loader2, MailCheck, MapPin, Monitor, Newspaper, PenLine, Quote, RefreshCw,
  Send, ShieldCheck, Smartphone, Sparkles, Trash2, Users, X,
} from 'lucide-react';

import { useAuth } from '@/src/components/FirebaseProvider';
import { db } from '@/src/firebase';
import { alertPushContent } from '@/src/lib/alerts';
import type { Incident } from '@/src/types';
import type { UserProfile } from '@/src/hooks/useAdminData';
import {
  CONTRIBUTION_STYLE_COPY,
  CONTRIBUTION_AUDIENCE_COPY,
  CONTRIBUTION_OUTLINES,
  DIGEST_CONTRIBUTION_AUDIENCES,
  DIGEST_CONTRIBUTION_STYLES,
  DIGEST_TEMPLATE_PURPOSES,
  digestBodyPlainText,
  contributionAppliesToScope,
  normalizeDigestUrl,
  parseDigestBody,
  upcomingDigestWeeks,
  type DigestInlineToken,
  type DigestContribution,
  type DigestContributionAudience,
  type DigestContributionStyle,
} from '@/src/lib/digestPlanner';
import {
  AdminButton, Chip, Field, Panel, StatusDot, T, display, inputClass, inputStyle, mono,
} from './ui';
import { configuredDigestAudienceForecast, DigestAudienceForecast } from './DigestAudienceForecast';
import { DigestReplyInbox } from './DigestReplyInbox';

const MAX_BODY = 2400;
const MIN_BODY = 20;
const PROOF_SERVICE_ENABLED = String(import.meta.env.VITE_DIGEST_PROOF_ENABLED ?? '').toLowerCase() === 'true';

const TEMPLATE_ICONS = {
  welcome: BookOpenText,
  weekly: Newspaper,
  'admin-proof': ShieldCheck,
} as const;

const AUDIENCE_ICONS = {
  everyone: Users,
  local: MapPin,
  citywide: Newspaper,
} as const;

type SaveState = 'idle' | 'loading' | 'saving' | 'saved' | 'error' | 'conflict';
type MessageTone = 'neutral' | 'ok' | 'attention' | 'critical';
type TestStatus = 'pending' | 'sending' | 'retrying' | 'sent' | 'partial' | 'failed';
type PlannerView = 'overview' | 'replies' | 'preview' | 'compose' | 'audience' | 'templates';
type SubscriberPreview = 'weekly-local' | 'weekly-city' | 'welcome' | 'alert';

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
  preheader: string;
  body: string;
  style: DigestContributionStyle;
  audience: DigestContributionAudience;
  byline: string;
  ctaLabel: string;
  ctaUrl: string;
  baseRevision: number;
  ownerUid: string;
  savedAt: number;
};

class PlannerConflictError extends Error {}

const DRAFT_TTL = 30 * 24 * 60 * 60 * 1000;
const draftKey = (uid: string, weekKey: string) => `cw_weekly_email_draft_${uid}_${weekKey}`;
const draftRead = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };
const draftRemove = (key: string) => { try { localStorage.removeItem(key); } catch { /* storage may be blocked */ } };
const draftWrite = (key: string, value: Draft) => {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
};
const signature = (
  headline: string, preheader: string, body: string, style: DigestContributionStyle,
  audience: DigestContributionAudience, byline: string, ctaLabel: string, ctaUrl: string,
) => JSON.stringify([headline, preheader, body, style, audience, byline, ctaLabel, ctaUrl]);

function formatTime(value: number | undefined): string {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Edmonton', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  }).format(new Date(value));
}

function safeDraft(value: string | null, ownerUid: string): Draft | null {
  if (!value) return null;
  try {
    const draft = JSON.parse(value) as Partial<Draft>;
    if (
      typeof draft.headline !== 'string' || typeof draft.preheader !== 'string' || typeof draft.body !== 'string' ||
      typeof draft.byline !== 'string' || typeof draft.ctaLabel !== 'string' || typeof draft.ctaUrl !== 'string' ||
      typeof draft.baseRevision !== 'number' || typeof draft.savedAt !== 'number' || draft.ownerUid !== ownerUid ||
      Date.now() - draft.savedAt > DRAFT_TTL ||
      !DIGEST_CONTRIBUTION_STYLES.includes(draft.style as DigestContributionStyle) ||
      !DIGEST_CONTRIBUTION_AUDIENCES.includes(draft.audience as DigestContributionAudience)
    ) return null;
    return draft as Draft;
  } catch {
    return null;
  }
}

function PreviewInline({ tokens }: { tokens: DigestInlineToken[] }) {
  return <>{tokens.map((token, index) => {
    if (token.type === 'strong') return <strong key={index} style={{ color: '#F4EEE3' }}>{token.text}</strong>;
    if (token.type === 'link') return <span key={index} className="font-semibold underline" style={{ color: '#5CC3AA' }}>{token.text}</span>;
    return <span key={index} className="whitespace-pre-line">{token.text}</span>;
  })}</>;
}

function PreviewBody({ body }: { body: string }) {
  const blocks = parseDigestBody(body);
  if (!blocks.length) return <p style={{ color: '#A6B8AE' }}>Your optional opening note will appear here.</p>;
  return <div className="mt-2 space-y-2.5 text-[0.82rem] leading-relaxed" style={{ color: '#DCD3C4' }}>
    {blocks.map((block, index) => {
      if (block.type === 'heading') return <p key={index} className="pt-1 text-[0.92rem] font-bold" style={{ fontFamily: display, color: '#F4EEE3' }}><PreviewInline tokens={block.content} /></p>;
      if (block.type === 'quote') return <blockquote key={index} className="border-s-2 ps-3 italic" style={{ borderColor: '#E0AC63' }}><PreviewInline tokens={block.content} /></blockquote>;
      if (block.type === 'list') return <ul key={index} className="space-y-1 ps-4">{block.items.map((item, itemIndex) => <li key={itemIndex} className="list-disc marker:text-[#E0AC63]"><PreviewInline tokens={item} /></li>)}</ul>;
      return <p key={index}><PreviewInline tokens={block.content} /></p>;
    })}
  </div>;
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
  style, headline, body, weekKey, byline, ctaLabel,
}: {
  style: DigestContributionStyle;
  headline: string;
  body: string;
  weekKey: string;
  byline: string;
  ctaLabel: string;
}) {
  const copy = CONTRIBUTION_STYLE_COPY[style];
  const content = (
    <>
      <p className="text-lg font-bold leading-snug" style={{ fontFamily: display, color: '#F4EEE3' }}>
        {headline.trim() || copy.label}
      </p>
      <PreviewBody body={body} />
      {byline.trim() && <p className="mt-3 text-[0.72rem] font-semibold" style={{ color: '#A6B8AE' }}>{byline.trim()}</p>}
      {ctaLabel.trim() && <span className="mt-4 inline-block rounded-sm px-3 py-2 text-[0.7rem] font-bold" style={{ background: '#F4EEE3', color: '#0E1A17' }}>{ctaLabel.trim()} →</span>}
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
        {!byline.trim() && <p className="mt-4 text-[0.72rem] font-semibold" style={{ color: '#A6B8AE' }}>From the Calgary Watch team</p>}
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

/**
 * A mock of the browser/phone push that rides along with the alert email, built
 * from the same alertPushContent the sender uses so the two never diverge. The
 * sample mirrors the alert-email fixture (an emergency + two nearby reports).
 */
function PushNotificationPreview() {
  const sample = [
    { title: 'Grass fire near the pathway' },
    { title: 'Break and enter on the 200 block' },
    { title: 'Catalytic converter theft reported' },
  ] as unknown as Incident[];
  const { title, body } = alertPushContent(sample);
  return (
    <div className="mx-auto mb-4 max-w-[26rem]">
      <p className="mb-2 flex items-center gap-1.5 text-[0.68rem] font-bold" style={{ color: T.muted }}>
        <Smartphone size={12} /> Also delivered as a push notification
      </p>
      <div className="flex items-start gap-3 rounded-2xl p-3 shadow-sm" style={{ background: '#F4F5F7', border: '1px solid #E2E5EA' }}>
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: '#06162F' }}>
          <Bell size={17} className="text-[#F2EFE8]" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[0.64rem]" style={{ color: '#6B7280' }}>
            <span className="font-semibold" style={{ color: '#374151' }}>Calgary Watch</span>
            <span>· now</span>
          </div>
          <p className="mt-0.5 text-[0.82rem] font-bold leading-tight" style={{ color: '#111827' }}>{title}</p>
          <p className="mt-0.5 text-[0.76rem] leading-snug" style={{ color: '#4B5563' }}>{body}</p>
        </div>
      </div>
    </div>
  );
}

function ProductionEmailViewer({ plan }: { plan: DigestContribution | undefined }) {
  const [route, setRoute] = useState<SubscriberPreview>('weekly-local');
  const [html, setHtml] = useState('');
  const [error, setError] = useState('');
  const routeConfig: Record<SubscriberPreview, { label: string; detail: string; file: string }> = {
    'weekly-local': { label: 'Weekly · local', detail: 'For readers with nearby results', file: 'digest.html' },
    'weekly-city': { label: 'Weekly · city-wide', detail: 'For readers without a local result set', file: 'city.html' },
    welcome: { label: 'Welcome letter', detail: 'Each subscriber’s first eligible send', file: 'welcome.html' },
    alert: { label: 'Instant alert', detail: 'Between-digest urgent nearby reports', file: 'alert.html' },
  };
  const active = routeConfig[route];

  useEffect(() => {
    let cancelled = false;
    setHtml('');
    setError('');
    fetch(`${import.meta.env.BASE_URL}email-previews/${active.file}`, { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.text();
      })
      .then((value) => { if (!cancelled) setHtml(value); })
      .catch((reason) => {
        console.error('Could not load production email preview:', reason);
        if (!cancelled) setError('The production preview could not be loaded. No email or schedule was changed.');
      });
    return () => { cancelled = true; };
  }, [active.file]);

  const weekly = route === 'weekly-local' || route === 'weekly-city';
  const previewFacts: Array<[string, string]> = route === 'alert'
    ? [
        ['Fixed for everyone', 'Branding and a short list of nearby reports'],
        ['Personalized', 'Only the reports that matched this reader’s zones and categories'],
        ['Delivery rule', 'Between digests when something worth interrupting for happens nearby, outside quiet hours'],
      ]
    : weekly
      ? [
          ['Fixed for everyone', 'Branding, layout, legal footer and report structure'],
          ['Personalized Monday', 'Name, subject, location, latest reports and distances'],
          ['Delivery rule', 'Only after that person’s welcome was delivered'],
        ]
      : [
          ['Fixed for everyone', 'Branding, onboarding explanation and legal footer'],
          ['Personalized Monday', 'Name, location and that week’s current sample briefing'],
          ['Delivery rule', 'Only when no successful welcome is recorded'],
        ];
  return (
    <section className="overflow-hidden rounded-xl border bg-white" style={{ borderColor: T.line }} aria-labelledby="production-email-title">
      <header className="border-b px-4 py-4 sm:px-5" style={{ borderColor: T.line }}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="production-email-title" className="text-sm font-bold" style={{ color: T.ink }}>Subscriber email preview</h2>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed" style={{ color: T.muted }}>This is the production template—not an admin-proof approximation. The reports, greeting, subject, distances and unsubscribe link are rebuilt for each person when Monday’s job runs.</p>
          </div>
          <Chip tone="ok"><Eye size={11} /> Production template</Chip>
        </div>
        <div className="mt-4 grid gap-1 rounded-lg p-1 sm:grid-cols-3" style={{ background: T.surface }} aria-label="Choose recipient email route">
          {(Object.keys(routeConfig) as SubscriberPreview[]).map((id) => {
            const selectedRoute = route === id;
            return <button key={id} type="button" aria-pressed={selectedRoute} onClick={() => setRoute(id)} className="rounded-md px-3 py-2 text-left transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2" style={{ background: selectedRoute ? T.card : 'transparent', color: selectedRoute ? T.signal : T.ink, boxShadow: selectedRoute ? `0 1px 3px ${T.rail}14` : 'none', outlineColor: T.signal }}><span className="block text-xs font-bold">{routeConfig[id].label}</span><span className="mt-0.5 block text-[0.66rem]" style={{ color: T.muted }}>{routeConfig[id].detail}</span></button>;
          })}
        </div>
      </header>

      {weekly && plan && (
        <div className="border-b px-4 py-4 sm:px-5" style={{ borderColor: T.line, background: `${T.signal}05` }}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><p className="text-xs font-bold" style={{ color: T.ink }}>Approved opening for this Monday</p><p className="mt-0.5 text-[0.68rem]" style={{ color: T.muted }}>These exact words are inserted before the personalized report section for {CONTRIBUTION_AUDIENCE_COPY[plan.audience ?? 'everyone'].label.toLowerCase()}.</p></div>
            <Chip tone="ok"><Check size={11} /> Revision {plan.revision ?? 1}</Chip>
          </div>
          <div className="mt-3 max-w-[34rem] rounded-lg p-4" style={{ background: '#0E1A17' }}><OpeningPreview style={plan.style} headline={plan.headline} body={plan.body} weekKey={plan.weekKey} byline={plan.byline ?? ''} ctaLabel={plan.ctaLabel ?? ''} /></div>
        </div>
      )}

      <div className="grid border-b md:grid-cols-3" style={{ borderColor: T.line }}>
        {previewFacts.map(([label, value]) =><div key={label} className="border-b px-4 py-3 last:border-b-0 md:border-b-0 md:border-e md:last:border-e-0" style={{ borderColor: T.line }}><p className="text-[0.66rem] font-bold" style={{ color: T.ink }}>{label}</p><p className="mt-1 text-[0.68rem] leading-relaxed" style={{ color: T.muted }}>{value}</p></div>)}
      </div>

      <div className="p-3 sm:p-5" style={{ background: T.surface }}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-bold" style={{ color: T.ink }}>{active.label} · representative subscriber</p>
          <a href={`${import.meta.env.BASE_URL}email-previews/${active.file}`} target="_blank" rel="noreferrer" className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border bg-white px-2.5 text-[0.72rem] font-bold focus-visible:outline-2 focus-visible:outline-offset-2" style={{ borderColor: T.line, color: T.ink, outlineColor: T.signal }}><Eye size={13} /> Open full size</a>
        </div>
        {route === 'alert' && <PushNotificationPreview />}
        <div className="mx-auto max-w-[42rem] overflow-hidden rounded-xl border bg-white" style={{ borderColor: T.line }}>
          {error ? <div className="flex min-h-64 flex-col items-center justify-center gap-2 p-6 text-center" role="alert"><AlertTriangle size={20} style={{ color: T.critical }} /><p className="max-w-md text-xs" style={{ color: T.muted }}>{error}</p></div> : html ? <iframe srcDoc={html} title={`${active.label} production email preview`} className="block h-[48rem] w-full bg-white" sandbox="" /> : <div className="h-[48rem] space-y-5 p-8 motion-safe:animate-pulse" aria-label="Loading production email preview"><div className="mx-auto h-12 w-52 rounded-lg" style={{ background: T.line }} /><div className="mx-auto h-40 max-w-lg rounded-xl" style={{ background: T.card }} /><div className="mx-auto h-56 max-w-lg rounded-xl" style={{ background: T.card }} /></div>}
        </div>
        <p className="mt-2 text-center text-[0.68rem]" style={{ color: T.muted }}>Representative data makes the layout reviewable before Monday. Recipient-specific values are produced only when the send job reads that person’s profile and the latest reports.</p>
      </div>
    </section>
  );
}

export function WeeklyEmailPlanner({ profiles, profilesLoading, profilesError }: { profiles: UserProfile[]; profilesLoading: boolean; profilesError: string }) {
  const { user } = useAuth();
  const weeks = useMemo(() => upcomingDigestWeeks(Date.now(), 8), []);
  const [plannerView, setPlannerView] = useState<PlannerView>('overview');
  const [plans, setPlans] = useState<Record<string, DigestContribution>>({});
  const [selectedWeek, setSelectedWeek] = useState(weeks[0]?.weekKey ?? '');
  const [loadedPlan, setLoadedPlan] = useState<DigestContribution | null>(null);
  const [headline, setHeadline] = useState('');
  const [preheader, setPreheader] = useState('');
  const [body, setBody] = useState('');
  const [style, setStyle] = useState<DigestContributionStyle>('neighbour-note');
  const [audience, setAudience] = useState<DigestContributionAudience>('everyone');
  const [byline, setByline] = useState('');
  const [ctaLabel, setCtaLabel] = useState('');
  const [ctaUrl, setCtaUrl] = useState('');
  const [previewMode, setPreviewMode] = useState<'visual' | 'text'>('visual');
  const [previewWidth, setPreviewWidth] = useState<'desktop' | 'mobile'>('desktop');
  const [previewScope, setPreviewScope] = useState<'local' | 'citywide'>('local');
  const [activeTemplateId, setActiveTemplateId] = useState<(typeof DIGEST_TEMPLATE_PURPOSES)[number]['id']>('weekly');
  const [showWelcomePreview, setShowWelcomePreview] = useState(false);
  const [welcomePreviewHtml, setWelcomePreviewHtml] = useState('');
  const [welcomePreviewError, setWelcomePreviewError] = useState('');
  const [saveState, setSaveState] = useState<SaveState>('loading');
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState<MessageTone>('neutral');
  const [testRequests, setTestRequests] = useState<TestRequest[]>([]);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const selected = weeks.find((week) => week.weekKey === selectedWeek) ?? weeks[0];
  const loadedRevision = loadedPlan?.revision ?? 0;
  const baseline = signature(
    loadedPlan?.headline ?? '', loadedPlan?.preheader ?? '', loadedPlan?.body ?? '', loadedPlan?.style ?? 'neighbour-note',
    loadedPlan?.audience ?? 'everyone',
    loadedPlan?.byline ?? '', loadedPlan?.ctaLabel ?? '', loadedPlan?.ctaUrl ?? '',
  );
  const dirty = saveState !== 'loading'
    && signature(headline, preheader, body, style, audience, byline, ctaLabel, ctaUrl) !== baseline;
  const remoteRevision = plans[selectedWeek]?.revision ?? 0;
  const hasRemoteChange = saveState !== 'loading' && remoteRevision !== loadedRevision;
  const bodyLength = body.trim().length;
  const validBody = bodyLength >= MIN_BODY && body.length <= MAX_BODY;
  const hasCta = !!ctaLabel.trim() || !!ctaUrl.trim();
  const validCta = !hasCta || (!!ctaLabel.trim() && !!normalizeDigestUrl(ctaUrl));
  const hasOutlinePrompts = /replace this/i.test(body);
  const formattedLinks = [...body.matchAll(/\[[^\]\n]+\]\(([^)\n]*)\)/g)];
  const validBodyLinks = !body.includes('](') || (
    formattedLinks.length > 0 && formattedLinks.every((match) => !!normalizeDigestUrl(match[1]))
  );
  const canSubmit = PROOF_SERVICE_ENABLED && !!db && !!user && !!selected && validBody && validCta && validBodyLinks && !hasOutlinePrompts
    && dirty && !hasRemoteChange && saveState !== 'saving';
  const latestTest = testRequests[0];
  const activeTemplate = DIGEST_TEMPLATE_PURPOSES.find((template) => template.id === activeTemplateId)
    ?? DIGEST_TEMPLATE_PURPOSES[1];
  const welcomePreviewUrl = `${import.meta.env.BASE_URL}email-previews/welcome.html`;

  async function openWelcomePreview() {
    setShowWelcomePreview(true);
    if (welcomePreviewHtml) return;
    setWelcomePreviewError('');
    try {
      const response = await fetch(welcomePreviewUrl, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Preview returned HTTP ${response.status}`);
      setWelcomePreviewHtml(await response.text());
    } catch (error) {
      console.error('Could not load welcome letter preview:', error);
      setWelcomePreviewError('The welcome letter preview could not be loaded. The email template itself was not changed.');
    }
  }

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
    if (!db || !user?.uid) return;
    setSaveState('loading');
    setMessage('');
    try {
      const snapshot = await getDoc(doc(db, 'weekly_email_plans', weekKey));
      const plan = snapshot.exists() ? snapshot.data() as DigestContribution : null;
      const revision = plan?.revision ?? 0;
      const key = draftKey(user?.uid ?? '', weekKey);
      const stored = discardDraft ? null : safeDraft(draftRead(key), user?.uid ?? '');
      const draft = stored?.baseRevision === revision ? stored : null;
      if (stored && !draft) draftRemove(key);

      setLoadedPlan(plan);
      setHeadline(draft?.headline ?? plan?.headline ?? '');
      setPreheader(draft?.preheader ?? plan?.preheader ?? '');
      setBody(draft?.body ?? plan?.body ?? '');
      setStyle(draft?.style ?? plan?.style ?? 'neighbour-note');
      setAudience(draft?.audience ?? plan?.audience ?? 'everyone');
      setByline(draft?.byline ?? plan?.byline ?? '');
      setCtaLabel(draft?.ctaLabel ?? plan?.ctaLabel ?? '');
      setCtaUrl(draft?.ctaUrl ?? plan?.ctaUrl ?? '');
      setSaveState('idle');
      if (draft) {
        setMessage('Your saved draft was restored on this device.');
        setMessageTone('attention');
      }
    } catch (error) {
      console.error('Could not load this email week:', error);
      setSaveState('error');
      setMessage('This edition could not be loaded. Nothing you type will be scheduled until it reconnects.');
      setMessageTone('critical');
    }
  }

  useEffect(() => { if (user?.uid) void loadWeek(selectedWeek); }, [user?.uid]);

  useEffect(() => {
    if (!selectedWeek || saveState === 'loading') return;
    if (dirty) {
      const draft: Draft = {
        headline, preheader, body, style, audience, byline, ctaLabel, ctaUrl,
        baseRevision: loadedRevision, ownerUid: user?.uid ?? '', savedAt: Date.now(),
      };
      draftWrite(draftKey(user?.uid ?? '', selectedWeek), draft);
    } else {
      draftRemove(draftKey(user?.uid ?? '', selectedWeek));
    }
  }, [audience, body, byline, ctaLabel, ctaUrl, dirty, headline, loadedRevision, preheader, saveState, selectedWeek, style, user?.uid]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  async function changeWeek(nextWeek: string) {
    if (nextWeek === selectedWeek) return;
    if (dirty && !window.confirm('Leave this edition? Your draft will remain on this device.')) return;
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
      preheader: plan.preheader ?? '',
      body: plan.body,
      style: plan.style,
      audience: plan.audience ?? 'everyone',
      byline: plan.byline ?? '',
      ctaLabel: plan.ctaLabel ?? '',
      ctaUrl: plan.ctaUrl ?? '',
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
          preheader: preheader.trim(),
          body: body.trim(),
          style,
          audience,
          byline: byline.trim(),
          ctaLabel: ctaLabel.trim(),
          ctaUrl: ctaLabel.trim() ? normalizeDigestUrl(ctaUrl) : '',
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
          changes: {
            revision: savedPlan.revision, style, audience, headline: savedPlan.headline,
            bodyLength: savedPlan.body.length, hasPreheader: !!savedPlan.preheader,
            hasByline: !!savedPlan.byline, hasCta: !!savedPlan.ctaUrl,
          },
          metadata: { testRequestId: testRef.id },
        });
      });

      setLoadedPlan(savedPlan);
      setHeadline(savedPlan!.headline);
      setPreheader(savedPlan!.preheader ?? '');
      setBody(savedPlan!.body);
      setByline(savedPlan!.byline ?? '');
      setCtaLabel(savedPlan!.ctaLabel ?? '');
      setCtaUrl(savedPlan!.ctaUrl ?? '');
      draftRemove(draftKey(user.uid, selected.weekKey));
      setSaveState('saved');
      setMessage('Approved for Monday. Test delivery has started for every admin.');
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
    if (!PROOF_SERVICE_ENABLED || !db || !user || !loadedPlan || dirty || hasRemoteChange || saveState === 'saving') return;
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
      draftRemove(draftKey(user.uid, selectedWeek));
      setLoadedPlan(null);
      setHeadline(''); setPreheader(''); setBody(''); setStyle('neighbour-note'); setAudience('everyone'); setByline(''); setCtaLabel(''); setCtaUrl('');
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

  function insertFormatting(prefix: string, suffix = '', fallback = '') {
    const field = bodyRef.current;
    if (!field) return;
    const start = field.selectionStart;
    const end = field.selectionEnd;
    const selectedText = body.slice(start, end) || fallback;
    const next = `${body.slice(0, start)}${prefix}${selectedText}${suffix}${body.slice(end)}`;
    if (next.length > MAX_BODY) return;
    setBody(next);
    requestAnimationFrame(() => {
      field.focus();
      field.setSelectionRange(start + prefix.length, start + prefix.length + selectedText.length);
    });
  }

  function insertLink() {
    const field = bodyRef.current;
    if (!field) return;
    const start = field.selectionStart;
    const end = field.selectionEnd;
    const label = body.slice(start, end) || 'link text';
    const inserted = `[${label}](https://)`;
    if (body.length + inserted.length - (end - start) > MAX_BODY) return;
    setBody(`${body.slice(0, start)}${inserted}${body.slice(end)}`);
    requestAnimationFrame(() => {
      const cursor = start + 1 + label.length + '](https://'.length;
      field.focus();
      field.setSelectionRange(cursor, cursor);
    });
  }

  function copyAnotherEdition() {
    const source = weeks.map((week) => plans[week.weekKey]).find((plan) => plan && plan.weekKey !== selectedWeek);
    if (!source) return;
    setHeadline(source.headline);
    setPreheader(source.preheader ?? '');
    setBody(source.body);
    setStyle(source.style);
    setAudience(source.audience ?? 'everyone');
    setByline(source.byline ?? '');
    setCtaLabel(source.ctaLabel ?? '');
    setCtaUrl(source.ctaUrl ?? '');
    setMessage(`Copied ${source.weekKey} into this draft. Review dates and links before scheduling.`);
    setMessageTone('attention');
  }

  function applyOutline() {
    const outline = CONTRIBUTION_OUTLINES[style];
    if ((headline.trim() || body.trim()) && !window.confirm('Replace the current headline and contribution with this outline?')) return;
    setHeadline(outline.headline);
    setBody(outline.body);
    setMessage(`${outline.label} added. Replace every prompt before scheduling.`);
    setMessageTone('attention');
    requestAnimationFrame(() => bodyRef.current?.focus());
  }

  const toneColor: Record<MessageTone, string> = {
    neutral: T.muted, ok: T.ok, attention: T.attention, critical: T.critical,
  };
  const wordCount = body.trim() ? digestBodyPlainText(body).trim().split(/\s+/).length : 0;
  const readingSeconds = Math.max(5, Math.ceil((wordCount / 220) * 60));
  const previewShowsOpening = contributionAppliesToScope(
    { audience }, previewScope === 'local' ? 'home' : 'city',
  );
  const plainTextPreview = [
    CONTRIBUTION_STYLE_COPY[style].emailLabel.toUpperCase(),
    headline.trim() || CONTRIBUTION_STYLE_COPY[style].label,
    '', digestBodyPlainText(body).trim(),
    ...(byline.trim() ? ['', byline.trim()] : []),
    ...(ctaLabel.trim() && normalizeDigestUrl(ctaUrl) ? ['', `${ctaLabel.trim()}: ${normalizeDigestUrl(ctaUrl)}`] : []),
  ].join('\n');
  const reusablePlan = weeks.some((week) => week.weekKey !== selectedWeek && plans[week.weekKey]);
  const preflightIssues = [
    ...(!PROOF_SERVICE_ENABLED ? ['Finish Firebase proof-service setup before approval so every admin receives the required proof'] : []),
    ...(!validBody ? [bodyLength === 0 ? 'Write the opening note' : body.length > MAX_BODY ? `Shorten the note by ${body.length - MAX_BODY} characters` : `${MIN_BODY - bodyLength} more characters needed`] : []),
    ...(hasOutlinePrompts ? ['Replace the outline prompts'] : []),
    ...(!validBodyLinks ? ['Finish or remove the incomplete body link'] : []),
    ...(!validCta ? ['Complete both call-to-action fields with an https:// link'] : []),
    ...(hasRemoteChange ? ['Load the latest saved revision'] : []),
  ];
  const audienceForecast = useMemo(() => configuredDigestAudienceForecast(profiles), [profiles]);
  const nextWeek = weeks[0];
  const nextPlan = nextWeek ? plans[nextWeek.weekKey] : undefined;
  const scheduledAudience = audienceForecast.rows.filter((row) => row.status === 'scheduled');
  const scheduledWelcome = scheduledAudience.filter((row) => row.kind === 'welcome').length;
  const scheduledWeekly = scheduledAudience.filter((row) => row.kind === 'weekly').length;
  const heldAudience = audienceForecast.rows.filter((row) => row.status.startsWith('held-')).length;
  const attentionAudience = audienceForecast.rows.filter((row) => row.status === 'attention').length;
  const showComposerNavigation = plannerView === 'compose' || dirty || !!loadedPlan;
  const plannerViews: Array<{ id: PlannerView; label: string; description: string; icon: typeof LayoutDashboard }> = [
    { id: 'overview', label: 'This Monday', description: 'Sent and pending', icon: LayoutDashboard },
    { id: 'replies', label: 'Replies', description: 'Reader responses', icon: Inbox },
    { id: 'preview', label: 'Email preview', description: 'What readers receive', icon: Eye },
    ...(showComposerNavigation ? [{ id: 'compose' as const, label: 'Opening note', description: dirty ? 'Draft needs approval' : 'Optional contribution', icon: PenLine }] : []),
    { id: 'audience', label: 'Recipients', description: 'Who gets which email', icon: Users },
    { id: 'templates', label: 'Delivery rules', description: 'How routing works', icon: FileText },
  ];

  async function openNextCompose() {
    setPlannerView('compose');
    if (dirty || !nextWeek || selectedWeek === nextWeek.weekKey) return;
    setSelectedWeek(nextWeek.weekKey);
    setTestRequests([]);
    await loadWeek(nextWeek.weekKey);
  }

  function selectPlannerView(view: PlannerView) {
    setPlannerView(view);
    if (view !== 'overview' || dirty || !nextWeek || selectedWeek === nextWeek.weekKey) return;
    setSelectedWeek(nextWeek.weekKey);
    setTestRequests([]);
    void loadWeek(nextWeek.weekKey);
  }

  return (
    <div className="space-y-4">
      <nav className="overflow-x-auto rounded-xl border bg-white p-1.5" style={{ borderColor: T.line }} aria-label="Email planner sections">
        <div className="flex min-w-max gap-1">
          {plannerViews.map((item) => {
            const Icon = item.icon;
            const active = plannerView === item.id;
            return (
              <button key={item.id} type="button" aria-current={active ? 'page' : undefined} onClick={() => selectPlannerView(item.id)} className="flex min-h-12 min-w-[9.5rem] flex-1 items-center gap-2.5 rounded-lg px-3 text-left transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2" style={{ background: active ? T.rail : 'transparent', color: active ? '#fff' : T.ink, outlineColor: T.signal }}>
                <Icon size={15} className="shrink-0" style={{ color: active ? '#fff' : T.muted }} />
                <span className="min-w-0">
                  <span className="block text-xs font-bold">{item.label}</span>
                  <span className="block truncate text-[0.65rem]" style={{ color: active ? '#CBD1D9' : T.muted }}>{item.description}</span>
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      {plannerView === 'preview' && <ProductionEmailViewer plan={nextPlan} />}

      {plannerView === 'replies' && <DigestReplyInbox />}

      {plannerView === 'overview' && (
        <section className="overflow-hidden rounded-xl border bg-white" style={{ borderColor: T.line }} aria-labelledby="email-overview-title">
          <header className="flex flex-wrap items-start justify-between gap-3 border-b px-4 py-4 sm:px-5" style={{ borderColor: T.line }}>
            <div><h2 id="email-overview-title" className="text-base font-bold" style={{ color: T.ink }}>This Monday’s send</h2><p className="mt-0.5 text-xs" style={{ color: T.muted }}>{nextWeek?.label} · automatic run at 15:00 UTC (09:00 MDT / 08:00 MST)</p></div>
            <div className="flex flex-wrap gap-2"><AdminButton tone="signal" onClick={() => setPlannerView('preview')}><Eye size={14} /> See the exact emails</AdminButton><AdminButton variant="outline" onClick={() => setPlannerView('audience')}><Users size={14} /> See recipients</AdminButton></div>
          </header>

          <div className="divide-y" style={{ borderColor: T.line }}>
            <div className="grid gap-3 px-4 py-4 sm:grid-cols-[10rem_minmax(0,1fr)_auto] sm:items-center sm:px-5">
              <p className="text-xs font-bold" style={{ color: T.ink }}>Subscriber delivery</p>
              <div><p className="flex items-center gap-2 text-xs font-semibold" style={{ color: profilesError ? T.critical : profilesLoading ? T.attention : T.ok }}><StatusDot tone={profilesError ? 'critical' : profilesLoading ? 'attention' : 'ok'} pulse={profilesLoading} /> {profilesError ? 'Forecast unavailable' : profilesLoading ? 'Checking recipients' : 'Ready for Monday'}</p><p className="mt-1 text-[0.7rem] leading-relaxed" style={{ color: T.muted }}>{profilesLoading ? 'Loading recipient forecast…' : profilesError ? 'Open Recipients to review the connection error before relying on these counts.' : `${scheduledAudience.length} scheduled: ${scheduledWelcome} welcome ${scheduledWelcome === 1 ? 'letter' : 'letters'} and ${scheduledWeekly} weekly ${scheduledWeekly === 1 ? 'brief' : 'briefs'}.`}</p></div>
              <span className="text-xs tabular-nums" style={{ color: heldAudience || attentionAudience ? T.attention : T.muted, fontFamily: mono }}>{heldAudience + attentionAudience} held</span>
            </div>

            <div className="grid gap-3 px-4 py-4 sm:grid-cols-[10rem_minmax(0,1fr)_auto] sm:items-center sm:px-5">
              <p className="text-xs font-bold" style={{ color: T.ink }}>Optional opening</p>
              {dirty ? <div><p className="flex items-center gap-2 text-xs font-semibold" style={{ color: T.attention }}><StatusDot tone="attention" /> Draft waiting for approval</p><p className="mt-1 text-[0.7rem]" style={{ color: T.muted }}>Your draft is saved on this device. The last approved email remains unchanged until you publish.</p></div> : nextPlan ? <div><p className="flex items-center gap-2 text-xs font-semibold" style={{ color: T.ok }}><StatusDot tone="ok" /> Approved and scheduled</p><p className="mt-1 text-[0.7rem]" style={{ color: T.muted }}>“{nextPlan.headline || CONTRIBUTION_STYLE_COPY[nextPlan.style]?.label || 'Editorial note'}” · revision {nextPlan.revision ?? 1}</p></div> : <div><p className="flex items-center gap-2 text-xs font-semibold" style={{ color: T.ink }}><StatusDot tone="neutral" /> Not requested</p><p className="mt-1 text-[0.7rem]" style={{ color: T.muted }}>The standard weekly email sends normally. Nothing is pending.</p></div>}
              {(dirty || nextPlan) && <AdminButton variant="ghost" size="sm" onClick={() => void openNextCompose()}>{dirty ? 'Finish approval' : 'Review'}</AdminButton>}
            </div>

            <div className="grid gap-3 px-4 py-4 sm:grid-cols-[10rem_minmax(0,1fr)_auto] sm:items-center sm:px-5">
              <p className="text-xs font-bold" style={{ color: T.ink }}>Admin proof</p>
              {!PROOF_SERVICE_ENABLED ? <div><p className="flex items-center gap-2 text-xs font-semibold" style={{ color: T.critical }}><StatusDot tone="critical" /> Billing upgrade required</p><p className="mt-1 text-[0.7rem] leading-relaxed" style={{ color: T.muted }}>Cloud Functions is enabled, but Firebase is still on the free Spark plan. Upgrade to Blaze, then deploy the proof function. Subscriber automation remains separate.</p></div> : nextPlan && selectedWeek === nextWeek?.weekKey ? <DeliveryStatus request={latestTest} /> : <div><p className="flex items-center gap-2 text-xs font-semibold" style={{ color: T.muted }}><StatusDot tone="neutral" /> {nextPlan ? 'Load the opening to check proof status' : 'Not required'}</p><p className="mt-1 text-[0.7rem]" style={{ color: T.muted }}>{nextPlan ? 'Proof history is attached to the approved edition.' : 'Proofs are sent only when an optional opening is published, updated or removed.'}</p></div>}
              {!PROOF_SERVICE_ENABLED ? <a href="https://console.firebase.google.com/project/calgary-map-e70bb/usage/details" target="_blank" rel="noreferrer" className="inline-flex min-h-8 items-center justify-center rounded-lg border px-2.5 text-[0.72rem] font-bold focus-visible:outline-2 focus-visible:outline-offset-2" style={{ borderColor: T.line, color: T.ink, outlineColor: T.signal }}>Upgrade Firebase</a> : nextPlan && selectedWeek === nextWeek?.weekKey && <AdminButton variant="outline" size="sm" onClick={() => void resendTest()} disabled={dirty || hasRemoteChange || saveState === 'saving'}>{saveState === 'saving' ? <Loader2 size={13} className="motion-safe:animate-spin" /> : <Send size={13} />} Send test</AdminButton>}
            </div>
          </div>

          {message && <div className="border-t px-4 py-3 sm:px-5" style={{ borderColor: T.line }}><p role="status" className="text-xs" style={{ color: toneColor[messageTone] }}>{message}</p></div>}

          {!dirty && !nextPlan && <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 sm:px-5" style={{ borderColor: T.line, background: T.surface }}><p className="text-[0.7rem]" style={{ color: T.muted }}>Need to add context this week? Personal stories, newsroom notes and announcements are available only when requested.</p><AdminButton variant="ghost" size="sm" onClick={() => void openNextCompose()}><PenLine size={13} /> Add optional opening</AdminButton></div>}
        </section>
      )}

      {plannerView === 'compose' && <section className="rounded-xl border bg-white px-4 py-3" style={{ borderColor: T.line }} aria-label="Selected email edition">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg" style={{ background: `${T.signal}12`, color: T.signal }}>
              <CalendarDays size={18} />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-bold" style={{ color: T.ink }}>{selected?.label}</p>
                {loadedPlan ? <Chip tone="ok"><Check size={11} /> Approved</Chip> : <Chip>Optional draft</Chip>}
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
                  {plans[week.weekKey] ? 'Approved · ' : ''}{index === 0 ? 'Next · ' : ''}{week.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <details className="mt-3 border-t pt-3" style={{ borderColor: T.line }}>
          <summary className="cursor-pointer text-xs font-bold focus-visible:outline-2 focus-visible:outline-offset-2" style={{ color: T.signal, outlineColor: T.signal }}>View the 8-week editorial calendar</summary>
          <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1" aria-label="Eight-week editorial calendar">
            {weeks.map((week, index) => {
              const active = week.weekKey === selectedWeek;
              const scheduled = !!plans[week.weekKey];
              return <button key={week.weekKey} type="button" onClick={() => void changeWeek(week.weekKey)} aria-pressed={active} className="min-w-[7.25rem] rounded-lg px-3 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2" style={{ background: active ? `${T.signal}10` : T.card, border: `1px solid ${active ? T.signal : T.line}`, outlineColor: T.signal }}>
                <span className="flex items-center justify-between gap-2 text-[0.65rem] font-bold" style={{ color: active ? T.signal : T.ink }}><span>{index === 0 ? 'Next Monday' : week.weekKey}</span><StatusDot tone={scheduled ? 'ok' : 'neutral'} /></span>
                <span className="mt-1 block text-[0.68rem]" style={{ color: T.muted }}>{week.label.split('–')[0].trim()}</span>
                <span className="mt-0.5 block text-[0.62rem]" style={{ color: scheduled ? T.ok : T.muted }}>{scheduled ? 'Opening approved' : 'Standard brief'}</span>
              </button>;
            })}
          </div>
        </details>
      </section>}

      {plannerView === 'audience' && <DigestAudienceForecast
        profiles={profiles}
        loading={profilesLoading}
        error={profilesError}
      />}

      {plannerView === 'templates' && <section className="overflow-hidden rounded-xl border bg-white" style={{ borderColor: T.line }} aria-labelledby="template-routing-title">
        <div className="border-b px-4 py-3" style={{ borderColor: T.line }}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="template-routing-title" className="text-sm font-bold" style={{ color: T.ink }}>Template routing</h2>
            <span className="inline-flex items-center gap-1 text-[0.68rem] font-semibold" style={{ color: T.muted }}><HelpCircle size={13} /> Hover, focus or tap a format</span>
          </div>
          <p className="mt-0.5 text-xs" style={{ color: T.muted }}>Each format has one job. Weekly edits never alter the subscriber welcome letter.</p>
        </div>
        <div className="divide-y md:grid md:grid-cols-3 md:divide-x md:divide-y-0" style={{ borderColor: T.line }} role="list" aria-label="Email templates">
          {DIGEST_TEMPLATE_PURPOSES.map((template) => {
            const Icon = TEMPLATE_ICONS[template.id];
            const editing = template.id === 'weekly';
            const active = template.id === activeTemplateId;
            return (
              <button
                key={template.id}
                type="button"
                role="listitem"
                aria-pressed={active}
                aria-controls="template-routing-details"
                onMouseEnter={() => setActiveTemplateId(template.id)}
                onFocus={() => setActiveTemplateId(template.id)}
                onClick={() => setActiveTemplateId(template.id)}
                className="flex w-full gap-3 p-4 text-left transition-colors duration-150 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-[-2px]"
                style={{ background: active ? `${T.signal}0A` : T.card, outlineColor: T.signal }}
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg" style={{ background: active ? `${T.signal}16` : T.surface, color: active ? T.signal : T.muted }}>
                  <Icon size={15} />
                </span>
                <div className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2 text-xs font-bold" style={{ color: T.ink }}>
                    {template.label}{editing && <Chip tone="signal">Editing</Chip>}
                  </span>
                  <span className="mt-0.5 block text-[0.68rem] font-semibold" style={{ color: active ? T.signal : T.muted }}>{template.timing}</span>
                  <span className="mt-1 block text-[0.7rem] leading-snug" style={{ color: T.muted }}>{template.purpose}</span>
                </div>
              </button>
            );
          })}
        </div>
        <div id="template-routing-details" className="border-t px-4 py-4" style={{ borderColor: T.line, background: `${T.signal}05` }} aria-live="polite">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-bold" style={{ color: T.ink }}>{activeTemplate.label}: exact delivery rules</p>
            <Chip tone={activeTemplate.id === 'admin-proof' ? 'attention' : activeTemplate.id === 'weekly' ? 'signal' : 'neutral'}>{activeTemplate.timing}</Chip>
          </div>
          <dl className="mt-3 grid gap-3 md:grid-cols-2">
            {[
              ['When it runs', activeTemplate.schedule],
              ['How it is chosen', activeTemplate.trigger],
              ['Who receives it now', activeTemplate.recipients],
              ['Safety and repeat rules', activeTemplate.protection],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border p-3" style={{ borderColor: T.line, background: T.card }}>
                <dt className="text-[0.66rem] font-bold uppercase tracking-[0.08em]" style={{ color: T.signal }}>{label}</dt>
                <dd className="mt-1 text-[0.72rem] leading-relaxed" style={{ color: T.muted }}>{value}</dd>
              </div>
            ))}
          </dl>
          {activeTemplate.id === 'welcome' && !showWelcomePreview && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t pt-3" style={{ borderColor: T.line }}>
              <p className="max-w-2xl text-[0.72rem] leading-relaxed" style={{ color: T.muted }}>See the complete production letter with its Calgary Watch logo, onboarding explanation, sample weekly brief and legal footer.</p>
              <AdminButton variant="outline" size="sm" onClick={() => void openWelcomePreview()}><Eye size={14} /> Preview welcome letter</AdminButton>
            </div>
          )}
        </div>
        {showWelcomePreview && (
          <div className="border-t p-4 sm:p-5" style={{ borderColor: T.line, background: T.surface }}>
            <div className="mx-auto max-w-[42rem]">
              <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-bold" style={{ color: T.ink }}>Welcome letter preview</p>
                    <Chip tone="ok">Actual production template</Chip>
                  </div>
                  <p className="mt-1 text-[0.72rem] leading-relaxed" style={{ color: T.muted }}>Subject: “Quick hello from Calgary Watch” · Sample recipient: Vicky in Beltline</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <a href={welcomePreviewUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[0.72rem] font-bold transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2" style={{ borderColor: T.line, color: T.ink, outlineColor: T.signal }}><Eye size={13} /> Open full size</a>
                  <AdminButton variant="ghost" size="sm" onClick={() => setShowWelcomePreview(false)} aria-label="Close welcome letter preview"><X size={14} /> Close</AdminButton>
                </div>
              </div>
              <div className="overflow-hidden rounded-xl border bg-white" style={{ borderColor: T.line }}>
                {welcomePreviewError ? (
                  <div className="flex min-h-64 flex-col items-center justify-center gap-3 p-6 text-center" role="alert">
                    <AlertTriangle size={22} style={{ color: T.critical }} />
                    <p className="max-w-md text-xs leading-relaxed" style={{ color: T.muted }}>{welcomePreviewError}</p>
                    <AdminButton variant="outline" size="sm" onClick={() => { setWelcomePreviewHtml(''); void openWelcomePreview(); }}><RefreshCw size={13} /> Try again</AdminButton>
                  </div>
                ) : welcomePreviewHtml ? (
                  <iframe
                    srcDoc={welcomePreviewHtml}
                    title="Calgary Watch welcome letter preview"
                    className="block h-[46rem] w-full bg-white"
                    sandbox=""
                  />
                ) : (
                  <div className="h-[46rem] space-y-5 p-8 motion-safe:animate-pulse" aria-label="Loading welcome letter preview">
                    <div className="mx-auto h-12 w-52 rounded-lg" style={{ background: T.line }} />
                    <div className="mx-auto h-40 max-w-lg rounded-xl" style={{ background: T.surface }} />
                    <div className="mx-auto h-56 max-w-lg rounded-xl" style={{ background: T.surface }} />
                  </div>
                )}
              </div>
              <p className="mt-2 text-center text-[0.68rem]" style={{ color: T.muted }}>Preview data is illustrative. Every real recipient receives their own location-aware sample and unsubscribe link.</p>
            </div>
          </div>
        )}
      </section>}

      {plannerView === 'compose' && hasRemoteChange && (
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

      {plannerView === 'compose' && <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.08fr)_minmax(350px,0.92fr)]">
        <Panel title="Weekly opening note" subtitle="Optional. It appears only in the recurring weekly brief, before the automated neighbourhood briefing." action={saveState === 'loading'
          ? <Chip tone="attention"><Loader2 size={11} className="motion-safe:animate-spin" /> Loading</Chip>
          : reusablePlan ? <AdminButton variant="ghost" size="sm" onClick={copyAnotherEdition} disabled={saveState === 'saving'}><Copy size={13} /> Reuse edition</AdminButton> : undefined}>
          <form className="space-y-5" onSubmit={submit}>
            <fieldset>
              <legend className="text-xs font-semibold" style={{ color: T.ink }}>Editorial format</legend>
              <div className="mt-2 grid grid-cols-3 gap-1 rounded-lg p-1" style={{ background: T.surface }}>
                {DIGEST_CONTRIBUTION_STYLES.map((option) => {
                  const active = option === style;
                  const copy = CONTRIBUTION_STYLE_COPY[option];
                  return (
                    <button key={option} type="button" aria-pressed={active} onClick={() => setStyle(option)} disabled={saveState === 'loading' || saveState === 'saving'} className="min-h-9 rounded-md px-2 text-center text-[0.7rem] font-bold transition-colors duration-150 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2" style={{ background: active ? T.card : 'transparent', color: active ? T.signal : T.muted, boxShadow: active ? `0 1px 3px ${T.rail}14` : 'none', outlineColor: T.signal }}>
                      {copy.label}
                    </button>
                  );
                })}
              </div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <p className="text-[0.7rem] leading-snug" style={{ color: T.muted }}>{CONTRIBUTION_STYLE_COPY[style].description}</p>
                <AdminButton variant="ghost" size="sm" onClick={applyOutline} disabled={saveState === 'loading' || saveState === 'saving'}><Sparkles size={13} /> Use outline</AdminButton>
              </div>
            </fieldset>

            <Field label="Headline (optional)">
              <input className={inputClass} style={inputStyle} maxLength={100} value={headline} disabled={saveState === 'loading' || saveState === 'saving'} onChange={(event) => setHeadline(event.target.value)} placeholder="What should readers take away?" />
              <p className="mt-1.5 text-[0.7rem]" style={{ color: T.muted }}>This labels the opening note. Subscriber subject lines remain personalized to their area.</p>
            </Field>

            <Field label="Inbox preview text (optional)">
              <input className={inputClass} style={inputStyle} maxLength={140} value={preheader} disabled={saveState === 'loading' || saveState === 'saving'} onChange={(event) => setPreheader(event.target.value)} placeholder="A short reason to open this week’s brief" />
              <div className="mt-1.5 flex justify-between gap-3 text-[0.7rem]" style={{ color: T.muted }}><span>Appears beside the subject in many inboxes. The automatic area summary is the fallback.</span><span className="shrink-0 tabular-nums" style={{ fontFamily: mono }}>{preheader.length}/140</span></div>
            </Field>

            <fieldset>
              <legend className="text-xs font-semibold" style={{ color: T.ink }}>Recipient audience</legend>
              <div className="mt-2 grid grid-cols-3 gap-1 rounded-lg p-1" style={{ background: T.surface }}>
                {DIGEST_CONTRIBUTION_AUDIENCES.map((option) => {
                  const active = audience === option;
                  const copy = CONTRIBUTION_AUDIENCE_COPY[option];
                  const Icon = AUDIENCE_ICONS[option];
                  return <button key={option} type="button" aria-pressed={active} onClick={() => setAudience(option)} disabled={saveState === 'loading' || saveState === 'saving'} className="flex min-h-9 items-center justify-center gap-1.5 rounded-md px-2 text-[0.7rem] font-bold transition-colors duration-150 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2" style={{ background: active ? T.card : 'transparent', color: active ? T.signal : T.muted, boxShadow: active ? `0 1px 3px ${T.rail}14` : 'none', outlineColor: T.signal }}>
                    <Icon size={12} />{copy.label}
                  </button>;
                })}
              </div>
              <p className="mt-2 text-[0.7rem] leading-snug" style={{ color: T.muted }}>{CONTRIBUTION_AUDIENCE_COPY[audience].description} This affects only the optional opening; the normal brief still goes to every eligible subscriber.</p>
            </fieldset>

            <Field label="Your contribution">
              <div className="mb-2 flex flex-wrap gap-1 rounded-lg p-1" style={{ background: T.surface }} role="toolbar" aria-label="Email formatting">
                <AdminButton variant="ghost" size="sm" onClick={() => insertFormatting('**', '**', 'important text')}><Bold size={13} /> Bold</AdminButton>
                <AdminButton variant="ghost" size="sm" onClick={() => insertFormatting('## ', '', 'Section heading')}><Heading3 size={13} /> Heading</AdminButton>
                <AdminButton variant="ghost" size="sm" onClick={() => insertFormatting('- ', '', 'List item')}><List size={13} /> List</AdminButton>
                <AdminButton variant="ghost" size="sm" onClick={() => insertFormatting('> ', '', 'Quoted text')}><Quote size={13} /> Quote</AdminButton>
                <AdminButton variant="ghost" size="sm" onClick={insertLink}><Link2 size={13} /> Link</AdminButton>
              </div>
              <textarea ref={bodyRef} className="w-full min-h-60 resize-y rounded-xl border px-3.5 py-3 text-sm leading-relaxed outline-none transition-colors duration-200 focus:border-slate-500 disabled:opacity-60" style={inputStyle} maxLength={MAX_BODY} value={body} disabled={saveState === 'loading' || saveState === 'saving'} onChange={(event) => setBody(event.target.value)} placeholder="Write the note readers should see before their weekly briefing…" aria-describedby="planner-count planner-guidance planner-validation" />
              <div className="mt-1.5 flex items-start justify-between gap-3 text-[0.7rem]" style={{ color: T.muted }}>
                <span id="planner-guidance">Formatting is converted to email-safe HTML and a readable plain-text fallback.</span>
                <span id="planner-count" className="shrink-0 tabular-nums" style={{ fontFamily: mono, color: body.length > MAX_BODY * 0.9 ? T.attention : T.muted }}>{body.length}/{MAX_BODY}</span>
              </div>
              <p id="planner-validation" className="mt-1 min-h-4 text-[0.7rem]" style={{ color: bodyLength > 0 && bodyLength < MIN_BODY ? T.attention : T.muted }}>
                {bodyLength > 0 && bodyLength < MIN_BODY ? `${MIN_BODY - bodyLength} more characters needed.` : `${wordCount} words · about ${readingSeconds} seconds to read`}
              </p>
            </Field>

            <details className="rounded-xl border" style={{ borderColor: T.line }} open={!!(byline || ctaLabel || ctaUrl)}>
              <summary className="cursor-pointer px-4 py-3 text-xs font-bold" style={{ color: T.ink }}>Attribution & call to action <span className="font-normal" style={{ color: T.muted }}>· optional</span></summary>
              <div className="space-y-4 border-t px-4 py-4" style={{ borderColor: T.line }}>
                <Field label="Attribution line">
                  <input className={inputClass} style={inputStyle} maxLength={80} value={byline} disabled={saveState === 'loading' || saveState === 'saving'} onChange={(event) => setByline(event.target.value)} placeholder="By Jane, Calgary Watch editor" />
                  <p className="mt-1.5 text-[0.7rem]" style={{ color: T.muted }}>For personal stories, this replaces the standard team sign-off.</p>
                </Field>
                <div className="grid gap-3 sm:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)]">
                  <Field label="Button label">
                    <input className={inputClass} style={inputStyle} maxLength={50} value={ctaLabel} disabled={saveState === 'loading' || saveState === 'saving'} onChange={(event) => setCtaLabel(event.target.value)} placeholder="Read the update" />
                  </Field>
                  <Field label="Button destination">
                    <input className={inputClass} style={inputStyle} inputMode="url" maxLength={500} value={ctaUrl} disabled={saveState === 'loading' || saveState === 'saving'} onChange={(event) => setCtaUrl(event.target.value)} placeholder="https://calgarywatch.ca/…" aria-invalid={hasCta && !validCta} />
                  </Field>
                </div>
                {hasCta && !validCta && <p className="text-[0.7rem]" style={{ color: T.critical }}>Add both a button label and a secure https:// destination.</p>}
              </div>
            </details>

            <div className="flex items-start gap-3 rounded-lg px-3 py-2.5" style={{ background: preflightIssues.length ? `${T.attention}0D` : `${T.ok}0D` }} aria-label="Publishing readiness">
              {preflightIssues.length ? <AlertTriangle className="mt-0.5 shrink-0" size={15} style={{ color: T.attention }} /> : <Check className="mt-0.5 shrink-0" size={15} style={{ color: T.ok }} />}
              <div>
                <p className="text-xs font-bold" style={{ color: T.ink }}>{preflightIssues.length ? 'Before publishing' : 'Ready to publish'}</p>
                <p className="mt-0.5 text-[0.7rem] leading-relaxed" style={{ color: T.muted }}>{preflightIssues.length ? preflightIssues.join(' · ') : `${CONTRIBUTION_AUDIENCE_COPY[audience].label} will see this optional opening. Publishing also sends a proof to every admin.`}</p>
              </div>
            </div>

            <div className="border-t pt-4" style={{ borderColor: T.line }}>
              <div className="flex flex-wrap items-center gap-2">
                <AdminButton type="submit" tone="signal" disabled={!canSubmit}>{saveState === 'saving' ? <><Loader2 size={14} className="motion-safe:animate-spin" /> Working…</> : <><Send size={14} /> Approve & send test</>}</AdminButton>
                {loadedPlan && <AdminButton variant="outline" size="sm" onClick={() => void resendTest()} disabled={!PROOF_SERVICE_ENABLED || dirty || hasRemoteChange || saveState === 'saving'} title={!PROOF_SERVICE_ENABLED ? 'Upgrade Firebase to Blaze and deploy the proof function first' : undefined}><RefreshCw size={13} /> Send test again</AdminButton>}
                {loadedPlan && <AdminButton variant="ghost" tone="critical" size="sm" onClick={() => void unschedule()} disabled={dirty || hasRemoteChange || saveState === 'saving'}><Trash2 size={13} /> Remove note</AdminButton>}
              </div>
              <div className="mt-3 flex min-h-8 items-center gap-2">
                {message && <p role="status" className="text-xs leading-snug" style={{ color: toneColor[messageTone] }}>{message}</p>}
                {!message && dirty && <p className="text-xs" style={{ color: T.muted }}>Per-admin draft saved on this device for 30 days.</p>}
              </div>
            </div>
          </form>
        </Panel>

        <div className="space-y-4 xl:sticky xl:top-24">
          <Panel title="Inbox preview" subtitle="A close representation of the opening subscribers will receive." action={<MailCheck size={16} style={{ color: T.signal }} />} padded={false}>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2" style={{ borderColor: T.line, background: T.surface }}>
              <div className="flex gap-1" aria-label="Preview content mode">
                <AdminButton size="sm" variant={previewMode === 'visual' ? 'outline' : 'ghost'} tone={previewMode === 'visual' ? 'signal' : 'neutral'} onClick={() => setPreviewMode('visual')}><MailCheck size={13} /> Designed</AdminButton>
                <AdminButton size="sm" variant={previewMode === 'text' ? 'outline' : 'ghost'} tone={previewMode === 'text' ? 'signal' : 'neutral'} onClick={() => setPreviewMode('text')}><FileText size={13} /> Plain text</AdminButton>
              </div>
              {previewMode === 'visual' && <div className="flex gap-1" aria-label="Preview width">
                <AdminButton size="sm" variant={previewWidth === 'desktop' ? 'outline' : 'ghost'} tone={previewWidth === 'desktop' ? 'signal' : 'neutral'} onClick={() => setPreviewWidth('desktop')} title="Desktop width"><Monitor size={13} /></AdminButton>
                <AdminButton size="sm" variant={previewWidth === 'mobile' ? 'outline' : 'ghost'} tone={previewWidth === 'mobile' ? 'signal' : 'neutral'} onClick={() => setPreviewWidth('mobile')} title="Mobile width"><Smartphone size={13} /></AdminButton>
              </div>}
            </div>
            <div className="flex items-center justify-between gap-3 border-b px-3 py-2" style={{ borderColor: T.line, background: '#fff' }}>
              <span className="text-[0.68rem] font-semibold" style={{ color: T.muted }}>Reader scenario</span>
              <div className="flex gap-1">
                <AdminButton size="sm" variant={previewScope === 'local' ? 'outline' : 'ghost'} tone={previewScope === 'local' ? 'signal' : 'neutral'} onClick={() => setPreviewScope('local')}><MapPin size={13} /> Local results</AdminButton>
                <AdminButton size="sm" variant={previewScope === 'citywide' ? 'outline' : 'ghost'} tone={previewScope === 'citywide' ? 'signal' : 'neutral'} onClick={() => setPreviewScope('citywide')}><Newspaper size={13} /> City-wide</AdminButton>
              </div>
            </div>
            <div className="border-b px-4 py-3" style={{ borderColor: T.line, background: '#fff' }} aria-label="Inbox row preview">
              <div className="flex min-w-0 gap-3 text-xs"><span className="shrink-0 font-bold" style={{ color: T.ink }}>Calgary Watch</span><p className="min-w-0 truncate" style={{ color: T.muted }}><strong style={{ color: T.ink }}>Your personalized weekly subject</strong> — {preheader.trim() || 'Automatic neighbourhood summary'}</p></div>
            </div>
            {previewMode === 'text' ? (
              <pre className="max-h-[36rem] overflow-auto whitespace-pre-wrap p-5 text-xs leading-relaxed" style={{ background: '#0E1A17', color: '#DCD3C4', fontFamily: mono }}>{previewShowsOpening ? plainTextPreview : `OPENING NOTE NOT SHOWN\n\nThis ${previewScope} reader is outside the selected audience. Their normal personalized weekly brief continues unchanged.`}</pre>
            ) : <div className="overflow-x-auto p-3 sm:p-5" style={{ background: '#0E1A17' }}>
              <div className={`mx-auto transition-[max-width] duration-200 ${previewWidth === 'mobile' ? 'max-w-[20rem]' : 'max-w-[34rem]'}`} style={{ color: '#DCD3C4' }}>
                <div className="flex items-center justify-between border-b-2 pb-3" style={{ borderColor: '#E0AC63' }}>
                  <div className="flex items-center gap-2.5">
                    <img src="/images/email/logo.png" width="40" height="40" alt="" className="h-10 w-10 object-contain" />
                    <div><p className="text-[0.68rem] font-bold tracking-[0.16em]" style={{ color: '#F4EEE3' }}>CALGARY WATCH</p><p className="mt-1 text-[0.65rem]" style={{ color: '#A6B8AE' }}>{selected?.label}</p></div>
                  </div>
                  <span className="text-[0.65rem]" style={{ color: '#A6B8AE' }}>{selected?.weekKey}</span>
                </div>
                <div className="py-5">
                  {previewShowsOpening
                    ? <OpeningPreview style={style} headline={headline} body={body} weekKey={selected?.weekKey ?? ''} byline={byline} ctaLabel={validCta ? ctaLabel : ''} />
                    : <div className="rounded-md border px-4 py-3 text-[0.72rem] leading-relaxed" style={{ borderColor: '#3A5A4E', color: '#A6B8AE' }}>This reader is outside the selected opening-note audience. Their standard weekly brief begins here.</div>}
                  <div className={previewShowsOpening ? 'pt-6' : 'pt-4'}>
                    <p className="text-xl font-bold" style={{ fontFamily: display, color: '#F4EEE3' }}>Morning, neighbour.</p>
                    <p className="mt-2 text-[0.78rem] leading-relaxed" style={{ color: '#A6B8AE' }}>The regular location-based summary, weekly comparison and report list continue below.</p>
                    <div className="mt-4 rounded-md p-3" style={{ background: '#17251F', border: '1px solid #2C443B' }}><div className="flex items-center justify-between text-[0.65rem] font-bold uppercase tracking-[0.12em]" style={{ color: '#E0AC63' }}><span>This week</span><span style={{ color: '#A6B8AE' }}>Your area</span></div></div>
                  </div>
                </div>
              </div>
            </div>}
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
      </div>}
    </div>
  );
}
