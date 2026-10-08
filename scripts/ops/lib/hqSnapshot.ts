// The HQ snapshot: one compact JSON document summarizing everything the ops
// agents know, written to the arctos-hq project for the dashboard at
// arctoslaunchpad.com/hq. Pure functions over documents already read, so the
// rules for "what's waiting on you" and "where work piles up" are testable.
//
// The dashboard keeps its own copy of these types (ArctosLaunchpad
// lib/hq/types.ts); bump SNAPSHOT_VERSION when the shape changes.

import type { AccountHistory, HistoryGroup, OpsHealth, OpsPerformance, OpsPost, PartnerLead } from '../../../src/types/ops';
import type { ScoutEntry } from './scout';

export const SNAPSHOT_VERSION = 2;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export type Business = 'calgarywatch' | 'calgarydaily' | 'vowmotion' | 'arctos';
export type Severity = 'ok' | 'warn' | 'bad';

export interface TodayItem {
  id: string;
  business: Business;
  kind: 'post-review' | 'post-fix' | 'post-failed' | 'reply' | 'pitch-review' | 'health';
  title: string;
  detail: string;
  since: number;
  link: string | null;
}

export interface Pipeline {
  business: Business;
  label: string;
  connected: boolean;
  note: string | null;
  stages: Array<{ key: string; label: string; count: number }>;
  sent30: number;
  replies30: number;
  interested30: number;
}

/** A CalgaryDaily/CalgaryWatch post as HQ shows it: the image, the words and where it stands. */
export interface HqPost {
  id: string;
  brand: Business;
  status: string;
  template: string;
  format: 'image' | 'carousel' | 'reel';
  headline: string;
  caption: string;
  altText: string;
  imageUrl: string | null;
  imageUrls: string[];
  videoUrl: string | null;
  warnings: string[];
  facts: string;
  note: string;
  suggestedFor: number | null;
  scheduledFor: number | null;
  publishedAt: number | null;
  permalink: string | null;
  error: string | null;
  insights: { reach: number; views: number | null; likes: number; comments: number; saves: number; shares: number } | null;
  updatedAt: number;
}

export interface InboxReply {
  leadId: string;
  business: Business;
  businessName: string;
  from: string;
  subject: string;
  text: string;
  classification: string;
  suggestedSubject: string;
  suggestedBody: string;
  approved: boolean;
  at: number;
}

export interface InboxPitch {
  leadId: string;
  business: Business;
  businessName: string;
  contactEmail: string | null;
  category: string;
  neighbourhood: string;
  reasonRelevant: string;
  subject: string;
  body: string;
  followUp: boolean;
  at: number;
}

export interface ActivityItem { at: number; business: Business; type: string; text: string }

export interface QueueCounts { waiting: number; scheduled: number; published7d: number; failed7d: number }

export interface SpendDay { date: string; usd: number; calls: number; byTask: Record<string, number> }

export interface Bottleneck { id: string; label: string; value: string; severity: Severity; detail: string }

export interface HqSnapshot {
  version: number;
  generatedAt: number;
  today: TodayItem[];
  health: OpsHealth | null;
  scout: { updatedAt: number; accounts: ScoutEntry[]; unreadable: string[]; candidatesWaiting: number } | null;
  calgaryDaily: {
    followers: number | null;
    followerTrend: Array<{ date: string; count: number }>;
    byFormat: HistoryGroup[];
    byOrigin: HistoryGroup[];
    byTopic: HistoryGroup[];
    top: Array<{ permalink: string; caption: string; views: number | null; likes: number; format: string; repost: boolean; at: number }>;
    avgDelayMinutes: number | null;
    queue: QueueCounts;
  } | null;
  posts: HqPost[];
  inbox: { replies: InboxReply[]; pitches: InboxPitch[]; at: number };
  activity: ActivityItem[];
  pipelines: Pipeline[];
  pipelinesAt: number;
  spend: { days: SpendDay[]; monthToDate: number; last7: number; last30: number };
  bottlenecks: Bottleneck[];
}

const ADMIN = 'https://calgarywatch.ca/admin';

/** Everything that can't move until a person looks at it, oldest first. */
export function todayItems(posts: OpsPost[], leads: PartnerLead[], health: OpsHealth | null): TodayItem[] {
  const out: TodayItem[] = [];
  for (const p of posts) {
    const title = p.imageText?.headline || p.caption.split('\n')[0].slice(0, 80) || 'Untitled post';
    const since = (p as { updatedAt?: number }).updatedAt ?? (p as { createdAt?: number }).createdAt ?? 0;
    if (p.status === 'drafted') out.push({ id: `post-${p.id}`, business: p.brand, kind: 'post-review', title, detail: `${p.template} post waiting for approval${p.warnings?.length ? ` · ${p.warnings[0]}` : ''}`, since, link: ADMIN });
    if (p.status === 'needs-correction') out.push({ id: `post-${p.id}`, business: p.brand, kind: 'post-fix', title, detail: 'Published, but a listing in it changed or was cancelled.', since, link: ADMIN });
    if (p.status === 'failed') out.push({ id: `post-${p.id}`, business: p.brand, kind: 'post-failed', title, detail: (p as { error?: string }).error ?? 'Publishing failed.', since, link: ADMIN });
  }
  for (const l of leads) {
    const r = l.lastReply;
    if (r && !r.sent && !r.approved && r.classification !== 'stop' && r.classification !== 'auto-reply') {
      out.push({ id: `reply-${l.id}`, business: 'calgarywatch', kind: 'reply', title: `${l.businessName} replied`, detail: `${r.classification}: ${r.text.replace(/\s+/g, ' ').slice(0, 140)}`, since: r.at, link: ADMIN });
    }
    if (l.status === 'ready' && !l.doNotContact) {
      out.push({ id: `pitch-${l.id}`, business: 'calgarywatch', kind: 'pitch-review', title: `Pitch to ${l.businessName}`, detail: l.draftSubject || 'Drafted email waiting for approval.', since: l.updatedAt, link: ADMIN });
    }
  }
  for (const h of health?.items ?? []) {
    if (!h.ok) out.push({ id: `health-${h.id}`, business: 'calgarywatch', kind: 'health', title: h.label, detail: h.detail, since: health!.checkedAt, link: null });
  }
  return out.sort((a, b) => a.since - b.since);
}

const STAGES: Array<{ key: string; label: string; statuses: string[] }> = [
  { key: 'found', label: 'Found', statuses: ['new', 'no-email', 'ready', 'approved'] },
  { key: 'contacted', label: 'Contacted', statuses: ['contacted', 'follow-up-ready', 'no-response'] },
  { key: 'replied', label: 'Replied', statuses: ['replied', 'not-interested'] },
  { key: 'interested', label: 'Interested', statuses: ['interested'] },
  { key: 'won', label: 'Claimed / partner', statuses: ['claimed', 'partner'] },
];

export function calgaryWatchPipeline(leads: PartnerLead[], now: number): Pipeline {
  const since = now - 30 * DAY;
  const events = leads.flatMap(l => l.history ?? []).filter(e => e.at >= since);
  return {
    business: 'calgarywatch',
    label: 'CalgaryWatch partners',
    connected: true,
    note: null,
    stages: STAGES.map(s => ({ key: s.key, label: s.label, count: leads.filter(l => s.statuses.includes(l.status)).length })),
    sent30: events.filter(e => e.type === 'sent').length,
    replies30: events.filter(e => e.type === 'reply').length,
    interested30: leads.filter(l => l.status === 'interested' && l.updatedAt >= since).length,
  };
}

export function notConnected(business: Business, label: string, note: string): Pipeline {
  return { business, label, connected: false, note, stages: STAGES.map(s => ({ key: s.key, label: s.label, count: 0 })), sent30: 0, replies30: 0, interested30: 0 };
}

export function spendSummary(days: SpendDay[], today: string): HqSnapshot['spend'] {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const sum = (xs: SpendDay[]) => Math.round(xs.reduce((n, d) => n + d.usd, 0) * 100) / 100;
  const back = (n: number) => { const d = new Date(`${today}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };
  return {
    days: sorted.slice(-35),
    monthToDate: sum(sorted.filter(d => d.date.slice(0, 7) === today.slice(0, 7))),
    last7: sum(sorted.filter(d => d.date > back(7))),
    last30: sum(sorted.filter(d => d.date > back(30))),
  };
}

const ago = (ms: number) => (ms < HOUR ? `${Math.max(1, Math.round(ms / 60_000))} min` : ms < 2 * DAY ? `${Math.round(ms / HOUR)} h` : `${Math.round(ms / DAY)} days`);

export function bottlenecks(input: { today: TodayItem[]; performance: OpsPerformance | null; inboxCheckedAt: number | null; health: OpsHealth | null; failed7d: number; now: number }): Bottleneck[] {
  const { today, performance, inboxCheckedAt, health, failed7d, now } = input;
  const out: Bottleneck[] = [];
  const mine = today.filter(t => t.kind !== 'health');
  const oldest = mine.length ? now - mine[0].since : 0;
  out.push({
    id: 'you', label: 'Waiting on you', value: mine.length ? `${mine.length} · oldest ${ago(oldest)}` : 'Nothing',
    severity: !mine.length || oldest < DAY ? 'ok' : oldest < 3 * DAY ? 'warn' : 'bad',
    detail: mine.length ? 'Drafts, replies and fixes only you can approve. Clear the oldest first.' : 'Nothing is waiting for a decision.',
  });
  const delay = performance?.avgDelayMinutes ?? null;
  out.push({
    id: 'late', label: 'Posts going out late', value: delay === null ? 'No data' : `${Math.round(delay)} min average`,
    severity: delay === null || delay <= 30 ? 'ok' : delay <= 90 ? 'warn' : 'bad',
    detail: 'GitHub starts scheduled runs late or skips them. Over 30 minutes for a week means it is time for the external trigger.',
  });
  const inboxAge = inboxCheckedAt ? now - inboxCheckedAt : null;
  out.push({
    id: 'inbox', label: 'Reply inbox sync', value: inboxAge === null ? 'Never synced' : `${ago(inboxAge)} ago`,
    severity: inboxAge !== null && inboxAge <= 2 * HOUR ? 'ok' : inboxAge !== null && inboxAge <= 6 * HOUR ? 'warn' : 'bad',
    detail: 'Outreach stops sending when replies and opt-outs have not been read for 6 hours.',
  });
  out.push({
    id: 'failed', label: 'Failed posts (7 days)', value: String(failed7d), severity: failed7d === 0 ? 'ok' : failed7d < 3 ? 'warn' : 'bad',
    detail: 'Posts Instagram rejected. Each one shows its error in Today.',
  });
  for (const id of ['workflows', 'inventory', 'scout', 'claude', 'outlook']) {
    const h = health?.items.find(i => i.id === id);
    if (h) out.push({ id, label: h.label, value: h.ok ? 'OK' : 'Needs attention', severity: h.ok ? 'ok' : 'bad', detail: h.detail });
  }
  return out;
}

export function calgaryDailySummary(history: AccountHistory | null, performance: OpsPerformance | null, queue: QueueCounts): HqSnapshot['calgaryDaily'] {
  if (!history && !performance) return null;
  const trend = Object.entries(performance?.followers ?? {}).sort(([a], [b]) => a.localeCompare(b)).slice(-60).map(([date, count]) => ({ date, count }));
  return {
    followers: history?.followers ?? trend.at(-1)?.count ?? null,
    followerTrend: trend,
    byFormat: history?.byFormat ?? [],
    byOrigin: history?.byOrigin ?? [],
    byTopic: (history?.byTopic ?? []).slice(0, 10),
    top: (history?.top ?? []).slice(0, 10).map(r => ({ permalink: r.permalink, caption: r.caption.replace(/\s+/g, ' ').slice(0, 140), views: r.views, likes: r.likes, format: r.format, repost: r.repost, at: r.timestamp })),
    avgDelayMinutes: performance?.avgDelayMinutes ?? null,
    queue,
  };
}

const OPEN_POSTS = ['drafted', 'approved', 'failed', 'needs-correction', 'redraft', 'requested'];

export function hqPosts(posts: OpsPost[], now: number): HqPost[] {
  const recent = (p: OpsPost) => p.status === 'published' && (p.publishedAt ?? 0) >= now - 14 * DAY;
  return posts
    .filter(p => OPEN_POSTS.includes(p.status) || recent(p))
    .map(p => ({
      id: p.id,
      brand: p.brand,
      status: p.status,
      template: p.template,
      format: p.videoUrl ? 'reel' as const : (p.imageUrls?.length ?? 0) > 1 ? 'carousel' as const : 'image' as const,
      headline: p.imageText?.headline || p.caption.split('\n')[0].slice(0, 80) || 'Untitled post',
      caption: p.caption,
      altText: p.altText,
      imageUrl: p.imageUrl,
      imageUrls: p.imageUrls ?? (p.imageUrl ? [p.imageUrl] : []),
      videoUrl: p.videoUrl ?? null,
      warnings: p.warnings ?? [],
      facts: (p.facts ?? '').slice(0, 1500),
      note: p.note ?? '',
      suggestedFor: p.suggestedFor ?? null,
      scheduledFor: p.scheduledFor ?? null,
      publishedAt: p.publishedAt ?? null,
      permalink: p.permalink ?? null,
      error: p.error ?? null,
      insights: p.insights ? { reach: p.insights.reach, views: p.insights.views, likes: p.insights.likes, comments: p.insights.comments, saves: p.insights.saves, shares: p.insights.shares } : null,
      updatedAt: p.updatedAt ?? 0,
    }))
    .sort((a, b) => (b.publishedAt ?? b.scheduledFor ?? b.suggestedFor ?? b.updatedAt) - (a.publishedAt ?? a.scheduledFor ?? a.suggestedFor ?? a.updatedAt))
    .slice(0, 60);
}

export function inbox(leads: PartnerLead[], now: number): HqSnapshot['inbox'] {
  const replies: InboxReply[] = [];
  const pitches: InboxPitch[] = [];
  for (const l of leads) {
    const r = l.lastReply;
    if (r && !r.sent && r.classification !== 'stop' && r.classification !== 'auto-reply') {
      replies.push({
        leadId: l.id, business: 'calgarywatch', businessName: l.businessName, from: r.from, subject: r.subject,
        text: r.text.slice(0, 4000), classification: r.classification, suggestedSubject: r.suggestedSubject,
        suggestedBody: r.suggestedBody, approved: r.approved, at: r.at,
      });
    }
    if ((l.status === 'ready' || l.status === 'follow-up-ready') && !l.doNotContact) {
      pitches.push({
        leadId: l.id, business: 'calgarywatch', businessName: l.businessName, contactEmail: l.contactEmail, category: l.category,
        neighbourhood: l.neighbourhood, reasonRelevant: l.reasonRelevant, subject: l.draftSubject, body: l.draftBody,
        followUp: l.status === 'follow-up-ready', at: l.updatedAt,
      });
    }
  }
  return { replies: replies.sort((a, b) => a.at - b.at), pitches: pitches.sort((a, b) => a.at - b.at), at: now };
}

const ACTIVITY_TYPES: Record<string, string> = { found: 'Lead found', drafted: 'Pitch drafted', approved: 'Approved', sent: 'Email sent', reply: 'Reply received', 'reply-sent': 'Reply sent', status: 'Updated', imported: 'Imported', note: 'Note' };

/** What the agents (and you) did lately, newest first. */
export function activity(leads: PartnerLead[], posts: OpsPost[], now: number, hours = 72): ActivityItem[] {
  const since = now - hours * 3_600_000;
  const out: ActivityItem[] = [];
  for (const l of leads) {
    for (const e of l.history ?? []) {
      if (e.at >= since) out.push({ at: e.at, business: 'calgarywatch', type: ACTIVITY_TYPES[e.type] ?? e.type, text: `${l.businessName}: ${e.summary}`.slice(0, 200) });
    }
  }
  for (const p of posts) {
    if (p.status === 'published' && (p.publishedAt ?? 0) >= since) out.push({ at: p.publishedAt!, business: p.brand, type: 'Posted', text: p.imageText?.headline || p.caption.split('\n')[0].slice(0, 120) });
    if (p.status === 'failed' && (p.updatedAt ?? 0) >= since) out.push({ at: p.updatedAt, business: p.brand, type: 'Post failed', text: `${p.imageText?.headline ?? ''}: ${p.error ?? ''}`.slice(0, 200) });
  }
  return out.sort((a, b) => b.at - a.at).slice(0, 80);
}
