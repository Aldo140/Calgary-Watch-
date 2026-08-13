/**
 * Shared admin data layer.
 *
 * Every subscription, derived KPI, chart series, and mutation used by the admin
 * screens lives here, lifted verbatim out of AdminPage so the presentation
 * could be rebuilt without any figure changing meaning. /admin, /admin/incidents
 * and /admin/users all read from this one hook, which is what removes the three
 * separate copies of the incidents+users subscriptions those pages used to keep.
 *
 * Nothing in here should render. If you need a new number on screen, derive it
 * here and return it, so every screen agrees on what it means.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  addDoc, collection, deleteDoc, doc, getDocs,
  onSnapshot, orderBy, query, updateDoc, limit, where, deleteField,
  getCountFromServer, setDoc,
} from 'firebase/firestore';
import { db } from '@/src/firebase';
import { useAuth } from '@/src/components/FirebaseProvider';
import { useCrimeStats } from '@/src/hooks/useCrimeStats';
import { Incident, CommunityStats, incidentVisibility } from '@/src/types';
import { INCIDENT_CATEGORIES, LEGACY_INCIDENT_CATEGORIES } from '@/src/constants';
import { deleteIncidentImage } from '@/src/lib/storage';
import { suppressionDocId } from '@/src/lib/suppression';

export type UserProfile = {
  uid: string;
  email: string;
  displayName: string;
  role: 'user' | 'admin';
  createdAt?: number;
  updatedAt?: number;
  notes?: string;
};

export type PageViewDoc = {
  timestamp: number;
  path: string;
  referrer?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  traffic_source?: string;
  sessionId?: string;
};

export type ApiHealth = {
  id: string;
  name: string;
  url: string;
  status: 'idle' | 'checking' | 'ok' | 'slow' | 'error';
  recordCount: number | null;
  responseMs: number | null;
  lastChecked: number | null;
  error: string | null;
};

export type EditableIncident = Pick<
  Incident,
  'title' | 'description' | 'category' | 'neighborhood'
  | 'verified_status' | 'report_count' | 'source_name' | 'source_url'
>;

export type EditableCommunityStats = Pick<
  CommunityStats,
  'community' | 'month' | 'violent_crime' | 'property_crime' | 'disorder_calls' | 'safety_score'
>;

export const VERIFIED_STATUSES: Incident['verified_status'][] = [
  'unverified', 'multiple_reports', 'community_confirmed', 'pending_review',
];

export const API_ENDPOINTS: Pick<ApiHealth, 'id' | 'name' | 'url'>[] = [
  { id: 'traffic',   name: 'Calgary Traffic',     url: 'https://data.calgary.ca/resource/35ra-9556.json?$limit=10&$order=start_dt%20DESC' },
  { id: '311',       name: 'Calgary 311',          url: "https://data.calgary.ca/resource/iahh-g8bj.json?$limit=10&$where=status_description%3D'Open'&$order=requested_date%20DESC" },
  { id: 'watermain', name: 'Water Main Breaks',    url: 'https://data.calgary.ca/resource/dpcu-jr23.json?$limit=10&$order=break_date%20DESC&status=ACTIVE' },
  { id: 'weather',   name: 'Open-Meteo Weather',   url: 'https://api.open-meteo.com/v1/forecast?latitude=51.048&longitude=-114.065&current=temperature_2m,weathercode&timezone=America%2FEdmonton' },
];

/** How long a suppression entry blocks re-ingestion of a record. */
const SUPPRESSION_TTL_MS = 180 * 24 * 60 * 60 * 1000; // 180 days

const emptyStatsDraft: EditableCommunityStats = {
  community: '', month: '', violent_crime: 0,
  property_crime: 0, disorder_calls: 0, safety_score: 0,
};

/** Firestore stores these as a number, a Timestamp, or {seconds} depending on writer. */
function coerceTimestamp(value: unknown): number {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object') {
    const maybeTimestamp = value as { toMillis?: () => number; seconds?: number };
    if (typeof maybeTimestamp.toMillis === 'function') return maybeTimestamp.toMillis();
    if (typeof maybeTimestamp.seconds === 'number') return maybeTimestamp.seconds * 1000;
  }
  return 0;
}

export function useAdminData() {
  const { user, isAuthReady, isAdmin } = useAuth();

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

  const [statsDrafts, setStatsDrafts] = useState<Record<string, EditableCommunityStats>>({});
  const [savingStatsId, setSavingStatsId] = useState<string | null>(null);
  const [apiHealths, setApiHealths] = useState<ApiHealth[]>(
    API_ENDPOINTS.map(e => ({ ...e, status: 'idle', recordCount: null, responseMs: null, lastChecked: null, error: null }))
  );
  const [liveTrafficCount, setLiveTrafficCount] = useState<number | null>(null);
  const [live311Count, setLive311Count] = useState<number | null>(null);

  const { stats: crimeStats, isLoading: crimeLoading } = useCrimeStats();

  // ── Audit log ──────────────────────────────────────────────────────────────

  const writeAuditLog = async (
    action:
      | 'incident_update'
      | 'incident_soft_delete'
      | 'incident_suppress'
      | 'image_cleanup_failed'
      | 'community_stats_update'
      | 'community_stats_soft_delete',
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
      // Clearing the flagger list as well as the visibility, otherwise the
      // same two accounts could not re-flag and a restored report would sit at
      // or above the threshold forever.
      await updateDoc(doc(db, 'incidents', incidentId), {
        visibility: 'public',
        flagged: false,
        flagged_at: deleteField(),
        flagged_by: [],
        flag_count: 0,
      });
      await writeAuditLog('incident_update', 'incidents', incidentId, { visibility: 'public' });
    } catch (err) {
      // Surfaced rather than swallowed: this used to fail silently, which made
      // a rules rejection look identical to a successful restore.
      console.error('Failed to restore incident:', err);
      alert('Could not restore this incident. Check your admin permissions.');
    } finally {
      setRestoringId(null);
    }
  };

  const handlePermanentDelete = async (incidentId: string) => {
    if (!window.confirm('Permanently delete this incident? This cannot be undone.')) return;
    if (!db || deletingId) return;
    setDeletingId(incidentId);
    const target = incidents.find((i) => i.id === incidentId);
    const isIngested =
      target?.authorUid === 'system' ||
      (target?.data_source != null && target.data_source !== 'community');
    try {
      // Suppress first, delete second. Deleting an ingested record on its own
      // is undone by the next ingest run, which re-upserts by dedup_key; if the
      // suppression write fails we want to have stopped before the delete
      // rather than after it.
      if (isIngested) {
        await setDoc(doc(db, 'suppressed_incidents', suppressionDocId(incidentId)), {
          suppressedAt: Date.now(),
          // Expire the entry well past the point the upstream feed would have
          // dropped the record, so the list cannot grow without bound.
          expiresAt: Date.now() + SUPPRESSION_TTL_MS,
        });
        await writeAuditLog('incident_suppress', 'incidents', incidentId, {
          reason: 'admin_permanent_delete',
          source_type: target?.source_type ?? null,
        });
      }

      await deleteDoc(doc(db, 'incidents', incidentId));
      await writeAuditLog('incident_soft_delete', 'incidents', incidentId, { permanent: true });

      // The photo is removed after the record it belonged to is gone. A
      // failure here leaves an orphan rather than an inconsistent takedown, so
      // it is recorded for retry instead of aborting the deletion.
      if (target?.image_url) {
        const removed = await deleteIncidentImage(target.image_url);
        if (!removed) {
          await writeAuditLog('image_cleanup_failed', 'incidents', incidentId, {
            image_url: target.image_url,
          });
        }
      }
    } catch (err) {
      console.error('Failed to permanently delete incident:', err);
      alert('Could not delete this incident. Check your admin permissions.');
    } finally {
      setDeletingId(null);
    }
  };

  // ── Data subscriptions ────────────────────────────────────────────────────

  useEffect(() => {
    if (!isAuthReady || !user || !isAdmin || !db) return;

    const unsubIncidents = onSnapshot(
      query(collection(db, 'incidents'), orderBy('timestamp', 'desc'), limit(500)),
      (snapshot) => {
        const rows = snapshot.docs
          .map((row) => ({ id: row.id, ...row.data() } as Incident))
          .filter((row) => incidentVisibility(row) !== 'deleted');
        setIncidents(rows);
        setLoadingData(false);
      }
    );

    const unsubStats = onSnapshot(collection(db, 'community_stats'), (snapshot) => {
      const rows = snapshot.docs
        .map((row) => ({ id: row.id, ...row.data() } as CommunityStats & { id: string; deleted?: boolean }))
        .filter((row) => incidentVisibility(row) !== 'deleted');
      setCommunityStats(rows);
    });

    const unsubUsers = onSnapshot(query(collection(db, 'users'), limit(200)), (snapshot) => {
      setUsers(snapshot.docs.map((row) => row.data() as UserProfile));
    });

    // Page views — real-time listener for chart/breakdown data (last 2000 docs)
    const unsubPageViews = onSnapshot(
      query(collection(db, 'page_views'), orderBy('timestamp', 'desc'), limit(200)),
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
    const countInterval = 0;

    const unsubFlagged = onSnapshot(
      query(collection(db, 'incidents'), where('visibility', '==', 'flagged'), orderBy('flagged_at', 'desc')),
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

  // ── Incident chart data ───────────────────────────────────────────────────

  const categoryChartData = useMemo(() => {
    const counts: Record<string, number> = {};
    incidents.forEach((i) => { counts[i.category] = (counts[i.category] ?? 0) + 1; });
    // Series come from the shared category list, plus any legacy categories
    // still present on old documents, so this chart cannot silently omit a
    // category the rest of the app accepts.
    return [
      ...INCIDENT_CATEGORIES.map((c) => ({
        name: c.label,
        value: counts[c.value] ?? 0,
        color: c.color as string,
      })),
      ...LEGACY_INCIDENT_CATEGORIES.map((value) => ({
        name: `${value[0].toUpperCase()}${value.slice(1)} (legacy)`,
        value: counts[value] ?? 0,
        color: '#10b981',
      })),
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

  const newestSignups = useMemo(() => {
    const firstReportByUser = new globalThis.Map<string, number>();
    incidents.forEach((incident) => {
      const keys = [(incident as any).authorUid, incident.email].filter(Boolean) as string[];
      keys.forEach((key) => {
        const existing = firstReportByUser.get(key);
        if (!existing || incident.timestamp < existing) firstReportByUser.set(key, incident.timestamp);
      });
    });

    return users
      .map((profile) => ({
        ...profile,
        joinedAt: coerceTimestamp(profile.createdAt) || coerceTimestamp(profile.updatedAt) || firstReportByUser.get(profile.uid) || firstReportByUser.get(profile.email) || 0,
        reports: incidents.filter((i) =>
          ((i as any).authorUid && (i as any).authorUid === profile.uid) ||
          (i.email && i.email === profile.email && i.email !== 'anonymous@calgarywatch.app')
        ).length,
      }))
      .sort((a, b) => b.joinedAt - a.joinedAt)
      .slice(0, 5);
  }, [users, incidents]);

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
      // Stored as a bare hostname since the analytics sanitisation pass.
      // Older documents may still hold a full URL, so accept both.
      let host = pv.referrer.replace(/^www\./, '');
      if (host.includes('/') || host.includes(':')) {
        try {
          host = new URL(pv.referrer).hostname.replace(/^www\./, '');
        } catch {
          return;
        }
      }
      if (host && host !== window.location.hostname.replace(/^www\./, '')) {
        counts[host] = (counts[host] ?? 0) + 1;
      }
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1]).slice(0, 8)
      .map(([referrer, views]) => ({ referrer: referrer.length > 22 ? referrer.slice(0, 22) + '…' : referrer, views }));
  }, [pageViewDocs]);

  const organicSearchDocs = useMemo(
    () => pageViewDocs.filter((pv) => pv.traffic_source === 'organic_search'),
    [pageViewDocs]
  );

  const organicShare = useMemo(() => {
    if (!pageViewDocs.length) return 0;
    return Math.round((organicSearchDocs.length / pageViewDocs.length) * 100);
  }, [organicSearchDocs.length, pageViewDocs.length]);

  const organicSearchByDayData = useMemo(() => {
    const counts: Record<string, number> = {};
    organicSearchDocs.forEach((pv) => {
      const key = new Date(pv.timestamp).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
      counts[key] = (counts[key] ?? 0) + 1;
    });
    return Object.entries(counts)
      .map(([date, searches]) => ({ date, searches }))
      .sort((a, b) => b.searches - a.searches)
      .slice(0, 7);
  }, [organicSearchDocs]);

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
      await updateDoc(doc(db, 'incidents', incidentId), {
        visibility: 'deleted',
        deleted: true,
        deletedAt: Date.now(),
        deletedBy: user.uid,
      });
      await writeAuditLog('incident_soft_delete', 'incidents', incidentId, { visibility: 'deleted' });
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
  return {
    // ── auth ──
    user, isAuthReady, isAdmin,
    // ── raw collections ──
    incidents, communityStats, users, pageViewDocs, flaggedIncidents,
    crimeStats, crimeLoading, loadingData,
    // ── counters ──
    totalIncidents, emergencyIncidents, unresolvedIncidents, todayIncidents,
    totalUsers, adminUsers, viewOnlyUsers, uniqueReporterEmails,
    totalPageViews, uniqueSessions, avgPagesPerSession,
    liveTrafficCount, live311Count, averageSafety,
    pendingReviewIncidents,
    officialTrafficCount, official311Count, officialCrimeCount, communityReportCount,
    // ── chart series ──
    categoryChartData, userRoleChartData, trustChartData, timelineChartData,
    pageViewsSparklineData, incidentSparklineData, neighborhoodChartData,
    safetyChartData, hourlyChartData, categoryByDayData, topReportersData,
    newestSignups, userGrowthData, userGrowthSparklineData, pageViewsByDayData,
    trafficSourceData, topPagesData, utmCampaignData, topReferrersData,
    organicSearchDocs, organicShare, organicSearchByDayData,
    topCrimeCommunities,
    // ── api health ──
    apiHealths, checkApis,
    // ── drafts + mutations ──
    statsDrafts, setStatsDraft,
    savingStatsId, restoringId, deletingId, isRefreshingUsers,
    saveCommunityStats, softDeleteIncident, approveIncident,
    softDeleteCommunityStats, handleRestore, handlePermanentDelete, refreshUsers,
  };
}

export type AdminData = ReturnType<typeof useAdminData>;
