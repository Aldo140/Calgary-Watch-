import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { collection, deleteDoc, doc, limit, onSnapshot, orderBy, query, updateDoc } from 'firebase/firestore';
import { ArrowLeft, Code2, Eye, FileText, Image, Loader2, Lock, Save, Search, ShieldAlert, Trash2, UserRound } from 'lucide-react';
import { useAuth } from '@/src/components/FirebaseProvider';
import { Button } from '@/src/components/ui/Button';
import { Card } from '@/src/components/ui/Card';
import { db, isFirebaseConfigured } from '@/src/firebase';
import { Incident, IncidentCategory } from '@/src/types';
import { cn } from '@/src/lib/utils';

type UserProfile = {
  uid: string;
  email: string;
  displayName: string;
  role: 'user' | 'admin';
};

type IncidentDraft = Pick<Incident, 'title' | 'description' | 'category' | 'neighborhood' | 'verified_status' | 'report_count'>;

function AdminGuard({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const { user, signIn, isAuthReady, isAdmin } = useAuth();

  if (!isAuthReady) return <div className="min-h-screen bg-[#f5efe3] text-slate-900 flex items-center justify-center"><Loader2 className="animate-spin" /></div>;
  if (!isFirebaseConfigured) return <div className="min-h-screen bg-[#f5efe3] p-6 flex items-center justify-center"><Card className="max-w-xl w-full p-8 bg-white border-slate-200"><h1 className="text-2xl font-black text-slate-900">Admin unavailable</h1><p className="mt-2 text-sm text-slate-600">Firebase is not configured.</p><Button onClick={() => navigate('/map')} className="mt-4 w-full">Back to map</Button></Card></div>;
  if (!user) return <div className="min-h-screen bg-[#f5efe3] p-6 flex items-center justify-center"><Card className="max-w-xl w-full p-8 bg-white border-slate-200"><h1 className="text-2xl font-black text-slate-900">Admin Portal</h1><p className="mt-2 text-sm text-slate-600">Sign in with an approved admin account.</p><Button onClick={signIn} className="mt-4 w-full">Sign in</Button></Card></div>;
  if (!isAdmin) return <div className="min-h-screen bg-[#f5efe3] p-6 flex items-center justify-center"><Card className="max-w-xl w-full p-8 bg-white border-red-200"><div className="flex items-center gap-2 text-red-600"><Lock size={18} /><h1 className="text-2xl font-black">Access denied</h1></div><Button variant="secondary" onClick={() => navigate('/map')} className="mt-4 w-full">Back to map</Button></Card></div>;

  return <>{children}</>;
}

function formatDateTime(ts?: number) {
  if (!ts) return 'No timestamp';
  return new Date(ts).toLocaleString('en-CA', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const categories: IncidentCategory[] = ['emergency', 'crime', 'traffic', 'infrastructure', 'weather'];
const statuses: Incident['verified_status'][] = ['unverified', 'pending_review', 'multiple_reports', 'community_confirmed'];

export default function AdminIncidentListPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'community' | 'official' | 'anonymous' | 'images'>('all');
  const [sort, setSort] = useState<'newest' | 'oldest' | 'status' | 'reports'>('newest');
  const [drafts, setDrafts] = useState<Record<string, IncidentDraft>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [rawView, setRawView] = useState(false);

  useEffect(() => {
    if (!db) return;
    const unsubIncidents = onSnapshot(query(collection(db, 'incidents'), orderBy('timestamp', 'desc'), limit(300)), (snapshot) => {
      const rows = snapshot.docs.map((row) => ({ id: row.id, ...row.data() } as Incident)).filter((row) => row.deleted !== true);
      setIncidents(rows);
      setSelectedId((current) => current || rows[0]?.id || null);
    });
    const unsubUsers = onSnapshot(query(collection(db, 'users'), limit(200)), (snapshot) => {
      setUsers(snapshot.docs.map((row) => ({ uid: row.id, ...row.data() } as UserProfile)));
    });
    return () => { unsubIncidents(); unsubUsers(); };
  }, []);

  const uidFilter = params.get('uid');

  const userByKey = useMemo(() => {
    const map = new globalThis.Map<string, UserProfile>();
    users.forEach((profile) => {
      map.set(profile.uid, profile);
      if (profile.email) map.set(profile.email, profile);
    });
    return map;
  }, [users]);

  const enrichedIncidents = useMemo(() => incidents.map((incident) => {
    const reporter = userByKey.get(incident.authorUid || '') || userByKey.get(incident.email || '');
    const searchBlob = [
      incident.title,
      incident.description,
      incident.neighborhood,
      incident.name,
      incident.email,
      reporter?.displayName,
      reporter?.email,
      incident.category,
      incident.verified_status,
    ].join(' ').toLowerCase();
    return { ...incident, reporter, searchBlob };
  }), [incidents, userByKey]);

  const filteredIncidents = useMemo(() => {
    const q = search.toLowerCase().trim();
    return enrichedIncidents
      .filter((incident) => {
        const matchesUid = !uidFilter || incident.authorUid === uidFilter;
        const matchesCategory = !categoryFilter || incident.category === categoryFilter;
        const matchesStatus = !statusFilter || incident.verified_status === statusFilter;
        const matchesSource =
          sourceFilter === 'community' ? (!incident.data_source || incident.data_source === 'community') :
          sourceFilter === 'official' ? incident.data_source === 'official' :
          sourceFilter === 'anonymous' ? Boolean(incident.anonymous) :
          sourceFilter === 'images' ? Boolean(incident.image_url) :
          true;
        const matchesSearch = !q || incident.searchBlob.includes(q);
        return matchesUid && matchesCategory && matchesStatus && matchesSource && matchesSearch;
      })
      .sort((a, b) => {
        if (sort === 'newest') return b.timestamp - a.timestamp;
        if (sort === 'oldest') return a.timestamp - b.timestamp;
        if (sort === 'reports') return (b.report_count || 0) - (a.report_count || 0);
        return a.verified_status.localeCompare(b.verified_status);
      });
  }, [enrichedIncidents, search, categoryFilter, statusFilter, sourceFilter, sort, uidFilter]);

  const selectedIncident = filteredIncidents.find((incident) => incident.id === selectedId) || filteredIncidents[0] || null;
  const incidentStats = useMemo(() => ({
    total: incidents.length,
    pending: incidents.filter((incident) => incident.verified_status !== 'community_confirmed').length,
    anonymous: incidents.filter((incident) => incident.anonymous).length,
    images: incidents.filter((incident) => incident.image_url).length,
  }), [incidents]);

  const getDraft = (incident: Incident): IncidentDraft => drafts[incident.id] || {
    title: incident.title,
    description: incident.description,
    category: incident.category,
    neighborhood: incident.neighborhood,
    verified_status: incident.verified_status,
    report_count: incident.report_count || 1,
  };

  const patchDraft = (incident: Incident, patch: Partial<IncidentDraft>) => {
    setDrafts((prev) => ({ ...prev, [incident.id]: { ...getDraft(incident), ...patch } }));
  };

  const saveIncident = async (incident: Incident) => {
    if (!db) return;
    setSavingId(incident.id);
    try {
      await updateDoc(doc(db, 'incidents', incident.id), { ...getDraft(incident), report_count: Number(getDraft(incident).report_count || 0) });
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[incident.id];
        return next;
      });
    } finally {
      setSavingId(null);
    }
  };

  const deleteIncident = async (incident: Incident) => {
    if (!db || !window.confirm(`Delete "${incident.title}" permanently?`)) return;
    await deleteDoc(doc(db, 'incidents', incident.id));
  };

  const reporter = selectedIncident ? selectedIncident.reporter : null;
  const draft = selectedIncident ? getDraft(selectedIncident) : null;

  return (
    <AdminGuard>
      <div className="min-h-screen bg-[#f5efe3] text-slate-900">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-[#fffaf2]/90 backdrop-blur-xl px-4 py-4">
          <div className="mx-auto flex max-w-7xl flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <Button variant="secondary" onClick={() => navigate('/admin')} className="h-9 border-slate-200 bg-white text-slate-700"><ArrowLeft size={14} /> Admin</Button>
              <div>
                <h1 className="text-lg font-black">Full Incident List</h1>
                <p className="text-xs text-slate-600">{filteredIncidents.length} of {incidents.length} incidents · newest first by default</p>
              </div>
            </div>
            <div className="flex flex-col gap-2 lg:flex-row">
              <div className="relative min-w-0">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search title, area, reporter..." className="h-10 w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-slate-900 lg:w-72" />
              </div>
              <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-slate-900">
                <option value="">All categories</option>
                {categories.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-slate-900">
                <option value="">All statuses</option>
                {statuses.map((status) => <option key={status} value={status}>{status.replace('_', ' ')}</option>)}
              </select>
              <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value as any)} className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-slate-900">
                <option value="all">All sources</option>
                <option value="community">Community</option>
                <option value="official">Official</option>
                <option value="anonymous">Anonymous</option>
                <option value="images">With images</option>
              </select>
              <select value={sort} onChange={(e) => setSort(e.target.value as any)} className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-slate-900">
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="reports">Most reports</option>
                <option value="status">Status</option>
              </select>
            </div>
          </div>
        </header>

        <main className="mx-auto grid max-w-7xl gap-4 px-4 py-5">
          <section className="grid gap-3 sm:grid-cols-4">
            {[
              { label: 'Incidents', value: incidentStats.total, icon: FileText, tone: 'text-slate-900' },
              { label: 'Unresolved', value: incidentStats.pending, icon: ShieldAlert, tone: 'text-amber-700' },
              { label: 'Anonymous', value: incidentStats.anonymous, icon: UserRound, tone: 'text-violet-700' },
              { label: 'Images', value: incidentStats.images, icon: Image, tone: 'text-sky-700' },
            ].map(({ label, value, icon: Icon, tone }) => (
              <Card key={label} className="rounded-2xl border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</p>
                  <Icon size={15} className={tone} />
                </div>
                <p className={cn('mt-2 text-3xl font-black', tone)}>{value}</p>
              </Card>
            ))}
          </section>

          {uidFilter && (
            <Card className="rounded-2xl border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
              Showing posts for user UID <span className="font-mono font-black">{uidFilter}</span>.
              <button onClick={() => navigate('/admin/incidents')} className="ml-2 font-black underline">Clear user filter</button>
            </Card>
          )}

          <section className="grid gap-4 lg:grid-cols-[25rem_1fr]">
          <div className="space-y-3 lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto lg:pr-1">
            {filteredIncidents.length === 0 && (
              <Card className="rounded-2xl border-slate-200 bg-white p-6 text-center text-sm text-slate-500">No incidents match your filters.</Card>
            )}
            {filteredIncidents.map((incident) => (
              <button key={incident.id} onClick={() => setSelectedId(incident.id)} className={cn('w-full rounded-2xl border bg-white p-4 text-left shadow-sm transition-all', selectedIncident?.id === incident.id ? 'border-slate-900 ring-2 ring-slate-900/10' : 'border-slate-200 hover:border-slate-300')}>
                <div className="flex items-start gap-3">
                  {incident.image_url && <img src={incident.image_url} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover" loading="lazy" />}
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm font-black">{incident.title}</p>
                    <p className="mt-1 truncate text-xs text-slate-600">{incident.neighborhood || 'Calgary'} · {formatDateTime(incident.timestamp)}</p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black uppercase text-slate-700">{incident.category}</span>
                  <span className="rounded-full bg-sky-50 px-2 py-1 text-[10px] font-black uppercase text-sky-700">{incident.verified_status.replace('_', ' ')}</span>
                  {incident.anonymous && <span className="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-black uppercase text-amber-700">Anonymous</span>}
                </div>
              </button>
            ))}
          </div>

          <section className="min-w-0">
            {selectedIncident && draft ? (
              <Card className="overflow-hidden rounded-2xl border-slate-200 bg-white">
                <div className="border-b border-slate-200 p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h2 className="text-xl font-black">{selectedIncident.title}</h2>
                      <p className="text-sm text-slate-600">{selectedIncident.neighborhood} · {formatDateTime(selectedIncident.timestamp)} · reporter: {selectedIncident.anonymous ? 'Anonymous' : reporter?.displayName || selectedIncident.name || selectedIncident.email || 'Unknown'}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="secondary" onClick={() => setRawView((value) => !value)} className="h-9 border-slate-200 bg-white text-slate-700">{rawView ? <Eye size={14} /> : <Code2 size={14} />}{rawView ? 'Structured' : 'Raw'}</Button>
                      <Button variant="secondary" onClick={() => deleteIncident(selectedIncident)} className="h-9 border-red-200 bg-red-50 text-red-700"><Trash2 size={14} />Delete</Button>
                    </div>
                  </div>
                </div>

                {rawView ? (
                  <pre className="max-h-[70vh] overflow-auto bg-slate-950 p-5 text-xs text-slate-100">{JSON.stringify({ incident: selectedIncident, reporter }, null, 2)}</pre>
                ) : (
                  <div className="grid gap-5 p-5">
                    {selectedIncident.image_url && <img src={selectedIncident.image_url} alt="" className="max-h-96 w-full rounded-2xl object-cover" />}
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="rounded-2xl bg-slate-50 p-4"><p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Anonymous</p><p className="mt-2 text-sm font-black">{selectedIncident.anonymous ? 'Yes' : 'No'}</p></div>
                      <div className="rounded-2xl bg-slate-50 p-4"><p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Source</p><p className="mt-2 text-sm font-black">{selectedIncident.data_source || 'community'}</p></div>
                      <div className="rounded-2xl bg-slate-50 p-4"><p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Coordinates</p><p className="mt-2 font-mono text-xs">{selectedIncident.lat}, {selectedIncident.lng}</p></div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Reporter Detail</p>
                      <div className="mt-2 grid gap-2 text-sm sm:grid-cols-3">
                        <p className="truncate"><span className="font-black">Name:</span> {selectedIncident.anonymous ? 'Anonymous on note' : reporter?.displayName || selectedIncident.name || 'Unknown'}</p>
                        <p className="truncate"><span className="font-black">Email:</span> {reporter?.email || selectedIncident.email || 'Unknown'}</p>
                        <p className="truncate"><span className="font-black">UID:</span> {selectedIncident.authorUid || reporter?.uid || 'Unknown'}</p>
                      </div>
                    </div>

                    <div className="grid gap-3">
                      <input value={draft.title} onChange={(e) => patchDraft(selectedIncident, { title: e.target.value })} className="h-11 rounded-2xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-slate-900" />
                      <textarea value={draft.description} onChange={(e) => patchDraft(selectedIncident, { description: e.target.value })} className="h-28 rounded-2xl border border-slate-300 bg-white p-3 text-sm outline-none focus:border-slate-900" />
                      <div className="grid gap-3 sm:grid-cols-4">
                        <select value={draft.category} onChange={(e) => patchDraft(selectedIncident, { category: e.target.value as IncidentCategory })} className="h-11 rounded-2xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-slate-900">{categories.map((category) => <option key={category} value={category}>{category}</option>)}</select>
                        <select value={draft.verified_status} onChange={(e) => patchDraft(selectedIncident, { verified_status: e.target.value as Incident['verified_status'] })} className="h-11 rounded-2xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-slate-900">{statuses.map((status) => <option key={status} value={status}>{status}</option>)}</select>
                        <input value={draft.neighborhood} onChange={(e) => patchDraft(selectedIncident, { neighborhood: e.target.value })} className="h-11 rounded-2xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-slate-900" />
                        <input type="number" value={draft.report_count} onChange={(e) => patchDraft(selectedIncident, { report_count: Number(e.target.value) })} className="h-11 rounded-2xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-slate-900" />
                      </div>
                      <Button onClick={() => saveIncident(selectedIncident)} disabled={savingId === selectedIncident.id} className="h-11 rounded-2xl"><Save size={14} />{savingId === selectedIncident.id ? 'Saving...' : 'Save Incident'}</Button>
                    </div>
                  </div>
                )}
              </Card>
            ) : (
              <Card className="rounded-2xl border-slate-200 bg-white p-10 text-center text-slate-500">No incidents match your filters.</Card>
            )}
          </section>
          </section>
        </main>
      </div>
    </AdminGuard>
  );
}
