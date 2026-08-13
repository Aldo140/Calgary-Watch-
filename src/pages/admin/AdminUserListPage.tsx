/**
 * User directory.
 *
 * Same master–detail shape as the incident list, deliberately: an admin moving
 * between the two screens should not have to relearn where anything is. Each
 * account carries its own reporting history, so moderation decisions can be
 * made with the person's full record in view rather than one report at a time.
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { collection, deleteDoc, doc, limit, onSnapshot, orderBy, query, updateDoc } from 'firebase/firestore';
import {
  ArrowLeft, FileText, Loader2, Lock, Save, Search, Trash2, Users, X,
} from 'lucide-react';
import { useAuth } from '@/src/components/FirebaseProvider';
import { db, isFirebaseConfigured } from '@/src/firebase';
import { Incident, incidentVisibility } from '@/src/types';
import {
  AdminButton, Chip, EmptyState, Field, Figure, FilterChip, FilterRow, Panel,
  SearchField, SkeletonRows, StatGrid, StatTile, T, TimeAgo, display,
  inputClass, inputStyle, mono,
} from '@/src/components/admin/ui';
import { cn } from '@/src/lib/utils';

type UserProfile = {
  uid: string;
  email: string;
  displayName: string;
  role: 'user' | 'admin';
  createdAt?: number;
  updatedAt?: number;
  notes?: string;
  weeklyDigestOptIn?: boolean;
  digestPromptedAt?: number;
  neighborhood?: string;
  inferredNeighborhood?: string;
};

type ProfileDraft = { displayName: string; role: 'user' | 'admin' };

function AdminGuard({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const { user, signIn, isAuthReady, isAdmin } = useAuth();

  if (!isAuthReady) {
    return (
      <div className="min-h-screen grid place-items-center" style={{ background: T.surface }}>
        <Loader2 className="animate-spin" style={{ color: T.muted }} />
      </div>
    );
  }

  const blocked = !isFirebaseConfigured
    ? { title: 'Admin unavailable', body: 'This build has no Firebase configuration.', cta: null }
    : !user
      ? { title: 'Sign in required', body: 'Sign in with an approved admin account to open the directory.', cta: 'signin' as const }
      : !isAdmin
        ? { title: 'Access denied', body: 'This account is not an approved admin.', cta: null }
        : null;

  if (!blocked) return <>{children}</>;

  return (
    <div className="min-h-screen grid place-items-center p-6" style={{ background: T.surface }}>
      <div className="max-w-sm w-full rounded-2xl border p-6 text-center" style={{ background: T.card, borderColor: T.line }}>
        <Lock size={22} className="mx-auto mb-3" style={{ color: T.muted }} />
        <h1 className="text-lg font-bold mb-1" style={{ fontFamily: display, color: T.ink }}>{blocked.title}</h1>
        <p className="text-sm mb-4" style={{ color: T.muted }}>{blocked.body}</p>
        <div className="flex gap-2 justify-center">
          {blocked.cta === 'signin' && <AdminButton tone="signal" onClick={signIn}>Sign in</AdminButton>}
          <AdminButton variant="outline" onClick={() => navigate('/admin')}>Back to admin</AdminButton>
        </div>
      </div>
    </div>
  );
}

/** Firestore stores these as a number, a Timestamp, or {seconds}. */
function coerceTimestamp(value: unknown): number {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object') {
    const t = value as { toMillis?: () => number; seconds?: number };
    if (typeof t.toMillis === 'function') return t.toMillis();
    if (typeof t.seconds === 'number') return t.seconds * 1000;
  }
  return 0;
}

export default function AdminUserListPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const uidParam = params.get('uid');

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUid, setSelectedUid] = useState<string | null>(uidParam);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'user' | 'reporters'>('all');
  const [sort, setSort] = useState<'newest' | 'oldest' | 'reports' | 'name'>('newest');
  const [draftNotes, setDraftNotes] = useState<Record<string, string>>({});
  const [draftProfiles, setDraftProfiles] = useState<Record<string, ProfileDraft>>({});
  const [savingUid, setSavingUid] = useState<string | null>(null);

  useEffect(() => {
    if (!db) { setLoading(false); return; }
    const unsubUsers = onSnapshot(query(collection(db, 'users'), limit(200)), (snapshot) => {
      setUsers(snapshot.docs.map((row) => row.data() as UserProfile));
      setLoading(false);
    });
    const unsubIncidents = onSnapshot(
      query(collection(db, 'incidents'), orderBy('timestamp', 'desc'), limit(300)),
      (snapshot) => {
        setIncidents(
          snapshot.docs
            .map((row) => ({ id: row.id, ...row.data() } as Incident))
            .filter((row) => incidentVisibility(row) !== 'deleted'),
        );
      },
    );
    return () => { unsubUsers(); unsubIncidents(); };
  }, []);

  const reportsByUserKey = useMemo(() => {
    const map = new globalThis.Map<string, Incident[]>();
    incidents.forEach((incident) => {
      const keys = [
        incident.authorUid,
        incident.email && incident.email !== 'anonymous@calgarywatch.app' ? incident.email : null,
      ].filter(Boolean) as string[];
      keys.forEach((key) => {
        const list = map.get(key) ?? [];
        list.push(incident);
        map.set(key, list);
      });
    });
    return map;
  }, [incidents]);

  const enrichedUsers = useMemo(() => users.map((profile) => {
    const reports = reportsByUserKey.get(profile.uid) ?? reportsByUserKey.get(profile.email) ?? [];
    const joinedAt = coerceTimestamp(profile.createdAt) || coerceTimestamp(profile.updatedAt) || 0;
    const anonymousCount = reports.filter((r) => r.anonymous).length;
    const searchBlob = [
      profile.displayName, profile.email, profile.notes,
      ...reports.map((i) => `${i.title} ${i.description} ${i.neighborhood}`),
    ].join(' ').toLowerCase();
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

  const selectedUser = filteredUsers.find((p) => p.uid === selectedUid) || filteredUsers[0] || null;

  const userStats = useMemo(() => ({
    total: users.length,
    admins: users.filter((p) => p.role === 'admin').length,
    reporters: enrichedUsers.filter((p) => p.reports.length > 0).length,
    digest: users.filter((p) => p.weeklyDigestOptIn === true).length,
  }), [users, enrichedUsers]);

  const getProfileDraft = (profile: UserProfile): ProfileDraft =>
    draftProfiles[profile.uid] || { displayName: profile.displayName || '', role: profile.role || 'user' };

  const saveNotes = async (profile: UserProfile) => {
    if (!db) return;
    setSavingUid(profile.uid);
    try {
      await updateDoc(doc(db, 'users', profile.uid), {
        notes: draftNotes[profile.uid] ?? profile.notes ?? '',
      });
    } finally {
      setSavingUid(null);
    }
  };

  const saveProfile = async (profile: UserProfile) => {
    if (!db) return;
    setSavingUid(profile.uid);
    try {
      await updateDoc(doc(db, 'users', profile.uid), getProfileDraft(profile));
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
    // Removes the Firestore profile document only. The Firebase Auth account
    // survives and can still sign in — deleting it requires the Admin SDK.
    if (!db || !window.confirm(
      `Remove ${profile.displayName || profile.email || 'this user'} from the user directory?\n\n` +
      'This deletes their profile record only. Their sign-in account still exists and they can sign in again.'
    )) return;
    await deleteDoc(doc(db, 'users', profile.uid));
    setSelectedUid(null);
  };

  const hasFilters = Boolean(search || roleFilter !== 'all');

  return (
    <AdminGuard>
      <div className="min-h-screen" style={{ background: T.surface }}>
        <header className="sticky top-0 z-30 border-b backdrop-blur" style={{ background: 'rgba(247,246,243,0.94)', borderColor: T.line }}>
          <div className="px-4 lg:px-7 py-3 max-w-[1500px]">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate('/admin')}
                className="shrink-0 h-9 w-9 grid place-items-center rounded-lg border"
                style={{ borderColor: T.line, color: T.muted, background: T.card }}
                aria-label="Back to admin"
              >
                <ArrowLeft size={16} />
              </button>
              <div className="min-w-0 flex-1">
                <h1 className="text-[1.05rem] lg:text-[1.3rem] font-bold leading-tight" style={{ fontFamily: display, color: T.ink }}>
                  User directory
                </h1>
                <p className="text-xs" style={{ color: T.muted }}>
                  <span className="tabular-nums" style={{ fontFamily: mono }}>{filteredUsers.length}</span>
                  {' of '}
                  <span className="tabular-nums" style={{ fontFamily: mono }}>{users.length}</span>
                  {' accounts'}
                </p>
              </div>
            </div>

            <div className="flex gap-2 mt-3">
              <SearchField
                value={search}
                onChange={setSearch}
                placeholder="Search name, email, notes or their reports"
                icon={<Search size={15} />}
              />
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as typeof sort)}
                className={cn(inputClass, 'w-auto shrink-0 pr-8')}
                style={inputStyle}
                aria-label="Sort order"
              >
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
                <option value="reports">Most reports</option>
                <option value="name">Name</option>
              </select>
            </div>

            <FilterRow>
              <FilterChip active={roleFilter === 'all'} onClick={() => setRoleFilter('all')} count={userStats.total}>Everyone</FilterChip>
              <FilterChip active={roleFilter === 'admin'} onClick={() => setRoleFilter('admin')} count={userStats.admins}>Admins</FilterChip>
              <FilterChip active={roleFilter === 'user'} onClick={() => setRoleFilter('user')}>View only</FilterChip>
              <FilterChip active={roleFilter === 'reporters'} onClick={() => setRoleFilter('reporters')} count={userStats.reporters}>Reporters</FilterChip>
              {hasFilters && (
                <FilterChip active={false} onClick={() => { setSearch(''); setRoleFilter('all'); }}>
                  <X size={12} /> Clear
                </FilterChip>
              )}
            </FilterRow>
          </div>
        </header>

        <main className="px-4 lg:px-7 py-4 max-w-[1500px] space-y-4">
          <StatGrid>
            <StatTile label="Accounts" value={userStats.total} />
            <StatTile label="Admins" value={userStats.admins} tone="signal" />
            <StatTile label="Have reported" value={userStats.reporters} tone="ok" />
            <StatTile label="Weekly digest" value={userStats.digest} hint="Opted in" />
          </StatGrid>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_26rem]">
            <Panel title="Accounts" subtitle={`Sorted by ${sort}`} padded={false}>
              {loading ? (
                <div className="p-4"><SkeletonRows rows={6} /></div>
              ) : filteredUsers.length === 0 ? (
                <EmptyState
                  icon={<Users size={26} />}
                  title="No accounts match"
                  body={hasFilters ? 'Try a different search or clear the filters.' : 'Accounts appear here as soon as someone signs in.'}
                  action={hasFilters ? <AdminButton size="sm" variant="outline" onClick={() => { setSearch(''); setRoleFilter('all'); }}>Clear filters</AdminButton> : undefined}
                />
              ) : (
                <ul className="divide-y max-h-[62vh] overflow-y-auto" style={{ borderColor: T.line }}>
                  {filteredUsers.map((profile) => {
                    const active = selectedUser?.uid === profile.uid;
                    return (
                      <li key={profile.uid}>
                        <button
                          onClick={() => setSelectedUid(profile.uid)}
                          className="w-full text-left p-3 flex items-center gap-3 transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2"
                          style={{ background: active ? `${T.signal}0D` : 'transparent', outlineColor: T.signal }}
                        >
                          <span
                            className="h-8 w-8 shrink-0 grid place-items-center rounded-full text-xs font-bold"
                            style={{ background: `${T.signal}18`, color: T.signal }}
                          >
                            {(profile.displayName || profile.email || '?').charAt(0).toUpperCase()}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1.5">
                              <p className="text-sm font-semibold truncate" style={{ color: T.ink }}>
                                {profile.displayName || 'Unnamed'}
                              </p>
                              {profile.role === 'admin' && <Chip tone="signal">admin</Chip>}
                            </span>
                            <p className="text-xs truncate" style={{ color: T.muted }}>{profile.email}</p>
                          </span>
                          <span className="shrink-0 text-right">
                            <Figure value={profile.reports.length} size="sm" tone={profile.reports.length > 0 ? 'ok' : 'neutral'} />
                            <p className="text-[0.62rem]" style={{ color: T.muted }}>reports</p>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Panel>

            <div className="lg:sticky lg:top-[12rem] lg:self-start">
              {selectedUser ? (
                <UserEditor
                  profile={selectedUser}
                  draft={getProfileDraft(selectedUser)}
                  notes={draftNotes[selectedUser.uid] ?? selectedUser.notes ?? ''}
                  saving={savingUid === selectedUser.uid}
                  dirty={Boolean(draftProfiles[selectedUser.uid])}
                  onPatch={(patch) =>
                    setDraftProfiles((prev) => ({
                      ...prev,
                      [selectedUser.uid]: { ...getProfileDraft(selectedUser), ...patch },
                    }))
                  }
                  onNotes={(v) => setDraftNotes((prev) => ({ ...prev, [selectedUser.uid]: v }))}
                  onSaveProfile={() => saveProfile(selectedUser)}
                  onSaveNotes={() => saveNotes(selectedUser)}
                  onDelete={() => deleteUser(selectedUser)}
                  onViewReports={() => navigate(`/admin/incidents?uid=${selectedUser.uid}`)}
                />
              ) : (
                <Panel title="No account selected">
                  <EmptyState title="Pick an account" body="Select someone from the list to see their record." />
                </Panel>
              )}
            </div>
          </div>
        </main>
      </div>
    </AdminGuard>
  );
}

function UserEditor({
  profile,
  draft,
  notes,
  saving,
  dirty,
  onPatch,
  onNotes,
  onSaveProfile,
  onSaveNotes,
  onDelete,
  onViewReports,
}: {
  profile: UserProfile & { joinedAt: number; reports: Incident[]; anonymousCount: number };
  draft: ProfileDraft;
  notes: string;
  saving: boolean;
  dirty: boolean;
  onPatch: (patch: Partial<ProfileDraft>) => void;
  onNotes: (v: string) => void;
  onSaveProfile: () => void;
  onSaveNotes: () => void;
  onDelete: () => void;
  onViewReports: () => void;
}) {
  return (
    <div className="space-y-4">
      <Panel
        title={profile.displayName || 'Unnamed account'}
        subtitle={profile.email}
        action={dirty ? <Chip tone="attention">Unsaved</Chip> : undefined}
      >
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <Metric label="Reports" value={profile.reports.length} tone="ok" />
            <Metric label="Anonymous" value={profile.anonymousCount} />
            <Metric label="Joined" value={profile.joinedAt ? <TimeAgo ts={profile.joinedAt} /> : '—'} />
          </div>

          <Field label="Display name">
            <input className={inputClass} style={inputStyle} value={draft.displayName} onChange={(e) => onPatch({ displayName: e.target.value })} />
          </Field>

          <Field label="Role">
            <select className={inputClass} style={inputStyle} value={draft.role} onChange={(e) => onPatch({ role: e.target.value as 'user' | 'admin' })}>
              <option value="user">View only</option>
              <option value="admin">Admin</option>
            </select>
          </Field>

          <AdminButton tone="signal" onClick={onSaveProfile} disabled={saving || !dirty} className="w-full">
            <Save size={14} /> {saving ? 'Saving' : dirty ? 'Save profile' : 'Saved'}
          </AdminButton>

          <div className="rounded-lg border p-3 space-y-1.5 text-xs" style={{ borderColor: T.line, background: T.surface }}>
            <InfoRow label="UID" value={profile.uid} mono />
            <InfoRow label="Neighbourhood" value={profile.neighborhood || profile.inferredNeighborhood || '—'} />
            <InfoRow label="Weekly digest" value={profile.weeklyDigestOptIn ? 'Opted in' : 'Not subscribed'} />
          </div>
        </div>
      </Panel>

      <Panel
        title="Admin notes"
        subtitle="Only visible to admins"
        action={
          <AdminButton size="sm" variant="outline" onClick={onSaveNotes} disabled={saving}>
            <Save size={13} /> Save
          </AdminButton>
        }
      >
        <textarea
          rows={3}
          value={notes}
          onChange={(e) => onNotes(e.target.value)}
          placeholder="Context worth keeping about this account."
          className="w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors focus:border-slate-500 resize-y"
          style={inputStyle}
        />
      </Panel>

      <Panel
        title="Their reports"
        subtitle={profile.reports.length === 0 ? 'None filed yet' : `${profile.reports.length} filed`}
        action={
          profile.reports.length > 0 ? (
            <AdminButton size="sm" variant="outline" onClick={onViewReports}>
              <FileText size={13} /> Open
            </AdminButton>
          ) : undefined
        }
      >
        {profile.reports.length === 0 ? (
          <EmptyState title="No reports yet" body="This account has not filed anything." />
        ) : (
          <ul className="space-y-1.5 max-h-44 overflow-y-auto">
            {profile.reports.slice(0, 12).map((incident) => (
              <li key={incident.id} className="flex items-center justify-between gap-2">
                <span className="text-xs truncate" style={{ color: T.ink }}>{incident.title}</span>
                <TimeAgo ts={incident.timestamp} />
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Danger zone" subtitle="Removes the profile record, not the sign-in account">
        <AdminButton variant="outline" tone="critical" onClick={onDelete} className="w-full">
          <Trash2 size={14} /> Remove profile
        </AdminButton>
      </Panel>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: React.ReactNode; tone?: 'ok' }) {
  return (
    <div className="rounded-lg border p-2 text-center" style={{ borderColor: T.line, background: T.surface }}>
      <p className="text-[0.6rem] font-semibold uppercase tracking-[0.07em] mb-1" style={{ color: T.muted }}>{label}</p>
      {typeof value === 'number' ? <Figure value={value} size="md" tone={tone} /> : <span className="text-xs">{value}</span>}
    </div>
  );
}

function InfoRow({ label, value, mono: useMono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="shrink-0" style={{ color: T.muted }}>{label}</span>
      <span className="text-right break-all" style={{ color: T.ink, fontFamily: useMono ? mono : undefined }}>{value}</span>
    </div>
  );
}
