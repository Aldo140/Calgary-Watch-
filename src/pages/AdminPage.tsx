/**
 * Calgary Watch — admin console.
 *
 * Rebuilt as a watch desk rather than a report. The old console opened on a
 * wall of charts and buried the two things an admin actually comes here to do:
 * find work, and do it. This opens on the attention queue and treats analytics
 * as reference material you go looking for.
 *
 * All data, KPIs, chart series and mutations come from useAdminData, so the
 * record-level screens (/admin/incidents, /admin/users) read exactly the same
 * numbers. Nothing is computed twice.
 */

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ResponsiveContainer, PieChart, Pie, Cell,
  AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar,
} from 'recharts';
import {
  ExternalLink, FileText, Globe, LayoutDashboard, Loader2, Lock,
  MailPlus, Map as MapIcon, RefreshCw, Save, Trash2, Users, Zap,
} from 'lucide-react';

import { useAuth } from '@/src/components/FirebaseProvider';
import { isFirebaseConfigured } from '@/src/firebase';
import { useAdminData } from '@/src/hooks/useAdminData';
import { AdminShell, type NavItem } from '@/src/components/admin/AdminShell';
import { AttentionQueue } from '@/src/components/admin/AttentionQueue';
import { WeeklyEmailPlanner } from '@/src/components/admin/WeeklyEmailPlanner';
import {
  AdminButton, Chip, EmptyState, Field, Figure, Panel, RecordList, SkeletonRows,
  StatGrid, StatTile, StatusDot, T, TimeAgo, display, inputClass, inputStyle, mono,
  CATEGORY_COLOR, type Tone,
} from '@/src/components/admin/ui';
import { INCIDENT_CATEGORIES } from '@/src/constants';
import { cn } from '@/src/lib/utils';

type Section = 'desk' | 'planner' | 'reports' | 'people' | 'feeds' | 'visitors' | 'city';

const CHART_COLORS = ['#2C6FB5', '#C77F18', '#2F855A', '#C0392B', '#7C5CBF', '#0F8B8D'];


/** Shared Recharts styling, kept in one place so every chart matches. */
const axis = { stroke: '#9AA1AC', fontSize: 10, tickLine: false, axisLine: false } as const;
const tooltipStyle = {
  background: '#FFFFFF',
  border: `1px solid ${T.line}`,
  borderRadius: 10,
  fontSize: 12,
  fontFamily: mono,
  color: T.ink,
} as const;

function ChartFrame({ height = 200, children }: { height?: number; children: React.ReactElement }) {
  return <ResponsiveContainer width="100%" height={height}>{children}</ResponsiveContainer>;
}

/** Inline sparkline — cheaper than a chart instance per tile. */
function Spark({ data, tone = T.signal }: { data: number[]; tone?: string }) {
  if (!data.length) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const span = max - min || 1;
  const pts = data
    .map((v, i) => `${(i / Math.max(data.length - 1, 1)) * 100},${28 - ((v - min) / span) * 26}`)
    .join(' ');
  return (
    <svg viewBox="0 0 100 28" preserveAspectRatio="none" className="w-full h-7" aria-hidden>
      <polyline points={pts} fill="none" stroke={tone} strokeWidth={1.75} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Legend({ items }: { items: { label: string; value?: number; color: string }[] }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-3">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5 text-[0.7rem]" style={{ color: T.muted }}>
          <span className="h-2 w-2 rounded-sm shrink-0" style={{ background: i.color }} />
          {i.label}
          {i.value !== undefined && (
            <span className="tabular-nums font-semibold" style={{ fontFamily: mono, color: T.ink }}>{i.value}</span>
          )}
        </span>
      ))}
    </div>
  );
}

export default function AdminPage() {
  const { logout } = useAuth();
  const [section, setSection] = useState<Section>('desk');
  const d = useAdminData();

  const failingFeeds = d.apiHealths.filter((a) => a.status === 'error').length;

  const navItems: NavItem[] = useMemo(() => {
    const needsAttention =
      d.flaggedIncidents.length + d.pendingReviewIncidents.length + failingFeeds;
    return [
      { id: 'desk', label: 'Watch desk', short: 'Desk', icon: LayoutDashboard, count: needsAttention, tone: needsAttention > 0 ? 'critical' : undefined },
      { id: 'planner', label: 'Email planner', short: 'Email', icon: MailPlus },
      { id: 'reports', label: 'Reports', short: 'Reports', icon: FileText },
      { id: 'people', label: 'People', short: 'People', icon: Users },
      { id: 'feeds', label: 'Data feeds', short: 'Feeds', icon: Zap, count: failingFeeds, tone: 'critical' },
      { id: 'visitors', label: 'Visitors', short: 'Visitors', icon: Globe },
      { id: 'city', label: 'City stats', short: 'City', icon: MapIcon },
    ];
  }, [d.flaggedIncidents.length, d.pendingReviewIncidents.length, failingFeeds]);

  const titles: Record<Section, { title: string; subtitle: string }> = {
    desk: { title: 'Watch desk', subtitle: 'What needs a human right now' },
    planner: { title: 'Email planner', subtitle: 'Prepare Monday’s edition, review recipients and understand every delivery route' },
    reports: { title: 'Reports', subtitle: 'What is being reported, where, and when' },
    people: { title: 'People', subtitle: 'Who is signed up and who is contributing' },
    feeds: { title: 'Data feeds', subtitle: 'Live status of the sources behind the map' },
    visitors: { title: 'Visitors', subtitle: 'How people find and move through the site' },
    city: { title: 'City stats', subtitle: 'Open-data crime figures and community safety scores' },
  };

  if (!d.isAuthReady) {
    return (
      <div className="min-h-screen grid place-items-center" style={{ background: T.surface }}>
        <Loader2 className="animate-spin" style={{ color: T.muted }} />
      </div>
    );
  }

  if (!isFirebaseConfigured || !d.user || !d.isAdmin) {
    return (
      <div className="min-h-screen grid place-items-center p-6" style={{ background: T.surface }}>
        <div className="max-w-sm w-full rounded-2xl border p-6 text-center" style={{ background: T.card, borderColor: T.line }}>
          <Lock size={22} className="mx-auto mb-3" style={{ color: T.muted }} />
          <h1 className="text-lg font-bold mb-1" style={{ fontFamily: display, color: T.ink }}>
            {!isFirebaseConfigured ? 'Admin is unavailable' : 'Admins only'}
          </h1>
          <p className="text-sm mb-4" style={{ color: T.muted }}>
            {!isFirebaseConfigured
              ? 'This build has no Firebase configuration, so there is nothing to administer.'
              : 'Sign in with an approved admin account to open the watch desk.'}
          </p>
          <Link to="/map"><AdminButton tone="signal">Back to map</AdminButton></Link>
        </div>
      </div>
    );
  }

  return (
    <AdminShell
      items={navItems}
      activeId={section}
      onSelect={(id) => setSection(id as Section)}
      title={titles[section].title}
      subtitle={titles[section].subtitle}
      onSignOut={logout}
      actions={
        <Chip tone={d.loadingData ? 'attention' : 'ok'}>
          <StatusDot tone={d.loadingData ? 'attention' : 'ok'} pulse={d.loadingData} />
          {d.loadingData ? 'Syncing' : 'Live'}
        </Chip>
      }
    >
      {section === 'desk' && <DeskSection d={d} />}
      {section === 'planner' && <WeeklyEmailPlanner profiles={d.digestSubscribers} profilesLoading={!d.digestSubscribersLoaded} profilesError={d.digestSubscribersError} />}
      {section === 'reports' && <ReportsSection d={d} />}
      {section === 'people' && <PeopleSection d={d} />}
      {section === 'feeds' && <FeedsSection d={d} />}
      {section === 'visitors' && <VisitorsSection d={d} />}
      {section === 'city' && <CitySection d={d} />}
    </AdminShell>
  );
}

type D = ReturnType<typeof useAdminData>;

// ── Watch desk ────────────────────────────────────────────────────────────────

function DeskSection({ d }: { d: D }) {
  return (
    <>
      <AttentionQueue
        flagged={d.flaggedIncidents}
        pendingReview={d.pendingReviewIncidents}
        apiHealths={d.apiHealths}
        incidents={d.incidents}
        onRestore={d.handleRestore}
        onDelete={d.handlePermanentDelete}
        onApprove={d.approveIncident}
        onHide={d.softDeleteIncident}
        restoringId={d.restoringId}
        deletingId={d.deletingId}
      />

      <StatGrid>
        <StatTile label="Reports today" value={d.todayIncidents} tone="signal" hint="Last 24 hours" />
        <StatTile label="Total reports" value={d.totalIncidents} hint="Loaded in console" />
        <StatTile label="Registered users" value={d.totalUsers} hint={`${d.adminUsers} admin`} />
        <StatTile label="Page views" value={d.totalPageViews} hint={`${d.uniqueSessions} sessions`} />
      </StatGrid>

      <div className="grid gap-4 lg:grid-cols-3 items-start">
        <Panel title="Reports over time" subtitle="Daily volume" className="lg:col-span-2">
          <ChartFrame height={200}>
            <AreaChart data={d.timelineChartData} margin={{ top: 4, right: 8, left: -22, bottom: 0 }}>
              <defs>
                <linearGradient id="gReports" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={T.signal} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={T.signal} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2 4" stroke={T.line} vertical={false} />
              <XAxis dataKey="date" {...axis} />
              <YAxis allowDecimals={false} {...axis} />
              <Tooltip contentStyle={tooltipStyle} />
              <Area type="monotone" dataKey="count" stroke={T.signal} strokeWidth={2} fill="url(#gReports)" />
            </AreaChart>
          </ChartFrame>
        </Panel>

        <div className="space-y-4">
          <Panel title="Live civic feeds" subtitle="Counted straight from the city APIs">
            <div className="space-y-3">
              <FeedCount label="Calgary traffic events" value={d.liveTrafficCount} />
              <FeedCount label="Open 311 requests" value={d.live311Count} />
            </div>
          </Panel>

          <Panel title="Momentum" subtitle="Recent direction">
            <div className="space-y-3">
              <TrendRow label="Reports" data={d.incidentSparklineData} tone={T.signal} />
              <TrendRow label="Page views" data={d.pageViewsSparklineData} tone={T.ok} />
              <TrendRow label="Signups" data={d.userGrowthSparklineData} tone={T.attention} />
            </div>
          </Panel>
        </div>
      </div>

      <StatGrid>
        <StatTile label="Emergency reports" value={d.emergencyIncidents} tone={d.emergencyIncidents > 0 ? 'critical' : 'neutral'} hint="Category: emergency" />
        <StatTile label="Unconfirmed" value={d.unresolvedIncidents} tone="attention" hint="Not yet community-confirmed" />
        <StatTile label="Distinct reporters" value={d.uniqueReporterEmails} hint="Excludes anonymous and system" />
        <StatTile label="Avg safety score" value={d.averageSafety} unit="/100" tone="ok" hint="Across tracked communities" />
      </StatGrid>
    </>
  );
}

function FeedCount({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm" style={{ color: T.muted }}>{label}</span>
      <span className="flex items-center gap-2">
        <StatusDot tone={value === null ? 'attention' : 'ok'} />
        <Figure value={value} size="md" />
      </span>
    </div>
  );
}

function TrendRow({ label, data, tone }: { label: string; data: number[]; tone: string }) {
  const total = data.reduce((a, b) => a + b, 0);
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs w-20 shrink-0" style={{ color: T.muted }}>{label}</span>
      <span className="flex-1 min-w-0"><Spark data={data} tone={tone} /></span>
      <Figure value={total} size="sm" />
    </div>
  );
}

// ── Reports ───────────────────────────────────────────────────────────────────

function ReportsSection({ d }: { d: D }) {
  return (
    <>
      <Panel
        title="Every report"
        subtitle="Search, edit and moderate individual records"
        action={
          <Link to="/admin/incidents">
            <AdminButton size="sm" tone="signal">Open list <ExternalLink size={13} /></AdminButton>
          </Link>
        }
      >
        <div className="flex items-center gap-5 flex-wrap">
          <span className="flex items-baseline gap-1.5">
            <Figure value={d.totalIncidents} size="lg" />
            <span className="text-xs" style={{ color: T.muted }}>records</span>
          </span>
          <span className="flex items-baseline gap-1.5">
            <Figure value={d.pendingReviewIncidents.length} size="lg" tone="attention" />
            <span className="text-xs" style={{ color: T.muted }}>unreviewed</span>
          </span>
          <span className="flex items-baseline gap-1.5">
            <Figure value={d.flaggedIncidents.length} size="lg" tone="critical" />
            <span className="text-xs" style={{ color: T.muted }}>flagged</span>
          </span>
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="By category" subtitle="Share of all reports">
          <ChartFrame height={210}>
            <PieChart>
              <Pie data={d.categoryChartData} dataKey="value" nameKey="name" innerRadius={48} outerRadius={78} paddingAngle={2}>
                {d.categoryChartData.map((entry, i) => (
                  <Cell key={i} fill={CATEGORY_COLOR[entry.name.toLowerCase()] ?? entry.color ?? CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
            </PieChart>
          </ChartFrame>
          <Legend items={d.categoryChartData.map((c, i) => ({ label: c.name, value: c.value, color: CATEGORY_COLOR[c.name.toLowerCase()] ?? c.color ?? CHART_COLORS[i % CHART_COLORS.length] }))} />
        </Panel>

        <Panel title="By trust level" subtitle="How reports get verified">
          <ChartFrame height={210}>
            <PieChart>
              <Pie data={d.trustChartData} dataKey="value" nameKey="name" innerRadius={48} outerRadius={78} paddingAngle={2}>
                {d.trustChartData.map((entry, i) => (
                  <Cell key={i} fill={entry.color ?? CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
            </PieChart>
          </ChartFrame>
          <Legend items={d.trustChartData.map((c, i) => ({ label: c.name, value: c.value, color: c.color ?? CHART_COLORS[i % CHART_COLORS.length] }))} />
        </Panel>

        <Panel title="Busiest neighbourhoods" subtitle="Most reports filed">
          <ChartFrame height={220}>
            <BarChart data={d.neighborhoodChartData} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="name" width={104} {...axis} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
              <Bar dataKey="count" fill={T.signal} radius={[0, 5, 5, 0]} />
            </BarChart>
          </ChartFrame>
        </Panel>

        <Panel title="Reports by hour" subtitle="When incidents get filed">
          <ChartFrame height={220}>
            <AreaChart data={d.hourlyChartData} margin={{ top: 4, right: 8, left: -22, bottom: 0 }}>
              <defs>
                <linearGradient id="gHour" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={T.attention} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={T.attention} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2 4" stroke={T.line} vertical={false} />
              <XAxis dataKey="hour" {...axis} />
              <YAxis allowDecimals={false} {...axis} />
              <Tooltip contentStyle={tooltipStyle} />
              <Area type="monotone" dataKey="count" stroke={T.attention} strokeWidth={2} fill="url(#gHour)" />
            </AreaChart>
          </ChartFrame>
        </Panel>

        <Panel title="Category mix by day" subtitle="Recent daily breakdown" className="lg:col-span-2">
          <ChartFrame height={200}>
            <BarChart data={d.categoryByDayData} margin={{ top: 4, right: 8, left: -22, bottom: 0 }}>
              <CartesianGrid strokeDasharray="2 4" stroke={T.line} vertical={false} />
              <XAxis dataKey="date" {...axis} />
              <YAxis allowDecimals={false} {...axis} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
              {INCIDENT_CATEGORIES.map((c) => (
                <Bar key={c.value} dataKey={c.value} stackId="a" fill={CATEGORY_COLOR[c.value]} />
              ))}
            </BarChart>
          </ChartFrame>
          <Legend items={INCIDENT_CATEGORIES.map((c) => ({ label: c.label, color: CATEGORY_COLOR[c.value] }))} />
        </Panel>

        <Panel title="Top reporters" subtitle="Most reports submitted" className="lg:col-span-2">
          {d.topReportersData.length === 0 ? (
            <EmptyState title="No reporters yet" body="Reports submitted by signed-in neighbours will rank here." />
          ) : (
            <ChartFrame height={200}>
              <BarChart data={d.topReportersData} layout="vertical" margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" width={128} {...axis} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                <Bar dataKey="count" fill={T.ok} radius={[0, 5, 5, 0]} />
              </BarChart>
            </ChartFrame>
          )}
        </Panel>
      </div>
    </>
  );
}

// ── People ────────────────────────────────────────────────────────────────────

function PeopleSection({ d }: { d: D }) {
  return (
    <>
      <Panel
        title="User directory"
        subtitle="Search accounts, edit roles and add notes"
        action={
          <Link to="/admin/users">
            <AdminButton size="sm" tone="signal">Open directory <ExternalLink size={13} /></AdminButton>
          </Link>
        }
      >
        <StatGrid>
          <StatTile label="Total users" value={d.totalUsers} />
          <StatTile label="Admins" value={d.adminUsers} tone="signal" />
          <StatTile label="View only" value={d.viewOnlyUsers} />
          <StatTile label="Reporters" value={d.uniqueReporterEmails} hint="Filed at least one report" />
        </StatGrid>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Signups over time" subtitle="Accounts created" className="lg:col-span-2">
          <ChartFrame height={200}>
            <AreaChart data={d.userGrowthData} margin={{ top: 4, right: 8, left: -22, bottom: 0 }}>
              <defs>
                <linearGradient id="gUsers" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={T.ok} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={T.ok} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2 4" stroke={T.line} vertical={false} />
              <XAxis dataKey="date" {...axis} />
              <YAxis allowDecimals={false} {...axis} />
              <Tooltip contentStyle={tooltipStyle} />
              <Area type="monotone" dataKey="count" stroke={T.ok} strokeWidth={2} fill="url(#gUsers)" />
            </AreaChart>
          </ChartFrame>
        </Panel>

        <Panel title="Roles" subtitle="Account permissions">
          <ChartFrame height={170}>
            <PieChart>
              <Pie data={d.userRoleChartData} dataKey="value" nameKey="name" innerRadius={40} outerRadius={66} paddingAngle={2}>
                {d.userRoleChartData.map((entry, i) => (
                  <Cell key={i} fill={entry.color ?? CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
            </PieChart>
          </ChartFrame>
          <Legend items={d.userRoleChartData.map((c, i) => ({ label: c.name, value: c.value, color: c.color ?? CHART_COLORS[i % CHART_COLORS.length] }))} />
        </Panel>
      </div>

      <Panel
        title="Newest signups"
        subtitle="Most recent accounts"
        action={
          <AdminButton size="sm" variant="outline" onClick={d.refreshUsers} disabled={d.isRefreshingUsers}>
            <RefreshCw size={13} className={cn(d.isRefreshingUsers && 'animate-spin')} /> Refresh
          </AdminButton>
        }
      >
        {d.newestSignups.length === 0 ? (
          <EmptyState title="No accounts yet" body="New signups appear here as soon as someone signs in." />
        ) : (
          <ul className="divide-y divide-[#E4E2DC]">
            {d.newestSignups.map((u) => (
              <li key={u.uid} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                <span className="h-8 w-8 shrink-0 grid place-items-center rounded-full text-xs font-bold" style={{ background: `${T.signal}18`, color: T.signal }}>
                  {(u.displayName || u.email || '?').charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate" style={{ color: T.ink }}>{u.displayName || 'Unnamed'}</p>
                  <p className="text-xs truncate" style={{ color: T.muted }}>{u.email}</p>
                </span>
                {u.role === 'admin' && <Chip tone="signal">Admin</Chip>}
                <TimeAgo ts={u.joinedAt} />
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}

// ── Data feeds ────────────────────────────────────────────────────────────────

function FeedsSection({ d }: { d: D }) {
  const toneFor = (s: string): Tone =>
    s === 'ok' ? 'ok' : s === 'slow' ? 'attention' : s === 'error' ? 'critical' : 'neutral';
  return (
    <>
      <Panel
        title="Source health"
        subtitle="Checked automatically every two minutes"
        action={
          <AdminButton size="sm" variant="outline" onClick={d.checkApis}>
            <RefreshCw size={13} /> Check now
          </AdminButton>
        }
        padded={false}
      >
        <ul className="divide-y divide-[#E4E2DC]">
          {d.apiHealths.map((api) => (
            <li key={api.id} className="p-3 flex items-center gap-3">
              <StatusDot tone={toneFor(api.status)} pulse={api.status === 'checking'} />
              <span className="min-w-0 flex-1">
                <p className="text-sm font-semibold truncate" style={{ color: T.ink }}>{api.name}</p>
                <p className="text-xs truncate" style={{ color: T.muted }}>
                  {api.status === 'error'
                    ? (api.error ?? 'Not responding')
                    : api.status === 'checking'
                      ? 'Checking…'
                      : `${api.recordCount ?? 0} records`}
                </p>
              </span>
              <span className="text-right shrink-0">
                <Figure value={api.responseMs} unit="ms" size="sm" tone={toneFor(api.status)} />
                <p className="text-[0.65rem] mt-0.5"><TimeAgo ts={api.lastChecked ?? undefined} /></p>
              </span>
            </li>
          ))}
        </ul>
      </Panel>

      <StatGrid>
        <StatTile label="Traffic events" value={d.liveTrafficCount} hint="Live from Calgary open data" />
        <StatTile label="Open 311 requests" value={d.live311Count} hint="Live from Calgary open data" />
        <StatTile label="Feeds healthy" value={`${d.apiHealths.filter((a) => a.status === 'ok').length}/${d.apiHealths.length}`} tone="ok" />
        <StatTile label="Feeds failing" value={d.apiHealths.filter((a) => a.status === 'error').length} tone="critical" />
      </StatGrid>
    </>
  );
}

// ── Visitors ──────────────────────────────────────────────────────────────────

function VisitorsSection({ d }: { d: D }) {
  return (
    <>
      <StatGrid>
        <StatTile label="Page views" value={d.totalPageViews} hint="All time" />
        <StatTile label="Sessions" value={d.uniqueSessions} hint="Unique visits" />
        <StatTile label="Pages per session" value={d.avgPagesPerSession} hint="Average depth" />
        <StatTile label="From search" value={d.organicShare} unit="%" tone="ok" hint="Share of traffic" />
      </StatGrid>

      <Panel title="Views by day" subtitle="Daily traffic">
        <ChartFrame height={200}>
          <AreaChart data={d.pageViewsByDayData} margin={{ top: 4, right: 8, left: -22, bottom: 0 }}>
            <defs>
              <linearGradient id="gViews" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={T.signal} stopOpacity={0.35} />
                <stop offset="100%" stopColor={T.signal} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="2 4" stroke={T.line} vertical={false} />
            <XAxis dataKey="date" {...axis} />
            <YAxis allowDecimals={false} {...axis} />
            <Tooltip contentStyle={tooltipStyle} />
            <Area type="monotone" dataKey="views" stroke={T.signal} strokeWidth={2} fill="url(#gViews)" />
          </AreaChart>
        </ChartFrame>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="How people arrive" subtitle="Bucketed from referrer and UTM tags">
          <ChartFrame height={190}>
            <PieChart>
              <Pie data={d.trafficSourceData} dataKey="value" nameKey="name" innerRadius={44} outerRadius={72} paddingAngle={2}>
                {d.trafficSourceData.map((entry, i) => (
                  <Cell key={i} fill={entry.color ?? CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
            </PieChart>
          </ChartFrame>
          <Legend items={d.trafficSourceData.map((c, i) => ({ label: c.name, value: c.value, color: c.color ?? CHART_COLORS[i % CHART_COLORS.length] }))} />
        </Panel>

        {/*
          This series is ranked by volume and capped at seven, so it is the
          busiest days rather than a timeline. Drawing it as a trend line would
          imply an order the data does not have.
        */}
        <Panel title="Busiest search days" subtitle="Days with the most visits arriving from a search engine">
          {d.organicSearchByDayData.length === 0 ? (
            <EmptyState title="No search traffic yet" body="Visits arriving from Google or Bing will be counted here." />
          ) : (
            <ChartFrame height={190}>
              <BarChart data={d.organicSearchByDayData} margin={{ top: 4, right: 8, left: -22, bottom: 0 }}>
                <CartesianGrid strokeDasharray="2 4" stroke={T.line} vertical={false} />
                <XAxis dataKey="date" {...axis} />
                <YAxis allowDecimals={false} {...axis} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                <Bar dataKey="searches" fill={T.ok} radius={[5, 5, 0, 0]} />
              </BarChart>
            </ChartFrame>
          )}
          <p className="text-[0.7rem] mt-2 leading-relaxed" style={{ color: T.muted }}>
            Search keywords are deliberately not collected — they can carry personal information, so only the volume is recorded.
          </p>
        </Panel>

        <Panel title="Top pages" subtitle="Most viewed">
          {d.topPagesData.length === 0 ? (
            <EmptyState title="No views recorded yet" body="Page views appear here once visitors land on the site." />
          ) : (
            <ul className="space-y-1.5">
              {d.topPagesData.map((p) => (
                <li key={p.path} className="flex items-center justify-between gap-3">
                  <span className="text-sm truncate" style={{ fontFamily: mono, color: T.ink }}>{p.path}</span>
                  <Figure value={p.views} size="sm" />
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Top referrers" subtitle="Sites sending traffic">
          {d.topReferrersData.length === 0 ? (
            <EmptyState title="No referrers yet" body="When another site links to Calgary Watch, it shows up here." />
          ) : (
            <ChartFrame height={190}>
              <BarChart data={d.topReferrersData} layout="vertical" margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="referrer" width={118} {...axis} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                <Bar dataKey="views" fill={T.attention} radius={[0, 5, 5, 0]} />
              </BarChart>
            </ChartFrame>
          )}
        </Panel>

        <Panel title="Campaigns" subtitle="Views from utm_campaign tagged links" className="lg:col-span-2">
          {d.utmCampaignData.length === 0 ? (
            <EmptyState
              title="No campaign data yet"
              body="Tag a shared link with ?utm_campaign=name and its traffic will be tracked here."
            />
          ) : (
            <ChartFrame height={190}>
              <BarChart data={d.utmCampaignData} layout="vertical" margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="campaign" width={118} {...axis} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                <Bar dataKey="views" fill={T.signal} radius={[0, 5, 5, 0]} />
              </BarChart>
            </ChartFrame>
          )}
        </Panel>
      </div>
    </>
  );
}

// ── City stats ────────────────────────────────────────────────────────────────

function CitySection({ d }: { d: D }) {
  return (
    <>
      <StatGrid>
        <StatTile label="Avg safety score" value={d.averageSafety} unit="/100" tone="ok" />
        <StatTile label="Communities tracked" value={d.communityStats.length} />
        <StatTile label="Crime records" value={d.crimeStats.size} hint="From Calgary open data" />
        <StatTile label="Traffic events" value={d.liveTrafficCount} hint="Live now" />
      </StatGrid>

      <Panel title="Safety scores" subtitle="The scores shown on the map's area panel">
        {d.safetyChartData.length === 0 ? (
          <EmptyState title="No safety scores yet" body="Add a community below and it will chart here." />
        ) : (
          <ChartFrame height={240}>
            <BarChart data={d.safetyChartData} margin={{ top: 4, right: 8, left: -14, bottom: 0 }}>
              <CartesianGrid strokeDasharray="2 4" stroke={T.line} vertical={false} />
              <XAxis dataKey="name" {...axis} />
              <YAxis domain={[0, 100]} {...axis} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
              {/* Series key is "Safety Score" — it is the label shown in the tooltip. */}
              <Bar dataKey="Safety Score" fill={T.ok} radius={[5, 5, 0, 0]} />
            </BarChart>
          </ChartFrame>
        )}
      </Panel>

      <Panel title="Highest reported crime" subtitle="From the Calgary Police open dataset">
        {d.crimeLoading ? (
          <SkeletonRows rows={4} />
        ) : d.topCrimeCommunities.length === 0 ? (
          <EmptyState title="Crime data unavailable" body="The Calgary open-data endpoint returned no records. Check the Data feeds tab." />
        ) : (
          <ul className="divide-y divide-[#E4E2DC]">
            {d.topCrimeCommunities.map((c) => (
              <li key={c.name} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                <span className="text-sm font-medium truncate" style={{ color: T.ink }}>{c.name}</span>
                <span className="flex items-center gap-2.5 shrink-0">
                  <span className="text-[0.68rem]" style={{ color: T.muted }}>crime</span>
                  <Figure value={c.crime} size="sm" tone="critical" />
                  <span className="text-[0.68rem]" style={{ color: T.muted }}>disorder</span>
                  <Figure value={c.disorder} size="sm" tone="attention" />
                  <span className="text-[0.68rem] tabular-nums" style={{ fontFamily: mono, color: T.muted }}>{c.year}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Community safety scores" subtitle="Edit the values that feed the map" padded={false}>
        <div className="p-4">
          <RecordList
            rows={d.communityStats}
            keyOf={(r) => r.id}
            empty={<EmptyState title="No community scores yet" body="Rows in the community_stats collection appear here for editing." />}
            columns={[
              { header: 'Community', cell: (row) => <StatsInput d={d} row={row} field="community" /> },
              { header: 'Month', width: '7rem', cell: (row) => <StatsInput d={d} row={row} field="month" /> },
              { header: 'Violent', width: '6rem', cell: (row) => <StatsInput d={d} row={row} field="violent_crime" numeric /> },
              { header: 'Property', width: '6rem', cell: (row) => <StatsInput d={d} row={row} field="property_crime" numeric /> },
              { header: 'Disorder', width: '6rem', cell: (row) => <StatsInput d={d} row={row} field="disorder_calls" numeric /> },
              { header: 'Score', width: '6rem', cell: (row) => <StatsInput d={d} row={row} field="safety_score" numeric /> },
              {
                header: 'Actions',
                width: '9rem',
                cell: (row) => (
                  <div className="flex gap-1.5">
                    <AdminButton size="sm" tone="signal" onClick={() => d.saveCommunityStats(row.id)} disabled={d.savingStatsId === row.id}>
                      <Save size={13} /> Save
                    </AdminButton>
                    <AdminButton size="sm" variant="outline" tone="critical" onClick={() => d.softDeleteCommunityStats(row.id)} title="Delete row">
                      <Trash2 size={13} />
                    </AdminButton>
                  </div>
                ),
              },
            ]}
            card={(row) => (
              <div className="rounded-xl border p-3 space-y-2.5" style={{ borderColor: T.line, background: T.card }}>
                <div className="grid grid-cols-2 gap-2.5">
                  <Field label="Community"><StatsInput d={d} row={row} field="community" /></Field>
                  <Field label="Month"><StatsInput d={d} row={row} field="month" /></Field>
                  <Field label="Violent"><StatsInput d={d} row={row} field="violent_crime" numeric /></Field>
                  <Field label="Property"><StatsInput d={d} row={row} field="property_crime" numeric /></Field>
                  <Field label="Disorder"><StatsInput d={d} row={row} field="disorder_calls" numeric /></Field>
                  <Field label="Safety score"><StatsInput d={d} row={row} field="safety_score" numeric /></Field>
                </div>
                <div className="flex gap-2">
                  <AdminButton size="sm" tone="signal" onClick={() => d.saveCommunityStats(row.id)} disabled={d.savingStatsId === row.id} className="flex-1">
                    <Save size={13} /> {d.savingStatsId === row.id ? 'Saving' : 'Save'}
                  </AdminButton>
                  <AdminButton size="sm" variant="outline" tone="critical" onClick={() => d.softDeleteCommunityStats(row.id)}>
                    <Trash2 size={13} /> Delete
                  </AdminButton>
                </div>
              </div>
            )}
          />
        </div>
      </Panel>
    </>
  );
}

function StatsInput({
  d,
  row,
  field,
  numeric,
}: {
  d: D;
  row: D['communityStats'][number];
  field: 'community' | 'month' | 'violent_crime' | 'property_crime' | 'disorder_calls' | 'safety_score';
  numeric?: boolean;
}) {
  const draft = d.statsDrafts[row.id] ?? {
    community: row.community, month: row.month,
    violent_crime: row.violent_crime, property_crime: row.property_crime,
    disorder_calls: row.disorder_calls, safety_score: row.safety_score,
  };
  return (
    <input
      className={inputClass}
      style={{ ...inputStyle, fontFamily: numeric ? mono : undefined }}
      type={numeric ? 'number' : 'text'}
      value={draft[field]}
      onChange={(e) =>
        d.setStatsDraft(row, { [field]: numeric ? Number(e.target.value) : e.target.value })
      }
    />
  );
}
