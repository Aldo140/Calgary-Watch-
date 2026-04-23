import { useEffect, useMemo, useState, useCallback } from 'react';
import { useCrimeStats } from '@/src/hooks/useCrimeStats';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/src/lib/utils';
import { useAuth } from '@/src/components/FirebaseProvider';
import { db, isFirebaseConfigured } from '@/src/firebase';
import { Incident, CommunityStats } from '@/src/types';
import {
  addDoc, collection, deleteDoc, doc, getDocs,
  onSnapshot, orderBy, query, updateDoc, limit, where, deleteField,
  getCountFromServer,
} from 'firebase/firestore';
import { Button } from '@/src/components/ui/Button';
import { Card } from '@/src/components/ui/Card';
import {
  ArrowLeft, Loader2, Lock, Save, Trash2,
  Activity, AlertTriangle, Clock3, Users, ShieldCheck,
  ChartNoAxesColumn, Sparkles, RefreshCw, Siren, ChartPie,
  ShieldQuestion, CheckCircle, LayoutDashboard, FileText,
  BarChart3, Map, Globe, TrendingUp, MousePointerClick,
  Wifi, Link, Megaphone, Zap, Flag,
} from 'lucide-react';
import {
  ResponsiveContainer,
  PieChart, Pie, Sector,
  AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar, Legend,
  LineChart, Line,
} from 'recharts';

// ── Types ──────────────────────────────────────────────────────────────────────

type UserProfile = {
  uid: string;
  email: string;
  displayName: string;
  role: 'user' | 'admin';
};

type EditableIncident = Pick<
  Incident,
  | 'title' | 'description' | 'category' | 'neighborhood'
  | 'verified_status' | 'report_count' | 'source_name' | 'source_url'
>;

type EditableCommunityStats = Pick<
  CommunityStats,
  'community' | 'month' | 'violent_crime' | 'property_crime' | 'disorder_calls' | 'safety_score'
>;

type PageViewDoc = {
  timestamp: number;
  path: string;
  referrer?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  traffic_source?: string;
  sessionId?: string;
};

type AdminSection =
  | 'dashboard'
  | 'incidents'
  | 'users'
  | 'stats'
  | 'analytics'
  | 'traffic'
  | 'apis'
  | 'flagged';

type ApiHealth = {
  id: string;
  name: string;
  url: string;
  status: 'idle' | 'checking' | 'ok' | 'slow' | 'error';
  recordCount: number | null;
  responseMs: number | null;
  lastChecked: number | null;
  error: string | null;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const emptyIncidentDraft: EditableIncident = {
  title: '', description: '', category: 'crime', neighborhood: '',
  verified_status: 'unverified', report_count: 1, source_name: '', source_url: '',
};

const emptyStatsDraft: EditableCommunityStats = {
  community: '', month: '', violent_crime: 0,
  property_crime: 0, disorder_calls: 0, safety_score: 0,
};

const API_ENDPOINTS: Pick<ApiHealth, 'id' | 'name' | 'url'>[] = [
  { id: 'traffic',   name: 'Calgary Traffic',     url: 'https://data.calgary.ca/resource/35ra-9556.json?$limit=10&$order=start_dt%20DESC' },
  { id: '311',       name: 'Calgary 311',          url: "https://data.calgary.ca/resource/iahh-g8bj.json?$limit=10&$where=status_description%3D'Open'&$order=requested_date%20DESC" },
  { id: 'watermain', name: 'Water Main Breaks',    url: 'https://data.calgary.ca/resource/dpcu-jr23.json?$limit=10&$order=break_date%20DESC&status=ACTIVE' },
  { id: 'weather',   name: 'Open-Meteo Weather',   url: 'https://api.open-meteo.com/v1/forecast?latitude=51.048&longitude=-114.065&current=temperature_2m,weathercode&timezone=America%2FEdmonton' },
];

const NAV_ITEMS: { id: AdminSection; label: string; icon: React.ElementType; badge?: string }[] = [
  { id: 'dashboard',  label: 'Dashboard',  icon: LayoutDashboard },
  { id: 'incidents',  label: 'Incidents',  icon: FileText },
  { id: 'users',      label: 'Users',      icon: Users },
  { id: 'stats',      label: 'City Stats', icon: Map },
  { id: 'analytics',  label: 'Analytics',  icon: BarChart3 },
  { id: 'traffic',    label: 'Traffic',    icon: Globe },
  { id: 'apis',       label: 'API Health', icon: Zap },
  { id: 'flagged' as AdminSection, label: 'Flagged', icon: Flag },
];

const INCIDENT_CATEGORIES: Incident['category'][] = [
  'emergency',
  'crime',
  'traffic',
  'infrastructure',
  'weather',
];

const VERIFIED_STATUSES: Incident['verified_status'][] = [
  'unverified',
  'multiple_reports',
  'community_confirmed',
];

const SECTION_THEMES: Record<AdminSection, { eyebrow: string; title: string; description: string; accent: string; glow: string }> = {
  dashboard: {
    eyebrow: 'Executive View',
    title: 'Run the city pulse from one screen',
    description: 'Critical incidents, growth signals, and moderation pressure are surfaced first for quick executive decisions.',
    accent: 'from-sky-500/30 via-blue-500/10 to-cyan-400/20',
    glow: 'rgba(56,189,248,0.24)',
  },
  incidents: {
    eyebrow: 'Field Ops',
    title: 'Moderate the live incident stream',
    description: 'Edit reports fast, resolve trust issues, and keep the public signal clean without hunting through tables.',
    accent: 'from-rose-500/30 via-orange-500/10 to-amber-400/20',
    glow: 'rgba(251,113,133,0.22)',
  },
  users: {
    eyebrow: 'Community',
    title: 'See who powers the network',
    description: 'Track admins, contributors, and top citizen reporters with a cleaner mobile-ready directory.',
    accent: 'from-violet-500/30 via-fuchsia-500/10 to-sky-400/20',
    glow: 'rgba(167,139,250,0.24)',
  },
  stats: {
    eyebrow: 'City Intel',
    title: 'Tune neighborhood safety metrics',
    description: 'Update community stats with a sharper editing flow designed for quick field review on mobile.',
    accent: 'from-emerald-500/30 via-teal-500/10 to-cyan-400/20',
    glow: 'rgba(45,212,191,0.22)',
  },
  analytics: {
    eyebrow: 'Insights',
    title: 'Spot patterns before they become trends',
    description: 'High-signal charts make it easier to read where reports are clustering across time and place.',
    accent: 'from-indigo-500/30 via-blue-500/10 to-sky-400/20',
    glow: 'rgba(99,102,241,0.22)',
  },
  traffic: {
    eyebrow: 'Growth',
    title: 'Measure reach and campaign momentum',
    description: 'See what channels, routes, and campaigns are actually moving attention across Calgary Watch.',
    accent: 'from-pink-500/30 via-orange-500/10 to-amber-400/20',
    glow: 'rgba(244,114,182,0.22)',
  },
  apis: {
    eyebrow: 'Infrastructure',
    title: 'Monitor the data pipeline',
    description: 'Real-time health of the Calgary Open Data and weather APIs that feed the live map.',
    accent: 'from-cyan-500/30 via-blue-500/10 to-sky-400/20',
    glow: 'rgba(34,211,238,0.22)',
  },
  flagged: {
    eyebrow: 'Moderation',
    title: 'Review flagged content',
    description: 'Incidents taken down by community flags. Restore clean reports or permanently remove harmful ones.',
    accent: 'from-amber-500/30 via-orange-500/10 to-yellow-400/20',
    glow: 'rgba(245,158,11,0.22)',
  },
};

function formatRelativeMinutes(timestamp: number) {
  const ageMin = Math.floor((Date.now() - timestamp) / 60000);
  if (ageMin < 1) return 'just now';
  if (ageMin < 60) return `${ageMin}m ago`;
  const ageHours = Math.floor(ageMin / 60);
  if (ageHours < 24) return `${ageHours}h ago`;
  return `${Math.floor(ageHours / 24)}d ago`;
}

// ── Mini sparkline (inline, no deps) ─────────────────────────────────────────

function MiniSparkline({ data, color = '#3b82f6' }: { data: number[]; color?: string }) {
  if (!data.length) return null;
  const max = Math.max(...data, 1);
  const W = 80; const H = 32;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * W;
    const y = H - (v / max) * H;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} fill="none" className="opacity-70">
      <polyline points={pts} stroke={color} strokeWidth="1.5" fill="none" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// ── Section header ─────────────────────────────────────────────────────────────

function SectionHeader({ icon: Icon, title, subtitle }: { icon: React.ElementType; title: string; subtitle?: string }) {
  return (
    <div className="flex items-center gap-3 mb-6">
      <div className="w-8 h-8 rounded-xl bg-blue-500/10 light:bg-blue-50 border border-blue-500/20 light:border-blue-200 flex items-center justify-center shrink-0">
        <Icon size={15} className="text-blue-400 light:text-blue-600" />
      </div>
      <div>
        <h2 className="text-base font-black text-white light:text-slate-900">{title}</h2>
        {subtitle && <p className="text-[10px] text-slate-500 light:text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function AdminPage() {
  const navigate = useNavigate();
  const { user, signIn, isAuthReady, isAdmin } = useAuth();

  const [activeSection, setActiveSection] = useState<AdminSection>('dashboard');
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [communityStats, setCommunityStats] = useState<(CommunityStats & { id: string })[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [pageViewDocs, setPageViewDocs] = useState<PageViewDoc[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [isRefreshingUsers, setIsRefreshingUsers] = useState(false);
  const [totalPageViews, setTotalPageViews] = useState<number | null>(null);
  const [flaggedIncidents, setFlaggedIncidents] = useState<Incident[]>([]);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [incidentDrafts, setIncidentDrafts] = useState<Record<string, EditableIncident>>({});
  const [statsDrafts, setStatsDrafts] = useState<Record<string, EditableCommunityStats>>({});
  const [savingIncidentId, setSavingIncidentId] = useState<string | null>(null);
  const [savingStatsId, setSavingStatsId] = useState<string | null>(null);
  const [apiHealths, setApiHealths] = useState<ApiHealth[]>(
    API_ENDPOINTS.map(e => ({ ...e, status: 'idle', recordCount: null, responseMs: null, lastChecked: null, error: null }))
  );
  const [liveTrafficCount, setLiveTrafficCount] = useState<number | null>(null);
  const [live311Count, setLive311Count] = useState<number | null>(null);

  const { stats: crimeStats, isLoading: crimeLoading } = useCrimeStats();

  // ── Audit log ──────────────────────────────────────────────────────────────

  const writeAuditLog = async (
    action: 'incident_update' | 'incident_soft_delete' | 'community_stats_update' | 'community_stats_soft_delete',
    targetCollection: 'incidents' | 'community_stats',
    targetId: string,
    changes: Record<string, unknown>,
  ) => {
    if (!user || !db) return;
    await addDoc(collection(db, 'admin_audit_logs'), {
      action, targetCollection, targetId,
      adminUid: user.uid, adminEmail: user.email || '',
      timestamp: Date.now(), changes,
      metadata: { userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown' },
    });
  };

  const handleRestore = async (incidentId: string) => {
    if (!db || restoringId) return;
    setRestoringId(incidentId);
    try {
      await updateDoc(doc(db, 'incidents', incidentId), {
        flagged: false,
        flagged_at: deleteField(),
        flagged_by: deleteField(),
      });
      await writeAuditLog('incident_update', 'incidents', incidentId, { flagged: false });
    } catch {
      // silently fail — Firestore subscription will keep the item visible
    } finally {
      setRestoringId(null);
    }
  };

  const handlePermanentDelete = async (incidentId: string) => {
    if (!window.confirm('Permanently delete this incident? This cannot be undone.')) return;
    if (!db || deletingId) return;
    setDeletingId(incidentId);
    try {
      await deleteDoc(doc(db, 'incidents', incidentId));
      await writeAuditLog('incident_soft_delete', 'incidents', incidentId, { permanent: true });
    } catch {
      // silently fail
    } finally {
      setDeletingId(null);
    }
  };

  // ── Data subscriptions ────────────────────────────────────────────────────

  useEffect(() => {
    if (!isAuthReady || !user || !isAdmin || !db) return;

    const unsubIncidents = onSnapshot(
      query(collection(db, 'incidents'), orderBy('timestamp', 'desc')),
      (snapshot) => {
        const rows = snapshot.docs
          .map((row) => ({ id: row.id, ...row.data() } as Incident))
          .filter((row) => row.deleted !== true);
        setIncidents(rows);
        setLoadingData(false);
      }
    );

    const unsubStats = onSnapshot(collection(db, 'community_stats'), (snapshot) => {
      const rows = snapshot.docs
        .map((row) => ({ id: row.id, ...row.data() } as CommunityStats & { id: string; deleted?: boolean }))
        .filter((row) => row.deleted !== true);
      setCommunityStats(rows);
    });

    const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      setUsers(snapshot.docs.map((row) => row.data() as UserProfile));
    });

    // Page views — real-time listener for chart/breakdown data (last 2000 docs)
    const unsubPageViews = onSnapshot(
      query(collection(db, 'page_views'), orderBy('timestamp', 'desc'), limit(2000)),
      (snapshot) => {
        setPageViewDocs(snapshot.docs.map(d => d.data() as PageViewDoc));
      },
      () => {}
    );

    // True total count — not capped by the snapshot limit
    const fetchTotalCount = async () => {
      try {
        const snap = await getCountFromServer(collection(db!, 'page_views'));
        setTotalPageViews(snap.data().count);
      } catch {
        setTotalPageViews(null);
      }
    };
    fetchTotalCount();
    const countInterval = setInterval(fetchTotalCount, 5 * 60 * 1000);

    const unsubFlagged = onSnapshot(
      query(collection(db, 'incidents'), where('flagged', '==', true), orderBy('flagged_at', 'desc')),
      (snapshot) => {
        setFlaggedIncidents(snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Incident)));
      }
    );

    return () => { unsubIncidents(); unsubStats(); unsubUsers(); unsubPageViews(); unsubFlagged(); clearInterval(countInterval); };
  }, [isAuthReady, isAdmin, user]);

  // ── API health polling ────────────────────────────────────────────────────

  const checkApis = useCallback(async () => {
    setApiHealths(prev => prev.map(h => ({ ...h, status: 'checking' as const })));
    const results = await Promise.all(
      API_ENDPOINTS.map(async (ep) => {
        const start = Date.now();
        try {
          const res = await fetch(ep.url);
          const ms = Date.now() - start;
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          const count = Array.isArray(data) ? data.length : (data ? 1 : 0);
          return { ...ep, status: (ms > 2000 ? 'slow' : 'ok') as ApiHealth['status'], recordCount: count, responseMs: ms, lastChecked: Date.now(), error: null };
        } catch (err: any) {
          return { ...ep, status: 'error' as const, recordCount: null, responseMs: Date.now() - start, lastChecked: Date.now(), error: err?.message ?? 'Unknown error' };
        }
      })
    );
    setApiHealths(results);
  }, []);

  useEffect(() => {
    if (!isAuthReady || !isAdmin) return;
    checkApis();
    const interval = setInterval(checkApis, 2 * 60 * 1000);
    return () => clearInterval(interval);
  }, [isAuthReady, isAdmin, checkApis]);

  // Fetch live counts from Calgary Open Data APIs for dashboard KPI cards.
  // These incidents are never written to Firestore, so they must be counted directly.
  useEffect(() => {
    if (!isAuthReady || !isAdmin) return;
    const fetchLiveCounts = async () => {
      try {
        const [trafficRes, res311] = await Promise.allSettled([
          fetch('https://data.calgary.ca/resource/35ra-9556.json?$limit=60&$order=start_dt%20DESC'),
          fetch("https://data.calgary.ca/resource/iahh-g8bj.json?$limit=50&$where=status_description%3D'Open'&$order=requested_date%20DESC"),
        ]);
        if (trafficRes.status === 'fulfilled' && trafficRes.value.ok) {
          const data = await trafficRes.value.json();
          setLiveTrafficCount(Array.isArray(data) ? data.length : 0);
        }
        if (res311.status === 'fulfilled' && res311.value.ok) {
          const data = await res311.value.json();
          setLive311Count(Array.isArray(data) ? data.length : 0);
        }
      } catch {
        // non-critical — dashboard still works without these counts
      }
    };
    fetchLiveCounts();
    const interval = setInterval(fetchLiveCounts, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [isAuthReady, isAdmin]);

  // ── KPI derivations ───────────────────────────────────────────────────────

  const totalIncidents     = incidents.length;
  const emergencyIncidents = incidents.filter((i) => i.category === 'emergency').length;
  const unresolvedIncidents = incidents.filter((i) => i.verified_status !== 'community_confirmed').length;
  const todayIncidents     = incidents.filter((i) => Date.now() - i.timestamp < 86_400_000).length;
  const totalUsers         = users.length;
  const adminUsers         = users.filter((u) => u.role === 'admin').length;
  const viewOnlyUsers      = totalUsers - adminUsers;
  const uniqueReporterEmails = new Set(
    incidents.map((i) => i.email).filter(e => e && e !== 'anonymous@calgarywatch.app' && e !== 'opendata@calgary.ca')
  ).size;
  const averageSafety = useMemo(() => {
    if (communityStats.length === 0) return 0;
    return Math.round(communityStats.reduce((sum, r) => sum + Number(r.safety_score || 0), 0) / communityStats.length);
  }, [communityStats]);

  const MODERATION_WINDOW_MS = 30 * 60 * 1000;
  const pendingReviewIncidents = incidents.filter((i) =>
    i.verified_status === 'unverified' &&
    i.data_source !== 'system' &&
    Date.now() - i.timestamp < MODERATION_WINDOW_MS
  );

  const officialTrafficCount   = incidents.filter((i) => i.source_type === '511_alberta_traffic').length;
  const official311Count       = incidents.filter((i) => i.source_type === 'calgary_infrastructure').length;
  const officialCrimeCount     = incidents.filter((i) => i.source_type === 'calgary_police_crime').length;
  const communityReportCount   = incidents.filter((i) => !i.data_source || i.data_source === 'community').length;
  const activeSectionTheme = SECTION_THEMES[activeSection];
  const activeNavItem = NAV_ITEMS.find((item) => item.id === activeSection) ?? NAV_ITEMS[0];

  // ── Incident chart data ───────────────────────────────────────────────────

  const categoryChartData = useMemo(() => {
    const counts: Record<string, number> = {};
    incidents.forEach((i) => { counts[i.category] = (counts[i.category] ?? 0) + 1; });
    return [
      { name: 'Emergency',      value: counts['emergency']      ?? 0, color: '#dc2626' },
      { name: 'Crime',          value: counts['crime']          ?? 0, color: '#ef4444' },
      { name: 'Traffic',        value: counts['traffic']        ?? 0, color: '#f97316' },
      { name: 'Infrastructure', value: counts['infrastructure'] ?? 0, color: '#3b82f6' },
      { name: 'Weather',        value: counts['weather']        ?? 0, color: '#a855f7' },
      { name: 'Gas',            value: counts['gas']            ?? 0, color: '#10b981' },
    ].filter((d) => d.value > 0);
  }, [incidents]);

  const userRoleChartData = useMemo(() => {
    let admins = 0, postingUsers = 0, lurkingUsers = 0;
    const posterEmails = new Set(incidents.map(i => i.email).filter(Boolean));
    const posterUids   = new Set(incidents.map(i => (i as any).uid).filter(Boolean));
    users.forEach(u => {
      if (u.role === 'admin') admins++;
      else if (posterEmails.has(u.email) || posterUids.has(u.uid)) postingUsers++;
      else lurkingUsers++;
    });
    return [
      { name: 'Posting Users',   value: postingUsers, color: '#f59e0b' },
      { name: 'View-Only Users', value: lurkingUsers, color: '#4A90D9' },
      { name: 'Admins',          value: admins,       color: '#2E8B7A' },
    ].filter((d) => d.value > 0);
  }, [users, incidents]);

  const trustChartData = useMemo(() => {
    const counts: Record<string, number> = {};
    incidents.forEach((i) => { counts[i.verified_status] = (counts[i.verified_status] ?? 0) + 1; });
    return [
      { name: 'Unverified',          value: counts['unverified']          ?? 0, color: '#64748b' },
      { name: 'Multiple Reports',    value: counts['multiple_reports']    ?? 0, color: '#f59e0b' },
      { name: 'Community Confirmed', value: counts['community_confirmed'] ?? 0, color: '#22c55e' },
    ].filter((d) => d.value > 0);
  }, [incidents]);

  const timelineChartData = useMemo(() => {
    const days = 14;
    const buckets: Record<string, number> = {};
    const now = Date.now();
    for (let d = days - 1; d >= 0; d--) {
      const date = new Date(now - d * 86400000);
      buckets[date.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })] = 0;
    }
    incidents.forEach((i) => {
      const key = new Date(i.timestamp).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
      if (key in buckets) buckets[key]++;
    });
    return Object.entries(buckets).map(([date, count]) => ({ date, count }));
  }, [incidents]);

  // Sparkline data for page views KPI (last 14 days daily buckets)
  const pageViewsSparklineData = useMemo(() => {
    const days = 14;
    const buckets: Record<string, number> = {};
    const now = Date.now();
    for (let d = days - 1; d >= 0; d--) {
      const date = new Date(now - d * 86400000).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
      buckets[date] = 0;
    }
    pageViewDocs.forEach((pv) => {
      const key = new Date(pv.timestamp).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
      if (key in buckets) buckets[key]++;
    });
    return Object.values(buckets);
  }, [pageViewDocs]);

  const incidentSparklineData = useMemo(
    () => timelineChartData.map(d => d.count),
    [timelineChartData]
  );

  const neighborhoodChartData = useMemo(() => {
    const counts: Record<string, number> = {};
    incidents.forEach((i) => {
      if (i.neighborhood) counts[i.neighborhood] = (counts[i.neighborhood] ?? 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1]).slice(0, 8)
      .map(([name, count]) => ({ name, count }));
  }, [incidents]);

  const safetyChartData = useMemo(() =>
    communityStats.slice().sort((a, b) => b.safety_score - a.safety_score).slice(0, 10)
      .map((row) => ({
        name: row.community.length > 12 ? row.community.slice(0, 12) + '…' : row.community,
        'Safety Score': row.safety_score,
        'Violent Crime': row.violent_crime,
        'Property Crime': row.property_crime,
        'Disorder Calls': row.disorder_calls,
      })),
  [communityStats]);

  const hourlyChartData = useMemo(() => {
    const buckets = Array.from({ length: 24 }, (_, h) => ({ hour: `${h}:00`, count: 0 }));
    incidents.forEach((i) => { buckets[new Date(i.timestamp).getHours()].count++; });
    return buckets;
  }, [incidents]);

  const categoryByDayData = useMemo(() => {
    const days = 7;
    const now = Date.now();
    const result: Record<string, Record<string, number>> = {};
    for (let d = days - 1; d >= 0; d--) {
      const date = new Date(now - d * 86400000).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
      result[date] = { emergency: 0, crime: 0, traffic: 0, infrastructure: 0, weather: 0 };
    }
    incidents.forEach((i) => {
      const key = new Date(i.timestamp).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
      if (result[key] && i.category in result[key]) result[key][i.category]++;
    });
    return Object.entries(result).map(([date, cats]) => ({ date, ...cats }));
  }, [incidents]);

  const topReportersData = useMemo(() => {
    const counts: Record<string, { name: string; count: number }> = {};
    incidents.forEach((i) => {
      const uid = (i as any).authorUid;
      const key = uid || i.email || 'unknown';
      if (!counts[key]) {
        const u = users.find(u => u.uid === uid || u.email === i.email);
        counts[key] = { name: u?.displayName || i.name || i.email || 'Unknown', count: 0 };
      }
      counts[key].count++;
    });
    return Object.values(counts)
      .filter(r => r.name !== 'Calgary 311 Sync' && r.name !== 'City of Calgary Traffic' && r.name !== 'Calgary Police Service')
      .sort((a, b) => b.count - a.count).slice(0, 8)
      .map(r => ({ name: r.name.length > 14 ? r.name.slice(0, 14) + '…' : r.name, count: r.count }));
  }, [incidents, users]);

  // User growth sparkline (registrations per day, last 14 days)
  // We don't have createdAt on UserProfile, so we proxy via first report date
  const userGrowthData = useMemo(() => {
    const days = 30;
    const buckets: Record<string, number> = {};
    const now = Date.now();
    for (let d = days - 1; d >= 0; d--) {
      const date = new Date(now - d * 86400000).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
      buckets[date] = 0;
    }
    // Proxy: count distinct new authors each day from incidents
    const seenAuthors = new Set<string>();
    incidents.slice().sort((a, b) => a.timestamp - b.timestamp).forEach((i) => {
      const uid = (i as any).authorUid || i.email;
      if (!uid || seenAuthors.has(uid)) return;
      seenAuthors.add(uid);
      const key = new Date(i.timestamp).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
      if (key in buckets) buckets[key]++;
    });
    return Object.entries(buckets).map(([date, count]) => ({ date, count }));
  }, [incidents]);

  const userGrowthSparklineData = useMemo(
    () => userGrowthData.map(d => d.count),
    [userGrowthData]
  );

  // ── Traffic analytics chart data ──────────────────────────────────────────

  // Page views per day — last 30 days
  const pageViewsByDayData = useMemo(() => {
    const days = 30;
    const buckets: Record<string, number> = {};
    const now = Date.now();
    for (let d = days - 1; d >= 0; d--) {
      const date = new Date(now - d * 86400000).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
      buckets[date] = 0;
    }
    pageViewDocs.forEach((pv) => {
      const key = new Date(pv.timestamp).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
      if (key in buckets) buckets[key]++;
    });
    return Object.entries(buckets).map(([date, views]) => ({ date, views }));
  }, [pageViewDocs]);

  // Traffic source breakdown
  const trafficSourceData = useMemo(() => {
    const counts: Record<string, number> = {};
    pageViewDocs.forEach((pv) => {
      const src = pv.traffic_source || 'direct';
      counts[src] = (counts[src] ?? 0) + 1;
    });
    const colorMap: Record<string, string> = {
      direct: '#4A90D9',
      organic_search: '#22c55e',
      social: '#f59e0b',
      referral: '#a855f7',
      campaign: '#f97316',
      email: '#ec4899',
    };
    const labelMap: Record<string, string> = {
      direct: 'Direct',
      organic_search: 'Organic Search',
      social: 'Social Media',
      referral: 'Referral',
      campaign: 'Campaign (UTM)',
      email: 'Email',
    };
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([src, value]) => ({
        name: labelMap[src] || src,
        value,
        color: colorMap[src] || '#64748b',
      }));
  }, [pageViewDocs]);

  // Top pages by views
  const topPagesData = useMemo(() => {
    const counts: Record<string, number> = {};
    pageViewDocs.forEach((pv) => {
      const p = pv.path || '/';
      counts[p] = (counts[p] ?? 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1]).slice(0, 8)
      .map(([path, views]) => ({ path, views }));
  }, [pageViewDocs]);

  // UTM campaign performance
  const utmCampaignData = useMemo(() => {
    const counts: Record<string, number> = {};
    pageViewDocs.forEach((pv) => {
      if (pv.utm_campaign) counts[pv.utm_campaign] = (counts[pv.utm_campaign] ?? 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1]).slice(0, 6)
      .map(([campaign, views]) => ({ campaign: campaign.length > 18 ? campaign.slice(0, 18) + '…' : campaign, views }));
  }, [pageViewDocs]);

  // Top referrers
  const topReferrersData = useMemo(() => {
    const counts: Record<string, number> = {};
    pageViewDocs.forEach((pv) => {
      if (!pv.referrer) return;
      try {
        const host = new URL(pv.referrer).hostname.replace(/^www\./, '');
        if (host && host !== window.location.hostname.replace(/^www\./, '')) {
          counts[host] = (counts[host] ?? 0) + 1;
        }
      } catch {}
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1]).slice(0, 8)
      .map(([referrer, views]) => ({ referrer: referrer.length > 22 ? referrer.slice(0, 22) + '…' : referrer, views }));
  }, [pageViewDocs]);

  // Unique sessions (approximate)
  const uniqueSessions = useMemo(() => {
    return new Set(pageViewDocs.map(pv => pv.sessionId).filter(Boolean)).size;
  }, [pageViewDocs]);

  // Avg pages per session
  const avgPagesPerSession = useMemo(() => {
    if (!uniqueSessions) return 0;
    return (pageViewDocs.length / uniqueSessions).toFixed(1);
  }, [pageViewDocs, uniqueSessions]);

  const topCrimeCommunities = useMemo(() => {
    const entries: { name: string; crime: number; disorder: number; year: number }[] = [];
    crimeStats.forEach((v, k) => entries.push({ name: k, ...v }));
    return entries.sort((a, b) => (b.crime + b.disorder) - (a.crime + a.disorder)).slice(0, 20);
  }, [crimeStats]);

  // ── Mutations ─────────────────────────────────────────────────────────────

  const setIncidentDraft = (incident: Incident, patch?: Partial<EditableIncident>) => {
    setIncidentDrafts((prev) => ({
      ...prev,
      [incident.id]: {
        ...(prev[incident.id] || {
          ...emptyIncidentDraft,
          title: incident.title, description: incident.description,
          category: incident.category, neighborhood: incident.neighborhood,
          verified_status: incident.verified_status, report_count: incident.report_count,
          source_name: incident.source_name || '', source_url: incident.source_url || '',
        }),
        ...patch,
      },
    }));
  };

  const setStatsDraft = (row: CommunityStats & { id: string }, patch?: Partial<EditableCommunityStats>) => {
    setStatsDrafts((prev) => ({
      ...prev,
      [row.id]: {
        ...(prev[row.id] || {
          ...emptyStatsDraft,
          community: row.community, month: row.month,
          violent_crime: row.violent_crime, property_crime: row.property_crime,
          disorder_calls: row.disorder_calls, safety_score: row.safety_score,
        }),
        ...patch,
      },
    }));
  };

  const saveIncident = async (incidentId: string) => {
    const draft = incidentDrafts[incidentId];
    if (!draft || !db) return;
    setSavingIncidentId(incidentId);
    try {
      await updateDoc(doc(db, 'incidents', incidentId), { ...draft, report_count: Number(draft.report_count || 0) });
      await writeAuditLog('incident_update', 'incidents', incidentId, draft);
    } finally { setSavingIncidentId(null); }
  };

  const saveCommunityStats = async (statsId: string) => {
    const draft = statsDrafts[statsId];
    if (!draft || !db) return;
    setSavingStatsId(statsId);
    try {
      await updateDoc(doc(db, 'community_stats', statsId), {
        ...draft,
        violent_crime: Number(draft.violent_crime || 0),
        property_crime: Number(draft.property_crime || 0),
        disorder_calls: Number(draft.disorder_calls || 0),
        safety_score: Number(draft.safety_score || 0),
      });
      await writeAuditLog('community_stats_update', 'community_stats', statsId, draft);
    } finally { setSavingStatsId(null); }
  };

  const softDeleteIncident = async (incidentId: string) => {
    if (!user || !db) return;
    if (!window.confirm('Soft-delete this incident? It will be hidden from the live feed.')) return;
    try {
      await updateDoc(doc(db, 'incidents', incidentId), { deleted: true, deletedAt: Date.now(), deletedBy: user.uid });
      await writeAuditLog('incident_soft_delete', 'incidents', incidentId, { deleted: true });
    } catch (err) {
      console.error('Failed to soft-delete incident:', err);
      alert('Could not delete this incident. Check your admin permissions.');
    }
  };

  const approveIncident = async (incidentId: string) => {
    if (!user || !db) return;
    try {
      await updateDoc(doc(db, 'incidents', incidentId), { verified_status: 'unverified' });
      await writeAuditLog('incident_update', 'incidents', incidentId, { verified_status: 'unverified' });
    } catch (err) { console.error('Failed to approve incident:', err); }
  };

  const softDeleteCommunityStats = async (statsId: string) => {
    if (!user || !db) return;
    if (!window.confirm('Soft-delete this community stats row?')) return;
    try {
      await updateDoc(doc(db, 'community_stats', statsId), { deleted: true, deletedAt: Date.now(), deletedBy: user.uid });
      await writeAuditLog('community_stats_soft_delete', 'community_stats', statsId, { deleted: true });
    } catch (err) {
      console.error('Failed to soft-delete community stats:', err);
      alert('Could not delete this row. Check your admin permissions.');
    }
  };

  const refreshUsers = async () => {
    if (!db) return;
    setIsRefreshingUsers(true);
    try {
      const snap = await getDocs(collection(db, 'users'));
      setUsers(snap.docs.map(d => d.data() as UserProfile));
    } catch {}
    setIsRefreshingUsers(false);
  };

  // ── Auth gates ────────────────────────────────────────────────────────────

  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-slate-950 light:bg-[#f5efe3] light:text-slate-900 text-white flex items-center justify-center">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  if (!isFirebaseConfigured) {
    return (
      <div className="min-h-screen bg-slate-950 light:bg-[#f5efe3] light:text-slate-900 text-white p-6 flex items-center justify-center">
        <Card className="max-w-xl w-full p-8 space-y-4 bg-slate-900/95 light:bg-white border-white/10 light:border-slate-200 rounded-[2rem] shadow-[0_25px_80px_-30px_rgba(0,0,0,0.7)]">
          <h1 className="text-2xl font-black light:text-slate-900">Admin unavailable</h1>
          <p className="text-slate-300 light:text-slate-600 text-sm leading-relaxed">
            This deployment was built without Firebase environment variables. Add the{' '}
            <code className="text-amber-300/90 light:text-amber-700">VITE_FIREBASE_*</code> secrets to your GitHub repository
            and re-run the Pages workflow, or run <code className="text-amber-300/90 light:text-amber-700">npm run build</code>{' '}
            with a local <code className="text-amber-300/90 light:text-amber-700">.env</code> file.
          </p>
          <Button onClick={() => navigate('/map')} className="w-full">Back to map</Button>
        </Card>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950 light:bg-[#f5efe3] light:text-slate-900 text-white p-6 flex items-center justify-center">
        <Card className="max-w-xl w-full p-8 space-y-4 bg-slate-900/95 light:bg-white border-white/10 light:border-slate-200 rounded-[2rem] shadow-[0_25px_80px_-30px_rgba(0,0,0,0.7)]">
          <h1 className="text-2xl font-black light:text-slate-900">Admin Portal</h1>
          <p className="text-slate-300 light:text-slate-600 text-sm">Sign in with Google using the approved admin account to continue.</p>
          <Button onClick={signIn} className="w-full">Sign in with Google</Button>
          <Button variant="secondary" onClick={() => navigate('/map')} className="w-full">Back to map</Button>
        </Card>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-slate-950 light:bg-[#f5efe3] light:text-slate-900 text-white p-6 flex items-center justify-center">
        <Card className="max-w-xl w-full p-8 space-y-4 bg-slate-900/95 light:bg-white border-red-500/40 light:border-red-200 rounded-[2rem] shadow-[0_25px_80px_-30px_rgba(0,0,0,0.7)]">
          <div className="flex items-center gap-2 text-red-400 light:text-red-600">
            <Lock size={18} />
            <h1 className="text-2xl font-black">Access denied</h1>
          </div>
          <p className="text-slate-300 light:text-slate-600 text-sm">This portal is restricted to approved admin accounts.</p>
          <Button variant="secondary" onClick={() => navigate('/map')} className="w-full">Back to map</Button>
        </Card>
      </div>
    );
  }

  // ── Shared tooltip style ──────────────────────────────────────────────────
  const isLightMode = typeof document !== 'undefined' && document.documentElement.classList.contains('light');
  const ttStyle = isLightMode
    ? { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, fontSize: 11, color: '#1e293b' }
    : { background: '#0f172a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, fontSize: 11 };

  const renderMobileHero = () => {
    const ActiveIcon = activeNavItem.icon;
    const mobileKpis = [
      { label: 'Open Issues', value: unresolvedIncidents, tone: 'text-amber-300', chip: 'bg-amber-500/15 border-amber-400/20' },
      { label: 'Pending Review', value: pendingReviewIncidents.length, tone: 'text-rose-300', chip: 'bg-rose-500/15 border-rose-400/20' },
      { label: 'Active Users', value: totalUsers, tone: 'text-sky-300', chip: 'bg-sky-500/15 border-sky-400/20' },
    ];

    return (
      <div className="md:hidden px-4 pt-4">
        <div className="relative overflow-hidden rounded-[2rem] border border-white/10 light:border-stone-200 bg-slate-950/90 light:bg-white/80 p-5 shadow-[0_30px_90px_-45px_rgba(15,23,42,0.95)]">
          <div
            className={cn('absolute inset-0 bg-gradient-to-br opacity-90', activeSectionTheme.accent)}
            style={{ boxShadow: `inset 0 0 120px ${activeSectionTheme.glow}` }}
          />
          <div className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />
          <div className="relative space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.28em] text-slate-300/75">{activeSectionTheme.eyebrow}</p>
                <h1 className="mt-2 max-w-[14rem] text-[1.65rem] font-black leading-none text-white light:text-slate-900">{activeSectionTheme.title}</h1>
              </div>
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-white/10 shadow-[0_0_30px_rgba(255,255,255,0.08)]">
                <ActiveIcon size={20} className="text-white light:text-slate-700" />
              </div>
            </div>

            <p className="max-w-[18rem] text-xs leading-relaxed text-slate-200/80">{activeSectionTheme.description}</p>

            <div className="grid grid-cols-3 gap-2">
              {mobileKpis.map((kpi) => (
                <div key={kpi.label} className={cn('rounded-2xl border px-3 py-3 backdrop-blur-sm', kpi.chip)}>
                  <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-300/70">{kpi.label}</p>
                  <p className={cn('mt-2 text-lg font-black', kpi.tone)}>{kpi.value}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setActiveSection('incidents')}
                className="rounded-2xl border border-white/15 bg-white/10 px-3 py-3 text-left backdrop-blur-sm transition-all active:scale-[0.98]"
              >
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/60">Priority</p>
                <p className="mt-1 text-sm font-bold text-white light:text-slate-800">Review incidents</p>
              </button>
              <button
                onClick={() => navigate('/map')}
                className="rounded-2xl border border-white/15 bg-slate-950/60 px-3 py-3 text-left backdrop-blur-sm transition-all active:scale-[0.98]"
              >
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Live Surface</p>
                <p className="mt-1 text-sm font-bold text-white light:text-slate-800">Open public map</p>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderMobileCommandDeck = () => (
    <div className="md:hidden sticky top-[72px] z-[19] border-b border-white/[0.06] light:border-stone-200/80 bg-slate-950/70 light:bg-[rgba(255,250,242,0.86)] px-4 py-3 backdrop-blur-xl">
      <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
          const isActive = activeSection === id;
          const badge = id === 'incidents' && pendingReviewIncidents.length > 0 ? pendingReviewIncidents.length : null;
          return (
            <button
              key={id}
              onClick={() => setActiveSection(id)}
              className={cn(
                'relative inline-flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-2 text-[11px] font-bold transition-all',
                isActive
                  ? 'border-sky-400/30 bg-sky-500/15 text-sky-200 shadow-[0_10px_30px_-18px_rgba(56,189,248,0.7)]'
                  : 'border-white/10 bg-white/[0.04] text-slate-400'
              )}
            >
              <Icon size={14} className={isActive ? 'text-sky-300' : 'text-slate-500'} />
              <span>{label}</span>
              {badge != null && (
                <span className="rounded-full border border-amber-300/20 bg-amber-400/15 px-1.5 py-0.5 text-[9px] font-black text-amber-200">
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );

  // ── Section renderers ─────────────────────────────────────────────────────

  const renderDashboard = () => (
    <div className="space-y-5">
      <SectionHeader icon={LayoutDashboard} title="Dashboard" subtitle="Live platform health and moderation queue" />

      {/* KPI row 1 — Incident health */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-4 bg-red-950/30 light:bg-red-50 border-red-500/30 light:border-red-200 rounded-2xl hover:border-red-500/60 transition-all">
          <div className="flex items-center gap-2 mb-3">
            <Siren size={13} className="text-red-400 animate-pulse shrink-0" />
            <p className="text-[10px] font-black tracking-widest uppercase text-red-400">Active Emergencies</p>
          </div>
          <p className="text-3xl font-black text-red-400">{emergencyIncidents}</p>
          <p className="text-[10px] text-red-400/50 mt-1">Critical — immediate review required</p>
        </Card>

        <Card className="p-4 bg-amber-950/20 light:bg-amber-50 border-amber-500/20 light:border-amber-200 rounded-2xl hover:border-amber-400/40 transition-all">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={13} className="text-amber-400 shrink-0" />
            <p className="text-[10px] font-black tracking-widest uppercase text-slate-400 light:text-slate-600">Unresolved</p>
          </div>
          <p className="text-3xl font-black text-amber-400">{unresolvedIncidents}</p>
          <p className="text-[10px] text-slate-600 mt-1">Awaiting community confirmation</p>
        </Card>

        <Card className="p-4 bg-slate-900/80 light:bg-white border-white/10 light:border-slate-200 rounded-2xl hover:border-blue-400/30 light:hover:border-blue-300 transition-all">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <Clock3 size={13} className="text-blue-400 shrink-0" />
              <p className="text-[10px] font-black tracking-widest uppercase text-slate-400 light:text-slate-600">Last 24h</p>
            </div>
            <MiniSparkline data={incidentSparklineData} color="#60a5fa" />
          </div>
          <p className="text-3xl font-black text-blue-400 mt-2">{todayIncidents}</p>
          <p className="text-[10px] text-slate-600 mt-1">14-day trend · today's reports</p>
        </Card>

        {/* Page Views KPI — enhanced with sparkline */}
        <Card className="p-4 bg-slate-900/80 light:bg-white border-white/10 light:border-slate-200 rounded-2xl hover:border-pink-400/30 transition-all">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <Activity size={13} className="text-pink-400 shrink-0" />
              <p className="text-[10px] font-black tracking-widest uppercase text-slate-400 light:text-slate-600">Page Views</p>
            </div>
            <MiniSparkline data={pageViewsSparklineData} color="#f472b6" />
          </div>
          <p className="text-3xl font-black mt-2 light:text-slate-900">{totalPageViews === null ? '–' : totalPageViews.toLocaleString()}</p>
          <p className="text-[10px] text-slate-600 mt-1">14-day trend above · lifetime total</p>
        </Card>
      </div>

      {/* KPI row 2 — Users + Safety */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-4 bg-slate-900/80 light:bg-white border-violet-500/20 light:border-violet-200 rounded-2xl hover:border-violet-400/40 transition-all">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <Users size={13} className="text-violet-400 shrink-0" />
              <p className="text-[10px] font-black tracking-widest uppercase text-slate-400 light:text-slate-600">Total Users</p>
            </div>
            <MiniSparkline data={userGrowthSparklineData} color="#a78bfa" />
          </div>
          <p className="text-3xl font-black text-violet-400 mt-2">{totalUsers}</p>
          <div className="flex gap-3 mt-1.5">
            <span className="text-[10px] text-slate-500"><span className="text-[#4A90D9] font-black">{viewOnlyUsers}</span> View-Only</span>
            <span className="text-[10px] text-slate-500"><span className="text-[#2E8B7A] font-black">{adminUsers}</span> Admin</span>
          </div>
        </Card>

        <Card className="p-4 bg-slate-900/80 light:bg-white border-white/10 light:border-slate-200 rounded-2xl hover:border-amber-400/30 light:hover:border-amber-300 transition-all">
          <div className="flex items-center gap-2 mb-3">
            <ChartPie size={13} className="text-amber-400 shrink-0" />
            <p className="text-[10px] font-black tracking-widest uppercase text-slate-400 light:text-slate-600">Active Reporters</p>
          </div>
          <p className="text-3xl font-black text-amber-400">{uniqueReporterEmails}</p>
          <p className="text-[10px] text-slate-600 mt-1">Distinct users who filed a report</p>
        </Card>

        <Card className="p-4 bg-slate-900/80 light:bg-white border-white/10 light:border-slate-200 rounded-2xl hover:border-blue-400/30 light:hover:border-blue-300 transition-all">
          <div className="flex items-center gap-2 mb-3">
            <Activity size={13} className="text-blue-400 shrink-0" />
            <p className="text-[10px] font-black tracking-widest uppercase text-slate-400 light:text-slate-600">Firebase Reports</p>
          </div>
          <p className="text-3xl font-black light:text-slate-900">{totalIncidents}</p>
          <p className="text-[10px] text-slate-600 mt-1">Community + official in Firestore</p>
        </Card>

        <Card className="p-4 bg-slate-900/80 light:bg-white border-emerald-500/20 light:border-emerald-200 rounded-2xl hover:border-emerald-400/40 transition-all">
          <div className="flex items-center gap-2 mb-3">
            <ShieldCheck size={13} className="text-emerald-400 shrink-0" />
            <p className="text-[10px] font-black tracking-widest uppercase text-slate-400 light:text-slate-600">Avg Safety Score</p>
          </div>
          <p className="text-3xl font-black text-emerald-400">{averageSafety}</p>
          <p className="text-[10px] text-slate-600 mt-1">Mean score (0–100) across tracked neighborhoods</p>
        </Card>
      </div>

      <div className="border-t border-white/[0.04]" />

      {/* API Data Sources Panel */}
      <Card className="p-5 bg-slate-900/80 light:bg-white border-white/10 light:border-slate-200 rounded-[1.6rem]">
        <div className="flex items-center gap-2 mb-4">
          <ChartNoAxesColumn size={14} className="text-sky-400" />
          <h3 className="text-sm font-black uppercase tracking-widest text-sky-400">Live API Data Sources</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'City Traffic', count: liveTrafficCount ?? officialTrafficCount, color: 'orange', desc: 'Live incidents from City of Calgary Open Data traffic feed' },
            { label: 'Calgary 311', count: live311Count ?? official311Count, color: 'blue', desc: 'Open service requests synced from Calgary 311 portal' },
            { label: 'Crime Stats', count: officialCrimeCount, color: 'red', desc: 'Monthly crime stats from Calgary Police Service Open Data' },
            { label: 'Community', count: communityReportCount, color: 'emerald', desc: 'User-submitted incidents from the Calgary Watch community' },
          ].map(({ label, count, color, desc }) => (
            <div key={label} className={`flex flex-col gap-1 p-3.5 rounded-2xl bg-${color}-500/5 border border-${color}-500/20`}>
              <p className={`text-[10px] font-black uppercase tracking-widest text-${color}-400`}>{label}</p>
              <p className={`text-2xl font-black text-${color}-400`}>{count}</p>
              <p className="text-[10px] text-slate-600 leading-snug">{desc}</p>
            </div>
          ))}
        </div>
      </Card>

      <div className="border-t border-white/[0.04]" />

      {/* Moderation Queue */}
      <Card className="p-5 bg-slate-900/80 light:bg-white border-white/10 light:border-slate-200 rounded-[1.6rem]">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-black flex items-center gap-2">
              <ShieldQuestion size={15} className="text-amber-400" />
              Moderation Queue
              {pendingReviewIncidents.length > 0 && (
                <span className="ml-1 px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-black">
                  {pendingReviewIncidents.length} pending
                </span>
              )}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">New community reports awaiting review. Auto-approved after 10 min.</p>
          </div>
        </div>
        {pendingReviewIncidents.length === 0 ? (
          <div className="flex items-center gap-2 py-6 justify-center text-slate-500 text-sm">
            <CheckCircle size={16} className="text-green-500" /> Queue is clear
          </div>
        ) : (
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {pendingReviewIncidents.map((incident) => {
              const ageMin = Math.floor((Date.now() - incident.timestamp) / 60000);
              return (
                <div key={incident.id} className="flex items-start gap-3 p-3 rounded-xl bg-slate-800/60 light:bg-slate-50 border border-white/5 light:border-slate-200">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white light:text-slate-900 truncate">{incident.title}</p>
                    <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{incident.description}</p>
                    <div className="flex items-center gap-3 mt-1.5 text-[10px] text-slate-500">
                      <span>{incident.neighborhood}</span>
                      <span>{incident.category}</span>
                      <span>{ageMin < 1 ? 'just now' : `${ageMin}m ago`}</span>
                      <span className="text-amber-400">auto-approves in {Math.max(0, 10 - ageMin)}m</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button onClick={() => approveIncident(incident.id)} className="px-3 py-1.5 rounded-lg bg-green-500/15 text-green-400 text-xs font-bold border border-green-500/25 hover:bg-green-500/25 transition-colors">Approve</button>
                    <button onClick={() => softDeleteIncident(incident.id)} className="px-3 py-1.5 rounded-lg bg-red-500/15 text-red-400 text-xs font-bold border border-red-500/25 hover:bg-red-500/25 transition-colors">Remove</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* User growth chart — Task 5 */}
      <Card className="p-5 bg-slate-900/80 light:bg-white border-white/10 light:border-slate-200 rounded-[1.6rem]">
        <p className="text-xs font-black text-slate-400 light:text-slate-600 uppercase tracking-[0.18em]">New Contributor Activity · Last 30 Days</p>
        <p className="text-[10px] text-slate-600 mb-4 mt-0.5">First-time reporters appearing each day (proxied from first incident submission). Reflects organic community growth.</p>
        {userGrowthData.every(d => d.count === 0) ? (
          <p className="text-slate-600 text-xs py-8 text-center">No contributor data yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={userGrowthData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="userGrowthGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff06" />
              <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 9 }} axisLine={false} tickLine={false} interval={4} />
              <YAxis allowDecimals={false} tick={{ fill: '#64748b', fontSize: 9 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={ttStyle} labelStyle={{ color: '#94a3b8' }} itemStyle={{ color: '#a78bfa' }} />
              <Area type="monotone" dataKey="count" stroke="#8b5cf6" strokeWidth={2} fill="url(#userGrowthGrad)" name="New Contributors" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </Card>

      {/* Elevated user directory — Task 5 */}
      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="col-span-1 lg:col-span-2 p-5 bg-slate-900/80 light:bg-white border-white/10 light:border-slate-200 rounded-[1.6rem] overflow-x-auto h-[420px]">
          <div className="flex items-center justify-between mb-4 pr-1">
            <div>
              <h3 className="text-base font-black flex items-center gap-2">
                <Users size={15} className="text-violet-400" />
                User Directory
              </h3>
              <p className="text-[10px] text-slate-500 mt-0.5">
                <span className="text-violet-400 font-black">{totalUsers}</span> total ·{' '}
                <span className="text-[#4A90D9] font-black">{viewOnlyUsers}</span> view-only ·{' '}
                <span className="text-[#2E8B7A] font-black">{adminUsers}</span> admin ·{' '}
                <span className="text-amber-400 font-black">{uniqueReporterEmails}</span> reporters
              </p>
            </div>
            <Button variant="secondary" onClick={refreshUsers} disabled={isRefreshingUsers} className="h-8 px-2.5 text-[10px] uppercase font-bold tracking-widest bg-white/5 light:bg-slate-100 border-white/10 light:border-slate-200 text-slate-300 light:text-slate-600 hover:bg-white/10 light:hover:bg-slate-200 hover:text-white light:hover:text-slate-900" title="Force Refresh">
              <RefreshCw size={12} className={isRefreshingUsers ? 'animate-spin' : ''} />
            </Button>
          </div>
          <div className="overflow-y-auto h-[320px] pr-2">
            <table className="w-full text-xs min-w-[500px]">
              <thead className="text-slate-400 light:text-slate-600 bg-slate-900/90 light:bg-slate-50 top-0 sticky z-10">
                <tr className="border-b border-white/8 light:border-slate-200">
                  <th className="py-2.5 text-left pl-2 font-bold uppercase text-[9px] tracking-wider">UID</th>
                  <th className="py-2.5 text-left font-bold uppercase text-[9px] tracking-wider">Name</th>
                  <th className="py-2.5 text-left font-bold uppercase text-[9px] tracking-wider">Email</th>
                  <th className="py-2.5 text-left font-bold uppercase text-[9px] tracking-wider">Role</th>
                  <th className="py-2.5 text-left font-bold uppercase text-[9px] tracking-wider">Reports</th>
                </tr>
              </thead>
              <tbody>
                {users.map((profile) => {
                  const reportCount = incidents.filter(i =>
                    ((i as any).authorUid && (i as any).authorUid === profile.uid) ||
                    (i.email && i.email === profile.email && i.email !== 'anonymous@calgarywatch.app')
                  ).length;
                  return (
                    <tr key={profile.uid} className="border-b border-white/5 light:border-slate-100 hover:bg-white/[0.03] light:hover:bg-slate-50 transition-colors">
                      <td className="py-2.5 pl-2 text-slate-600 font-mono text-[10px]">{profile.uid.slice(0, 8)}…</td>
                      <td className="py-2.5 font-medium text-white light:text-slate-900 text-xs">{profile.displayName || 'Unknown'}</td>
                      <td className="py-2.5 text-slate-400 text-[11px]">{profile.email || '—'}</td>
                      <td className="py-2.5">
                        <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest ${profile.role === 'admin' ? 'bg-[#2E8B7A]/20 border border-[#2E8B7A]/40 text-[#2E8B7A]' : 'bg-[#4A90D9]/10 border border-[#4A90D9]/20 text-[#4A90D9]'}`}>
                          {profile.role === 'admin' ? 'Admin' : 'View-Only'}
                        </span>
                      </td>
                      <td className="py-2.5">
                        {reportCount > 0
                          ? <span className="text-amber-400 font-black text-[11px]">{reportCount}</span>
                          : <span className="text-slate-600 text-[11px]">0</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="col-span-1 flex flex-col gap-4 h-[420px]">
          <Card className="p-5 bg-slate-900/80 light:bg-white border-white/10 light:border-slate-200 rounded-[1.6rem] flex flex-col flex-1 min-h-0">
            <p className="text-xs font-black text-slate-400 light:text-slate-600 uppercase tracking-[0.18em]">User Roles</p>
            <p className="text-[10px] text-slate-600 mb-2 mt-1">
              <span className="text-violet-400 font-black">{totalUsers}</span> total registered users.
            </p>
            {userRoleChartData.length === 0 ? (
              <p className="text-slate-600 text-xs flex-1 flex items-center justify-center">No user data.</p>
            ) : (
              <div className="flex-1 flex flex-col min-h-0">
                <ResponsiveContainer width="100%" height={130}>
                  <PieChart>
                    <Pie data={userRoleChartData} cx="50%" cy="50%" innerRadius={36} outerRadius={58} paddingAngle={3} dataKey="value" strokeWidth={0}
                      shape={(props: any, i: number) => <Sector {...props} fill={userRoleChartData[i]?.color ?? props.fill} />}
                    />
                    <Tooltip contentStyle={ttStyle} itemStyle={{ color: '#e2e8f0' }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-col gap-1.5 mt-2">
                  {userRoleChartData.map((d) => (
                    <div key={d.name} className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-white/3 light:bg-slate-50 border border-white/5 light:border-slate-200">
                      <span className="flex items-center gap-2 text-xs text-slate-300 light:text-slate-700">
                        <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: d.color }} />
                        {d.name}
                      </span>
                      <span className="text-sm font-black" style={{ color: d.color }}>{d.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>

          {topReportersData.length > 0 && (
            <Card className="p-4 bg-slate-900/80 light:bg-white border-amber-500/15 light:border-amber-200 rounded-[1.6rem]">
              <p className="text-[10px] font-black text-slate-400 light:text-slate-600 uppercase tracking-[0.18em] mb-3">Top Contributors</p>
              <div className="space-y-1.5">
                {topReportersData.slice(0, 5).map((r, i) => (
                  <div key={r.name} className="flex items-center gap-2">
                    <span className="text-[9px] text-slate-600 w-3 text-right shrink-0">{i + 1}</span>
                    <span className="flex-1 text-[11px] text-slate-300 truncate">{r.name}</span>
                    <span className="text-[11px] font-black text-amber-400">{r.count}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );

  const renderIncidents = () => (
    <div className="space-y-5">
      <SectionHeader icon={FileText} title="Incidents" subtitle="Edit, moderate, and soft-delete community and official incident records" />
      <Card className="p-5 bg-slate-900/80 light:bg-white border-white/10 light:border-slate-200 rounded-[1.6rem] overflow-x-auto">
        <div className="flex items-center justify-between mb-4">
          <span className="text-[10px] uppercase tracking-[0.2em] font-black text-slate-500">
            {totalIncidents} records · {pendingReviewIncidents.length} in queue
          </span>
          <span className="text-[10px] text-amber-500 md:hidden">Swipe table &rarr;</span>
        </div>
        {loadingData ? (
          <div className="py-8 flex items-center justify-center"><Loader2 className="animate-spin" /></div>
        ) : (
          <>
            <div className="space-y-4 md:hidden">
              {incidents.map((incident) => {
                const draft = incidentDrafts[incident.id] || {
                  ...emptyIncidentDraft,
                  title: incident.title, description: incident.description,
                  category: incident.category, neighborhood: incident.neighborhood,
                  verified_status: incident.verified_status, report_count: incident.report_count,
                  source_name: incident.source_name || '', source_url: incident.source_url || '',
                };
                return (
                  <div key={incident.id} className="rounded-[1.6rem] border border-white/10 light:border-slate-200 bg-gradient-to-br from-slate-900 to-slate-950 light:from-white light:to-slate-50 p-4 shadow-[0_20px_70px_-40px_rgba(15,23,42,0.95)]">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">{incident.category}</p>
                        <p className="mt-1 text-sm font-black text-white light:text-slate-900">{incident.neighborhood || 'Unknown area'}</p>
                        <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                          {(() => {
                            const isSystemInc = incident.data_source != null && incident.data_source !== 'community';
                            if (isSystemInc) return <span className="text-[10px] text-slate-500">{incident.source_name || 'System'}</span>;
                            const isAnon = Boolean(incident.anonymous);
                            if (isAnon) {
                              const real = users.find(u => u.uid === incident.authorUid);
                              return (
                                <>
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-amber-500/20 text-amber-400 uppercase tracking-wider">Anon</span>
                                  <span className="text-[10px] text-slate-300">{real?.displayName || '—'}</span>
                                  <span className="text-[10px] text-slate-500">{real?.email || incident.authorUid || '?'}</span>
                                </>
                              );
                            }
                            return <span className="text-[10px] text-slate-400">{incident.name || '—'}</span>;
                          })()}
                        </div>
                      </div>
                      <div className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-black text-slate-300">
                        {formatRelativeMinutes(incident.timestamp)}
                      </div>
                    </div>
                    <div className="mt-4 grid gap-3">
                      <input className="w-full rounded-2xl border border-white/10 light:border-slate-300 bg-slate-800/80 light:bg-white p-3 text-sm light:text-slate-900" value={draft.title} onChange={(e) => setIncidentDraft(incident, { title: e.target.value })} />
                      <textarea className="h-24 w-full rounded-2xl border border-white/10 light:border-slate-300 bg-slate-800/80 light:bg-white p-3 text-sm light:text-slate-900" value={draft.description} onChange={(e) => setIncidentDraft(incident, { description: e.target.value })} />
                      <div className="grid grid-cols-2 gap-2">
                        <select className="w-full rounded-2xl border border-white/10 light:border-slate-300 bg-slate-800/80 light:bg-white p-3 text-sm light:text-slate-900" value={draft.category} onChange={(e) => setIncidentDraft(incident, { category: e.target.value as Incident['category'] })}>
                          {INCIDENT_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
                        </select>
                        <select className="w-full rounded-2xl border border-white/10 light:border-slate-300 bg-slate-800/80 light:bg-white p-3 text-sm light:text-slate-900" value={draft.verified_status} onChange={(e) => setIncidentDraft(incident, { verified_status: e.target.value as Incident['verified_status'] })}>
                          {VERIFIED_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                        </select>
                      </div>
                      <div className="grid grid-cols-[1fr_auto] gap-2">
                        <input className="w-full rounded-2xl border border-white/10 light:border-slate-300 bg-slate-800/80 light:bg-white p-3 text-sm light:text-slate-900" value={draft.neighborhood} onChange={(e) => setIncidentDraft(incident, { neighborhood: e.target.value })} />
                        <input type="number" className="w-24 rounded-2xl border border-white/10 light:border-slate-300 bg-slate-800/80 light:bg-white p-3 text-sm light:text-slate-900" value={draft.report_count} onChange={(e) => setIncidentDraft(incident, { report_count: Number(e.target.value) })} />
                      </div>
                      <input className="w-full rounded-2xl border border-white/10 light:border-slate-300 bg-slate-800/80 light:bg-white p-3 text-sm light:text-slate-900" placeholder="Source name" value={draft.source_name || ''} onChange={(e) => setIncidentDraft(incident, { source_name: e.target.value })} />
                      <input className="w-full rounded-2xl border border-white/10 light:border-slate-300 bg-slate-800/80 light:bg-white p-3 text-sm light:text-slate-900" placeholder="Source URL" value={draft.source_url || ''} onChange={(e) => setIncidentDraft(incident, { source_url: e.target.value })} />
                      <div className="grid grid-cols-2 gap-2">
                        <Button onClick={() => saveIncident(incident.id)} className="h-11 rounded-2xl bg-blue-600 text-sm hover:bg-blue-700" disabled={savingIncidentId === incident.id}>
                          {savingIncidentId === incident.id ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                          <span className="ml-2">Save</span>
                        </Button>
                        <Button variant="secondary" onClick={() => softDeleteIncident(incident.id)} className="h-11 rounded-2xl border border-red-500/30 bg-red-500/10 text-sm text-red-300 hover:bg-red-500/15">
                          <Trash2 size={16} />
                          <span className="ml-2">Remove</span>
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <table className="hidden md:table w-full text-xs min-w-[1280px]">
              <thead className="text-slate-400 light:text-slate-600">
                <tr className="border-b border-white/10 light:border-slate-200">
                  <th className="py-2 text-left">Title</th>
                  <th className="py-2 text-left">Category</th>
                  <th className="py-2 text-left">Neighborhood</th>
                  <th className="py-2 text-left">Status</th>
                  <th className="py-2 text-left">Reports</th>
                  <th className="py-2 text-left">Time</th>
                  <th className="py-2 text-left">Reporter</th>
                  <th className="py-2 text-left">Description</th>
                  <th className="py-2 text-left">Source</th>
                  <th className="py-2 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {incidents.map((incident) => {
                  const draft = incidentDrafts[incident.id] || {
                    ...emptyIncidentDraft,
                    title: incident.title, description: incident.description,
                    category: incident.category, neighborhood: incident.neighborhood,
                    verified_status: incident.verified_status, report_count: incident.report_count,
                    source_name: incident.source_name || '', source_url: incident.source_url || '',
                  };
                  return (
                    <tr key={incident.id} className="border-b border-white/5 light:border-slate-100 align-top hover:bg-white/[0.02] light:hover:bg-slate-50 transition-colors">
                      <td className="py-2 pr-2"><input className="w-full bg-slate-800/80 light:bg-white border border-white/10 light:border-slate-300 rounded-xl p-2 light:text-slate-900" value={draft.title} onChange={(e) => setIncidentDraft(incident, { title: e.target.value })} /></td>
                      <td className="py-2 pr-2">
                        <select className="w-full bg-slate-800/80 light:bg-white border border-white/10 light:border-slate-300 rounded-xl p-2 light:text-slate-900" value={draft.category} onChange={(e) => setIncidentDraft(incident, { category: e.target.value as Incident['category'] })}>
                          {INCIDENT_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
                        </select>
                      </td>
                      <td className="py-2 pr-2"><input className="w-full bg-slate-800/80 light:bg-white border border-white/10 light:border-slate-300 rounded-xl p-2 light:text-slate-900" value={draft.neighborhood} onChange={(e) => setIncidentDraft(incident, { neighborhood: e.target.value })} /></td>
                      <td className="py-2 pr-2">
                        <select className="w-full bg-slate-800/80 light:bg-white border border-white/10 light:border-slate-300 rounded-xl p-2 light:text-slate-900" value={draft.verified_status} onChange={(e) => setIncidentDraft(incident, { verified_status: e.target.value as Incident['verified_status'] })}>
                          {VERIFIED_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                        </select>
                      </td>
                      <td className="py-2 pr-2"><input type="number" className="w-24 bg-slate-800/80 light:bg-white border border-white/10 light:border-slate-300 rounded-xl p-2 light:text-slate-900" value={draft.report_count} onChange={(e) => setIncidentDraft(incident, { report_count: Number(e.target.value) })} /></td>
                      <td className="py-2 pr-2 whitespace-nowrap">
                        {incident.timestamp
                          ? <span className="text-[10px] text-slate-400 font-mono leading-tight">
                              <span className="block">{new Date(incident.timestamp).toLocaleDateString('en-CA')}</span>
                              <span className="block text-slate-600">{new Date(incident.timestamp).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' })}</span>
                            </span>
                          : <span className="text-slate-700 text-[10px]">—</span>}
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {(() => {
                          const isSystemInc = incident.data_source != null && incident.data_source !== 'community';
                          if (isSystemInc) return <span className="text-[10px] text-slate-500">{incident.source_name || 'System'}</span>;
                          const isAnon = Boolean(incident.anonymous);
                          if (isAnon) {
                            const real = users.find(u => u.uid === incident.authorUid);
                            return (
                              <div>
                                <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-black bg-amber-500/20 text-amber-400 uppercase tracking-wider mb-1">Anon</span>
                                <span className="block text-[10px] text-slate-300">{real?.displayName || '—'}</span>
                                <span className="block text-[10px] text-slate-500 font-mono">{real?.email || incident.authorUid || '?'}</span>
                              </div>
                            );
                          }
                          return <span className="text-[10px] text-slate-300">{incident.name || '—'}</span>;
                        })()}
                      </td>
                      <td className="py-2 pr-2"><textarea className="w-full h-20 bg-slate-800/80 light:bg-white border border-white/10 light:border-slate-300 rounded-xl p-2 light:text-slate-900" value={draft.description} onChange={(e) => setIncidentDraft(incident, { description: e.target.value })} /></td>
                      <td className="py-2 pr-2">
                        <input className="w-full bg-slate-800/80 light:bg-white border border-white/10 light:border-slate-300 rounded-xl p-2 mb-2 light:text-slate-900" placeholder="Source name" value={draft.source_name || ''} onChange={(e) => setIncidentDraft(incident, { source_name: e.target.value })} />
                        <input className="w-full bg-slate-800/80 light:bg-white border border-white/10 light:border-slate-300 rounded-xl p-2 light:text-slate-900" placeholder="Source URL" value={draft.source_url || ''} onChange={(e) => setIncidentDraft(incident, { source_url: e.target.value })} />
                      </td>
                      <td className="py-2 flex gap-2">
                        <Button onClick={() => saveIncident(incident.id)} className="h-9 px-3 text-xs bg-blue-600 hover:bg-blue-700" disabled={savingIncidentId === incident.id}>
                          {savingIncidentId === incident.id ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                        </Button>
                        <Button variant="secondary" onClick={() => softDeleteIncident(incident.id)} className="h-9 px-3 text-xs text-red-400 border-red-500/30 hover:bg-red-500/10">
                          <Trash2 size={14} />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}
      </Card>
    </div>
  );

  const renderUsers = () => (
    <div className="space-y-5">
      <SectionHeader icon={Users} title="User Directory" subtitle="Registered users, roles, and contribution activity" />
      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="col-span-1 lg:col-span-2 p-5 bg-slate-900/80 light:bg-white border-white/10 light:border-slate-200 rounded-[1.6rem] overflow-x-auto">
          <div className="flex items-center justify-between mb-4 pr-1">
            <p className="text-[10px] text-slate-500">
              <span className="text-violet-400 font-black">{totalUsers}</span> total ·{' '}
              <span className="text-[#4A90D9] font-black">{viewOnlyUsers}</span> view-only ·{' '}
              <span className="text-[#2E8B7A] font-black">{adminUsers}</span> admin ·{' '}
              <span className="text-amber-400 font-black">{uniqueReporterEmails}</span> reporters
            </p>
            <Button variant="secondary" onClick={refreshUsers} disabled={isRefreshingUsers} className="h-8 px-2.5 text-[10px] uppercase font-bold tracking-widest bg-white/5 light:bg-slate-100 border-white/10 light:border-slate-200 text-slate-300 light:text-slate-600 hover:bg-white/10 light:hover:bg-slate-200 hover:text-white light:hover:text-slate-900">
              <RefreshCw size={12} className={isRefreshingUsers ? 'animate-spin' : ''} />
            </Button>
          </div>
          <div className="space-y-3 md:hidden">
            {users.map((profile) => {
              const reportCount = incidents.filter(i =>
                ((i as any).authorUid && (i as any).authorUid === profile.uid) ||
                (i.email && i.email === profile.email && i.email !== 'anonymous@calgarywatch.app')
              ).length;
              return (
                <div key={profile.uid} className="rounded-[1.35rem] border border-white/10 light:border-slate-200 bg-gradient-to-br from-slate-900 to-slate-950 light:from-white light:to-slate-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-black text-white light:text-slate-900 truncate">{profile.displayName || 'Unknown'}</p>
                      <p className="mt-1 truncate text-[11px] text-slate-400 light:text-slate-600">{profile.email || '—'}</p>
                    </div>
                    <span className={cn(
                      'rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.18em]',
                      profile.role === 'admin'
                        ? 'border-emerald-400/30 bg-emerald-500/15 text-emerald-200'
                        : 'border-sky-400/25 bg-sky-500/10 text-sky-200'
                    )}>
                      {profile.role === 'admin' ? 'Admin' : 'View'}
                    </span>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <div className="rounded-2xl border border-white/8 light:border-slate-200 bg-white/[0.03] light:bg-slate-50 p-3">
                      <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-500">UID</p>
                      <p className="mt-2 font-mono text-xs text-slate-300">{profile.uid.slice(0, 8)}…</p>
                    </div>
                    <div className="rounded-2xl border border-white/8 light:border-slate-200 bg-white/[0.03] light:bg-slate-50 p-3">
                      <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-500">Reports</p>
                      <p className="mt-2 text-xl font-black text-amber-300">{reportCount}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="hidden md:block overflow-y-auto max-h-[540px] pr-2">
            <table className="w-full text-xs min-w-[500px]">
              <thead className="text-slate-400 light:text-slate-600 bg-slate-900/90 light:bg-slate-50 top-0 sticky z-10">
                <tr className="border-b border-white/8 light:border-slate-200">
                  <th className="py-2.5 text-left pl-2 font-bold uppercase text-[9px] tracking-wider">UID</th>
                  <th className="py-2.5 text-left font-bold uppercase text-[9px] tracking-wider">Name</th>
                  <th className="py-2.5 text-left font-bold uppercase text-[9px] tracking-wider">Email</th>
                  <th className="py-2.5 text-left font-bold uppercase text-[9px] tracking-wider">Role</th>
                  <th className="py-2.5 text-left font-bold uppercase text-[9px] tracking-wider">Reports</th>
                </tr>
              </thead>
              <tbody>
                {users.map((profile) => {
                  const reportCount = incidents.filter(i =>
                    ((i as any).authorUid && (i as any).authorUid === profile.uid) ||
                    (i.email && i.email === profile.email && i.email !== 'anonymous@calgarywatch.app')
                  ).length;
                  return (
                    <tr key={profile.uid} className="border-b border-white/5 light:border-slate-100 hover:bg-white/[0.03] light:hover:bg-slate-50 transition-colors">
                      <td className="py-2.5 pl-2 text-slate-600 font-mono text-[10px]">{profile.uid.slice(0, 8)}…</td>
                      <td className="py-2.5 font-medium text-white light:text-slate-900 text-xs">{profile.displayName || 'Unknown'}</td>
                      <td className="py-2.5 text-slate-400 text-[11px]">{profile.email || '—'}</td>
                      <td className="py-2.5">
                        <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest ${profile.role === 'admin' ? 'bg-[#2E8B7A]/20 border border-[#2E8B7A]/40 text-[#2E8B7A]' : 'bg-[#4A90D9]/10 border border-[#4A90D9]/20 text-[#4A90D9]'}`}>
                          {profile.role === 'admin' ? 'Admin' : 'View-Only'}
                        </span>
                      </td>
                      <td className="py-2.5">
                        {reportCount > 0
                          ? <span className="text-amber-400 font-black text-[11px]">{reportCount}</span>
                          : <span className="text-slate-600 text-[11px]">0</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="p-5 bg-slate-900/80 light:bg-white border-white/10 light:border-slate-200 rounded-[1.6rem]">
            <p className="text-xs font-black text-slate-400 uppercase tracking-[0.18em] mb-3">User Roles</p>
            {userRoleChartData.length === 0 ? (
              <p className="text-slate-600 text-xs py-4 text-center">No user data.</p>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie data={userRoleChartData} cx="50%" cy="50%" innerRadius={42} outerRadius={68} paddingAngle={3} dataKey="value" strokeWidth={0}
                      shape={(props: any, i: number) => <Sector {...props} fill={userRoleChartData[i]?.color ?? props.fill} />}
                    />
                    <Tooltip contentStyle={ttStyle} itemStyle={{ color: '#e2e8f0' }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-col gap-2 mt-3">
                  {userRoleChartData.map((d) => (
                    <div key={d.name} className="flex items-center justify-between px-3 py-2 rounded-xl bg-white/3 light:bg-slate-50 border border-white/5 light:border-slate-200">
                      <span className="flex items-center gap-2 text-xs text-slate-300 light:text-slate-700">
                        <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: d.color }} />
                        {d.name}
                      </span>
                      <span className="text-sm font-black" style={{ color: d.color }}>{d.value}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>

          {/* Top reporters */}
          {topReportersData.length > 0 && (
            <Card className="p-5 bg-slate-900/80 light:bg-white border-white/10 light:border-slate-200 rounded-[1.6rem]">
              <p className="text-xs font-black text-slate-400 uppercase tracking-[0.18em] mb-3">Top Reporters</p>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={topReportersData} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                  <XAxis type="number" allowDecimals={false} tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" width={90} tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={ttStyle} itemStyle={{ color: '#fbbf24' }} cursor={{ fill: '#ffffff06' }} />
                  <Bar dataKey="count" name="Reports" fill="#f59e0b" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          )}
        </div>
      </div>
    </div>
  );

  const renderStats = () => {
    return (
    <div className="space-y-5">
      <SectionHeader icon={Map} title="City Stats" subtitle="Live crime data from Calgary Open Data API + editable community safety scores" />

      {/* Live crime data from API */}
      <Card className="p-5 bg-slate-900/80 light:bg-white border-white/10 light:border-slate-200 rounded-[1.6rem]">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] font-black text-slate-500">Live Crime Stats · Calgary Open Data API</p>
            <p className="text-[10px] text-slate-600 mt-0.5">Top 20 communities by total incidents — latest year available</p>
          </div>
          {crimeLoading && <Loader2 size={14} className="animate-spin text-slate-400 shrink-0" />}
        </div>
        {crimeStats.size === 0 && !crimeLoading ? (
          <p className="text-slate-500 text-xs py-6 text-center">No crime data loaded yet. Check API Health section.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[600px]">
              <thead>
                <tr className="border-b border-white/10 light:border-slate-200 text-slate-400">
                  <th className="py-2 text-left">Community</th>
                  <th className="py-2 text-right">Crime</th>
                  <th className="py-2 text-right">Disorder</th>
                  <th className="py-2 text-right">Total</th>
                  <th className="py-2 text-right">Year</th>
                </tr>
              </thead>
              <tbody>
                {topCrimeCommunities.map((row) => (
                  <tr key={row.name} className="border-b border-white/5 light:border-slate-100 hover:bg-white/[0.02]">
                    <td className="py-2 pr-3 font-medium text-white light:text-slate-900 capitalize">{row.name}</td>
                    <td className="py-2 pr-3 text-right text-red-400">{row.crime.toLocaleString()}</td>
                    <td className="py-2 pr-3 text-right text-amber-400">{row.disorder.toLocaleString()}</td>
                    <td className="py-2 pr-3 text-right font-black text-white light:text-slate-900">{(row.crime + row.disorder).toLocaleString()}</td>
                    <td className="py-2 text-right text-slate-500">{row.year}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Card className="p-5 bg-slate-900/80 light:bg-white border-white/10 light:border-slate-200 rounded-[1.6rem] overflow-x-auto">
        <div className="flex items-center justify-between mb-4">
          <span className="text-[10px] uppercase tracking-[0.2em] font-black text-slate-500">City Intelligence · {communityStats.length} communities</span>
          <span className="text-[10px] text-amber-500 md:hidden">Swipe table &rarr;</span>
        </div>
        <div className="space-y-4 md:hidden">
          {communityStats.map((row) => {
            const draft = statsDrafts[row.id] || {
              ...emptyStatsDraft,
              community: row.community, month: row.month,
              violent_crime: row.violent_crime, property_crime: row.property_crime,
              disorder_calls: row.disorder_calls, safety_score: row.safety_score,
            };
            return (
              <div key={row.id} className="rounded-[1.6rem] border border-white/10 light:border-slate-200 bg-gradient-to-br from-slate-900 to-slate-950 light:from-white light:to-slate-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-300/70">{draft.month || 'Month'}</p>
                    <p className="mt-1 text-sm font-black text-white light:text-slate-900">{draft.community || 'Community'}</p>
                  </div>
                  <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2">
                    <p className="text-[9px] font-black uppercase tracking-[0.18em] text-emerald-200/70">Safety</p>
                    <p className="mt-1 text-lg font-black text-emerald-200">{draft.safety_score}</p>
                  </div>
                </div>
                <div className="mt-4 grid gap-2">
                  <input className="w-full rounded-2xl border border-white/10 light:border-slate-300 bg-slate-800/80 light:bg-white p-3 text-sm light:text-slate-900" value={draft.community} onChange={(e) => setStatsDraft(row, { community: e.target.value })} />
                  <input className="w-full rounded-2xl border border-white/10 light:border-slate-300 bg-slate-800/80 light:bg-white p-3 text-sm light:text-slate-900" value={draft.month} onChange={(e) => setStatsDraft(row, { month: e.target.value })} />
                  <div className="grid grid-cols-2 gap-2">
                    <input type="number" className="w-full rounded-2xl border border-white/10 light:border-slate-300 bg-slate-800/80 light:bg-white p-3 text-sm light:text-slate-900" value={draft.violent_crime} onChange={(e) => setStatsDraft(row, { violent_crime: Number(e.target.value) })} />
                    <input type="number" className="w-full rounded-2xl border border-white/10 light:border-slate-300 bg-slate-800/80 light:bg-white p-3 text-sm light:text-slate-900" value={draft.property_crime} onChange={(e) => setStatsDraft(row, { property_crime: Number(e.target.value) })} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input type="number" className="w-full rounded-2xl border border-white/10 light:border-slate-300 bg-slate-800/80 light:bg-white p-3 text-sm light:text-slate-900" value={draft.disorder_calls} onChange={(e) => setStatsDraft(row, { disorder_calls: Number(e.target.value) })} />
                    <input type="number" className="w-full rounded-2xl border border-white/10 light:border-slate-300 bg-slate-800/80 light:bg-white p-3 text-sm light:text-slate-900" value={draft.safety_score} onChange={(e) => setStatsDraft(row, { safety_score: Number(e.target.value) })} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button onClick={() => saveCommunityStats(row.id)} className="h-11 rounded-2xl bg-blue-600 text-sm hover:bg-blue-700" disabled={savingStatsId === row.id}>
                      {savingStatsId === row.id ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                      <span className="ml-2">Save</span>
                    </Button>
                    <Button variant="secondary" onClick={() => softDeleteCommunityStats(row.id)} className="h-11 rounded-2xl border border-red-500/30 bg-red-500/10 text-sm text-red-300 hover:bg-red-500/15">
                      <Trash2 size={16} />
                      <span className="ml-2">Remove</span>
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <table className="hidden md:table w-full text-xs min-w-[980px]">
          <thead className="text-slate-400">
            <tr className="border-b border-white/10 light:border-slate-200">
              <th className="py-2 text-left">Community</th>
              <th className="py-2 text-left">Month</th>
              <th className="py-2 text-left">Violent</th>
              <th className="py-2 text-left">Property</th>
              <th className="py-2 text-left">Disorder</th>
              <th className="py-2 text-left">Safety</th>
              <th className="py-2 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {communityStats.map((row) => {
              const draft = statsDrafts[row.id] || {
                ...emptyStatsDraft,
                community: row.community, month: row.month,
                violent_crime: row.violent_crime, property_crime: row.property_crime,
                disorder_calls: row.disorder_calls, safety_score: row.safety_score,
              };
              return (
                <tr key={row.id} className="border-b border-white/5 light:border-slate-100 hover:bg-white/[0.02] light:hover:bg-slate-50 transition-colors">
                  <td className="py-2 pr-2"><input className="w-full bg-slate-800/80 light:bg-white border border-white/10 light:border-slate-300 rounded-xl p-2 light:text-slate-900" value={draft.community} onChange={(e) => setStatsDraft(row, { community: e.target.value })} /></td>
                  <td className="py-2 pr-2"><input className="w-full bg-slate-800/80 light:bg-white border border-white/10 light:border-slate-300 rounded-xl p-2 light:text-slate-900" value={draft.month} onChange={(e) => setStatsDraft(row, { month: e.target.value })} /></td>
                  <td className="py-2 pr-2"><input type="number" className="w-full bg-slate-800/80 light:bg-white border border-white/10 light:border-slate-300 rounded-xl p-2 light:text-slate-900" value={draft.violent_crime} onChange={(e) => setStatsDraft(row, { violent_crime: Number(e.target.value) })} /></td>
                  <td className="py-2 pr-2"><input type="number" className="w-full bg-slate-800/80 light:bg-white border border-white/10 light:border-slate-300 rounded-xl p-2 light:text-slate-900" value={draft.property_crime} onChange={(e) => setStatsDraft(row, { property_crime: Number(e.target.value) })} /></td>
                  <td className="py-2 pr-2"><input type="number" className="w-full bg-slate-800/80 light:bg-white border border-white/10 light:border-slate-300 rounded-xl p-2 light:text-slate-900" value={draft.disorder_calls} onChange={(e) => setStatsDraft(row, { disorder_calls: Number(e.target.value) })} /></td>
                  <td className="py-2 pr-2"><input type="number" className="w-full bg-slate-800/80 light:bg-white border border-white/10 light:border-slate-300 rounded-xl p-2 light:text-slate-900" value={draft.safety_score} onChange={(e) => setStatsDraft(row, { safety_score: Number(e.target.value) })} /></td>
                  <td className="py-2 flex gap-2">
                    <Button onClick={() => saveCommunityStats(row.id)} className="h-9 px-3 text-xs bg-blue-600 hover:bg-blue-700" disabled={savingStatsId === row.id}>
                      {savingStatsId === row.id ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                    </Button>
                    <Button variant="secondary" onClick={() => softDeleteCommunityStats(row.id)} className="h-9 px-3 text-xs text-red-400 border-red-500/30 hover:bg-red-500/10">
                      <Trash2 size={14} />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {safetyChartData.length > 0 && (
        <Card className="p-5 bg-slate-900/80 light:bg-white border-white/10 light:border-slate-200 rounded-[1.6rem]">
          <p className="text-xs font-black text-slate-400 light:text-slate-600 uppercase tracking-[0.18em]">Community Safety vs Crime Breakdown</p>
          <p className="text-[10px] text-slate-600 mb-4 mt-0.5">Compares safety score against violent crime, property crime, and disorder calls per neighborhood.</p>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={safetyChartData} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
              <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={ttStyle} itemStyle={{ color: '#e2e8f0' }} cursor={{ fill: '#ffffff05' }} />
              <Legend wrapperStyle={{ fontSize: 10, color: '#64748b', paddingTop: 12 }} />
              <Bar dataKey="Safety Score"   fill="#22c55e" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Violent Crime"  fill="#ef4444" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Property Crime" fill="#f97316" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Disorder Calls" fill="#a855f7" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}
    </div>
    );
  };

  const renderAnalytics = () => (
    <div className="space-y-5">
      <SectionHeader icon={BarChart3} title="Analytics" subtitle="Incident patterns, geographic distribution, and temporal trends" />

      {/* Incidents timeline — 14 days */}
      <Card className="p-5 bg-slate-900/80 light:bg-white border-white/10 light:border-slate-200 rounded-[1.6rem]">
        <p className="text-xs font-black text-slate-400 light:text-slate-600 uppercase tracking-[0.18em]">Incidents: Last 14 Days</p>
        <p className="text-[10px] text-slate-600 mb-4 mt-0.5">Daily report volume. Spikes indicate high-activity periods worth reviewing.</p>
        {timelineChartData.every((d) => d.count === 0) ? (
          <p className="text-slate-600 text-xs py-8 text-center">No incident data yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={timelineChartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="incidentGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
              <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={ttStyle} labelStyle={{ color: '#94a3b8' }} itemStyle={{ color: '#60a5fa' }} />
              <Area type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} fill="url(#incidentGrad)" name="Incidents" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </Card>

      {/* Category donut + Trust donut + Top Neighborhoods */}
      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="p-5 bg-slate-900/80 light:bg-white border-white/10 light:border-slate-200 rounded-[1.6rem]">
          <p className="text-xs font-black text-slate-400 light:text-slate-600 uppercase tracking-[0.18em]">By Category</p>
          <p className="text-[10px] text-slate-600 mb-4 mt-0.5">How reports break down by type.</p>
          {categoryChartData.length === 0 ? (
            <p className="text-slate-600 text-xs py-8 text-center">No data yet.</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={categoryChartData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3} dataKey="value" strokeWidth={0}
                    shape={(props: any, i: number) => <Sector {...props} fill={categoryChartData[i]?.color ?? props.fill} />}
                  />
                  <Tooltip contentStyle={ttStyle} itemStyle={{ color: '#e2e8f0' }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-3">
                {categoryChartData.map((d) => (
                  <span key={d.name} className="flex items-center gap-1.5 text-[10px] text-slate-400 light:text-slate-600">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: d.color }} />
                    {d.name} <span className="font-black text-white light:text-slate-900">{d.value}</span>
                  </span>
                ))}
              </div>
            </>
          )}
        </Card>

        <Card className="p-5 bg-slate-900/80 light:bg-white border-white/10 light:border-slate-200 rounded-[1.6rem]">
          <p className="text-xs font-black text-slate-400 light:text-slate-600 uppercase tracking-[0.18em]">Trust Status</p>
          <p className="text-[10px] text-slate-600 mb-4 mt-0.5">Verification breakdown across all reports.</p>
          {trustChartData.length === 0 ? (
            <p className="text-slate-600 text-xs py-8 text-center">No data yet.</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={trustChartData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3} dataKey="value" strokeWidth={0}
                    shape={(props: any, i: number) => <Sector {...props} fill={trustChartData[i]?.color ?? props.fill} />}
                  />
                  <Tooltip contentStyle={ttStyle} itemStyle={{ color: '#e2e8f0' }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-3">
                {trustChartData.map((d) => (
                  <span key={d.name} className="flex items-center gap-1.5 text-[10px] text-slate-400 light:text-slate-600">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: d.color }} />
                    {d.name} <span className="font-black text-white light:text-slate-900">{d.value}</span>
                  </span>
                ))}
              </div>
            </>
          )}
        </Card>

        <Card className="p-5 bg-slate-900/80 light:bg-white border-white/10 light:border-slate-200 rounded-[1.6rem]">
          <p className="text-xs font-black text-slate-400 light:text-slate-600 uppercase tracking-[0.18em]">Top Neighborhoods</p>
          <p className="text-[10px] text-slate-600 mb-4 mt-0.5">Areas with the highest incident count.</p>
          {neighborhoodChartData.length === 0 ? (
            <p className="text-slate-600 text-xs py-8 text-center">No data yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={neighborhoodChartData} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
                <XAxis type="number" allowDecimals={false} tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={80} tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={ttStyle} itemStyle={{ color: '#60a5fa' }} cursor={{ fill: '#ffffff08' }} />
                <Bar dataKey="count" name="Incidents" fill="#3b82f6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      {/* Hourly + Category by day */}
      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-5 bg-slate-900/80 light:bg-white border-white/10 light:border-slate-200 rounded-[1.6rem]">
          <p className="text-xs font-black text-slate-400 light:text-slate-600 uppercase tracking-[0.18em]">Hourly Activity Pattern</p>
          <p className="text-[10px] text-slate-600 mb-4 mt-0.5">When during the day most reports are filed.</p>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={hourlyChartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="hourGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#a855f7" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff06" />
              <XAxis dataKey="hour" tick={{ fill: '#64748b', fontSize: 9 }} axisLine={false} tickLine={false} interval={2} />
              <YAxis allowDecimals={false} tick={{ fill: '#64748b', fontSize: 9 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={ttStyle} labelStyle={{ color: '#94a3b8' }} itemStyle={{ color: '#c084fc' }} />
              <Area type="monotone" dataKey="count" stroke="#a855f7" strokeWidth={2} fill="url(#hourGrad)" name="Reports" />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-5 bg-slate-900/80 light:bg-white border-white/10 light:border-slate-200 rounded-[1.6rem]">
          <p className="text-xs font-black text-slate-400 light:text-slate-600 uppercase tracking-[0.18em]">Category Mix · Last 7 Days</p>
          <p className="text-[10px] text-slate-600 mb-4 mt-0.5">Daily stacked view of report categories.</p>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={categoryByDayData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff06" />
              <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 9 }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fill: '#64748b', fontSize: 9 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={ttStyle} itemStyle={{ color: '#e2e8f0' }} cursor={{ fill: '#ffffff05' }} />
              <Legend wrapperStyle={{ fontSize: 9, color: '#64748b', paddingTop: 8 }} />
              <Bar dataKey="emergency"      stackId="a" fill="#dc2626" name="Emergency" />
              <Bar dataKey="crime"          stackId="a" fill="#ef4444" name="Crime" />
              <Bar dataKey="traffic"        stackId="a" fill="#f97316" name="Traffic" />
              <Bar dataKey="infrastructure" stackId="a" fill="#3b82f6" name="Infrastructure" />
              <Bar dataKey="weather"        stackId="a" fill="#a855f7" radius={[3, 3, 0, 0]} name="Weather" />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </div>
  );

  // ── Task 4.2 — Traffic analytics section ─────────────────────────────────

  const renderTrafficAnalytics = () => (
    <div className="space-y-5">
      <SectionHeader icon={Globe} title="Traffic Analytics" subtitle="Page view patterns, acquisition channels, and session metrics from enhanced PageTracker" />

      {/* Traffic KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-4 bg-slate-900/80 light:bg-white border-blue-500/20 light:border-blue-200 rounded-2xl hover:border-blue-400/40 transition-all">
          <div className="flex items-center gap-2 mb-3">
            <MousePointerClick size={13} className="text-blue-400 shrink-0" />
            <p className="text-[10px] font-black tracking-widest uppercase text-slate-400 light:text-slate-600">Total Views</p>
          </div>
          <p className="text-3xl font-black text-blue-400">{totalPageViews === null ? '–' : totalPageViews.toLocaleString()}</p>
          <p className="text-[10px] text-slate-600 mt-1">Lifetime page loads tracked</p>
        </Card>

        <Card className="p-4 bg-slate-900/80 light:bg-white border-emerald-500/20 light:border-emerald-200 rounded-2xl hover:border-emerald-400/40 transition-all">
          <div className="flex items-center gap-2 mb-3">
            <Wifi size={13} className="text-emerald-400 shrink-0" />
            <p className="text-[10px] font-black tracking-widest uppercase text-slate-400 light:text-slate-600">Sessions (Sample)</p>
          </div>
          <p className="text-3xl font-black text-emerald-400">{uniqueSessions.toLocaleString()}</p>
          <p className="text-[10px] text-slate-600 mt-1">Unique browser sessions in sample</p>
        </Card>

        <Card className="p-4 bg-slate-900/80 light:bg-white border-amber-500/20 light:border-amber-200 rounded-2xl hover:border-amber-400/40 transition-all">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp size={13} className="text-amber-400 shrink-0" />
            <p className="text-[10px] font-black tracking-widest uppercase text-slate-400 light:text-slate-600">Pages / Session</p>
          </div>
          <p className="text-3xl font-black text-amber-400">{avgPagesPerSession}</p>
          <p className="text-[10px] text-slate-600 mt-1">Avg depth across sampled sessions</p>
        </Card>

        <Card className="p-4 bg-slate-900/80 light:bg-white border-pink-500/20 light:border-pink-200 rounded-2xl hover:border-pink-400/40 transition-all">
          <div className="flex items-center gap-2 mb-3">
            <Activity size={13} className="text-pink-400 shrink-0" />
            <p className="text-[10px] font-black tracking-widest uppercase text-slate-400 light:text-slate-600">Sample Size</p>
          </div>
          <p className="text-3xl font-black text-pink-400">{pageViewDocs.length.toLocaleString()}</p>
          <p className="text-[10px] text-slate-600 mt-1">Recent docs loaded (last 2 000)</p>
        </Card>
      </div>

      {/* Page views over time — 30 days */}
      <Card className="p-5 bg-slate-900/80 light:bg-white border-white/10 light:border-slate-200 rounded-[1.6rem]">
        <p className="text-xs font-black text-slate-400 light:text-slate-600 uppercase tracking-[0.18em]">Page Views · Last 30 Days</p>
        <p className="text-[10px] text-slate-600 mb-4 mt-0.5">Daily volume from the <code className="text-slate-400">page_views</code> collection. Excludes admin sessions.</p>
        {pageViewsByDayData.every(d => d.views === 0) ? (
          <p className="text-slate-600 text-xs py-8 text-center">No page view data in the sample window.</p>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={pageViewsByDayData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="pvGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#4A90D9" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#4A90D9" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
              <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} interval={4} />
              <YAxis allowDecimals={false} tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={ttStyle} labelStyle={{ color: '#94a3b8' }} itemStyle={{ color: '#4A90D9' }} />
              <Area type="monotone" dataKey="views" stroke="#4A90D9" strokeWidth={2} fill="url(#pvGrad)" name="Page Views" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </Card>

      {/* Traffic sources + Top pages */}
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Traffic source donut */}
        <Card className="p-5 bg-slate-900/80 light:bg-white border-white/10 light:border-slate-200 rounded-[1.6rem]">
          <p className="text-xs font-black text-slate-400 light:text-slate-600 uppercase tracking-[0.18em]">Acquisition Channels</p>
          <p className="text-[10px] text-slate-600 mb-4 mt-0.5">How visitors arrive — bucketed from referrer and UTM params.</p>
          {trafficSourceData.length === 0 ? (
            <p className="text-slate-600 text-xs py-8 text-center">
              No traffic source data yet. The enhanced PageTracker needs to collect sessions first.
            </p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={trafficSourceData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3} dataKey="value" strokeWidth={0}
                    shape={(props: any, i: number) => <Sector {...props} fill={trafficSourceData[i]?.color ?? props.fill} />}
                  />
                  <Tooltip contentStyle={ttStyle} itemStyle={{ color: '#e2e8f0' }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-3">
                {trafficSourceData.map((d) => (
                  <span key={d.name} className="flex items-center gap-1.5 text-[10px] text-slate-400 light:text-slate-600">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: d.color }} />
                    {d.name} <span className="font-black text-white light:text-slate-900 ml-auto">{d.value}</span>
                  </span>
                ))}
              </div>
            </>
          )}
        </Card>

        {/* Top pages */}
        <Card className="p-5 bg-slate-900/80 light:bg-white border-white/10 light:border-slate-200 rounded-[1.6rem]">
          <p className="text-xs font-black text-slate-400 light:text-slate-600 uppercase tracking-[0.18em]">Top Pages by Views</p>
          <p className="text-[10px] text-slate-600 mb-4 mt-0.5">Which routes drive the most traffic in the sampled window.</p>
          {topPagesData.length === 0 ? (
            <p className="text-slate-600 text-xs py-8 text-center">No page data yet.</p>
          ) : (
            <div className="space-y-2">
              {topPagesData.map(({ path, views }, i) => {
                const maxViews = topPagesData[0]?.views || 1;
                const pct = Math.round((views / maxViews) * 100);
                return (
                  <div key={path} className="flex items-center gap-3">
                    <span className="text-[10px] text-slate-600 w-4 text-right shrink-0">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-xs text-slate-300 light:text-slate-700 font-mono truncate">{path}</span>
                        <span className="text-xs font-black text-white light:text-slate-900 ml-2 shrink-0">{views.toLocaleString()}</span>
                      </div>
                      <div className="h-1 rounded-full bg-white/5">
                        <div className="h-1 rounded-full bg-[#4A90D9]" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {/* Top referrers + UTM campaigns */}
      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-5 bg-slate-900/80 light:bg-white border-white/10 light:border-slate-200 rounded-[1.6rem]">
          <div className="flex items-center gap-2 mb-1">
            <Link size={12} className="text-purple-400" />
            <p className="text-xs font-black text-slate-400 light:text-slate-600 uppercase tracking-[0.18em]">Top Referrers</p>
          </div>
          <p className="text-[10px] text-slate-600 mb-4 mt-0.5">External domains driving inbound traffic to Calgary Watch.</p>
          {topReferrersData.length === 0 ? (
            <p className="text-slate-600 text-xs py-8 text-center">No referral data in the sample. Most traffic may be direct.</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={topReferrersData} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                <XAxis type="number" allowDecimals={false} tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="referrer" width={110} tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={ttStyle} itemStyle={{ color: '#c084fc' }} cursor={{ fill: '#ffffff06' }} />
                <Bar dataKey="views" name="Visits" fill="#a855f7" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card className="p-5 bg-slate-900/80 light:bg-white border-white/10 light:border-slate-200 rounded-[1.6rem]">
          <div className="flex items-center gap-2 mb-1">
            <Megaphone size={12} className="text-orange-400" />
            <p className="text-xs font-black text-slate-400 light:text-slate-600 uppercase tracking-[0.18em]">UTM Campaigns</p>
          </div>
          <p className="text-[10px] text-slate-600 mb-4 mt-0.5">Views attributed to <code className="text-slate-400">utm_campaign</code> tagged links.</p>
          {utmCampaignData.length === 0 ? (
            <p className="text-slate-600 text-xs py-8 text-center">No UTM campaign data yet. Tag your links with <code className="text-slate-400">?utm_campaign=name</code> to track campaigns here.</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={utmCampaignData} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                <XAxis type="number" allowDecimals={false} tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="campaign" width={110} tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={ttStyle} itemStyle={{ color: '#fb923c' }} cursor={{ fill: '#ffffff06' }} />
                <Bar dataKey="views" name="Views" fill="#f97316" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>
    </div>
  );

  const renderFlagged = () => (
    <section className="space-y-6">
      {flaggedIncidents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Flag size={48} className="text-slate-700 mb-4" />
          <p className="text-slate-400 font-bold">No flagged incidents</p>
          <p className="text-slate-600 text-sm mt-1">Community moderation is clean.</p>
        </div>
      ) : (
        flaggedIncidents.map((incident) => (
          <div key={incident.id} className="rounded-3xl border border-amber-500/20 light:border-amber-200 bg-amber-500/5 light:bg-amber-50 p-6 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-black text-amber-400 uppercase tracking-widest mb-1">
                  Flagged {incident.flagged_at ? formatRelativeMinutes(incident.flagged_at) : ''}
                </p>
                <h3 className="text-white light:text-slate-900 font-black text-lg leading-tight truncate">{incident.title}</h3>
                <p className="text-slate-400 light:text-slate-600 text-sm mt-1 line-clamp-2">{incident.description}</p>
              </div>
              {incident.image_url && (
                <img src={incident.image_url} alt="" className="w-20 h-20 rounded-2xl object-cover border border-white/10 shrink-0" />
              )}
            </div>
            <div className="text-xs text-slate-500 space-y-0.5">
              <p>Neighborhood: <span className="text-slate-300 light:text-slate-700">{incident.neighborhood}</span></p>
              <p>Flagged by UID: <span className="text-slate-300 light:text-slate-700 font-mono">{incident.flagged_by}</span></p>
              <p>Reporter: <span className="text-slate-300 light:text-slate-700">{incident.name}</span></p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => void handleRestore(incident.id)}
                disabled={!!restoringId || !!deletingId}
                className="flex-1 h-10 rounded-2xl bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-400 font-black text-xs tracking-wide transition-all disabled:opacity-50"
              >
                {restoringId === incident.id ? 'Restoring…' : 'Restore'}
              </button>
              <button
                onClick={() => void handlePermanentDelete(incident.id)}
                disabled={!!restoringId || !!deletingId}
                className="flex-1 h-10 rounded-2xl bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 text-red-400 font-black text-xs tracking-wide transition-all disabled:opacity-50"
              >
                {deletingId === incident.id ? 'Deleting…' : 'Delete Permanently'}
              </button>
            </div>
          </div>
        ))
      )}
    </section>
  );

  // ── API Health section ────────────────────────────────────────────────────

  const renderApiHealth = () => {
    const statusColor: Record<ApiHealth['status'], string> = {
      idle:     'bg-slate-600',
      checking: 'bg-amber-400 animate-pulse',
      ok:       'bg-emerald-400',
      slow:     'bg-amber-400',
      error:    'bg-red-500',
    };
    const statusLabel: Record<ApiHealth['status'], string> = {
      idle: 'Not checked', checking: 'Checking…', ok: 'OK', slow: 'Slow', error: 'Error',
    };
    const allOk = apiHealths.every(h => h.status === 'ok' || h.status === 'idle');
    const anyError = apiHealths.some(h => h.status === 'error');
    return (
      <div className="space-y-5">
        <SectionHeader icon={Zap} title="API Health" subtitle="Live status of the Calgary Open Data and weather APIs that power the map" />
        <div className="flex items-center justify-between">
          <span className={cn('text-xs font-black uppercase tracking-widest', anyError ? 'text-red-400' : allOk ? 'text-emerald-400' : 'text-amber-400')}>
            {anyError ? 'Degraded — one or more APIs are failing' : allOk ? 'All systems operational' : 'Checking…'}
          </span>
          <button
            onClick={checkApis}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-bold transition-all border border-white/10"
          >
            <RefreshCw size={12} className={apiHealths.some(h => h.status === 'checking') ? 'animate-spin' : ''} />
            Test Now
          </button>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          {apiHealths.map((h) => (
            <Card key={h.id} className={cn('p-4 bg-slate-900/80 light:bg-white rounded-2xl border transition-all', h.status === 'error' ? 'border-red-500/40' : h.status === 'slow' ? 'border-amber-400/30' : 'border-white/10 light:border-slate-200')}>
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-2">
                  <span className={cn('w-2.5 h-2.5 rounded-full shrink-0', statusColor[h.status])} />
                  <span className="text-sm font-black text-white light:text-slate-900">{h.name}</span>
                </div>
                <span className={cn('text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-lg', h.status === 'ok' ? 'bg-emerald-500/15 text-emerald-300' : h.status === 'error' ? 'bg-red-500/15 text-red-300' : h.status === 'slow' ? 'bg-amber-500/15 text-amber-300' : 'bg-slate-700 text-slate-400')}>
                  {statusLabel[h.status]}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div>
                  <p className="text-slate-500 uppercase tracking-wider font-bold text-[9px]">Records</p>
                  <p className="text-white light:text-slate-900 font-black">{h.recordCount !== null ? h.recordCount : '—'}</p>
                </div>
                <div>
                  <p className="text-slate-500 uppercase tracking-wider font-bold text-[9px]">Response</p>
                  <p className={cn('font-black', h.responseMs && h.responseMs > 2000 ? 'text-amber-300' : 'text-white light:text-slate-900')}>
                    {h.responseMs !== null ? `${h.responseMs} ms` : '—'}
                  </p>
                </div>
                <div className="col-span-2">
                  <p className="text-slate-500 uppercase tracking-wider font-bold text-[9px]">Last checked</p>
                  <p className="text-slate-400">{h.lastChecked ? new Date(h.lastChecked).toLocaleTimeString() : 'Never'}</p>
                </div>
                {h.error && (
                  <div className="col-span-2">
                    <p className="text-slate-500 uppercase tracking-wider font-bold text-[9px]">Error</p>
                    <p className="text-red-400 truncate">{h.error}</p>
                  </div>
                )}
              </div>
              <p className="mt-3 text-[9px] text-slate-600 font-mono truncate">{h.url}</p>
            </Card>
          ))}
        </div>
      </div>
    );
  };

  // ── Section content router ─────────────────────────────────────────────────

  const renderSection = () => {
    switch (activeSection) {
      case 'dashboard': return renderDashboard();
      case 'incidents': return renderIncidents();
      case 'users':     return renderUsers();
      case 'stats':     return renderStats();
      case 'analytics': return renderAnalytics();
      case 'traffic':   return renderTrafficAnalytics();
      case 'apis':      return renderApiHealth();
      case 'flagged':   return renderFlagged();
      default:          return renderDashboard();
    }
  };

  // ── Shell ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-950 light:bg-[#f5efe3] light:text-slate-900 text-white flex flex-col md:flex-row relative overflow-hidden">

      {/* Ambient gradient blobs */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute -top-48 -left-32 w-[36rem] h-[36rem] rounded-full"
          style={{ background: 'radial-gradient(ellipse at center, rgba(37,99,235,0.07) 0%, transparent 65%)' }} />
        <div className="absolute -bottom-56 right-0 w-[32rem] h-[32rem] rounded-full"
          style={{ background: 'radial-gradient(ellipse at center, rgba(79,70,229,0.06) 0%, transparent 65%)' }} />
        <div className="absolute inset-x-0 top-0 hidden h-[24rem] light:block bg-[radial-gradient(circle_at_top_left,rgba(74,144,217,0.16),transparent_36%),radial-gradient(circle_at_top_right,rgba(212,168,67,0.18),transparent_26%)]" />
      </div>

      {/* ── Sidebar — desktop ─────────────────────────────────────────────── */}
      <aside className="hidden md:flex flex-col w-56 shrink-0 border-r border-white/[0.06] light:border-stone-200/80 bg-slate-950/80 light:bg-[rgba(255,250,242,0.86)] backdrop-blur-xl relative z-10 sticky top-0 h-screen">
        {/* Logo / wordmark */}
        <div className="p-5 border-b border-white/[0.06] light:border-stone-200/80">
          <div className="inline-flex items-center gap-2 mb-1">
            <Sparkles size={13} className="text-blue-400" />
            <span className="text-[9px] font-black uppercase tracking-[0.24em] text-slate-500 light:text-stone-500">Control Center</span>
          </div>
          <h1 className="text-base font-black tracking-tight leading-tight">Calgary Watch</h1>
          <p className="text-[10px] text-slate-500 mt-0.5">Admin Portal</p>
        </div>

        {/* Nav items */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
            const isActive = activeSection === id;
            // Badge for moderation queue
            const badge = id === 'incidents' && pendingReviewIncidents.length > 0
              ? pendingReviewIncidents.length : null;
            return (
              <button
                key={id}
                onClick={() => setActiveSection(id)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all border',
                  isActive
                    ? 'bg-gradient-to-r from-blue-500/20 to-blue-600/10 text-blue-300 border-blue-500/30 shadow-[inset_0_1px_0_rgba(147,197,253,0.1),0_0_12px_rgba(59,130,246,0.08)]'
                    : 'text-slate-400 light:text-stone-600 border-transparent hover:text-white light:hover:text-slate-900 hover:bg-white/[0.05] light:hover:bg-white/70'
                )}
              >
                <Icon size={14} className={isActive ? 'text-blue-400' : 'text-slate-500'} />
                <span className="flex-1 text-left">{label}</span>
                {badge != null && (
                  <span className="w-4 h-4 rounded-full bg-amber-500/30 text-amber-300 text-[9px] font-black flex items-center justify-center">
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Bottom: user + back link */}
        <div className="p-3 border-t border-white/[0.06] light:border-stone-200/80 space-y-2">
          <div className="px-3 py-2 rounded-xl bg-white/[0.03] light:bg-white/70 border border-white/[0.06] light:border-stone-200/80">
            <p className="text-[10px] font-black text-slate-300 light:text-slate-800 truncate">{user.displayName || 'Admin'}</p>
            <p className="text-[9px] text-slate-600 light:text-stone-500 truncate">{user.email}</p>
          </div>
          <button
            onClick={() => navigate('/map')}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-slate-500 light:text-stone-500 hover:text-slate-300 light:hover:text-slate-900 hover:bg-white/[0.05] light:hover:bg-white/70 transition-all"
          >
            <ArrowLeft size={13} />
            Back to map
          </button>
        </div>
      </aside>

      {/* ── Main content area ─────────────────────────────────────────────── */}
      <main className="flex-1 min-w-0 relative z-10 pb-8 md:pb-0">
        {/* Top bar — mobile header */}
        <div className="md:hidden flex items-center justify-between px-4 py-4 border-b border-white/[0.06] light:border-stone-200/80 bg-slate-950/80 light:bg-[rgba(255,250,242,0.88)] backdrop-blur-xl sticky top-0 z-20">
          <div className="flex items-center gap-3">
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.28em] text-slate-500 light:text-stone-500">Calgary Watch</p>
              <h2 className="text-sm font-black leading-tight text-white light:text-slate-900">Admin Control</h2>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {pendingReviewIncidents.length > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/15 px-2.5 py-1 text-[9px] font-black text-amber-200">
                <Zap size={10} />
                {pendingReviewIncidents.length} pending
              </span>
            )}
            <button
              onClick={() => navigate('/map')}
              className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 light:border-stone-200/80 bg-white/[0.05] light:bg-white/72 text-slate-300 light:text-slate-800 transition-all active:scale-95"
              aria-label="Back to map"
            >
              <ArrowLeft size={15} />
            </button>
          </div>
        </div>
        {renderMobileCommandDeck()}
        {renderMobileHero()}

        {/* Content scroll area */}
        <div className="p-4 pt-5 md:p-6 lg:p-8">
          {renderSection()}
        </div>
      </main>
    </div>
  );
}
