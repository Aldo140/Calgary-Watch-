import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/src/components/FirebaseProvider';
import { db, isFirebaseConfigured } from '@/src/firebase';
import { Incident, CommunityStats } from '@/src/types';
import { addDoc, collection, doc, onSnapshot, orderBy, query, updateDoc } from 'firebase/firestore';
import { Button } from '@/src/components/ui/Button';
import { Card } from '@/src/components/ui/Card';
import { ArrowLeft, Loader2, Lock, Save, Trash2, Activity, AlertTriangle, Clock3, Users, ShieldCheck, ChartNoAxesColumn, Sparkles } from 'lucide-react';
import {
  ResponsiveContainer,
  PieChart, Pie, Cell,
  AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar, Legend,
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

    return () => {
      unsubIncidents();
      unsubStats();
      unsubUsers();
    };
  }, [isAuthReady, isAdmin, user, db]);

  const totalIncidents = incidents.length;
  const unresolvedIncidents = incidents.filter((i) => i.verified_status !== 'community_confirmed').length;
  const todayIncidents = incidents.filter((i) => Date.now() - i.timestamp < 24 * 60 * 60 * 1000).length;
  const uniqueReporterEmails = new Set(incidents.map((i) => i.email).filter(Boolean)).size;
  const averageSafety = useMemo(() => {
    if (communityStats.length === 0) return 0;
    return Math.round(communityStats.reduce((sum, row) => sum + Number(row.safety_score || 0), 0) / communityStats.length);
  }, [communityStats]);

  // ── Chart data ──────────────────────────────────────────────────────────────

  const categoryChartData = useMemo(() => {
    const counts: Record<string, number> = {};
    incidents.forEach((i) => { counts[i.category] = (counts[i.category] ?? 0) + 1; });
    return [
      { name: 'Crime',          value: counts['crime']          ?? 0, color: '#ef4444' },
      { name: 'Traffic',        value: counts['traffic']        ?? 0, color: '#f97316' },
      { name: 'Infrastructure', value: counts['infrastructure'] ?? 0, color: '#3b82f6' },
      { name: 'Weather',        value: counts['weather']        ?? 0, color: '#a855f7' },
      { name: 'Gas',            value: counts['gas']            ?? 0, color: '#10b981' },
    ].filter((d) => d.value > 0);
  }, [incidents]);

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

    await updateDoc(doc(db, 'incidents', incidentId), {
      deleted: true,
      deletedAt: Date.now(),
      deletedBy: user.uid,
    });
    await writeAuditLog('incident_soft_delete', 'incidents', incidentId, { deleted: true });
  };

  const softDeleteCommunityStats = async (statsId: string) => {
    if (!user || !db) return;
    const confirmed = window.confirm('Soft-delete this community stats row?');
    if (!confirmed) return;

    await updateDoc(doc(db, 'community_stats', statsId), {
      deleted: true,
      deletedAt: Date.now(),
      deletedBy: user.uid,
    });
    await writeAuditLog('community_stats_soft_delete', 'community_stats', statsId, { deleted: true });
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
        <div className="absolute -top-48 -left-32 w-[36rem] h-[36rem] rounded-full bg-blue-600/10 blur-[140px]" />
        <div className="absolute -bottom-56 right-0 w-[32rem] h-[32rem] rounded-full bg-indigo-600/10 blur-[140px]" />
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
          <Button variant="secondary" onClick={() => navigate('/map')} className="flex items-center gap-2">
            <ArrowLeft size={16} />
            Back to map
          </Button>
        </div>

        <div className="grid md:grid-cols-3 lg:grid-cols-6 gap-3">
          <Card className="p-4 bg-slate-900/80 border-white/10 rounded-2xl hover:border-blue-400/40 transition-all">
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-400">Total Incidents</p>
              <Activity size={14} className="text-blue-400" />
            </div>
            <p className="text-2xl font-black mt-2">{totalIncidents}</p>
            <p className="text-[10px] text-slate-600 mt-1 leading-tight">All active reports in the system (soft-deleted excluded)</p>
          </Card>
          <Card className="p-4 bg-slate-900/80 border-white/10 rounded-2xl hover:border-amber-400/40 transition-all">
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-400">Unresolved</p>
              <AlertTriangle size={14} className="text-amber-400" />
            </div>
            <p className="text-2xl font-black text-amber-400 mt-2">{unresolvedIncidents}</p>
            <p className="text-[10px] text-slate-600 mt-1 leading-tight">Reports not yet marked community-confirmed · your moderation backlog</p>
          </Card>
          <Card className="p-4 bg-slate-900/80 border-white/10 rounded-2xl hover:border-blue-400/40 transition-all">
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-400">Last 24h</p>
              <Clock3 size={14} className="text-blue-400" />
            </div>
            <p className="text-2xl font-black text-blue-400 mt-2">{todayIncidents}</p>
            <p className="text-[10px] text-slate-600 mt-1 leading-tight">New reports submitted in the past 24 hours · measures daily activity</p>
          </Card>
          <Card className="p-4 bg-slate-900/80 border-white/10 rounded-2xl hover:border-violet-400/40 transition-all">
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-400">Reporter Emails</p>
              <Users size={14} className="text-violet-400" />
            </div>
            <p className="text-2xl font-black mt-2">{uniqueReporterEmails}</p>
            <p className="text-[10px] text-slate-600 mt-1 leading-tight">Distinct contributors by email · excludes anonymous posts</p>
          </Card>
          <Card className="p-4 bg-slate-900/80 border-white/10 rounded-2xl hover:border-cyan-400/40 transition-all">
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-400">Stats Rows</p>
              <ChartNoAxesColumn size={14} className="text-cyan-400" />
            </div>
            <p className="text-2xl font-black mt-2">{communityStats.length}</p>
            <p className="text-[10px] text-slate-600 mt-1 leading-tight">Neighborhood crime statistic records powering Area Intelligence</p>
          </Card>
          <Card className="p-4 bg-slate-900/80 border-white/10 rounded-2xl hover:border-emerald-400/40 transition-all">
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-400">Avg Safety</p>
              <ShieldCheck size={14} className="text-emerald-400" />
            </div>
            <p className="text-2xl font-black text-emerald-400 mt-2">{averageSafety}</p>
            <p className="text-[10px] text-slate-600 mt-1 leading-tight">Mean safety score (0-100) across all tracked neighborhoods · higher is safer</p>
          </Card>
        </div>

        {/* ── Analytics ─────────────────────────────────────────────────────── */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <ChartNoAxesColumn size={15} className="text-blue-400" />
            <span className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Analytics</span>
          </div>

          {/* Row 1: Incidents over time — full width */}
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

          {/* Row 3: Community safety breakdown — full width */}
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
        </div>
        {/* ── End Analytics ──────────────────────────────────────────────────── */}

        <Card className="p-5 bg-slate-900/80 border-white/10 rounded-[1.6rem] overflow-x-auto">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold">User Overview</h2>
            <span className="text-[10px] uppercase tracking-[0.2em] font-black text-slate-500">Live Directory</span>
          </div>
          <table className="w-full text-xs min-w-[720px]">
            <thead className="text-slate-400">
              <tr className="border-b border-white/10">
                <th className="py-2 text-left">Name</th>
                <th className="py-2 text-left">Email</th>
                <th className="py-2 text-left">Role</th>
              </tr>
            </thead>
            <tbody>
              {users.map((profile) => (
                <tr key={profile.uid} className="border-b border-white/5 hover:bg-white/[0.03] transition-colors">
                  <td className="py-2">{profile.displayName || 'Unknown'}</td>
                  <td className="py-2">{profile.email || 'No email'}</td>
                  <td className="py-2">
                    <span className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wide ${profile.role === 'admin' ? 'bg-blue-500/20 text-blue-400' : 'bg-white/10 text-slate-300'}`}>
                      {profile.role}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card className="p-5 bg-slate-900/80 border-white/10 rounded-[1.6rem] overflow-x-auto">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold">Incidents (Editable)</h2>
            <span className="text-[10px] uppercase tracking-[0.2em] font-black text-slate-500">Moderation Queue</span>
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

        <Card className="p-5 bg-slate-900/80 border-white/10 rounded-[1.6rem] overflow-x-auto">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold">Community Stats (Editable)</h2>
            <span className="text-[10px] uppercase tracking-[0.2em] font-black text-slate-500">City Intelligence</span>
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
