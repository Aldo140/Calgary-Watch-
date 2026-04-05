import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/src/components/FirebaseProvider';
import { db, isFirebaseConfigured } from '@/src/firebase';
import { Incident, CommunityStats } from '@/src/types';
import { addDoc, collection, doc, getDocs, getCountFromServer, onSnapshot, orderBy, query, updateDoc } from 'firebase/firestore';
import { Button } from '@/src/components/ui/Button';
import { Card } from '@/src/components/ui/Card';
import { ArrowLeft, Loader2, Lock, Save, Trash2, Activity, AlertTriangle, Clock3, Users, ShieldCheck, ChartNoAxesColumn, Sparkles, RefreshCw, Siren, ChartPie } from 'lucide-react';
import {
  ResponsiveContainer,
  PieChart, Pie, Cell,
  AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar, Legend,
  LineChart, Line,
} from 'recharts';

type UserProfile = {
  uid: string;
  email: string;
  displayName: string;
  role: 'user' | 'admin';
};

type EditableIncident = Pick<
  Incident,
  | 'title'
  | 'description'
  | 'category'
  | 'neighborhood'
  | 'verified_status'
  | 'report_count'
  | 'source_name'
  | 'source_url'
>;

type EditableCommunityStats = Pick<
  CommunityStats,
  'community' | 'month' | 'violent_crime' | 'property_crime' | 'disorder_calls' | 'safety_score'
>;

const emptyIncidentDraft: EditableIncident = {
  title: '',
  description: '',
  category: 'crime',
  neighborhood: '',
  verified_status: 'unverified',
  report_count: 1,
  source_name: '',
  source_url: '',
};

const emptyStatsDraft: EditableCommunityStats = {
  community: '',
  month: '',
  violent_crime: 0,
  property_crime: 0,
  disorder_calls: 0,
  safety_score: 0,
};

export default function AdminPage() {
  const navigate = useNavigate();
  const { user, signIn, isAuthReady, isAdmin } = useAuth();

  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [communityStats, setCommunityStats] = useState<(CommunityStats & { id: string })[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [isRefreshingUsers, setIsRefreshingUsers] = useState(false);
  const [totalPageViews, setTotalPageViews] = useState<number | null>(null);

  const [incidentDrafts, setIncidentDrafts] = useState<Record<string, EditableIncident>>({});
  const [statsDrafts, setStatsDrafts] = useState<Record<string, EditableCommunityStats>>({});
  const [savingIncidentId, setSavingIncidentId] = useState<string | null>(null);
  const [savingStatsId, setSavingStatsId] = useState<string | null>(null);

  const writeAuditLog = async (
    action: 'incident_update' | 'incident_soft_delete' | 'community_stats_update' | 'community_stats_soft_delete',
    targetCollection: 'incidents' | 'community_stats',
    targetId: string,
    changes: Record<string, unknown>,
  ) => {
    if (!user || !db) return;
    await addDoc(collection(db, 'admin_audit_logs'), {
      action,
      targetCollection,
      targetId,
      adminUid: user.uid,
      adminEmail: user.email || '',
      timestamp: Date.now(),
      changes,
      metadata: {
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
      },
    });
  };

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
      const rows = snapshot.docs.map((row) => row.data() as UserProfile);
      setUsers(rows);
    });

    try {
      getCountFromServer(collection(db, 'page_views'))
        .then(snap => setTotalPageViews(snap.data().count))
        .catch(() => setTotalPageViews(0));
    } catch {}

    return () => {
      unsubIncidents();
      unsubStats();
      unsubUsers();
    };
  }, [isAuthReady, isAdmin, user, db]);

  const totalIncidents = incidents.length;
  const emergencyIncidents = incidents.filter((i) => i.category === 'emergency').length;
  const unresolvedIncidents = incidents.filter((i) => i.verified_status !== 'community_confirmed').length;
  const todayIncidents = incidents.filter((i) => Date.now() - i.timestamp < 24 * 60 * 60 * 1000).length;
  const totalUsers = users.length;
  const adminUsers = users.filter((u) => u.role === 'admin').length;
  const viewOnlyUsers = totalUsers - adminUsers;
  const uniqueReporterEmails = new Set(
    incidents.map((i) => i.email).filter(e => e && e !== 'anonymous@calgarywatch.app' && e !== 'opendata@calgary.ca')
  ).size;
  const averageSafety = useMemo(() => {
    if (communityStats.length === 0) return 0;
    return Math.round(communityStats.reduce((sum, row) => sum + Number(row.safety_score || 0), 0) / communityStats.length);
  }, [communityStats]);

  // API data source stats
  const officialTrafficCount = incidents.filter((i) => i.id.startsWith('yyc-traffic-')).length;
  const official311Count = incidents.filter((i) => i.id.startsWith('yyc-311-')).length;
  const officialCrimeCount = incidents.filter((i) => i.id.startsWith('crime-stat-')).length;
  const communityReportCount = incidents.filter((i) => !i.data_source || i.data_source === 'community').length;

  const refreshUsers = async () => {
    if (!db) return;
    setIsRefreshingUsers(true);
    try {
      const snap = await getDocs(collection(db, 'users'));
      setUsers(snap.docs.map(doc => doc.data() as UserProfile));
    } catch {}
    setIsRefreshingUsers(false);
  };

  // ── Chart data ──────────────────────────────────────────────────────────────

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
    let admins = 0;
    let postingUsers = 0;
    let lurkingUsers = 0;

    const posterEmails = new Set(incidents.map(i => i.email).filter(Boolean));
    // Incident type doesn't natively include uid, but loosely cast
    const posterUids = new Set(incidents.map(i => (i as any).uid).filter(Boolean)); 

    users.forEach(u => {
      if (u.role === 'admin') admins++;
      else if (posterEmails.has(u.email) || posterUids.has(u.uid)) postingUsers++;
      else lurkingUsers++;
    });

    return [
      { name: 'Posting Users', value: postingUsers, color: '#f59e0b' },
      { name: 'View-Only Users', value: lurkingUsers, color: '#4A90D9' },
      { name: 'Admins', value: admins, color: '#2E8B7A' },
    ].filter((d) => d.value > 0);
  }, [users, incidents]);

  const trustChartData = useMemo(() => {
    const counts: Record<string, number> = {};
    incidents.forEach((i) => { counts[i.verified_status] = (counts[i.verified_status] ?? 0) + 1; });
    return [
      { name: 'Unverified',         value: counts['unverified']          ?? 0, color: '#64748b' },
      { name: 'Multiple Reports',   value: counts['multiple_reports']    ?? 0, color: '#f59e0b' },
      { name: 'Community Confirmed',value: counts['community_confirmed'] ?? 0, color: '#22c55e' },
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
      const date = new Date(i.timestamp);
      const key = date.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
      if (key in buckets) buckets[key]++;
    });
    return Object.entries(buckets).map(([date, count]) => ({ date, count }));
  }, [incidents]);

  const neighborhoodChartData = useMemo(() => {
    const counts: Record<string, number> = {};
    incidents.forEach((i) => {
      if (i.neighborhood) counts[i.neighborhood] = (counts[i.neighborhood] ?? 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, count]) => ({ name, count }));
  }, [incidents]);

  const safetyChartData = useMemo(() =>
    communityStats
      .slice()
      .sort((a, b) => b.safety_score - a.safety_score)
      .slice(0, 10)
      .map((row) => ({
        name: row.community.length > 12 ? row.community.slice(0, 12) + '…' : row.community,
        'Safety Score': row.safety_score,
        'Violent Crime': row.violent_crime,
        'Property Crime': row.property_crime,
        'Disorder Calls': row.disorder_calls,
      })),
  [communityStats]);

  // Hourly distribution (0-23)
  const hourlyChartData = useMemo(() => {
    const buckets = Array.from({ length: 24 }, (_, h) => ({ hour: `${h}:00`, count: 0 }));
    incidents.forEach((i) => {
      const h = new Date(i.timestamp).getHours();
      buckets[h].count++;
    });
    return buckets;
  }, [incidents]);

  // Stacked category-by-day (last 7 days)
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

  // Top reporters (by count)
  const topReportersData = useMemo(() => {
    const counts: Record<string, { name: string; count: number }> = {};
    incidents.forEach((i) => {
      const uid = (i as any).authorUid;
      const key = uid || i.email || 'unknown';
      if (!counts[key]) {
        const user = users.find(u => u.uid === uid || u.email === i.email);
        counts[key] = { name: user?.displayName || i.name || i.email || 'Unknown', count: 0 };
      }
      counts[key].count++;
    });
    return Object.values(counts)
      .filter(r => r.name !== 'Calgary 311 Sync' && r.name !== 'City of Calgary Traffic' && r.name !== 'Calgary Police Service')
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)
      .map(r => ({ name: r.name.length > 14 ? r.name.slice(0, 14) + '…' : r.name, count: r.count }));
  }, [incidents, users]);

  // ── End chart data ───────────────────────────────────────────────────────────

  const setIncidentDraft = (incident: Incident, patch?: Partial<EditableIncident>) => {
    setIncidentDrafts((prev) => ({
      ...prev,
      [incident.id]: {
        ...(prev[incident.id] || {
          ...emptyIncidentDraft,
          title: incident.title,
          description: incident.description,
          category: incident.category,
          neighborhood: incident.neighborhood,
          verified_status: incident.verified_status,
          report_count: incident.report_count,
          source_name: incident.source_name || '',
          source_url: incident.source_url || '',
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
          community: row.community,
          month: row.month,
          violent_crime: row.violent_crime,
          property_crime: row.property_crime,
          disorder_calls: row.disorder_calls,
          safety_score: row.safety_score,
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
      await updateDoc(doc(db, 'incidents', incidentId), {
        ...draft,
        report_count: Number(draft.report_count || 0),
      });
      await writeAuditLog('incident_update', 'incidents', incidentId, draft);
    } finally {
      setSavingIncidentId(null);
    }
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
    } finally {
      setSavingStatsId(null);
    }
  };

  const softDeleteIncident = async (incidentId: string) => {
    if (!user || !db) return;
    const confirmed = window.confirm('Soft-delete this incident? It will be hidden from the live feed.');
    if (!confirmed) return;

    try {
      await updateDoc(doc(db, 'incidents', incidentId), {
        deleted: true,
        deletedAt: Date.now(),
        deletedBy: user.uid,
      });
      await writeAuditLog('incident_soft_delete', 'incidents', incidentId, { deleted: true });
    } catch (err) {
      console.error('Failed to soft-delete incident:', err);
      alert('Could not delete this incident. Check your admin permissions and redeploy Firestore rules if needed.');
    }
  };

  const softDeleteCommunityStats = async (statsId: string) => {
    if (!user || !db) return;
    const confirmed = window.confirm('Soft-delete this community stats row?');
    if (!confirmed) return;

    try {
      await updateDoc(doc(db, 'community_stats', statsId), {
        deleted: true,
        deletedAt: Date.now(),
        deletedBy: user.uid,
      });
      await writeAuditLog('community_stats_soft_delete', 'community_stats', statsId, { deleted: true });
    } catch (err) {
      console.error('Failed to soft-delete community stats:', err);
      alert('Could not delete this row. Check your admin permissions.');
    }
  };

  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  if (!isFirebaseConfigured) {
    return (
      <div className="min-h-screen bg-slate-950 text-white p-6 flex items-center justify-center">
        <Card className="max-w-xl w-full p-8 space-y-4 bg-slate-900/95 border-white/10 rounded-[2rem] shadow-[0_25px_80px_-30px_rgba(0,0,0,0.7)]">
          <h1 className="text-2xl font-black">Admin unavailable</h1>
          <p className="text-slate-300 text-sm leading-relaxed">
            This deployment was built without Firebase environment variables. Add the{' '}
            <code className="text-amber-300/90">VITE_FIREBASE_*</code> secrets to your GitHub repository and re-run the
            Pages workflow, or run <code className="text-amber-300/90">npm run build</code> with a local{' '}
            <code className="text-amber-300/90">.env</code> file.
          </p>
          <Button onClick={() => navigate('/map')} className="w-full">
            Back to map
          </Button>
        </Card>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950 text-white p-6 flex items-center justify-center">
        <Card className="max-w-xl w-full p-8 space-y-4 bg-slate-900/95 border-white/10 rounded-[2rem] shadow-[0_25px_80px_-30px_rgba(0,0,0,0.7)]">
          <h1 className="text-2xl font-black">Admin Portal</h1>
          <p className="text-slate-300 text-sm">Sign in with Google using the approved admin account to continue.</p>
          <Button onClick={signIn} className="w-full">Sign in with Google</Button>
          <Button variant="secondary" onClick={() => navigate('/map')} className="w-full">Back to map</Button>
        </Card>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-slate-950 text-white p-6 flex items-center justify-center">
        <Card className="max-w-xl w-full p-8 space-y-4 bg-slate-900/95 border-red-500/40 rounded-[2rem] shadow-[0_25px_80px_-30px_rgba(0,0,0,0.7)]">
          <div className="flex items-center gap-2 text-red-400">
            <Lock size={18} />
            <h1 className="text-2xl font-black">Access denied</h1>
          </div>
          <p className="text-slate-300 text-sm">This portal is restricted to approved admin accounts.</p>
          <Button variant="secondary" onClick={() => navigate('/map')} className="w-full">Back to map</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white p-4 md:p-8 relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-48 -left-32 w-[36rem] h-[36rem] rounded-full"
          style={{ background: 'radial-gradient(ellipse at center, rgba(37,99,235,0.08) 0%, transparent 65%)' }} />
        <div className="absolute -bottom-56 right-0 w-[32rem] h-[32rem] rounded-full"
          style={{ background: 'radial-gradient(ellipse at center, rgba(79,70,229,0.07) 0%, transparent 65%)' }} />
      </div>
      <div className="max-w-7xl mx-auto space-y-6 relative z-10">
        <div className="flex flex-wrap gap-3 items-center justify-between bg-slate-900/70 border border-white/10 rounded-[2rem] p-5 backdrop-blur-xl shadow-[0_24px_60px_-28px_rgba(0,0,0,0.7)]">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/10 bg-white/5 mb-3">
              <Sparkles size={12} className="text-blue-400" />
              <span className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Ops Control Center</span>
            </div>
            <h1 className="text-3xl md:text-4xl font-black tracking-tight">Calgary Watch Admin</h1>
            <p className="text-sm text-slate-400 mt-1">Live command surface for incidents, trust status, and community intelligence.</p>
          </div>
          <Button variant="secondary" onClick={() => navigate('/map')} className="flex items-center justify-center gap-2 w-full md:w-auto mt-2 md:mt-0">
            <ArrowLeft size={16} />
            Back to map
          </Button>
        </div>

        {/* KPI row 1 — Incident health */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="p-4 bg-red-950/30 border-red-500/30 rounded-2xl hover:border-red-500/60 transition-all">
            <div className="flex items-center gap-2 mb-3">
              <Siren size={13} className="text-red-400 animate-pulse shrink-0" />
              <p className="text-[10px] font-black tracking-widest uppercase text-red-400">Active Emergencies</p>
            </div>
            <p className="text-3xl font-black text-red-400">{emergencyIncidents}</p>
            <p className="text-[10px] text-red-400/50 mt-1">Critical priority — requires immediate review</p>
          </Card>
          <Card className="p-4 bg-amber-950/20 border-amber-500/20 rounded-2xl hover:border-amber-400/40 transition-all">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle size={13} className="text-amber-400 shrink-0" />
              <p className="text-[10px] font-black tracking-widest uppercase text-slate-400">Unresolved</p>
            </div>
            <p className="text-3xl font-black text-amber-400">{unresolvedIncidents}</p>
            <p className="text-[10px] text-slate-600 mt-1">Awaiting community confirmation</p>
          </Card>
          <Card className="p-4 bg-slate-900/80 border-white/10 rounded-2xl hover:border-blue-400/30 transition-all">
            <div className="flex items-center gap-2 mb-3">
              <Clock3 size={13} className="text-blue-400 shrink-0" />
              <p className="text-[10px] font-black tracking-widest uppercase text-slate-400">Last 24h</p>
            </div>
            <p className="text-3xl font-black text-blue-400">{todayIncidents}</p>
            <p className="text-[10px] text-slate-600 mt-1">New reports in the past 24 hours</p>
          </Card>
          <Card className="p-4 bg-slate-900/80 border-white/10 rounded-2xl hover:border-blue-400/30 transition-all">
            <div className="flex items-center gap-2 mb-3">
              <Activity size={13} className="text-pink-400 shrink-0" />
              <p className="text-[10px] font-black tracking-widest uppercase text-slate-400">Page Views</p>
            </div>
            <p className="text-3xl font-black">{totalPageViews === null ? '–' : totalPageViews.toLocaleString()}</p>
            <p className="text-[10px] text-slate-600 mt-1">Lifetime platform loads tracked</p>
          </Card>
        </div>

        {/* KPI row 2 — Users + Safety */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="p-4 bg-slate-900/80 border-violet-500/20 rounded-2xl hover:border-violet-400/40 transition-all">
            <div className="flex items-center gap-2 mb-3">
              <Users size={13} className="text-violet-400 shrink-0" />
              <p className="text-[10px] font-black tracking-widest uppercase text-slate-400">Total Users</p>
            </div>
            <p className="text-3xl font-black text-violet-400">{totalUsers}</p>
            <div className="flex gap-3 mt-2">
              <span className="text-[10px] text-slate-500"><span className="text-[#4A90D9] font-black">{viewOnlyUsers}</span> View-Only</span>
              <span className="text-[10px] text-slate-500"><span className="text-[#2E8B7A] font-black">{adminUsers}</span> Admin</span>
            </div>
          </Card>
          <Card className="p-4 bg-slate-900/80 border-white/10 rounded-2xl hover:border-amber-400/30 transition-all">
            <div className="flex items-center gap-2 mb-3">
              <ChartPie size={13} className="text-amber-400 shrink-0" />
              <p className="text-[10px] font-black tracking-widest uppercase text-slate-400">Active Reporters</p>
            </div>
            <p className="text-3xl font-black text-amber-400">{uniqueReporterEmails}</p>
            <p className="text-[10px] text-slate-600 mt-1">Distinct users who have filed a report</p>
          </Card>
          <Card className="p-4 bg-slate-900/80 border-white/10 rounded-2xl hover:border-blue-400/30 transition-all">
            <div className="flex items-center gap-2 mb-3">
              <Activity size={13} className="text-blue-400 shrink-0" />
              <p className="text-[10px] font-black tracking-widest uppercase text-slate-400">Firebase Reports</p>
            </div>
            <p className="text-3xl font-black">{totalIncidents}</p>
            <p className="text-[10px] text-slate-600 mt-1">Community + official in Firestore</p>
          </Card>
          <Card className="p-4 bg-slate-900/80 border-emerald-500/20 rounded-2xl hover:border-emerald-400/40 transition-all">
            <div className="flex items-center gap-2 mb-3">
              <ShieldCheck size={13} className="text-emerald-400 shrink-0" />
              <p className="text-[10px] font-black tracking-widest uppercase text-slate-400">Avg Safety Score</p>
            </div>
            <p className="text-3xl font-black text-emerald-400">{averageSafety}</p>
            <p className="text-[10px] text-slate-600 mt-1">Mean score (0–100) across tracked neighborhoods</p>
          </Card>
        </div>

        {/* API Data Sources Panel */}
        <Card className="p-5 bg-slate-900/80 border-white/10 rounded-[1.6rem]">
          <div className="flex items-center gap-2 mb-4">
            <ChartNoAxesColumn size={14} className="text-sky-400" />
            <h2 className="text-sm font-black uppercase tracking-widest text-sky-400">Live API Data Sources</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="flex flex-col gap-1 p-3.5 rounded-2xl bg-orange-500/5 border border-orange-500/20">
              <p className="text-[10px] font-black uppercase tracking-widest text-orange-400">City Traffic</p>
              <p className="text-2xl font-black text-orange-400">{officialTrafficCount}</p>
              <p className="text-[10px] text-slate-600 leading-snug">Live incidents from City of Calgary Open Data traffic feed</p>
            </div>
            <div className="flex flex-col gap-1 p-3.5 rounded-2xl bg-blue-500/5 border border-blue-500/20">
              <p className="text-[10px] font-black uppercase tracking-widest text-blue-400">Calgary 311</p>
              <p className="text-2xl font-black text-blue-400">{official311Count}</p>
              <p className="text-[10px] text-slate-600 leading-snug">Open service requests synced from Calgary 311 portal</p>
            </div>
            <div className="flex flex-col gap-1 p-3.5 rounded-2xl bg-red-500/5 border border-red-500/20">
              <p className="text-[10px] font-black uppercase tracking-widest text-red-400">Crime Stats</p>
              <p className="text-2xl font-black text-red-400">{officialCrimeCount}</p>
              <p className="text-[10px] text-slate-600 leading-snug">Monthly crime stats from Calgary Police Service Open Data</p>
            </div>
            <div className="flex flex-col gap-1 p-3.5 rounded-2xl bg-emerald-500/5 border border-emerald-500/20">
              <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400">Community Reports</p>
              <p className="text-2xl font-black text-emerald-400">{communityReportCount}</p>
              <p className="text-[10px] text-slate-600 leading-snug">User-submitted incidents from the Calgary Watch community</p>
            </div>
          </div>
        </Card>

        <Card className="p-5 bg-slate-900/80 border-white/10 rounded-[1.6rem] overflow-x-auto">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold">Incidents (Editable)</h2>
            <div className="flex flex-col items-end">
              <span className="text-[10px] uppercase tracking-[0.2em] font-black text-slate-500">Moderation Queue</span>
              <span className="text-[10px] text-amber-500 md:hidden mt-0.5">Swipe table &rarr;</span>
            </div>
          </div>
          {loadingData ? (
            <div className="py-8 flex items-center justify-center"><Loader2 className="animate-spin" /></div>
          ) : (
            <table className="w-full text-xs min-w-[1280px]">
              <thead className="text-slate-400">
                <tr className="border-b border-white/10">
                  <th className="py-2 text-left">Title</th>
                  <th className="py-2 text-left">Category</th>
                  <th className="py-2 text-left">Neighborhood</th>
                  <th className="py-2 text-left">Status</th>
                  <th className="py-2 text-left">Reports</th>
                  <th className="py-2 text-left">Description</th>
                  <th className="py-2 text-left">Source</th>
                  <th className="py-2 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {incidents.map((incident) => {
                  const draft = incidentDrafts[incident.id] || {
                    ...emptyIncidentDraft,
                    title: incident.title,
                    description: incident.description,
                    category: incident.category,
                    neighborhood: incident.neighborhood,
                    verified_status: incident.verified_status,
                    report_count: incident.report_count,
                    source_name: incident.source_name || '',
                    source_url: incident.source_url || '',
                  };

                  return (
                    <tr key={incident.id} className="border-b border-white/5 align-top hover:bg-white/[0.02] transition-colors">
                      <td className="py-2 pr-2"><input className="w-full bg-slate-800/80 border border-white/10 rounded-xl p-2" value={draft.title} onChange={(e) => setIncidentDraft(incident, { title: e.target.value })} /></td>
                      <td className="py-2 pr-2">
                        <select className="w-full bg-slate-800/80 border border-white/10 rounded-xl p-2" value={draft.category} onChange={(e) => setIncidentDraft(incident, { category: e.target.value as Incident['category'] })}>
                          <option value="emergency">emergency</option>
                          <option value="crime">crime</option>
                          <option value="traffic">traffic</option>
                          <option value="infrastructure">infrastructure</option>
                          <option value="weather">weather</option>
                          <option value="gas">gas</option>
                        </select>
                      </td>
                      <td className="py-2 pr-2"><input className="w-full bg-slate-800/80 border border-white/10 rounded-xl p-2" value={draft.neighborhood} onChange={(e) => setIncidentDraft(incident, { neighborhood: e.target.value })} /></td>
                      <td className="py-2 pr-2">
                        <select className="w-full bg-slate-800/80 border border-white/10 rounded-xl p-2" value={draft.verified_status} onChange={(e) => setIncidentDraft(incident, { verified_status: e.target.value as Incident['verified_status'] })}>
                          <option value="unverified">unverified</option>
                          <option value="multiple_reports">multiple_reports</option>
                          <option value="community_confirmed">community_confirmed</option>
                        </select>
                      </td>
                      <td className="py-2 pr-2"><input type="number" className="w-24 bg-slate-800/80 border border-white/10 rounded-xl p-2" value={draft.report_count} onChange={(e) => setIncidentDraft(incident, { report_count: Number(e.target.value) })} /></td>
                      <td className="py-2 pr-2"><textarea className="w-full h-20 bg-slate-800/80 border border-white/10 rounded-xl p-2" value={draft.description} onChange={(e) => setIncidentDraft(incident, { description: e.target.value })} /></td>
                      <td className="py-2 pr-2">
                        <input className="w-full bg-slate-800/80 border border-white/10 rounded-xl p-2 mb-2" placeholder="Source name" value={draft.source_name || ''} onChange={(e) => setIncidentDraft(incident, { source_name: e.target.value })} />
                        <input className="w-full bg-slate-800/80 border border-white/10 rounded-xl p-2" placeholder="Source URL" value={draft.source_url || ''} onChange={(e) => setIncidentDraft(incident, { source_url: e.target.value })} />
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
          )}
        </Card>

        {/* ── Analytics ─────────────────────────────────────────────────────── */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <ChartNoAxesColumn size={15} className="text-blue-400" />
            <span className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Analytics</span>
          </div>

          {/* Row 1: Incidents over time - full width */}
          <Card className="p-5 bg-slate-900/80 border-white/10 rounded-[1.6rem]">
            <p className="text-xs font-black text-slate-400 uppercase tracking-[0.18em]">Incidents: Last 14 Days</p>
            <p className="text-[10px] text-slate-600 mb-4 mt-0.5">Daily report volume from your community. Spikes indicate high-activity periods worth reviewing.</p>
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
                  <Tooltip
                    contentStyle={{ background: '#0f172a', border: '1px solid #ffffff15', borderRadius: 12, fontSize: 11 }}
                    labelStyle={{ color: '#94a3b8' }}
                    itemStyle={{ color: '#60a5fa' }}
                  />
                  <Area type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} fill="url(#incidentGrad)" name="Incidents" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </Card>

          {/* Row 2: Category donut + Trust donut + Top Neighborhoods bar */}
          <div className="grid lg:grid-cols-3 gap-4">
            <Card className="p-5 bg-slate-900/80 border-white/10 rounded-[1.6rem]">
              <p className="text-xs font-black text-slate-400 uppercase tracking-[0.18em]">By Category</p>
              <p className="text-[10px] text-slate-600 mb-4 mt-0.5">How reports break down by type. Helps identify which incident categories dominate the feed.</p>
              {categoryChartData.length === 0 ? (
                <p className="text-slate-600 text-xs py-8 text-center">No data yet.</p>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={160}>
                    <PieChart>
                      <Pie data={categoryChartData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3} dataKey="value" strokeWidth={0}>
                        {categoryChartData.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ background: '#0f172a', border: '1px solid #ffffff15', borderRadius: 12, fontSize: 11 }}
                        itemStyle={{ color: '#e2e8f0' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-3">
                    {categoryChartData.map((d) => (
                      <span key={d.name} className="flex items-center gap-1.5 text-[10px] text-slate-400">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: d.color }} />
                        {d.name} <span className="font-black text-white">{d.value}</span>
                      </span>
                    ))}
                  </div>
                </>
              )}
            </Card>

            <Card className="p-5 bg-slate-900/80 border-white/10 rounded-[1.6rem]">
              <p className="text-xs font-black text-slate-400 uppercase tracking-[0.18em]">Trust Status</p>
              <p className="text-[10px] text-slate-600 mb-4 mt-0.5">Verification breakdown. Grey = unverified, amber = multiple reports, green = community-confirmed.</p>
              {trustChartData.length === 0 ? (
                <p className="text-slate-600 text-xs py-8 text-center">No data yet.</p>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={160}>
                    <PieChart>
                      <Pie data={trustChartData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3} dataKey="value" strokeWidth={0}>
                        {trustChartData.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ background: '#0f172a', border: '1px solid #ffffff15', borderRadius: 12, fontSize: 11 }}
                        itemStyle={{ color: '#e2e8f0' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-3">
                    {trustChartData.map((d) => (
                      <span key={d.name} className="flex items-center gap-1.5 text-[10px] text-slate-400">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: d.color }} />
                        {d.name} <span className="font-black text-white">{d.value}</span>
                      </span>
                    ))}
                  </div>
                </>
              )}
            </Card>

            <Card className="p-5 bg-slate-900/80 border-white/10 rounded-[1.6rem]">
              <p className="text-xs font-black text-slate-400 uppercase tracking-[0.18em]">Top Neighborhoods</p>
              <p className="text-[10px] text-slate-600 mb-4 mt-0.5">Areas with the highest incident count. Use this to prioritize moderation and area intelligence updates.</p>
              {neighborhoodChartData.length === 0 ? (
                <p className="text-slate-600 text-xs py-8 text-center">No data yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={neighborhoodChartData} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
                    <XAxis type="number" allowDecimals={false} tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" width={80} tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{ background: '#0f172a', border: '1px solid #ffffff15', borderRadius: 12, fontSize: 11 }}
                      itemStyle={{ color: '#60a5fa' }}
                      cursor={{ fill: '#ffffff08' }}
                    />
                    <Bar dataKey="count" name="Incidents" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>
          </div>

          {/* Row 3: Community safety breakdown - full width */}
          {safetyChartData.length > 0 && (
            <Card className="p-5 bg-slate-900/80 border-white/10 rounded-[1.6rem]">
              <p className="text-xs font-black text-slate-400 uppercase tracking-[0.18em]">Community Safety vs Crime Breakdown</p>
              <p className="text-[10px] text-slate-600 mb-4 mt-0.5">Compares safety score against violent crime, property crime, and disorder calls per neighborhood. Higher safety score = safer. Use to spot communities where the score doesn't match the crime data.</p>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={safetyChartData} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                  <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ background: '#0f172a', border: '1px solid #ffffff15', borderRadius: 12, fontSize: 11 }}
                    itemStyle={{ color: '#e2e8f0' }}
                    cursor={{ fill: '#ffffff05' }}
                  />
                  <Legend wrapperStyle={{ fontSize: 10, color: '#64748b', paddingTop: 12 }} />
                  <Bar dataKey="Safety Score"    fill="#22c55e" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Violent Crime"   fill="#ef4444" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Property Crime"  fill="#f97316" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Disorder Calls"  fill="#a855f7" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          )}

          {/* Row 4: Hourly activity + stacked category by day */}
          <div className="grid lg:grid-cols-2 gap-4">
            <Card className="p-5 bg-slate-900/80 border-white/10 rounded-[1.6rem]">
              <p className="text-xs font-black text-slate-400 uppercase tracking-[0.18em]">Hourly Activity Pattern</p>
              <p className="text-[10px] text-slate-600 mb-4 mt-0.5">When during the day most reports are filed. Useful for staffing moderation windows.</p>
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
                  <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #ffffff15', borderRadius: 12, fontSize: 11 }} labelStyle={{ color: '#94a3b8' }} itemStyle={{ color: '#c084fc' }} />
                  <Area type="monotone" dataKey="count" stroke="#a855f7" strokeWidth={2} fill="url(#hourGrad)" name="Reports" />
                </AreaChart>
              </ResponsiveContainer>
            </Card>

            <Card className="p-5 bg-slate-900/80 border-white/10 rounded-[1.6rem]">
              <p className="text-xs font-black text-slate-400 uppercase tracking-[0.18em]">Category Mix · Last 7 Days</p>
              <p className="text-[10px] text-slate-600 mb-4 mt-0.5">Daily stacked view of report categories. See how the mix shifts over time.</p>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={categoryByDayData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff06" />
                  <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 9 }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fill: '#64748b', fontSize: 9 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #ffffff15', borderRadius: 12, fontSize: 11 }} itemStyle={{ color: '#e2e8f0' }} cursor={{ fill: '#ffffff05' }} />
                  <Legend wrapperStyle={{ fontSize: 9, color: '#64748b', paddingTop: 8 }} />
                  <Bar dataKey="emergency"      stackId="a" fill="#dc2626" radius={[0,0,0,0]} name="Emergency" />
                  <Bar dataKey="crime"          stackId="a" fill="#ef4444" name="Crime" />
                  <Bar dataKey="traffic"        stackId="a" fill="#f97316" name="Traffic" />
                  <Bar dataKey="infrastructure" stackId="a" fill="#3b82f6" name="Infrastructure" />
                  <Bar dataKey="weather"        stackId="a" fill="#a855f7" radius={[3,3,0,0]} name="Weather" />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>

          {/* Row 5: Top reporters bar */}
          {topReportersData.length > 0 && (
            <Card className="p-5 bg-slate-900/80 border-white/10 rounded-[1.6rem]">
              <p className="text-xs font-black text-slate-400 uppercase tracking-[0.18em]">Top Community Reporters</p>
              <p className="text-[10px] text-slate-600 mb-4 mt-0.5">Most active community members by report count. Anonymous and API-sourced entries excluded.</p>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={topReportersData} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff06" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" width={90} tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #ffffff15', borderRadius: 12, fontSize: 11 }} itemStyle={{ color: '#fbbf24' }} cursor={{ fill: '#ffffff06' }} />
                  <Bar dataKey="count" name="Reports" fill="#f59e0b" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          )}

        </div>
        {/* ── End Analytics ──────────────────────────────────────────────────── */}

        <div className="grid lg:grid-cols-3 gap-4">
          <Card className="col-span-1 lg:col-span-2 p-5 bg-slate-900/80 border-white/10 rounded-[1.6rem] overflow-x-auto h-[420px]">
            <div className="flex items-center justify-between mb-4 pr-1">
              <div>
                <h2 className="text-base font-black flex items-center gap-2">
                  <Users size={15} className="text-violet-400" />
                  User Directory
                </h2>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  <span className="text-violet-400 font-black">{totalUsers}</span> total ·{' '}
                  <span className="text-[#4A90D9] font-black">{viewOnlyUsers}</span> view-only ·{' '}
                  <span className="text-[#2E8B7A] font-black">{adminUsers}</span> admin ·{' '}
                  <span className="text-amber-400 font-black">{uniqueReporterEmails}</span> reporters
                </p>
              </div>
              <Button variant="secondary" onClick={refreshUsers} disabled={isRefreshingUsers} className="h-8 px-2.5 text-[10px] uppercase font-bold tracking-widest bg-white/5 border-white/10 text-slate-300 hover:bg-white/10 hover:text-white" title="Force Refresh">
                <RefreshCw size={12} className={isRefreshingUsers ? "animate-spin" : ""} />
              </Button>
            </div>
            <div className="overflow-y-auto custom-scrollbar h-[320px] pr-2">
              <table className="w-full text-xs min-w-[500px]">
                <thead className="text-slate-400 bg-slate-900/90 top-0 sticky z-10">
                  <tr className="border-b border-white/8">
                    <th className="py-2.5 text-left pl-2 font-bold uppercase text-[9px] tracking-wider">UID</th>
                    <th className="py-2.5 text-left font-bold uppercase text-[9px] tracking-wider">Name</th>
                    <th className="py-2.5 text-left font-bold uppercase text-[9px] tracking-wider">Email</th>
                    <th className="py-2.5 text-left font-bold uppercase text-[9px] tracking-wider">Role</th>
                    <th className="py-2.5 text-left font-bold uppercase text-[9px] tracking-wider">Reports</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((profile) => {
                    // Match by authorUid (most reliable) or email fallback; exclude anonymous posts
                    const reportCount = incidents.filter(i =>
                      ((i as any).authorUid && (i as any).authorUid === profile.uid) ||
                      (i.email && i.email === profile.email && i.email !== 'anonymous@calgarywatch.app')
                    ).length;
                    return (
                      <tr key={profile.uid} className="border-b border-white/5 hover:bg-white/[0.03] transition-colors">
                        <td className="py-2.5 pl-2 text-slate-600 font-mono text-[10px]">{profile.uid.slice(0, 8)}…</td>
                        <td className="py-2.5 font-medium text-white text-xs">{profile.displayName || 'Unknown'}</td>
                        <td className="py-2.5 text-slate-400 text-[11px]">{profile.email || '—'}</td>
                        <td className="py-2.5">
                          <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest ${profile.role === 'admin' ? 'bg-[#2E8B7A]/20 border border-[#2E8B7A]/40 text-[#2E8B7A]' : 'bg-[#4A90D9]/10 border border-[#4A90D9]/20 text-[#4A90D9]'}`}>
                            {profile.role === 'admin' ? 'Admin' : 'View-Only'}
                          </span>
                        </td>
                        <td className="py-2.5">
                          {reportCount > 0
                            ? <span className="text-amber-400 font-black text-[11px]">{reportCount}</span>
                            : <span className="text-slate-600 text-[11px]">0</span>
                          }
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="col-span-1 p-5 bg-slate-900/80 border-white/10 rounded-[1.6rem] flex flex-col h-[420px]">
            <p className="text-xs font-black text-slate-400 uppercase tracking-[0.18em]">User Roles</p>
            <p className="text-[10px] text-slate-600 mb-2 mt-1">
              <span className="text-violet-400 font-black">{totalUsers}</span> total registered users across all roles.
            </p>
            {userRoleChartData.length === 0 ? (
              <p className="text-slate-600 text-xs py-8 text-center flex-1 flex items-center justify-center">No user data.</p>
            ) : (
              <div className="flex-1 flex flex-col min-h-0">
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={userRoleChartData} cx="50%" cy="50%" innerRadius={48} outerRadius={76} paddingAngle={3} dataKey="value" strokeWidth={0}>
                      {userRoleChartData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: '#0f172a', border: '1px solid #ffffff15', borderRadius: 12, fontSize: 11 }}
                      itemStyle={{ color: '#e2e8f0' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-col gap-2 mt-3">
                  {userRoleChartData.map((d) => (
                    <div key={d.name} className="flex items-center justify-between px-3 py-2 rounded-xl bg-white/3 border border-white/5">
                      <span className="flex items-center gap-2 text-xs text-slate-300">
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
        </div>

        

        <Card className="p-5 bg-slate-900/80 border-white/10 rounded-[1.6rem] overflow-x-auto">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold">Community Stats (Editable)</h2>
            <div className="flex flex-col items-end">
              <span className="text-[10px] uppercase tracking-[0.2em] font-black text-slate-500">City Intelligence</span>
              <span className="text-[10px] text-amber-500 md:hidden mt-0.5">Swipe table &rarr;</span>
            </div>
          </div>
          <table className="w-full text-xs min-w-[980px]">
            <thead className="text-slate-400">
              <tr className="border-b border-white/10">
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
                  community: row.community,
                  month: row.month,
                  violent_crime: row.violent_crime,
                  property_crime: row.property_crime,
                  disorder_calls: row.disorder_calls,
                  safety_score: row.safety_score,
                };

                return (
                  <tr key={row.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                    <td className="py-2 pr-2"><input className="w-full bg-slate-800/80 border border-white/10 rounded-xl p-2" value={draft.community} onChange={(e) => setStatsDraft(row, { community: e.target.value })} /></td>
                    <td className="py-2 pr-2"><input className="w-full bg-slate-800/80 border border-white/10 rounded-xl p-2" value={draft.month} onChange={(e) => setStatsDraft(row, { month: e.target.value })} /></td>
                    <td className="py-2 pr-2"><input type="number" className="w-full bg-slate-800/80 border border-white/10 rounded-xl p-2" value={draft.violent_crime} onChange={(e) => setStatsDraft(row, { violent_crime: Number(e.target.value) })} /></td>
                    <td className="py-2 pr-2"><input type="number" className="w-full bg-slate-800/80 border border-white/10 rounded-xl p-2" value={draft.property_crime} onChange={(e) => setStatsDraft(row, { property_crime: Number(e.target.value) })} /></td>
                    <td className="py-2 pr-2"><input type="number" className="w-full bg-slate-800/80 border border-white/10 rounded-xl p-2" value={draft.disorder_calls} onChange={(e) => setStatsDraft(row, { disorder_calls: Number(e.target.value) })} /></td>
                    <td className="py-2 pr-2"><input type="number" className="w-full bg-slate-800/80 border border-white/10 rounded-xl p-2" value={draft.safety_score} onChange={(e) => setStatsDraft(row, { safety_score: Number(e.target.value) })} /></td>
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
      </div>
    </div>
  );
}
