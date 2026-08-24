import { useMemo, useState } from 'react';
import {
  AlertTriangle, BookOpenText, CalendarDays, MailCheck, MapPin, Newspaper, Search, ShieldCheck,
} from 'lucide-react';

import type { UserProfile } from '@/src/hooks/useAdminData';
import {
  buildDigestAudienceForecast,
  nextDigestRunAt,
  type DigestAudienceRow,
  type DigestAudienceStatus,
} from '@/src/lib/digestPlanner';
import type { ConsentRefusal, DigestRecipient } from '@/src/lib/digest';
import { Chip, Figure, StatusDot, T, display, mono } from './ui';

type AudienceFilter = 'all' | 'scheduled' | 'welcome' | 'weekly' | 'held' | 'attention';

const allowlist = String(import.meta.env.VITE_DIGEST_ALLOWLIST ?? '')
  .split(',').map((email) => email.trim().toLowerCase()).filter(Boolean);
const configuredLimit = Number(import.meta.env.VITE_DIGEST_LIMIT ?? 50);

/** One entry point keeps the overview and detailed audience view in lockstep. */
export function configuredDigestAudienceForecast(profiles: UserProfile[]) {
  return buildDigestAudienceForecast(
    profiles as DigestRecipient[], { allowlist, limit: configuredLimit },
  );
}

const refusalCopy: Record<ConsentRefusal, string> = {
  'not-opted-in': 'Not opted in',
  'no-consent-timestamp': 'Consent date is missing',
  'no-email': 'Email address is missing',
  'invalid-email': 'Email address is invalid',
};

const statusCopy: Record<DigestAudienceStatus, { label: string; tone: 'ok' | 'attention' | 'critical' }> = {
  scheduled: { label: 'Sending Monday', tone: 'ok' },
  'held-allowlist': { label: 'Held by allowlist', tone: 'attention' },
  'held-limit': { label: 'Held by send cap', tone: 'attention' },
  'held-duplicate': { label: 'Duplicate email held', tone: 'attention' },
  attention: { label: 'Needs attention', tone: 'critical' },
};

function formatDate(value: number | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Edmonton', month: 'short', day: 'numeric', year: 'numeric',
  }).format(new Date(value));
}

function routeDetail(row: DigestAudienceRow): string {
  if (row.refusal) return refusalCopy[row.refusal];
  if (row.kind === 'welcome') return 'No successful welcome is recorded yet.';
  return `Welcome delivered ${formatDate(row.welcomeSentAt)}.`;
}

function RecipientRow({ row }: { row: DigestAudienceRow }) {
  const status = statusCopy[row.status];
  const RouteIcon = row.kind === 'welcome' ? BookOpenText : Newspaper;
  return (
    <li className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(12rem,1.25fr)_minmax(9rem,0.65fr)_minmax(10rem,0.75fr)_minmax(14rem,1.2fr)] md:items-center">
      <div className="min-w-0">
        <p className="truncate text-xs font-bold" style={{ color: T.ink }}>{row.displayName || 'Unnamed subscriber'}</p>
        <p className="truncate text-[0.7rem]" style={{ color: T.muted }}>{row.email || 'No email address'}</p>
      </div>
      <div className="flex min-w-0 items-center gap-2">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg" style={{ background: row.kind === 'welcome' ? `${T.signal}12` : T.surface, color: row.kind === 'welcome' ? T.signal : T.muted }}><RouteIcon size={13} /></span>
        <div className="min-w-0">
          <p className="text-[0.7rem] font-bold" style={{ color: T.ink }}>{row.kind === 'welcome' ? 'Welcome letter' : 'Weekly brief'}</p>
          <p className="truncate text-[0.65rem]" style={{ color: T.muted }}>{row.kind === 'welcome' ? 'First eligible send' : 'Recurring route'}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <StatusDot tone={status.tone} />
        <span className="text-[0.7rem] font-semibold" style={{ color: status.tone === 'critical' ? T.critical : T.ink }}>{status.label}</span>
      </div>
      <div className="min-w-0">
        <p className="text-[0.7rem] leading-snug" style={{ color: T.muted }}>{routeDetail(row)}</p>
        <p className="mt-1 flex items-center gap-1 text-[0.65rem]" style={{ color: T.muted }}><MapPin size={10} /> {row.location} · consent {formatDate(row.consentedAt)}</p>
      </div>
    </li>
  );
}

export function DigestAudienceForecast({ profiles, loading, error }: {
  profiles: UserProfile[];
  loading: boolean;
  error: string;
}) {
  const [filter, setFilter] = useState<AudienceFilter>('all');
  const [search, setSearch] = useState('');
  const forecast = useMemo(() => configuredDigestAudienceForecast(profiles), [profiles]);
  const nextRun = useMemo(() => nextDigestRunAt(), []);
  const nextRunLabel = useMemo(() => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Edmonton', weekday: 'long', month: 'short', day: 'numeric', year: 'numeric',
  }).format(new Date(nextRun)), [nextRun]);
  const scheduled = forecast.rows.filter((row) => row.status === 'scheduled');
  const scheduledWelcome = scheduled.filter((row) => row.kind === 'welcome').length;
  const scheduledWeekly = scheduled.filter((row) => row.kind === 'weekly').length;
  const held = forecast.rows.filter((row) => row.status.startsWith('held-')).length;
  const heldByAllowlist = forecast.rows.filter((row) => row.status === 'held-allowlist').length;
  const heldByLimit = forecast.rows.filter((row) => row.status === 'held-limit').length;
  const heldAsDuplicate = forecast.rows.filter((row) => row.status === 'held-duplicate').length;
  const attention = forecast.rows.filter((row) => row.status === 'attention').length;
  const configuredWelcome = forecast.rows.filter((row) => row.kind === 'welcome' && !row.refusal).length;
  const configuredWeekly = forecast.rows.filter((row) => row.kind === 'weekly' && !row.refusal).length;

  const shown = forecast.rows.filter((row) => {
    if (filter === 'scheduled' && row.status !== 'scheduled') return false;
    if (filter === 'welcome' && (row.kind !== 'welcome' || !!row.refusal)) return false;
    if (filter === 'weekly' && (row.kind !== 'weekly' || !!row.refusal)) return false;
    if (filter === 'held' && !row.status.startsWith('held-')) return false;
    if (filter === 'attention' && row.status !== 'attention') return false;
    const needle = search.trim().toLowerCase();
    return !needle || `${row.displayName} ${row.email} ${row.location}`.toLowerCase().includes(needle);
  });

  const filters: Array<{ id: AudienceFilter; label: string; count: number }> = [
    { id: 'all', label: 'All subscribed', count: forecast.rows.length },
    { id: 'scheduled', label: 'Sending', count: scheduled.length },
    { id: 'welcome', label: 'Welcome route', count: configuredWelcome },
    { id: 'weekly', label: 'Weekly route', count: configuredWeekly },
    { id: 'held', label: 'Held', count: held },
    { id: 'attention', label: 'Needs attention', count: attention },
  ];

  return (
    <section className="overflow-hidden rounded-xl border" style={{ borderColor: T.line, background: T.card }} aria-labelledby="audience-forecast-title">
      <header className="border-b px-4 py-4" style={{ borderColor: T.line }}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="audience-forecast-title" className="text-sm font-bold" style={{ fontFamily: display, color: T.ink }}>Monday audience forecast</h2>
            <p className="mt-0.5 text-xs" style={{ color: T.muted }}>{nextRunLabel} · scheduled for 15:00 UTC (09:00 MDT / 08:00 MST)</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Chip tone={forecast.allowlistActive ? 'attention' : 'ok'}><ShieldCheck size={11} /> {forecast.allowlistActive ? `Allowlist active · ${allowlist.length}` : 'All eligible subscribers'}</Chip>
            <Chip><MailCheck size={11} /> Limit {forecast.limit}</Chip>
          </div>
        </div>
        <div className="mt-3 flex gap-3 rounded-lg px-3 py-2.5" style={{ background: `${T.signal}09` }}>
          <CalendarDays className="mt-0.5 shrink-0" size={16} style={{ color: T.signal }} />
          <p className="max-w-4xl text-[0.72rem] leading-relaxed" style={{ color: T.muted }}><strong style={{ color: T.ink }}>Welcome is tracked per person, not per campaign.</strong> Someone who joins after this Monday still receives the welcome on their own first eligible Monday. Its sample briefing is rebuilt from that week’s latest reports and their saved location.</p>
        </div>
      </header>

      <div className="flex min-w-max divide-x overflow-x-auto border-b" style={{ borderColor: T.line }} aria-label="Projected delivery totals">
        {[
          ['Sending next Monday', scheduled.length, 'The current safety configuration'],
          ['Welcome letters', scheduledWelcome, `${configuredWelcome} eligible for this route`],
          ['Weekly briefs', scheduledWeekly, `${configuredWeekly} eligible for this route`],
          ['Held', held, `${heldByAllowlist} allowlist · ${heldByLimit} send cap · ${heldAsDuplicate} duplicate`],
          ['Needs attention', attention, 'Opted in but not legally mailable'],
        ].map(([label, value, hint]) => (
          <div key={String(label)} className="min-w-[10.5rem] flex-1 px-4 py-3">
            <p className="text-[0.65rem] font-semibold" style={{ color: T.muted }}>{label}</p>
            <div className="mt-1"><Figure value={loading || error ? null : Number(value)} size="md" tone={label === 'Needs attention' && Number(value) ? 'critical' : label === 'Held' && Number(value) ? 'attention' : 'neutral'} /></div>
            <p className="mt-1 text-[0.62rem]" style={{ color: T.muted }}>{hint}</p>
          </div>
        ))}
      </div>

      <div className="border-b px-4 py-3" style={{ borderColor: T.line }}>
        <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex gap-1.5 overflow-x-auto pb-1" aria-label="Filter digest audience">
            {filters.map((option) => {
              const active = filter === option.id;
              return <button key={option.id} type="button" aria-pressed={active} onClick={() => setFilter(option.id)} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-[0.7rem] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2" style={{ borderColor: active ? T.signal : T.line, background: active ? `${T.signal}0D` : T.card, color: active ? T.signal : T.muted, outlineColor: T.signal }}>{option.label}<span className="tabular-nums" style={{ fontFamily: mono }}>{option.count}</span></button>;
            })}
          </div>
          <label className="relative block w-full lg:w-64">
            <span className="sr-only">Search digest recipients</span>
            <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2" size={13} style={{ color: T.muted }} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, email or area" className="h-8 w-full rounded-lg border pl-8 pr-3 text-xs outline-none focus:border-slate-500" style={{ borderColor: T.line, color: T.ink, background: T.card }} />
          </label>
        </div>
      </div>

      {error ? (
        <div className="flex min-h-40 flex-col items-center justify-center gap-2 px-4 py-8 text-center" role="alert">
          <AlertTriangle size={20} style={{ color: T.critical }} />
          <p className="max-w-xl text-xs leading-relaxed" style={{ color: T.muted }}>{error}</p>
        </div>
      ) : loading ? (
        <div className="space-y-3 p-4 motion-safe:animate-pulse" aria-label="Loading digest audience">
          {[0, 1, 2].map((row) => <div key={row} className="h-14 rounded-lg" style={{ background: T.surface }} />)}
        </div>
      ) : shown.length ? (
        <>
          <div className="hidden grid-cols-[minmax(12rem,1.25fr)_minmax(9rem,0.65fr)_minmax(10rem,0.75fr)_minmax(14rem,1.2fr)] gap-3 border-b px-4 py-2 md:grid" style={{ borderColor: T.line, background: T.surface }} aria-hidden="true">
            {['Recipient', 'Route', 'Delivery', 'Why'].map((label) => <span key={label} className="text-[0.62rem] font-bold uppercase tracking-[0.06em]" style={{ color: T.muted }}>{label}</span>)}
          </div>
          <ul className="max-h-[28rem] divide-y overflow-y-auto" style={{ borderColor: T.line }}>{shown.map((row) => <RecipientRow key={row.uid} row={row} />)}</ul>
        </>
      ) : (
        <div className="px-4 py-10 text-center">
          <p className="text-xs font-bold" style={{ color: T.ink }}>No recipients match this view</p>
          <p className="mt-1 text-[0.7rem]" style={{ color: T.muted }}>Try another route filter or clear the search.</p>
        </div>
      )}
      <footer className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2.5" style={{ borderColor: T.line, background: T.surface }}>
        <p className="text-[0.66rem]" style={{ color: T.muted }}>Live from user profiles. Updates appear as people opt in or complete their first delivery.</p>
        {attention > 0 && <span className="inline-flex items-center gap-1 text-[0.66rem] font-semibold" style={{ color: T.critical }}><AlertTriangle size={11} /> {attention} subscribed profile{attention === 1 ? '' : 's'} cannot be mailed</span>}
      </footer>
    </section>
  );
}
