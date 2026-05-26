import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, deleteDoc, doc, limit, onSnapshot, orderBy, query, updateDoc } from 'firebase/firestore';
import { ArrowLeft, Code2, Eye, FileText, Loader2, Lock, Save, Search, ShieldCheck, Trash2, Users } from 'lucide-react';
import { useAuth } from '@/src/components/FirebaseProvider';
import { Button } from '@/src/components/ui/Button';
import { Card } from '@/src/components/ui/Card';
import { db, isFirebaseConfigured } from '@/src/firebase';
import { Incident } from '@/src/types';
import { cn } from '@/src/lib/utils';

type UserProfile = {
  uid: string;
  email: string;
  displayName: string;
  role: 'user' | 'admin';
  createdAt?: number;
  updatedAt?: number;
  notes?: string;
};

function AdminGuard({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const { user, signIn, isAuthReady, isAdmin } = useAuth();

  if (!isAuthReady) return <div className="min-h-screen bg-[#f5efe3] light:bg-[#f5efe3] text-slate-900 flex items-center justify-center"><Loader2 className="animate-spin" /></div>;
  if (!isFirebaseConfigured) return <div className="min-h-screen bg-[#f5efe3] p-6 flex items-center justify-center"><Card className="max-w-xl w-full p-8 bg-white border-slate-200"><h1 className="text-2xl font-black text-slate-900">Admin unavailable</h1><p className="mt-2 text-sm text-slate-600">Firebase is not configured.</p><Button onClick={() => navigate('/map')} className="mt-4 w-full">Back to map</Button></Card></div>;
  if (!user) return <div className="min-h-screen bg-[#f5efe3] p-6 flex items-center justify-center"><Card className="max-w-xl w-full p-8 bg-white border-slate-200"><h1 className="text-2xl font-black text-slate-900">Admin Portal</h1><p className="mt-2 text-sm text-slate-600">Sign in with an approved admin account.</p><Button onClick={signIn} className="mt-4 w-full">Sign in</Button></Card></div>;
  if (!isAdmin) return <div className="min-h-screen bg-[#f5efe3] p-6 flex items-center justify-center"><Card className="max-w-xl w-full p-8 bg-white border-red-200"><div className="flex items-center gap-2 text-red-600"><Lock size={18} /><h1 className="text-2xl font-black">Access denied</h1></div><Button variant="secondary" onClick={() => navigate('/map')} className="mt-4 w-full">Back to map</Button></Card></div>;

  return <>{children}</>;
}

function coerceTimestamp(value: unknown): number {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object') {
    const maybeTimestamp = value as { toMillis?: () => number; seconds?: number };
    if (typeof maybeTimestamp.toMillis === 'function') return maybeTimestamp.toMillis();
    if (typeof maybeTimestamp.seconds === 'number') return maybeTimestamp.seconds * 1000;
  }
  return 0;
}

function formatDateTime(ts?: number) {
  if (!ts) return 'No timestamp stored';
  return new Date(ts).toLocaleString('en-CA', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function AdminUserListPage() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'newest' | 'oldest' | 'name' | 'reports'>('newest');
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'user' | 'reporters'>('all');
  const [draftNotes, setDraftNotes] = useState<Record<string, string>>({});
  const [draftProfiles, setDraftProfiles] = useState<Record<string, Pick<UserProfile, 'displayName' | 'role'>>>({});
  const [savingUid, setSavingUid] = useState<string | null>(null);
  const [rawView, setRawView] = useState(false);

  useEffect(() => {
    if (!db) return;
    const unsubUsers = onSnapshot(query(collection(db, 'users'), limit(200)), (snapshot) => {
      const rows = snapshot.docs.map((row) => ({ uid: row.id, ...row.data() } as UserProfile));
      setUsers(rows);
      setSelectedUid((current) => current || rows[0]?.uid || null);
    });
    const unsubIncidents = onSnapshot(query(collection(db, 'incidents'), orderBy('timestamp', 'desc'), limit(300)), (snapshot) => {
      setIncidents(snapshot.docs.map((row) => ({ id: row.id, ...row.data() } as Incident)).filter((row) => row.deleted !== true));
    });
    return () => { unsubUsers(); unsubIncidents(); };
  }, []);

  const reportsByUserKey = useMemo(() => {
    const map = new globalThis.Map<string, Incident[]>();
    incidents.forEach((incident) => {
      const keys = [incident.authorUid, incident.email && incident.email !== 'anonymous@calgarywatch.app' ? incident.email : null].filter(Boolean) as string[];
      keys.forEach((key) => {
        const bucket = map.get(key) || [];
        bucket.push(incident);
        map.set(key, bucket);
      });
    });
    return map;
  }, [incidents]);

  const enrichedUsers = useMemo(() => users.map((profile) => {
    const byUid = reportsByUserKey.get(profile.uid) || [];
    const byEmail = reportsByUserKey.get(profile.email) || [];
    const reportMap = new globalThis.Map([...byUid, ...byEmail].map((incident) => [incident.id, incident]));
    const reports = [...reportMap.values()].sort((a, b) => b.timestamp - a.timestamp);
    const firstReport = reports.length ? Math.min(...reports.map((incident) => incident.timestamp)) : 0;
    const joinedAt = coerceTimestamp(profile.createdAt) || coerceTimestamp(profile.updatedAt) || firstReport || 0;
    const anonymousCount = reports.filter((incident) => incident.anonymous).length;
    const searchBlob = [profile.displayName, profile.email, profile.notes, ...reports.map((incident) => `${incident.title} ${incident.description} ${incident.neighborhood}`)]
      .join(' ')
      .toLowerCase();
    return { ...profile, joinedAt, reports, anonymousCount, searchBlob };
  }), [users, reportsByUserKey]);

  const filteredUsers = useMemo(() => {
    const q = search.toLowerCase().trim();
    return enrichedUsers
      .filter((profile) => {
        if (roleFilter === 'admin' && profile.role !== 'admin') return false;
        if (roleFilter === 'user' && profile.role === 'admin') return false;
        if (roleFilter === 'reporters' && profile.reports.length === 0) return false;
        if (!q) return true;
        return profile.searchBlob.includes(q);
      })
      .sort((a, b) => {
        if (sort === 'newest') return b.joinedAt - a.joinedAt;
        if (sort === 'oldest') return a.joinedAt - b.joinedAt;
        if (sort === 'reports') return b.reports.length - a.reports.length;
        return (a.displayName || a.email || '').localeCompare(b.displayName || b.email || '');
      });
  }, [enrichedUsers, search, sort, roleFilter]);

  const selectedUser = filteredUsers.find((profile) => profile.uid === selectedUid) || filteredUsers[0] || null;
  const userStats = useMemo(() => ({
    total: users.length,
    admins: users.filter((profile) => profile.role === 'admin').length,
    reporters: enrichedUsers.filter((profile) => profile.reports.length > 0).length,
    notes: incidents.length,
  }), [users, enrichedUsers, incidents.length]);

  const saveNotes = async (profile: UserProfile) => {
    if (!db) return;
    setSavingUid(profile.uid);
    try {
      await updateDoc(doc(db, 'users', profile.uid), { notes: draftNotes[profile.uid] ?? profile.notes ?? '' });
    } finally {
      setSavingUid(null);
    }
  };

  const saveProfile = async (profile: UserProfile) => {
    if (!db) return;
    const draft = draftProfiles[profile.uid] || { displayName: profile.displayName || '', role: profile.role || 'user' };
    setSavingUid(profile.uid);
    try {
      await updateDoc(doc(db, 'users', profile.uid), draft);
      setDraftProfiles((prev) => {
        const next = { ...prev };
        delete next[profile.uid];
        return next;
      });
    } finally {
      setSavingUid(null);
    }
  };

  const deleteUser = async (profile: UserProfile) => {
    if (!db || !window.confirm(`Delete ${profile.displayName || profile.email || 'this user'} from the user directory?`)) return;
    await deleteDoc(doc(db, 'users', profile.uid));
  };

  return (
    <AdminGuard>
      <div className="min-h-screen bg-[#f5efe3] light:bg-[#f5efe3] text-slate-900">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-[#fffaf2]/90 backdrop-blur-xl px-4 py-4">
          <div className="mx-auto flex max-w-7xl flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <Button variant="secondary" onClick={() => navigate('/admin')} className="h-9 border-slate-200 bg-white text-slate-700"><ArrowLeft size={14} /> Admin</Button>
              <div>
                <h1 className="text-lg font-black">Full User Directory</h1>
                <p className="text-xs text-slate-600">{filteredUsers.length} of {users.length} users · newest first available</p>
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative min-w-0">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email, notes..." className="h-10 w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-slate-900 sm:w-72" />
              </div>
              <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as any)} className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-slate-900">
                <option value="all">All users</option>
                <option value="reporters">Reporters</option>
                <option value="admin">Admins</option>
                <option value="user">View-only</option>
              </select>
              <select value={sort} onChange={(e) => setSort(e.target.value as any)} className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-slate-900">
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="reports">Most reports</option>
                <option value="name">Name</option>
              </select>
            </div>
          </div>
        </header>

        <main className="mx-auto grid max-w-7xl gap-4 px-4 py-5">
          <section className="grid gap-3 sm:grid-cols-4">
            {[
              { label: 'Users', value: userStats.total, icon: Users, tone: 'text-slate-900' },
              { label: 'Admins', value: userStats.admins, icon: ShieldCheck, tone: 'text-emerald-700' },
              { label: 'Reporters', value: userStats.reporters, icon: FileText, tone: 'text-amber-700' },
              { label: 'Notes', value: userStats.notes, icon: Code2, tone: 'text-sky-700' },
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

          <section className="grid gap-4 lg:grid-cols-[24rem_1fr]">
          <div className="space-y-3 lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto lg:pr-1">
            {filteredUsers.length === 0 && (
              <Card className="rounded-2xl border-slate-200 bg-white p-6 text-center text-sm text-slate-500">No users match your filters.</Card>
            )}
            {filteredUsers.map((profile) => (
              <button key={profile.uid} onClick={() => setSelectedUid(profile.uid)} className={cn('w-full rounded-2xl border bg-white p-4 text-left shadow-sm transition-all', selectedUser?.uid === profile.uid ? 'border-slate-900 ring-2 ring-slate-900/10' : 'border-slate-200 hover:border-slate-300')}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black">{profile.displayName || 'Unknown user'}</p>
                    <p className="truncate text-xs text-slate-600">{profile.email || 'No email'}</p>
                  </div>
                  <span className={cn('rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-widest', profile.role === 'admin' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-sky-200 bg-sky-50 text-sky-700')}>{profile.role}</span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <span className="rounded-xl bg-slate-50 px-3 py-2 text-slate-600">{formatDateTime(profile.joinedAt)}</span>
                  <span className="rounded-xl bg-amber-50 px-3 py-2 font-black text-amber-700">{profile.reports.length} notes</span>
                </div>
              </button>
            ))}
          </div>

          <section className="min-w-0">
            {selectedUser ? (
              <Card className="overflow-hidden rounded-2xl border-slate-200 bg-white">
                <div className="border-b border-slate-200 p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h2 className="text-xl font-black">{selectedUser.displayName || 'Unknown user'}</h2>
                      <p className="text-sm text-slate-600">{selectedUser.email || 'No email'} · member since {formatDateTime(selectedUser.joinedAt)}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="secondary" onClick={() => setRawView((value) => !value)} className="h-9 border-slate-200 bg-white text-slate-700">{rawView ? <Eye size={14} /> : <Code2 size={14} />}{rawView ? 'Structured' : 'Raw'}</Button>
                      <Button variant="secondary" onClick={() => deleteUser(selectedUser)} className="h-9 border-red-200 bg-red-50 text-red-700"><Trash2 size={14} />Delete</Button>
                    </div>
                  </div>
                </div>

                {rawView ? (
                  <pre className="max-h-[70vh] overflow-auto bg-slate-950 p-5 text-xs text-slate-100">{JSON.stringify({ user: selectedUser, reports: selectedUser.reports }, null, 2)}</pre>
                ) : (
                  <div className="grid gap-5 p-5">
                    <div className="grid gap-3 sm:grid-cols-4">
                      <div className="rounded-2xl bg-slate-50 p-4"><p className="text-[10px] font-black uppercase tracking-widest text-slate-500">UID</p><p className="mt-2 break-all font-mono text-xs">{selectedUser.uid}</p></div>
                      <div className="rounded-2xl bg-slate-50 p-4"><p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Role</p><p className="mt-2 text-sm font-black">{selectedUser.role}</p></div>
                      <div className="rounded-2xl bg-slate-50 p-4"><p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Notes Posted</p><p className="mt-2 text-sm font-black">{selectedUser.reports.length}</p></div>
                      <div className="rounded-2xl bg-slate-50 p-4"><p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Anonymous Notes</p><p className="mt-2 text-sm font-black">{selectedUser.anonymousCount}</p></div>
                    </div>

                    <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
                      <label className="grid gap-1 text-[10px] font-black uppercase tracking-widest text-slate-500">
                        Display Name
                        <input
                          value={draftProfiles[selectedUser.uid]?.displayName ?? selectedUser.displayName ?? ''}
                          onChange={(e) => setDraftProfiles((prev) => ({ ...prev, [selectedUser.uid]: { displayName: e.target.value, role: prev[selectedUser.uid]?.role ?? selectedUser.role } }))}
                          className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium normal-case tracking-normal text-slate-900 outline-none focus:border-slate-900"
                        />
                      </label>
                      <label className="grid gap-1 text-[10px] font-black uppercase tracking-widest text-slate-500">
                        Role
                        <select
                          value={draftProfiles[selectedUser.uid]?.role ?? selectedUser.role}
                          onChange={(e) => setDraftProfiles((prev) => ({ ...prev, [selectedUser.uid]: { displayName: prev[selectedUser.uid]?.displayName ?? selectedUser.displayName ?? '', role: e.target.value as UserProfile['role'] } }))}
                          className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium normal-case tracking-normal text-slate-900 outline-none focus:border-slate-900"
                        >
                          <option value="user">User</option>
                          <option value="admin">Admin</option>
                        </select>
                      </label>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <Button onClick={() => saveProfile(selectedUser)} disabled={savingUid === selectedUser.uid} className="h-10 rounded-xl"><Save size={14} />Save</Button>
                        <Button variant="secondary" onClick={() => navigate(`/admin/incidents?uid=${selectedUser.uid}`)} className="h-10 rounded-xl border-slate-200 bg-white text-slate-700"><FileText size={14} />Posts</Button>
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Admin Notes</label>
                      <textarea value={draftNotes[selectedUser.uid] ?? selectedUser.notes ?? ''} onChange={(e) => setDraftNotes((prev) => ({ ...prev, [selectedUser.uid]: e.target.value }))} className="mt-2 h-24 w-full rounded-2xl border border-slate-300 bg-white p-3 text-sm outline-none focus:border-slate-900" />
                      <Button onClick={() => saveNotes(selectedUser)} disabled={savingUid === selectedUser.uid} className="mt-2 h-9 rounded-xl"><Save size={14} />{savingUid === selectedUser.uid ? 'Saving...' : 'Save Notes'}</Button>
                    </div>

                    <div>
                      <h3 className="text-sm font-black">Posted Notes</h3>
                      <div className="mt-3 space-y-3">
                        {selectedUser.reports.length === 0 ? <p className="text-sm text-slate-500">No notes posted yet.</p> : selectedUser.reports.map((incident) => (
                          <div key={incident.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                              <div>
                                <p className="font-black">{incident.title}</p>
                                <p className="mt-1 text-sm text-slate-600">{incident.description}</p>
                              </div>
                              <span className={cn('rounded-full px-2 py-1 text-[10px] font-black', incident.anonymous ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800')}>{incident.anonymous ? 'Anonymous' : 'Named'}</span>
                            </div>
                            <p className="mt-2 text-xs text-slate-500">{formatDateTime(incident.timestamp)} · {incident.neighborhood} · {incident.category}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </Card>
            ) : (
              <Card className="rounded-2xl border-slate-200 bg-white p-10 text-center text-slate-500">No users match your search.</Card>
            )}
          </section>
          </section>
        </main>
      </div>
    </AdminGuard>
  );
}
