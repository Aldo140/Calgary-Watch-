import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/src/components/FirebaseProvider';
import { db } from '@/src/firebase';
import { Incident, CommunityStats } from '@/src/types';
import { collection, deleteDoc, doc, onSnapshot, orderBy, query, updateDoc } from 'firebase/firestore';
import { Button } from '@/src/components/ui/Button';
import { Card } from '@/src/components/ui/Card';
import { ArrowLeft, Loader2, Lock, Save, Trash2 } from 'lucide-react';

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

  useEffect(() => {
    if (!isAuthReady || !user || !isAdmin) return;

    const unsubIncidents = onSnapshot(
      query(collection(db, 'incidents'), orderBy('timestamp', 'desc')),
      (snapshot) => {
        const rows = snapshot.docs.map((row) => ({ id: row.id, ...row.data() })) as Incident[];
        setIncidents(rows);
        setLoadingData(false);
      }
    );

    const unsubStats = onSnapshot(collection(db, 'community_stats'), (snapshot) => {
      const rows = snapshot.docs.map((row) => ({ id: row.id, ...row.data() })) as (CommunityStats & { id: string })[];
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
  }, [isAuthReady, isAdmin, user]);

  const totalIncidents = incidents.length;
  const unresolvedIncidents = incidents.filter((i) => i.verified_status !== 'community_confirmed').length;
  const todayIncidents = incidents.filter((i) => Date.now() - i.timestamp < 24 * 60 * 60 * 1000).length;
  const uniqueReporterEmails = new Set(incidents.map((i) => i.email).filter(Boolean)).size;
  const averageSafety = useMemo(() => {
    if (communityStats.length === 0) return 0;
    return Math.round(communityStats.reduce((sum, row) => sum + Number(row.safety_score || 0), 0) / communityStats.length);
  }, [communityStats]);

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
    if (!draft) return;
    setSavingIncidentId(incidentId);
    try {
      await updateDoc(doc(db, 'incidents', incidentId), {
        ...draft,
        report_count: Number(draft.report_count || 0),
      });
    } finally {
      setSavingIncidentId(null);
    }
  };

  const saveCommunityStats = async (statsId: string) => {
    const draft = statsDrafts[statsId];
    if (!draft) return;
    setSavingStatsId(statsId);
    try {
      await updateDoc(doc(db, 'community_stats', statsId), {
        ...draft,
        violent_crime: Number(draft.violent_crime || 0),
        property_crime: Number(draft.property_crime || 0),
        disorder_calls: Number(draft.disorder_calls || 0),
        safety_score: Number(draft.safety_score || 0),
      });
    } finally {
      setSavingStatsId(null);
    }
  };

  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950 text-white p-6 flex items-center justify-center">
        <Card className="max-w-xl w-full p-8 space-y-4 bg-slate-900 border-white/10">
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
        <Card className="max-w-xl w-full p-8 space-y-4 bg-slate-900 border-red-500/40">
          <div className="flex items-center gap-2 text-red-400">
            <Lock size={18} />
            <h1 className="text-2xl font-black">Access denied</h1>
          </div>
          <p className="text-slate-300 text-sm">This portal is restricted to approved admin: `jorti104@mtroyal.ca`.</p>
          <Button variant="secondary" onClick={() => navigate('/map')} className="w-full">Back to map</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-wrap gap-3 items-center justify-between">
          <div>
            <h1 className="text-3xl font-black">Calgary Watch Admin</h1>
            <p className="text-sm text-slate-400 mt-1">Live control center for incidents, community stats, and user health.</p>
          </div>
          <Button variant="secondary" onClick={() => navigate('/map')} className="flex items-center gap-2">
            <ArrowLeft size={16} />
            Back to map
          </Button>
        </div>

        <div className="grid md:grid-cols-3 lg:grid-cols-6 gap-3">
          <Card className="p-4 bg-slate-900 border-white/10"><p className="text-xs text-slate-400">Total Incidents</p><p className="text-2xl font-black">{totalIncidents}</p></Card>
          <Card className="p-4 bg-slate-900 border-white/10"><p className="text-xs text-slate-400">Unresolved</p><p className="text-2xl font-black text-amber-400">{unresolvedIncidents}</p></Card>
          <Card className="p-4 bg-slate-900 border-white/10"><p className="text-xs text-slate-400">Last 24h</p><p className="text-2xl font-black text-blue-400">{todayIncidents}</p></Card>
          <Card className="p-4 bg-slate-900 border-white/10"><p className="text-xs text-slate-400">Reporter Emails</p><p className="text-2xl font-black">{uniqueReporterEmails}</p></Card>
          <Card className="p-4 bg-slate-900 border-white/10"><p className="text-xs text-slate-400">Stats Rows</p><p className="text-2xl font-black">{communityStats.length}</p></Card>
          <Card className="p-4 bg-slate-900 border-white/10"><p className="text-xs text-slate-400">Avg Safety</p><p className="text-2xl font-black text-emerald-400">{averageSafety}</p></Card>
        </div>

        <Card className="p-4 bg-slate-900 border-white/10 overflow-x-auto">
          <h2 className="text-lg font-bold mb-3">User Overview</h2>
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
                <tr key={profile.uid} className="border-b border-white/5">
                  <td className="py-2">{profile.displayName || 'Unknown'}</td>
                  <td className="py-2">{profile.email || 'No email'}</td>
                  <td className="py-2">{profile.role}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card className="p-4 bg-slate-900 border-white/10 overflow-x-auto">
          <h2 className="text-lg font-bold mb-3">Incidents (Editable)</h2>
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
                    <tr key={incident.id} className="border-b border-white/5 align-top">
                      <td className="py-2 pr-2"><input className="w-full bg-slate-800 border border-white/10 rounded p-2" value={draft.title} onChange={(e) => setIncidentDraft(incident, { title: e.target.value })} /></td>
                      <td className="py-2 pr-2">
                        <select className="w-full bg-slate-800 border border-white/10 rounded p-2" value={draft.category} onChange={(e) => setIncidentDraft(incident, { category: e.target.value as Incident['category'] })}>
                          <option value="crime">crime</option>
                          <option value="traffic">traffic</option>
                          <option value="infrastructure">infrastructure</option>
                          <option value="weather">weather</option>
                          <option value="gas">gas</option>
                        </select>
                      </td>
                      <td className="py-2 pr-2"><input className="w-full bg-slate-800 border border-white/10 rounded p-2" value={draft.neighborhood} onChange={(e) => setIncidentDraft(incident, { neighborhood: e.target.value })} /></td>
                      <td className="py-2 pr-2">
                        <select className="w-full bg-slate-800 border border-white/10 rounded p-2" value={draft.verified_status} onChange={(e) => setIncidentDraft(incident, { verified_status: e.target.value as Incident['verified_status'] })}>
                          <option value="unverified">unverified</option>
                          <option value="multiple_reports">multiple_reports</option>
                          <option value="community_confirmed">community_confirmed</option>
                        </select>
                      </td>
                      <td className="py-2 pr-2"><input type="number" className="w-24 bg-slate-800 border border-white/10 rounded p-2" value={draft.report_count} onChange={(e) => setIncidentDraft(incident, { report_count: Number(e.target.value) })} /></td>
                      <td className="py-2 pr-2"><textarea className="w-full h-20 bg-slate-800 border border-white/10 rounded p-2" value={draft.description} onChange={(e) => setIncidentDraft(incident, { description: e.target.value })} /></td>
                      <td className="py-2 pr-2">
                        <input className="w-full bg-slate-800 border border-white/10 rounded p-2 mb-2" placeholder="Source name" value={draft.source_name || ''} onChange={(e) => setIncidentDraft(incident, { source_name: e.target.value })} />
                        <input className="w-full bg-slate-800 border border-white/10 rounded p-2" placeholder="Source URL" value={draft.source_url || ''} onChange={(e) => setIncidentDraft(incident, { source_url: e.target.value })} />
                      </td>
                      <td className="py-2 flex gap-2">
                        <Button onClick={() => saveIncident(incident.id)} className="h-9 px-3 text-xs" disabled={savingIncidentId === incident.id}>
                          {savingIncidentId === incident.id ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                        </Button>
                        <Button variant="secondary" onClick={() => deleteDoc(doc(db, 'incidents', incident.id))} className="h-9 px-3 text-xs text-red-400 border-red-500/30 hover:bg-red-500/10">
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

        <Card className="p-4 bg-slate-900 border-white/10 overflow-x-auto">
          <h2 className="text-lg font-bold mb-3">Community Stats (Editable)</h2>
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
                  <tr key={row.id} className="border-b border-white/5">
                    <td className="py-2 pr-2"><input className="w-full bg-slate-800 border border-white/10 rounded p-2" value={draft.community} onChange={(e) => setStatsDraft(row, { community: e.target.value })} /></td>
                    <td className="py-2 pr-2"><input className="w-full bg-slate-800 border border-white/10 rounded p-2" value={draft.month} onChange={(e) => setStatsDraft(row, { month: e.target.value })} /></td>
                    <td className="py-2 pr-2"><input type="number" className="w-full bg-slate-800 border border-white/10 rounded p-2" value={draft.violent_crime} onChange={(e) => setStatsDraft(row, { violent_crime: Number(e.target.value) })} /></td>
                    <td className="py-2 pr-2"><input type="number" className="w-full bg-slate-800 border border-white/10 rounded p-2" value={draft.property_crime} onChange={(e) => setStatsDraft(row, { property_crime: Number(e.target.value) })} /></td>
                    <td className="py-2 pr-2"><input type="number" className="w-full bg-slate-800 border border-white/10 rounded p-2" value={draft.disorder_calls} onChange={(e) => setStatsDraft(row, { disorder_calls: Number(e.target.value) })} /></td>
                    <td className="py-2 pr-2"><input type="number" className="w-full bg-slate-800 border border-white/10 rounded p-2" value={draft.safety_score} onChange={(e) => setStatsDraft(row, { safety_score: Number(e.target.value) })} /></td>
                    <td className="py-2 flex gap-2">
                      <Button onClick={() => saveCommunityStats(row.id)} className="h-9 px-3 text-xs" disabled={savingStatsId === row.id}>
                        {savingStatsId === row.id ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                      </Button>
                      <Button variant="secondary" onClick={() => deleteDoc(doc(db, 'community_stats', row.id))} className="h-9 px-3 text-xs text-red-400 border-red-500/30 hover:bg-red-500/10">
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
