/**
 * Full incident list.
 *
 * The record-level workspace: every report, searchable and filterable, with an
 * editor attached. The dashboard answers "is anything wrong"; this answers
 * "show me exactly this one".
 *
 * Laid out as master–detail on desktop, because moderating is a scanning task
 * and losing your place in the list to open a record is the main thing that
 * made the old screen slow. On mobile the detail takes over the screen and
 * returns you to the same scroll position.
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { collection, deleteDoc, doc, limit, onSnapshot, query, updateDoc } from 'firebase/firestore';
import {
  ArrowLeft, Code2, EyeOff, FileText, Image as ImageIcon, Loader2, Lock,
  Save, Search, Trash2, UserRound, X,
} from 'lucide-react';
import { useAuth } from '@/src/components/FirebaseProvider';
import { db, isFirebaseConfigured } from '@/src/firebase';
import { Incident, IncidentCategory, incidentVisibility } from '@/src/types';
import { INCIDENT_CATEGORY_VALUES } from '@/src/constants';
import { VERIFIED_STATUSES } from '@/src/hooks/useAdminData';
import { aggregateFeedback, type IncidentFeedback } from '@/src/lib/feedback';
import {
  AdminButton, Chip, EmptyState, Field, Figure, FilterChip, FilterRow, Panel,
  SearchField, SkeletonRows, StatGrid, StatTile, T, TimeAgo, display,
  inputClass, inputStyle, mono, CategoryChip,
} from '@/src/components/admin/ui';
import { cn } from '@/src/lib/utils';
import {
  adminIncidentTimestamp,
  canPermanentlyDeleteIncident,
  isAdminExampleIncident,
  isOperationalIncident,
  isResidentSubmission,
  matchesAdminSourceFilter,
  type AdminSourceFilter,
} from '@/src/lib/adminIncidentPolicy';

type UserProfile = { uid: string; email: string; displayName: string; role: 'user' | 'admin' };
type IncidentDraft = Pick<
  Incident,
  'title' | 'description' | 'category' | 'neighborhood' | 'verified_status' | 'report_count'
>;

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
      ? { title: 'Sign in required', body: 'Sign in with an approved admin account to open the incident list.', cta: 'signin' as const }
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

export default function AdminIncidentListPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const uidFilter = params.get('uid') ?? '';

  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [feedback, setFeedback] = useState<IncidentFeedback[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  // The archive exists first for resident submissions. API records remain
  // available as an operational tab, but never crowd out the default view.
  const [sourceFilter, setSourceFilter] = useState<AdminSourceFilter>('community');
  const [sort, setSort] = useState<'newest' | 'oldest' | 'status' | 'reports'>('newest');
  const [drafts, setDrafts] = useState<Record<string, IncidentDraft>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [rawView, setRawView] = useState(false);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    if (!db) { setLoading(false); return; }
    // Read the collection itself: orderBy(timestamp) silently excludes legacy
    // documents that do not contain that field, which made old submissions
    // disappear from the purported all-time archive.
    const unsubIncidents = onSnapshot(
      collection(db, 'incidents'),
      (snapshot) => {
        setIncidents(
          snapshot.docs
            .map((row) => {
              const data = row.data();
              return { id: row.id, ...data, timestamp: adminIncidentTimestamp(data) } as Incident;
            }),
        );
        setLoadError('');
        setLoading(false);
      },
      (error) => {
        console.error('Could not load report history:', error);
        setLoadError('The all-time report archive could not be loaded. Check the deployed admin read rules.');
        setLoading(false);
      },
    );
    const unsubUsers = onSnapshot(query(collection(db, 'users'), limit(200)), (snapshot) => {
      setUsers(snapshot.docs.map((row) => row.data() as UserProfile));
    });
    const unsubFeedback = onSnapshot(collection(db, 'incident_feedback'), (snapshot) => {
      setFeedback(snapshot.docs.map((row) => row.data() as IncidentFeedback));
    }, () => setFeedback([]));
    return () => { unsubIncidents(); unsubUsers(); unsubFeedback(); };
  }, []);

  // Resident corroboration per incident, and the set moderators should look at
  // first: reports where neighbours disagree (some say active, some resolved).
  const feedbackByIncident = useMemo(() => {
    const groups = new globalThis.Map<string, IncidentFeedback[]>();
    for (const f of feedback) {
      if (!f?.incidentId) continue;
      const list = groups.get(f.incidentId);
      if (list) list.push(f); else groups.set(f.incidentId, [f]);
    }
    const now = Date.now();
    const map = new globalThis.Map<string, ReturnType<typeof aggregateFeedback>>();
    for (const [incidentId, docs] of groups) map.set(incidentId, aggregateFeedback(docs, now));
    return map;
  }, [feedback]);

  const disputedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const [incidentId, agg] of feedbackByIncident) if (agg.disputed) ids.add(incidentId);
    return ids;
  }, [feedbackByIncident]);

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
      incident.title, incident.description, incident.neighborhood, incident.name,
      incident.email, reporter?.displayName, reporter?.email,
      incident.category, incident.verified_status,
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
        const matchesSource = matchesAdminSourceFilter(incident, sourceFilter);
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

  const selectedIncident =
    filteredIncidents.find((incident) => incident.id === selectedId) || filteredIncidents[0] || null;

  const incidentStats = useMemo(() => ({
    stored: incidents.length,
    total: incidents.filter(isResidentSubmission).length,
    official: incidents.filter(isOperationalIncident).length,
    pending: incidents.filter((i) => isResidentSubmission(i) && i.verified_status !== 'community_confirmed').length,
    anonymous: incidents.filter((i) => isResidentSubmission(i) && i.anonymous).length,
    disputed: incidents.filter((i) => disputedIds.has(i.id)).length,
    examples: incidents.filter(isAdminExampleIncident).length,
    hidden: incidents.filter((i) => isResidentSubmission(i) && incidentVisibility(i) !== 'public').length,
    images: incidents.filter((i) => isResidentSubmission(i) && i.image_url).length,
  }), [incidents, disputedIds]);

  const oldestTimestamp = useMemo(() => filteredIncidents.reduce((oldest, incident) => {
    if (!incident.timestamp) return oldest;
    return oldest === 0 ? incident.timestamp : Math.min(oldest, incident.timestamp);
  }, 0), [filteredIncidents]);

  const apiSourceBreakdown = useMemo(() => {
    const counts = new globalThis.Map<string, number>();
    incidents.filter(isOperationalIncident).forEach((incident) => {
      const label = incident.source_name || incident.source_type || 'Unlabelled API source';
      counts.set(label, (counts.get(label) ?? 0) + 1);
    });
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [incidents]);

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

  const isDirty = (incident: Incident) => Boolean(drafts[incident.id]);

  const saveIncident = async (incident: Incident) => {
    if (!db) return;
    setSavingId(incident.id);
    try {
      const draft = getDraft(incident);
      await updateDoc(doc(db, 'incidents', incident.id), {
        ...draft,
        report_count: Number(draft.report_count || 0),
      });
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[incident.id];
        return next;
      });
    } finally {
      setSavingId(null);
    }
  };

  /**
   * Hide a report without destroying it.
   *
   * The reversible half of moderation: sets visibility to 'deleted', which
   * drops it from the public map query while leaving the record intact for
   * review. Permanent deletion is the separate, confirmed action below.
   */
  const hideIncident = async (incident: Incident) => {
    if (!db) return;
    setSavingId(incident.id);
    try {
      await updateDoc(doc(db, 'incidents', incident.id), {
        visibility: 'deleted',
        deleted: true,
        deletedAt: Date.now(),
      });
      setSelectedId(null);
    } finally {
      setSavingId(null);
    }
  };

  const deleteIncident = async (incident: Incident) => {
    if (!canPermanentlyDeleteIncident(incident)) {
      window.alert('Resident submissions are retained permanently. Use Hide from map instead.');
      return;
    }
    if (!db || !window.confirm(`Delete "${incident.title}" permanently? This cannot be undone.`)) return;
    await deleteDoc(doc(db, 'incidents', incident.id));
    setSelectedId(null);
  };

  const clearFilters = () => {
    setSearch(''); setCategoryFilter(''); setStatusFilter(''); setSourceFilter('all');
  };
  const hasFilters = Boolean(search || categoryFilter || statusFilter || sourceFilter !== 'all' || uidFilter);

  return (
    <AdminGuard>
      <div className="min-h-screen" style={{ background: T.surface }}>
        {/* Header */}
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
                  Report history
                </h1>
                <p className="text-xs" style={{ color: T.muted }}>
                  <span className="tabular-nums" style={{ fontFamily: mono }}>{filteredIncidents.length}</span>
                  {' shown · '}
                  <span className="tabular-nums" style={{ fontFamily: mono }}>{incidentStats.total}</span>
                  {' resident retained · '}
                  <span className="tabular-nums" style={{ fontFamily: mono }}>{incidentStats.official}</span>
                  {' API current'}
                  {uidFilter && ' · filtered to one reporter'}
                </p>
              </div>
              <AdminButton size="sm" variant={rawView ? 'solid' : 'outline'} onClick={() => setRawView((v) => !v)} title="Toggle raw JSON">
                <Code2 size={13} /> <span className="hidden sm:inline">Raw</span>
              </AdminButton>
            </div>

            <div className="flex gap-2 mt-3">
              <SearchField
                value={search}
                onChange={setSearch}
                placeholder="Search title, description, neighbourhood or reporter"
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
                <option value="status">Status</option>
                <option value="reports">Most reports</option>
              </select>
            </div>

            <div className="mt-2 space-y-1.5">
              <FilterRow>
                <FilterChip active={sourceFilter === 'all'} onClick={() => setSourceFilter('all')}>All reports</FilterChip>
                <FilterChip active={sourceFilter === 'community'} onClick={() => setSourceFilter('community')} count={incidentStats.total}>Community history</FilterChip>
                <FilterChip active={sourceFilter === 'official'} onClick={() => setSourceFilter('official')} count={incidentStats.official}>API / official</FilterChip>
                <FilterChip active={sourceFilter === 'example'} onClick={() => setSourceFilter('example')} count={incidentStats.examples}>Examples</FilterChip>
                <FilterChip active={sourceFilter === 'anonymous'} onClick={() => setSourceFilter('anonymous')} count={incidentStats.anonymous}>Anonymous</FilterChip>
                <FilterChip active={sourceFilter === 'hidden'} onClick={() => setSourceFilter('hidden')} count={incidentStats.hidden}>Hidden</FilterChip>
                <FilterChip active={sourceFilter === 'images'} onClick={() => setSourceFilter('images')} count={incidentStats.images}>With photo</FilterChip>
              </FilterRow>
              <FilterRow>
                <FilterChip active={!categoryFilter} onClick={() => setCategoryFilter('')}>Any category</FilterChip>
                {INCIDENT_CATEGORY_VALUES.map((c) => (
                  <FilterChip key={c} active={categoryFilter === c} onClick={() => setCategoryFilter(categoryFilter === c ? '' : c)}>{c}</FilterChip>
                ))}
              </FilterRow>
              <FilterRow>
                <FilterChip active={!statusFilter} onClick={() => setStatusFilter('')}>Any status</FilterChip>
                {VERIFIED_STATUSES.map((s) => (
                  <FilterChip key={s} active={statusFilter === s} onClick={() => setStatusFilter(statusFilter === s ? '' : s)}>{s.replace(/_/g, ' ')}</FilterChip>
                ))}
                {hasFilters && (
                  <FilterChip active={false} onClick={clearFilters}><X size={12} /> Clear</FilterChip>
                )}
              </FilterRow>
            </div>
          </div>
        </header>

        <main className="px-4 lg:px-7 py-4 max-w-[1500px] space-y-4">
          <StatGrid>
            <StatTile label="Resident reports" value={incidentStats.total} />
            <StatTile label="Not yet confirmed" value={incidentStats.pending} tone="attention" />
            <StatTile label="Disputed by residents" value={incidentStats.disputed} tone="attention" />
            <StatTile label="Anonymous" value={incidentStats.anonymous} />
            <StatTile label="API records" value={incidentStats.official} />
            <StatTile label="Examples" value={incidentStats.examples} tone="attention" />
            <StatTile label="Hidden from map" value={incidentStats.hidden} tone="attention" />
            <StatTile label="With a photo" value={incidentStats.images} />
            <StatTile label="All stored records" value={incidentStats.stored} />
          </StatGrid>

          <Panel title="Resident archive" subtitle="Permanent history, separate from temporary API data">
            <p className="text-sm leading-relaxed" style={{ color: T.muted }}>
              Community and anonymous submissions are retained for all-time moderation. API and official records are reproducible operational data: they live under their own tab and expire according to the source’s freshness window.
            </p>
            {apiSourceBreakdown.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2" aria-label="Current API records by source">
                {apiSourceBreakdown.map(([source, count]) => (
                  <Chip key={source}>{source} · {count}</Chip>
                ))}
              </div>
            )}
          </Panel>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_26rem] items-start">
            {/* List */}
            <Panel
              title="All-time records"
              subtitle={`Sorted by ${sort}${oldestTimestamp ? ` · archive begins ${new Date(oldestTimestamp).toLocaleDateString('en-CA')}` : ''}`}
              padded={false}
            >
              {loading ? (
                <div className="p-4"><SkeletonRows rows={6} /></div>
              ) : loadError ? (
                <EmptyState icon={<FileText size={26} />} title="History unavailable" body={loadError} />
              ) : filteredIncidents.length === 0 ? (
                <EmptyState
                  icon={<FileText size={26} />}
                  title={sourceFilter === 'community' && !search && !categoryFilter && !statusFilter && !uidFilter
                    ? 'No resident history found'
                    : 'No reports match'}
                  body={sourceFilter === 'community' && !search && !categoryFilter && !statusFilter && !uidFilter
                    ? 'The archive loaded, but no retained community submissions were found. API records are kept separately and do not count as resident history.'
                    : hasFilters ? 'Try widening the filters or clearing the search.' : 'Reports will appear here as soon as they are submitted.'}
                  action={hasFilters ? <AdminButton size="sm" variant="outline" onClick={clearFilters}>Clear filters</AdminButton> : undefined}
                />
              ) : (
                <ul className="divide-y divide-[#E4E2DC] max-h-[62vh] overflow-y-auto">
                  {filteredIncidents.map((incident) => {
                    const active = selectedIncident?.id === incident.id;
                    return (
                      <li key={incident.id}>
                        <button
                          onClick={() => setSelectedId(incident.id)}
                          className="w-full text-left p-3 flex items-start gap-3 transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2"
                          style={{ background: active ? `${T.signal}0D` : 'transparent', outlineColor: T.signal }}
                        >
                          <span
                            className="mt-1 h-1.5 w-1.5 rounded-full shrink-0"
                            style={{ background: active ? T.signal : T.line }}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1.5 flex-wrap">
                              <CategoryChip category={incident.category} />
                              {isAdminExampleIncident(incident) && <Chip tone="attention">Example</Chip>}
                              {incident.anonymous && <Chip>anon</Chip>}
                              {incident.image_url && <Chip><ImageIcon size={10} /> photo</Chip>}
                              {incidentVisibility(incident) !== 'public' && <Chip tone="critical"><EyeOff size={10} /> hidden</Chip>}
                              {disputedIds.has(incident.id) && <Chip tone="critical">disputed</Chip>}
                              {isDirty(incident) && <Chip tone="attention">unsaved</Chip>}
                            </span>
                            <p className="text-sm font-semibold mt-1 leading-snug line-clamp-1" style={{ color: T.ink }}>
                              {incident.title}
                            </p>
                            <p className="text-xs mt-0.5 truncate" style={{ color: T.muted }}>
                              {incident.neighborhood} · {incident.anonymous ? 'Anonymous' : (incident.reporter?.displayName || incident.name)}
                            </p>
                          </span>
                          <span className="shrink-0 text-right">
                            <TimeAgo ts={incident.timestamp} />
                            {(incident.report_count ?? 0) > 1 && (
                              <p className="mt-1"><Figure value={incident.report_count} size="sm" /></p>
                            )}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Panel>

            {/* Detail */}
            <div className="lg:sticky lg:top-[13.5rem] lg:self-start">
              {selectedIncident ? (
                <IncidentEditor
                  incident={selectedIncident}
                  draft={getDraft(selectedIncident)}
                  dirty={isDirty(selectedIncident)}
                  saving={savingId === selectedIncident.id}
                  rawView={rawView}
                  onPatch={(patch) => patchDraft(selectedIncident, patch)}
                  onSave={() => saveIncident(selectedIncident)}
                  onHide={() => hideIncident(selectedIncident)}
                  onDelete={() => deleteIncident(selectedIncident)}
                  onViewReporter={
                    selectedIncident.authorUid
                      ? () => navigate(`/admin/users?uid=${selectedIncident.authorUid}`)
                      : undefined
                  }
                />
              ) : (
                <Panel title="No record selected">
                  <EmptyState title="Pick a report" body="Select a record from the list to edit it." />
                </Panel>
              )}
            </div>
          </div>
        </main>
      </div>
    </AdminGuard>
  );
}

function IncidentEditor({
  incident,
  draft,
  dirty,
  saving,
  rawView,
  onPatch,
  onSave,
  onHide,
  onDelete,
  onViewReporter,
}: {
  incident: Incident & { reporter?: UserProfile };
  draft: IncidentDraft;
  dirty: boolean;
  saving: boolean;
  rawView: boolean;
  onPatch: (patch: Partial<IncidentDraft>) => void;
  onSave: () => void;
  onHide: () => void;
  onDelete: () => void;
  onViewReporter?: () => void;
}) {
  const visible = incidentVisibility(incident) === 'public';

  return (
    <Panel
      title="Edit report"
      subtitle={new Date(incident.timestamp).toLocaleString('en-CA')}
      action={isAdminExampleIncident(incident)
        ? <Chip tone="attention">Example</Chip>
        : dirty
          ? <Chip tone="attention">Unsaved</Chip>
          : undefined}
    >
      <div className="space-y-3">
        <Field label="Title">
          <input className={inputClass} style={inputStyle} value={draft.title} onChange={(e) => onPatch({ title: e.target.value })} />
        </Field>

        <Field label="Description">
          <textarea
            rows={4}
            className="w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors focus:border-slate-500 resize-y"
            style={inputStyle}
            value={draft.description}
            onChange={(e) => onPatch({ description: e.target.value })}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Category">
            <select className={inputClass} style={inputStyle} value={draft.category} onChange={(e) => onPatch({ category: e.target.value as IncidentCategory })}>
              {INCIDENT_CATEGORY_VALUES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Neighbourhood">
            <input className={inputClass} style={inputStyle} value={draft.neighborhood} onChange={(e) => onPatch({ neighborhood: e.target.value })} />
          </Field>
          <Field label="Trust status">
            <select className={inputClass} style={inputStyle} value={draft.verified_status} onChange={(e) => onPatch({ verified_status: e.target.value as Incident['verified_status'] })}>
              {VERIFIED_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
            </select>
          </Field>
          <Field label="Report count">
            <input
              type="number"
              className={inputClass}
              style={{ ...inputStyle, fontFamily: mono }}
              value={draft.report_count}
              onChange={(e) => onPatch({ report_count: Number(e.target.value) })}
            />
          </Field>
        </div>

        {incident.image_url && (
          <Field label="Attached photo">
            <img
              src={incident.image_url}
              alt=""
              className="w-full rounded-lg border object-cover max-h-44"
              style={{ borderColor: T.line }}
              loading="lazy"
            />
          </Field>
        )}

        <div className="rounded-lg border p-3 space-y-1.5 text-xs" style={{ borderColor: T.line, background: T.surface }}>
          {isAdminExampleIncident(incident) && (
            <p className="mb-2 text-xs font-medium leading-relaxed" style={{ color: T.attention }}>
              Seeded example. Publicly styled as an anonymous community report; excluded from digest, counts and safety signals.
            </p>
          )}
          <Row label="Reporter" value={incident.anonymous ? 'Anonymous' : (incident.reporter?.displayName || incident.name || 'Unknown')} />
          <Row label="Account" value={incident.reporter?.email || '—'} mono />
          <Row label="Author UID" value={incident.authorUid || '—'} mono />
          <Row label="Record ID" value={incident.id} mono />
          <Row label="Coordinates" value={`${incident.lat?.toFixed(5)}, ${incident.lng?.toFixed(5)}`} mono />
          <Row label="Visibility" value={incidentVisibility(incident)} />
          {incident.source_type && <Row label="Source" value={incident.source_type} mono />}
        </div>

        {rawView && (
          <Field label="Raw document">
            <pre
              className="text-[0.68rem] leading-relaxed rounded-lg border p-3 overflow-x-auto max-h-56"
              style={{ borderColor: T.line, background: T.surface, fontFamily: mono, color: T.ink }}
            >
              {JSON.stringify(incident, null, 2)}
            </pre>
          </Field>
        )}

        <div className="space-y-2 pt-1">
          <div className="flex gap-2">
            <AdminButton
              tone={dirty ? 'signal' : 'neutral'}
              variant={dirty ? 'solid' : 'outline'}
              onClick={onSave}
              disabled={saving || !dirty}
              className="flex-1"
            >
              <Save size={14} /> {saving ? 'Saving' : dirty ? 'Save changes' : 'No changes'}
            </AdminButton>
            {onViewReporter && (
              <AdminButton variant="outline" onClick={onViewReporter} title="View this reporter">
                <UserRound size={14} />
              </AdminButton>
            )}
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            {visible && (
              <AdminButton variant="outline" tone="attention" onClick={onHide} disabled={saving} className="flex-1">
                <EyeOff size={14} /> Hide from map
              </AdminButton>
            )}
            {canPermanentlyDeleteIncident(incident) ? (
              <AdminButton variant="outline" tone="critical" onClick={onDelete} className={visible ? undefined : 'flex-1'}>
                <Trash2 size={14} /> Delete permanently
              </AdminButton>
            ) : (
              <p className="flex-1 self-center text-xs leading-snug" style={{ color: T.muted }}>
                Resident submissions are retained permanently.
              </p>
            )}
          </div>
        </div>
      </div>
    </Panel>
  );
}

function Row({ label, value, mono: useMono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="shrink-0" style={{ color: T.muted }}>{label}</span>
      <span
        className="text-right break-all"
        style={{ color: T.ink, fontFamily: useMono ? mono : undefined }}
      >
        {value}
      </span>
    </div>
  );
}
