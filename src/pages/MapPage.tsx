import { plansAreaPatch } from '../lib/plansSetup';
import '../styles/map-brand.css';
import '../styles/briefing.css';
import '../styles/map-chrome.css';
import { useState, useEffect, useCallback, useRef, useMemo, startTransition } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import Map, { MapRef } from '@/src/components/Map';
import Sidebar from '@/src/components/Sidebar';
import IncidentForm, { IncidentFormData } from '@/src/components/IncidentForm';
import EmergencyModal, { EmergencySubmitData } from '@/src/components/EmergencyModal';
import AreaIntelligencePanel from '@/src/components/AreaIntelligencePanel';
import IncidentDetailPanel from '@/src/components/IncidentDetailPanel';
import LayerToggle from '@/src/components/LayerToggle';
import MobileMapSheet, { type MapSheetRef } from '@/src/components/MobileMapSheet';
import type { SheetState } from '@/src/hooks/useSheetDrag';
import MapTour from '@/src/components/MapTour';
import { Incident, IncidentCategory, AreaIntelligence, isPubliclyVisible, isCommunityFacingIncident } from '@/src/types';
import { getAreaIntelligence } from '@/src/services/mockData';
import { Plus, Navigation, ShieldAlert, Bell, Search, X, LogIn, Home, Siren, Check, ArrowRight, MapPin } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { CALGARY_CENTER } from '@/src/constants';
import { useAuth } from '@/src/components/FirebaseProvider';
import { db, handleFirestoreError, OperationType } from '@/src/firebase';
import { collection, onSnapshot, query, where, orderBy, limit, getDoc, getDocs, startAfter, QueryDocumentSnapshot, DocumentData, doc, setDoc, writeBatch } from 'firebase/firestore';
import { cn } from '@/src/lib/utils';
import { buildWatchFeed } from '@/src/lib/watch';
import { DIGEST_CATEGORY_ORDER, DIGEST_CATEGORY_LABEL } from '@/src/lib/digest';
import { mergeWatchState, readLocalWatch, writeLocalWatch } from '@/src/lib/watchProfile';
import { logProductEvent } from '@/src/lib/productEvents';
import { enablePush, disablePush, isPushSupported, isPushConfigured, isPushEnabledHere, type PushStatus } from '@/src/lib/push';
import { SidebarSkeleton, MapShimmer } from '@/src/components/SkeletonLoader';
import { useCrimeStats, computeCityAverages } from '@/src/hooks/useCrimeStats';
import { useAlbertaMunicipalityCrimeStats } from '@/src/hooks/useAlbertaMunicipalityCrimeStats';
import { usePropertyAssessments } from '@/src/hooks/usePropertyAssessments';
import { useEdmontonOpenData } from '@/src/hooks/useEdmontonOpenData';
import { usePowerOutages } from '@/src/hooks/usePowerOutages';
import { useAirQuality } from '@/src/hooks/useAirQuality';
import type { AirZoneReading } from '@/src/lib/airQuality';
import { useRiverLevels } from '@/src/hooks/useRiverLevels';
import { useTrafficCameras, type TrafficCamera } from '@/src/hooks/useTrafficCameras';
import CameraViewer from '@/src/components/CameraViewer';
import TrafficFlowPanel from '@/src/components/TrafficFlowPanel';
import { useTrafficFlow } from '@/src/hooks/useTrafficFlow';
import type { TrafficSegmentState } from '@/src/types/trafficFlow';
import { useSafetyCameras } from '@/src/hooks/useSafetyCameras';
import { stripCityQualifier, withCityQualifier, buildAddressQuery, rankAddressMatches, rankFullTextMatches } from '@/src/lib/address';
import { curateTrafficReports } from '@/src/lib/reportCuration';
import { categoryColor } from '@/src/lib/tokens';
import PersonalBriefing from '@/src/components/PersonalBriefing';
import { communityCentre, fetchCommunityBoundaries, findCommunityAt, normalizeCalgaryAddress, pointInPolygon, type CommunityBoundary } from '@/src/lib/communityLookup';
import { applySuppression, useSuppressedIds } from '@/src/lib/suppression';
import { getDistance } from '@/src/lib/geo';
import { classify311Service } from '@/src/lib/three11';
import DesktopMapBrandMark from '@/src/components/DesktopMapBrandMark';
import { fetchCalgaryTraffic } from '@/src/lib/calgaryTraffic';
import NowBriefing from '@/src/components/map/NowBriefing';
import { LivePill, WhenChips, UnreadBadge, UserMenu, AvatarFace, freshnessLabel, windowWord, bellLabel } from '@/src/components/map/ChromeParts';
import { NotificationRow, NotificationsEmpty, type MapNotification, type AreaComparison } from '@/src/components/map/NotificationRow';
import { inMapTimeWindow, parseWhenParam, type MapTimeWindow } from '@/src/lib/mapTimeWindow';

function getCalgaryQuadrant(lat: number, lng: number) {
  const northSouth = lat >= CALGARY_CENTER.lat ? 'N' : 'S';
  const eastWest = lng >= CALGARY_CENTER.lng ? 'E' : 'W';
  return `${northSouth}${eastWest}`;
}

type UserProfileSettings = {
  uid?: string;
  displayName?: string;
  email?: string;
  photoURL?: string;
  role?: string;
  neighborhood?: string;
  inferredNeighborhood?: string;
  address?: string;
  locationPreferenceType?: 'address' | 'neighborhood' | 'none';
  piiConsentAt?: number | null;
  weeklyDigestOptIn?: boolean;
  weeklyDigestOptInAt?: number;
  /** Categories the reader chose for their weekly digest; empty/absent = all. */
  digestCategories?: IncidentCategory[];
  profileUpdatedAt?: number;
  onboardingCompletedAt?: number;
  /** Set the first (and only) time the weekly-digest prompt is shown */
  digestPromptedAt?: number;
  digestUnsubscribedAt?: number | null;
  digestUnsubscribeSource?: string | null;
  /** "My Watch" — epoch ms the reader last opened the since-you-last-checked panel. */
  watchLastSeenAt?: number;
  /** "My Watch" — metres from home the reader cares about; absent means no radius filter. */
  watchRadiusM?: number;
  /** "My Watch" — categories the reader wants; absent/empty means all. */
  watchCategories?: IncidentCategory[];
  /** Instant alerts (Phase 3): opt-in, quiet hours, and category narrowing. */
  alertsEnabled?: boolean;
  alertCategories?: IncidentCategory[];
  alertQuietStartHour?: number;
  alertQuietEndHour?: number;
  /** IANA timezone the quiet-hours bounds are read in; captured at opt-in. */
  alertTimezone?: string;
  /** Extra named areas (beyond home) the reader wants alerted about. */
  alertZones?: { id: string; label: string; neighborhood: string; radiusM: number }[];
  /** Set false to stop always-on emergency alerts. Absent/true keeps them on. */
  alertEmergencyAlways?: boolean;
  /** Server-side dedup cursor for the alert-sending job. */
  alertLastSentAt?: number;
  /** Registered browser-push tokens for this reader (W3-5). */
  pushTokens?: string[];
};

const FALLBACK_NEIGHBORHOODS = [
  'Beltline',
  'Downtown Calgary',
  'Bridgeland/Riverside',
  'Kensington',
  'Inglewood',
  'Marda Loop',
  'Mission',
  'Sunnyside',
  'Forest Lawn',
  'Bowness',
  'Seton',
  'Mahogany',
];

// ---------------------------------------------------------------------------
// Geocode a Calgary address → official community name via Nominatim (OSM).
// Returns the suburb / neighbourhood string from the structured address, or ''.
// Called at profile-save time so results are stored — not on every report view.
// ---------------------------------------------------------------------------
async function geocodeOnce(query: string) {
  const q = encodeURIComponent(`${query}, Calgary, Alberta, Canada`);
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${q}&format=json&addressdetails=1&limit=1&countrycodes=ca`,
    { headers: { 'User-Agent': 'CalgaryWatch/1.0 (community-safety-app)' } }
  );
  if (!res.ok) return null;
  const data: Array<{ address: Record<string, string>; lat?: string; lon?: string }> = await res.json();
  return data[0] ?? null;
}

async function geocodeToCalgarySuburb(address: string): Promise<string> {
  try {
    const raw = address.trim();
    const normalized = normalizeCalgaryAddress(raw);

    // Ordinal-stripped form first — the geocoder fails outright on "16th Ave"
    // but resolves "16 Ave". Fall back to what the user typed if that misses.
    let hit = await geocodeOnce(normalized);
    if (!hit && normalized !== raw) hit = await geocodeOnce(raw);
    if (!hit) return '';

    // Prefer the authoritative answer: which City of Calgary community polygon
    // actually contains this point. That name is the exact key crime stats and
    // the choropleth use, so the area report can look it up with no guessing.
    // Nominatim's own suburb label is only a fallback — it comes from a
    // different dataset and often disagrees with the City's community names.
    const lat = Number(hit.lat);
    const lng = Number(hit.lon);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      const boundaries = await fetchCommunityBoundaries();
      const community = findCommunityAt(lat, lng, boundaries);
      if (community) return community;
    }

    const addr = hit.address;
    if (!addr) return '';
    // Nominatim returns Calgary communities under suburb or neighbourhood
    return (addr.suburb || addr.neighbourhood || addr.city_district || addr.quarter || '').trim();
  } catch {
    return '';
  }
}

// Title-case city-registry strings ("1125 17 AV SW" → "1125 17 Av SW",
// "LOWER MOUNT ROYAL" → "Lower Mount Royal") keeping quadrants uppercase.
function titleCaseAddress(raw: string): string {
  return raw
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (/^(nw|ne|sw|se)$/.test(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ')
    .trim();
}

/**
 * Live address autocomplete against the City of Calgary property registry
 * (Property Assessments open dataset) — real addresses, each carrying its
 * official community name.
 */
function useAddressSearch(query: string): Array<{ label: string; neighborhood: string }> {
  const [results, setResults] = useState<Array<{ label: string; neighborhood: string }>>([]);
  useEffect(() => {
    const built = buildAddressQuery(query);
    if (!built) { setResults([]); return; }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      const run = async (params: string) => {
        const url =
          'https://data.calgary.ca/resource/4ur7-wsgc.json?$select=address,comm_name' +
          '&$group=address,comm_name&$limit=25' + params;
        const res = await fetch(url, { signal: ctrl.signal });
        return res.ok ? ((await res.json()) as Array<{ address?: string; comm_name?: string }>) : [];
      };
      try {
        let usedPrefix = Boolean(built.where);
        let rows = await run(
          built.where ? `&$where=${encodeURIComponent(built.where)}` : `&$q=${encodeURIComponent(built.q ?? '')}`,
        );
        // "17 av sw" starts with a digit but is a street, not a house number,
        // so nothing prefix-matches it. Fall back to full text — and drop the
        // prefix ranking with it, because that ordering is only valid when
        // every result is an equally good match.
        if (rows.length === 0 && built.where) {
          rows = await run(`&$q=${encodeURIComponent(stripCityQualifier(query).trim())}`);
          usedPrefix = false;
        }

        // A plain record, not a Map — `Map` is the map component in this file.
        const community: Record<string, string> = {};
        for (const row of rows) {
          if (row.address && !(row.address in community)) community[row.address] = row.comm_name ?? '';
        }
        const ordered = usedPrefix
          ? rankAddressMatches(Object.keys(community))
          : rankFullTextMatches(Object.keys(community), query);
        setResults(
          ordered
            .slice(0, 5)
            .map((address) => ({
              label: `${titleCaseAddress(address)}, Calgary`,
              neighborhood: community[address] ? titleCaseAddress(community[address]) : '',
            })),
        );
      } catch { /* aborted or offline — keep previous results */ }
    }, 300);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [query]);
  return results;
}

/** Full official community list (Community District Boundaries dataset). */
let COMMUNITY_CACHE: string[] | null = null;
function useCalgaryCommunities(enabled: boolean): string[] {
  const [list, setList] = useState<string[]>(COMMUNITY_CACHE ?? []);
  useEffect(() => {
    if (!enabled || COMMUNITY_CACHE) return;
    fetch('https://data.calgary.ca/resource/surr-xmvs.json?$select=name&$limit=400')
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: Array<{ name?: string }>) => {
        const names = rows
          .map((r) => r.name ?? '')
          .filter((n) => n && !/^\d/.test(n))
          .map(titleCaseAddress)
          .sort((a, b) => a.localeCompare(b));
        COMMUNITY_CACHE = names;
        setList(names);
      })
      .catch(() => {});
  }, [enabled]);
  return list;
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06L5.84 9.9C6.71 7.31 9.14 5.38 12 5.38z" />
    </svg>
  );
}

function useOfficialOpenData(isAuthReady: boolean) {
  const [officialIncidents, setOfficialIncidents] = useState<Incident[]>([]);

  useEffect(() => {
    if (!isAuthReady) return;

    const fetchOpenData = async () => {
      const fetchedAt = Date.now();
      const trafficIncidents: Incident[] = [];
      const three11Incidents: Incident[] = [];
      const infrastructureIncidents: Incident[] = [];

      // ── Traffic — isolated so a failure never blocks 311 ──────────────────
      try {
        const { rows: trafficData } = await fetchCalgaryTraffic<any>(60);

        for (const item of trafficData) {
          const lat = parseFloat(item.latitude);
          const lng = parseFloat(item.longitude);
          if (!isFinite(lat) || !isFinite(lng)) continue;

          const rawInfo = (item.incident_info || '').trim().toLowerCase();
          const rawDesc = (item.description || '').trim().toLowerCase();
          const combined = `${rawInfo} ${rawDesc}`;
          const quadrant = item.quadrant ? `Calgary ${item.quadrant}` : 'Calgary';

          let tTitle: string;
          let tDesc: string;
          if (combined.includes('collision') || combined.includes('accident')) {
            tTitle = 'Vehicle Collision'; tDesc = `Multi-vehicle collision in ${quadrant}. Expect delays and use alternate routes.`;
          } else if (combined.includes('stalled') || combined.includes('disabled vehicle')) {
            tTitle = 'Stalled Vehicle'; tDesc = `Stalled vehicle on the roadway in ${quadrant}. Lane restriction in effect.`;
          } else if (combined.includes('signal') || combined.includes('light out')) {
            tTitle = 'Traffic Signal Issue'; tDesc = `Traffic signal malfunction in ${quadrant}. Treat as all-way stop.`;
          } else if (combined.includes('road closure') || combined.includes('closed')) {
            tTitle = 'Road Closure'; tDesc = `Road closure active in ${quadrant}. Check alternate routes before travelling.`;
          } else if (combined.includes('construction') || combined.includes('paving') || combined.includes('utility')) {
            tTitle = 'Construction Zone'; tDesc = `Active construction causing lane reductions in ${quadrant}.`;
          } else if (combined.includes('spill') || combined.includes('debris') || combined.includes('hazard')) {
            tTitle = 'Road Hazard'; tDesc = `Hazardous material or debris on roadway in ${quadrant}.`;
          } else if (combined.includes('flood') || combined.includes('water')) {
            tTitle = 'Flooded Roadway'; tDesc = `Water on roadway in ${quadrant}. Do not drive through flooded sections.`;
          } else {
            tTitle = item.incident_info?.trim() || 'Traffic Disruption';
            tDesc = `Traffic disruption in ${quadrant}. Check 511 Alberta for updates.`;
          }

          const parsedStart = Date.parse(item.start_dt || '');
          // Planned work can have a future start. Keep ordering honest by
          // stamping it when first observed, never in the future.
          const ts = Number.isFinite(parsedStart) ? Math.min(parsedStart, fetchedAt) : fetchedAt;
          trafficIncidents.push({
            id: `yyc-traffic-${item.id || `${String(item.incident_info || 'unk').replace(/[^a-zA-Z0-9]/g, '').slice(0, 32)}-${lat.toFixed(3)}-${lng.toFixed(3)}`}`,
            title: tTitle, description: tDesc, category: 'traffic' as IncidentCategory,
            neighborhood: quadrant, lat, lng, timestamp: ts,
            email: 'opendata@calgary.ca', name: 'City of Calgary Traffic',
            anonymous: false, verified_status: 'community_confirmed' as const, report_count: 1,
            data_source: 'official' as const, source_name: 'City of Calgary Open Data',
            source_url: 'https://data.calgary.ca/dataset/Traffic-Incidents/35ra-9556',
            // This endpoint contains active incidents. Keep each row until
            // shortly after the next refresh even when its start time is old.
            expires_at: fetchedAt + 90 * 60 * 1000,
          });
        }
      } catch (err) {
        console.warn('[CalgaryWatch] Traffic API failed:', err);
      }

      // ── Calgary 311 — isolated so a failure never blocks traffic ──────────
      try {
        const recent311Cutoff = new Date(fetchedAt - 7 * 24 * 60 * 60 * 1000)
          .toISOString().slice(0, 19);
        const three11Url =
          'https://data.calgary.ca/resource/iahh-g8bj.json' +
          '?$limit=100' +
          '&$where=' + encodeURIComponent(
            `status_description='Open' AND requested_date > '${recent311Cutoff}'`,
          ) +
          '&$order=' + encodeURIComponent('requested_date DESC');

        const three11Res = await fetch(three11Url);
        if (!three11Res.ok) throw new Error(`311 API ${three11Res.status}`);
        const three11Data: any[] = await three11Res.json();

        for (const item of three11Data) {
          const lat = parseFloat(item.latitude);
          const lng = parseFloat(item.longitude);
          if (!isFinite(lat) || !isFinite(lng)) continue;

          // Never 'emergency': a 311 row is a resident service request, and
          // loose "fire" matching once flagged fire-code questions as emergencies.
          const category = classify311Service(item.service_name);
          if (!category) continue;

          const timestamp = new Date(item.requested_date || new Date()).getTime();
          let cleanTitle = item.service_name || 'City Service Issue';
          if (cleanTitle.startsWith('Bylaw - ')) cleanTitle = cleanTitle.replace('Bylaw - ', '');
          if (cleanTitle.includes('Disturbance and Behavioural Concerns')) cleanTitle = 'Public Disturbance';

          const area = item.comm_name ? `in ${item.comm_name}` : 'in Calgary';
          const status = item.status_description ? ` Current 311 status: ${item.status_description}.` : '';
          // Do not turn a service request into an invented dispatch claim. The
          // API proves that a resident filed it; it does not prove an officer
          // or crew is currently en route.
          const cleanDesc = `${cleanTitle} reported to City of Calgary 311 ${area}.${status} This is a resident service request, not a police-confirmed offence.`;

          three11Incidents.push({
            id: `yyc-311-${item.service_request_id}`,
            title: cleanTitle, description: cleanDesc, category,
            neighborhood: item.comm_name || 'Calgary', lat, lng, timestamp,
            email: 'opendata@calgary.ca', name: 'Calgary 311 Sync',
            anonymous: false, verified_status: 'community_confirmed' as const, report_count: 1,
            data_source: 'official' as const, source_name: 'Calgary 311',
            source_url: 'https://data.calgary.ca/dataset/311-Service-Requests/iahh-g8bj',
            expires_at: timestamp + 7 * 24 * 60 * 60 * 1000,
          });
        }
      } catch (err) {
        console.warn('[CalgaryWatch] 311 API failed:', err);
      }

      // ── Calgary Water Main Breaks — dedicated infrastructure feed ────────
      try {
        const waterMainUrl =
          'https://data.calgary.ca/resource/dpcu-jr23.json' +
          '?$limit=60' +
          '&$order=' + encodeURIComponent('break_date DESC') +
          '&status=ACTIVE';

        const waterMainRes = await fetch(waterMainUrl);
        if (!waterMainRes.ok) throw new Error(`Water Main Breaks API ${waterMainRes.status}`);
        const waterMainData: any[] = await waterMainRes.json();
        const now = Date.now();
        const recentThreshold = now - 60 * 24 * 60 * 60 * 1000;

        for (const item of waterMainData) {
          const coords = item.point?.coordinates;
          if (!Array.isArray(coords) || coords.length < 2) continue;

          const [lngRaw, latRaw] = coords;
          const lat = Number(latRaw);
          const lng = Number(lngRaw);
          if (!isFinite(lat) || !isFinite(lng)) continue;

          const timestamp = new Date(item.break_date || now).getTime();
          if (!Number.isFinite(timestamp) || timestamp < recentThreshold) continue;

          const quadrant = getCalgaryQuadrant(lat, lng);
          const materialCode = String(item.break_type || '').toUpperCase();
          const materialLabel = ({
            AC: 'asbestos cement',
            CI: 'cast iron',
            DI: 'ductile iron',
            PVC: 'PVC',
            S: 'steel',
            G: 'galvanized',
            A: 'unknown main',
            CG: 'cast iron / galvanized',
          } as Record<string, string>)[materialCode] || 'water infrastructure';

          infrastructureIncidents.push({
            id: `yyc-water-main-${item.break_date || 'nodate'}-${lat.toFixed(4)}-${lng.toFixed(4)}`,
            title: 'Water Main Break',
            description: `Active water main break affecting Calgary ${quadrant}. Utility crews are responding. Pipe type: ${materialLabel}. Expect local service and road impacts nearby.`,
            category: 'infrastructure' as IncidentCategory,
            neighborhood: `Calgary ${quadrant}`,
            lat,
            lng,
            timestamp,
            email: 'opendata@calgary.ca',
            name: 'Calgary Water Services',
            anonymous: false,
            verified_status: 'community_confirmed' as const,
            report_count: 1,
            data_source: 'official' as const,
            source_name: 'Calgary Water Main Breaks',
            source_type: 'calgary_water_main_breaks',
            source_url: 'https://data.calgary.ca/dataset/Water-Main-Breaks/dpcu-jr23',
            expires_at: now + 24 * 60 * 60 * 1000,
          });
        }
      } catch (err) {
        console.warn('[CalgaryWatch] Water Main Breaks API failed:', err);
      }

      // Deduplicate within each source by ID, then proximity-dedup across all sources.
      // Same-category incidents within 50m are the same real-world event (multiple 311 reports).
      // Cross-category incidents within 15m are also the same event (water main in 2 APIs).
      const allOfficial = [
        ...new globalThis.Map(trafficIncidents.map(i => [i.id, i])).values(),
        ...new globalThis.Map(three11Incidents.map(i => [i.id, i])).values(),
        ...new globalThis.Map(infrastructureIncidents.map(i => [i.id, i])).values(),
      ];
      // Sort newest-first so the most recent report wins when two are within the radius.
      allOfficial.sort((a, b) => b.timestamp - a.timestamp);
      const kept: Incident[] = [];
      for (const inc of allOfficial) {
        const isDup = kept.some(k =>
          getDistance(k.lat, k.lng, inc.lat, inc.lng) <
            (k.category === inc.category ? 0.05 : 0.015)
        );
        if (!isDup) kept.push(inc);
      }
      setOfficialIncidents(kept);
    };

    fetchOpenData();
    const interval = setInterval(fetchOpenData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [isAuthReady]);

  return officialIncidents;
}

// ── WMO weather code → alert (returns null if conditions are unremarkable) ──
const WMO_ALERTS: Record<number, { title: string; description: string; severity: 'advisory' | 'watch' | 'warning' }> = {
  // Drizzle
  51: { title: 'Drizzle', description: 'Light drizzle in the area. Roads may be slippery — allow extra stopping distance.', severity: 'advisory' },
  53: { title: 'Drizzle', description: 'Moderate drizzle. Wet roads and reduced visibility in this part of the city.', severity: 'advisory' },
  55: { title: 'Heavy Drizzle', description: 'Dense drizzle reducing visibility. Drive with headlights on.', severity: 'advisory' },
  // Rain
  61: { title: 'Rain', description: 'Light rain falling in this area. Wet roads — slow down and increase following distance.', severity: 'advisory' },
  63: { title: 'Moderate Rain', description: 'Moderate rainfall in this quadrant. Standing water possible on roadways.', severity: 'advisory' },
  65: { title: 'Heavy Rain', description: 'Heavy rain falling. Reduced visibility and possible localized flooding.', severity: 'watch' },
  // Rain showers
  80: { title: 'Rain Showers', description: 'Scattered rain showers moving through this area. Intermittent wet conditions on roads.', severity: 'advisory' },
  81: { title: 'Rain Showers', description: 'Moderate rain showers with gusty winds possible in this quadrant.', severity: 'advisory' },
  82: { title: 'Heavy Rain Showers', description: 'Heavy rain showers moving through. Ponding water on roads — slow down.', severity: 'watch' },
  // Fog
  45: { title: 'Fog Advisory', description: 'Dense fog reducing visibility. Drive with headlights on and reduce speed.', severity: 'advisory' },
  48: { title: 'Freezing Fog Warning', description: 'Freezing fog causing icy road surfaces. Extremely slippery conditions.', severity: 'warning' },
  // Freezing precip
  56: { title: 'Freezing Drizzle', description: 'Light freezing drizzle creating ice on roads and sidewalks. Use caution.', severity: 'watch' },
  57: { title: 'Heavy Freezing Drizzle', description: 'Heavy freezing drizzle causing dangerous ice accumulation on all surfaces.', severity: 'warning' },
  66: { title: 'Freezing Rain', description: 'Freezing rain producing significant ice build-up on roads. Travel not recommended.', severity: 'warning' },
  67: { title: 'Heavy Freezing Rain', description: 'Heavy freezing rain. Dangerous driving conditions — travel only if necessary.', severity: 'warning' },
  // Snow
  71: { title: 'Snow', description: 'Light snow falling in this quadrant. Slippery road conditions developing.', severity: 'advisory' },
  73: { title: 'Snowfall', description: 'Moderate snowfall in this area. Plows are active — allow extra travel time.', severity: 'watch' },
  75: { title: 'Heavy Snowfall', description: 'Heavy snowfall with significant accumulation expected. Expect major travel delays.', severity: 'warning' },
  77: { title: 'Snow Pellets', description: 'Ice pellets reducing road traction. Treat intersections with extra caution.', severity: 'watch' },
  85: { title: 'Snow Showers', description: 'Snow showers moving through this part of the city. Reduced visibility in exposed areas.', severity: 'advisory' },
  86: { title: 'Heavy Snow Showers', description: 'Heavy snow showers causing rapidly deteriorating travel conditions in this quadrant.', severity: 'watch' },
  // Thunderstorm
  95: { title: 'Thunderstorm', description: 'Thunderstorm in this area. Seek shelter immediately — avoid open spaces.', severity: 'watch' },
  96: { title: 'Thunderstorm with Hail', description: 'Thunderstorm producing hail. Move vehicles under cover and stay indoors.', severity: 'warning' },
  99: { title: 'Severe Thunderstorm', description: 'Severe thunderstorm with large hail and heavy rain. Take shelter immediately.', severity: 'warning' },
};

// Alberta weather zones: [name, lat, lng]
const ALBERTA_WEATHER_ZONES: [string, number, number][] = [
  // Calgary
  ['Northwest Calgary',  51.128, -114.190],
  ['Northeast Calgary',  51.128, -113.980],
  ['Downtown Calgary',   51.048, -114.065],
  ['Southwest Calgary',  50.975, -114.180],
  ['Southeast Calgary',  50.975, -113.980],
  // Surrounding communities
  ['Airdrie',            51.292, -114.014],
  ['Cochrane',           51.189, -114.467],
  ['Chestermere',        51.047, -113.821],
  ['Okotoks',            50.726, -113.975],
  ['High River',         50.580, -113.874],
  ['Strathmore',         51.038, -113.400],
  ['Canmore',            51.090, -115.359],
  // Edmonton
  ['Northwest Edmonton', 53.600, -113.650],
  ['Central Edmonton',   53.544, -113.490],
  ['Southeast Edmonton', 53.460, -113.370],
];

function useWeatherAlerts(isAuthReady: boolean) {
  const [weatherAlerts, setWeatherAlerts] = useState<Incident[]>([]);

  useEffect(() => {
    if (!isAuthReady) return;

    const fetchWeather = async () => {
      const alerts: Incident[] = [];
      const now = Date.now();
      const SEVERITY_RANK: Record<string, number> = { advisory: 1, watch: 2, warning: 3 };

      await Promise.allSettled(
        ALBERTA_WEATHER_ZONES.map(async ([zoneName, lat, lng]) => {
          try {
            const url =
              `https://api.open-meteo.com/v1/forecast` +
              `?latitude=${lat}&longitude=${lng}` +
              `&current=temperature_2m,weathercode,windspeed_10m,precipitation` +
              `&timezone=America%2FEdmonton`;
            const res = await fetch(url);
            if (!res.ok) return;
            const data = await res.json();
            const current = data.current;
            if (!current) return;

            const code: number = current.weathercode;
            const windKph: number = current.windspeed_10m ?? 0;
            const tempC: number = current.temperature_2m ?? 99;

            // Collect all candidate alerts for this zone, then emit only the most severe.
            // Multiple alerts at the same coordinates stack on the map — one per zone prevents that.
            const candidates: Array<{ incident: Incident; severity: number }> = [];

            const base = {
              category: 'weather' as IncidentCategory,
              neighborhood: zoneName,
              lat, lng,
              timestamp: now,
              email: 'alerts@open-meteo.com',
              name: 'Environment Canada (via Open-Meteo)',
              anonymous: false,
              verified_status: 'community_confirmed' as const,
              report_count: 1,
              data_source: 'official' as const,
              source_name: 'Environment Canada',
              source_url: 'https://weather.gc.ca/',
              expires_at: now + 2 * 60 * 60 * 1000,
            };

            if (WMO_ALERTS[code]) {
              const alert = WMO_ALERTS[code];
              candidates.push({
                severity: SEVERITY_RANK[alert.severity] ?? 1,
                incident: {
                  ...base,
                  id: `wx-${zoneName.replace(/\s+/g, '-').toLowerCase()}-${code}`,
                  title: alert.title,
                  description: `${alert.description} (${zoneName}, ${tempC.toFixed(0)}°C)`,
                },
              });
            }

            if (windKph >= 70) {
              const sev = windKph >= 90 ? 3 : 2;
              candidates.push({
                severity: sev,
                incident: {
                  ...base,
                  id: `wx-wind-${zoneName.replace(/\s+/g, '-').toLowerCase()}`,
                  title: windKph >= 90 ? 'Extreme Wind Warning' : 'Wind Warning',
                  description: `Sustained winds of ${Math.round(windKph)} km/h in ${zoneName}. Secure loose outdoor objects.`,
                },
              });
            }

            if (tempC <= -35) {
              candidates.push({
                severity: 3,
                incident: {
                  ...base,
                  id: `wx-cold-${zoneName.replace(/\s+/g, '-').toLowerCase()}`,
                  title: 'Extreme Cold Warning',
                  description: `Temperature of ${tempC.toFixed(0)}°C in ${zoneName}. Frostbite can occur within minutes of exposure.`,
                },
              });
            }

            if (candidates.length > 0) {
              candidates.sort((a, b) => b.severity - a.severity);
              alerts.push(candidates[0].incident);
            }
          } catch {
            // Silent — partial failures are fine
          }
        })
      );

      setWeatherAlerts(alerts);
    };

    fetchWeather();
    const interval = setInterval(fetchWeather, 30 * 60 * 1000); // refresh every 30 min
    return () => clearInterval(interval);
  }, [isAuthReady]);

  return weatherAlerts;
}

export default function MapPage() {
  const INCIDENT_PAGE_SIZE = 60;
  const { user, signIn, logout, isAuthReady, isAdmin } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const mapRef = useRef<MapRef>(null);
  const officialOpenData = useOfficialOpenData(isAuthReady);
  const weatherAlerts = useWeatherAlerts(isAuthReady);
  const edmontonOpenData = useEdmontonOpenData(isAuthReady);
  // ENMAX outages arrive already adapted into infrastructure incidents.
  const powerOutageIncidents = usePowerOutages(isAuthReady);
  // Wildfire smoke is the one hazard nobody files a report about, because it is
  // a condition rather than an event. It has to come from a measurement.
  const { incidents: airQualityIncidents, readings: airReadings } = useAirQuality(isAuthReady);
  // 2013 is why the rivers belong here. This reports the gauge and its trend —
  // Alberta Emergency Alert, already ingested, issues the actual warnings.
  const riverIncidents = useRiverLevels(isAuthReady);
  const suppressedIds = useSuppressedIds(isAuthReady);
  const { stats: crimeStats, yearlyStats: crimeYearlyStats } = useCrimeStats();
  const { stats: statcanStats, yearlyStats: statcanYearlyStats } = useAlbertaMunicipalityCrimeStats();
  const cityAverages = useMemo(() => computeCityAverages(crimeStats), [crimeStats]);

  const [firebaseIncidents, setFirebaseIncidents] = useState<Incident[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<IncidentCategory | 'all'>('all');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<{ lat: number; lng: number } | null>(null);
  
  const [selectedArea, setSelectedArea] = useState<AreaIntelligence | null>(null);
  const { data: propertyData } = usePropertyAssessments(selectedArea?.communityName ?? null);
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [activeIncidentId, setActiveIncidentId] = useState<string | null>(null);
  
  const [showLiveReports, setShowLiveReports] = useState(true);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [showCameras, setShowCameras] = useState(false);
  const [showSafetyCameras, setShowSafetyCameras] = useState(false);
  const [showTrafficFlow, setShowTrafficFlow] = useState(false);
  const [briefingOpen, setBriefingOpen] = useState(false);
  const [showCrimeLayer, setShowCrimeLayer] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [nearMeOpen, setNearMeOpen] = useState(false);
  /** The camera pin a reader tapped, or null when the viewer is closed. */
  const [viewerCamera, setViewerCamera] = useState<TrafficCamera | null>(null);
  const [selectedTrafficSegment, setSelectedTrafficSegment] = useState<TrafficSegmentState | null>(null);
  const trafficFlow = useTrafficFlow(showTrafficFlow);
  // Only fetched once the layer is switched on.
  // Also loaded when an incident is open, so its detail panel can show a
  // camera overlooking that spot. One request, cached for the session.
  //
  // Declared after nearMeOpen on purpose: this reads it, and a const read
  // during render before its declaration is a TDZ ReferenceError.
  const trafficCameras = useTrafficCameras(
    // Also loaded for the Near Me panel, which shows the nearest camera's
    // live frame the moment someone declares their location.
    // The viewer keeps them loaded while it is open so its walk-through has
    // neighbours to step to even if the layer is switched off underneath it.
    showCameras || briefingOpen || Boolean(selectedIncident) || Boolean(viewerCamera) || Boolean(selectedTrafficSegment),
  );
  // Also loaded for the personal briefing, which counts them near a saved address.
  const safetyCameras = useSafetyCameras(showSafetyCameras || Boolean(user));
  const [nearMeIndex, setNearMeIndex] = useState(0);
  // Radar-scan moment before results reveal — the pause builds anticipation
  // and makes the reveal land (Duolingo-style feedback loop).
  const [nearMeScanning, setNearMeScanning] = useState(false);
  /**
   * The locate button used to do three things on one press: fly, drop a pin,
   * and jump straight to the nearest incident — which moved the map away from
   * the thing the person had just asked to see. It now stops on arrival and
   * asks before going anywhere.
   */
  const [nearMeStage, setNearMeStage] = useState<'arrived' | 'results'>('arrived');
  /** Once shown, the "you are here" pin stays for the whole session. */
  const userPinShown = useRef(false);
  const nearMeScanTimer = useRef<number | null>(null);
  const NEAR_ME_RADIUS_KM = 3;
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [sheetState, setSheetState] = useState<SheetState>('rail');
  const sheetRef = useRef<MapSheetRef>(null);
  const chromeRef = useRef<HTMLDivElement>(null);

  /**
   * Publish the chrome's height so the tap-to-close scrim can start below it.
   *
   * The scrim used to be `top-0` with `bottom: 82vh`, which put it over the
   * chrome at every common phone height — a category chip, Home, and the
   * near-me button all collapsed the sheet instead of acting. The height is
   * measured rather than assumed because it varies with
   * env(safe-area-inset-top), and a hard-coded guess meeting a variable-height
   * element is exactly what caused the bug. This fixes Home and the search
   * bar, which live inside the measured region; the category chip is gone
   * (the sheet holds the only copy now); the near-me button lives in a
   * separate sibling container and is raised above the scrim independently,
   * by z-index, since its height doesn't need to be measured.
   */
  useEffect(() => {
    const el = chromeRef.current;
    if (!el) return;
    const publish = () => {
      document.documentElement.style.setProperty('--cw-chrome-h', `${el.offsetHeight}px`);
    };
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(el);
    window.addEventListener('orientationchange', publish);
    return () => {
      observer.disconnect();
      window.removeEventListener('orientationchange', publish);
      document.documentElement.style.removeProperty('--cw-chrome-h');
    };
  }, []);
  const [notifications, setNotifications] = useState<MapNotification[]>([]);
  const [unreadNotifications, setUnreadNotifications] = useState<number>(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const [authPanelOpen, setAuthPanelOpen] = useState(false);
  const [authPanelMode, setAuthPanelMode] = useState<'signin' | 'settings'>('signin');
  const [userProfile, setUserProfile] = useState<UserProfileSettings | null>(null);
  const [profileDraft, setProfileDraft] = useState({ neighborhood: '', address: '', inferredNeighborhood: '', piiConsent: false, weeklyDigestOptIn: false, digestCategories: [] as IncidentCategory[] });
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileSaveError, setProfileSaveError] = useState<string | null>(null);
  const [isEditingPreferences, setIsEditingPreferences] = useState(false);
  const [onboardingDismissedThisSession, setOnboardingDismissedThisSession] = useState(false);
  const [locationError, setLocationError] = useState(false);

  /**
   * Time window applied to the feed.
   *
   * Every incident already carries a timestamp and nothing let a reader use it,
   * so the feed mixed a collision from twenty minutes ago with a road
   * restriction from last week and gave them equal weight. This is a pure
   * client-side narrowing of data already loaded — it issues no additional
   * requests and touches no ingest behaviour.
   *
   * Defaults to 'all' so the feed starts exactly as it did before, unless the
   * link names a window (`?when=tonight`, `?when=yesterday`, ...). The same
   * window now narrows the map markers too: it used to change the feed while
   * the map kept showing everything.
   */
  const [timeWindow, setTimeWindow] = useState<MapTimeWindow>(
    () => parseWhenParam(typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('when') : null) ?? 'all',
  );

  // Keep `?when=` in the address bar so the view can be shared or reloaded.
  // history.replaceState rather than setSearchParams: no router render, no
  // history entry. Re-applied when the router rewrites the query (it does for
  // ?i= and friends) because those writes start from its own copy, which
  // never saw this one.
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      const current = url.searchParams.get('when');
      const want = timeWindow === 'all' ? null : timeWindow;
      if (current === want) return;
      if (want) url.searchParams.set('when', want);
      else url.searchParams.delete('when');
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    } catch { /* non-browser */ }
  }, [timeWindow, searchParams]);

  /**
   * A community named in the link (`?near=seton`, or the older `?area=`).
   * Drives the briefing headline ("Tonight near Seton") and scopes its counts
   * to that community's boundary.
   */
  const [nearArea, setNearArea] = useState<{ name: string; boundary: CommunityBoundary | null } | null>(null);
  /** Latest handleViewNeighborhood, for the deep link that resolves async. */
  const viewNeighborhoodRef = useRef<((name: string) => void) | null>(null);

  /** A minute clock for the freshness stamp. */
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setClock(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  /**
   * A report someone tried to start while signed out. Kept through sign-in so
   * the form opens once they are in, instead of letting them fill it in and
   * losing it at submit (the old phone sheet / ?action=report / "Report
   * related" path).
   */
  const [pendingReport, setPendingReport] = useState<{ location: { lat: number; lng: number } | null } | null>(null);

  // Clear the geolocation notice on its own. Denied location is a fallback the
  // map handles fine, not a condition worth occupying screen space until the
  // user dismisses it by hand.
  useEffect(() => {
    if (!locationError) return;
    const timer = setTimeout(() => setLocationError(false), 6000);
    return () => clearTimeout(timer);
  }, [locationError]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Post-submit celebration — the payoff beat after a report goes live
  const [celebration, setCelebration] = useState<string | null>(null);
  const celebrationTimer = useRef<number | null>(null);
  const celebrate = useCallback((msg: string) => {
    setCelebration(msg);
    if (celebrationTimer.current) window.clearTimeout(celebrationTimer.current);
    celebrationTimer.current = window.setTimeout(() => setCelebration(null), 4500);
  }, []);
  const [isEmergencyOpen, setIsEmergencyOpen] = useState(false);
  const [isEmergencyPinMode, setIsEmergencyPinMode] = useState(false);
  const [confirmedEmergencyPinLocation, setConfirmedEmergencyPinLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [isLoadingMoreIncidents, setIsLoadingMoreIncidents] = useState(false);
  const [hasMoreIncidents, setHasMoreIncidents] = useState(false);
  const hasInitializedIncidents = useRef(false);
  const knownIncidentIds = useRef<Set<string>>(new Set());
  const lastVisibleIncidentDoc = useRef<QueryDocumentSnapshot<DocumentData> | null>(null);
  const buttonClickDebounceRef = useRef(0); // Prevent rapid button clicks
  const deepLinkHandledRef = useRef(false); // Ensure ?i= deep-link opens only once
  const lastNeighborhoodReportUidRef = useRef<string | null>(null);

  /**
   * The buttons in the top-right column each open their own floating panel,
   * and nothing closed anyone else's. Tapping settings with notifications
   * already open left both on screen, stacked — most of a phone's width taken
   * by two competing panels.
   *
   * They are mutually exclusive by construction here rather than by a
   * `setShowNotifications(false)` at each of the eight call sites, so a new
   * entry point cannot reintroduce it.
   */
  const openAuthPanel = useCallback((mode: 'signin' | 'settings' = 'signin') => {
    setAuthPanelMode(mode);
    setAuthPanelOpen(true);
    setShowUserMenu(false);
    setShowNotifications(false);
    setIsEditingPreferences(false);
  }, []);

  const toggleNotifications = useCallback(() => {
    setShowNotifications((wasOpen) => {
      if (!wasOpen) {
        setShowUserMenu(false);
        setAuthPanelOpen(false);
        setUnreadNotifications(0);
      }
      return !wasOpen;
    });
  }, []);

  const toggleUserMenu = useCallback(() => {
    setShowUserMenu((wasOpen) => {
      if (!wasOpen) setShowNotifications(false);
      return !wasOpen;
    });
  }, []);

  useEffect(() => {
    if (!user || !db) {
      setUserProfile(null);
      setProfileDraft({ neighborhood: '', address: '', inferredNeighborhood: '', piiConsent: false, weeklyDigestOptIn: false, digestCategories: [] as IncidentCategory[] });
      if (!user) lastNeighborhoodReportUidRef.current = null;
      return;
    }

    const unsubscribe = onSnapshot(doc(db, 'users', user.uid), (snapshot) => {
      const profile = (snapshot.exists() ? snapshot.data() : {}) as UserProfileSettings;
      setUserProfile(profile);
      setProfileDraft({
        neighborhood: profile.neighborhood || '',
        address: profile.address || '',
        inferredNeighborhood: profile.inferredNeighborhood || '',
        piiConsent: Boolean(profile.piiConsentAt),
        // Newsletter consent must be an explicit opt-in. Missing legacy values
        // are treated as no consent, not as permission to send email.
        weeklyDigestOptIn: profile.weeklyDigestOptIn === true,
        digestCategories: profile.digestCategories || [],
      });

      // Resolve inferredNeighborhood from the saved address.
      //
      // Also re-resolves values stored before community lookup was polygon-based:
      // those came from Nominatim's suburb label, which frequently is not a real
      // City of Calgary community name and so never matched the crime stats.
      // Anything that isn't a recognised community gets geocoded again and
      // written back, so the fix reaches existing users, not just new ones.
      if (profile.address && db) {
        const dbRef = db;
        const savedAddress = profile.address;
        const stored = (profile.inferredNeighborhood || '').trim().toLowerCase();
        void (async () => {
          if (stored) {
            const boundaries = await fetchCommunityBoundaries();
            // Empty list means the boundary fetch failed — leave the stored
            // value alone rather than churning it on a network blip.
            if (!boundaries.length || boundaries.some((b) => b.name === stored)) return;
          }
          const geocoded = await geocodeToCalgarySuburb(savedAddress);
          if (geocoded && geocoded.toLowerCase() !== stored) {
            setDoc(doc(dbRef, 'users', user.uid), { inferredNeighborhood: geocoded.slice(0, 80) }, { merge: true }).catch(() => {});
          }
        })();
      }
    }, (error) => {
      console.error('Failed to load user profile:', error);
    });

    return () => unsubscribe();
  }, [user]);

  // Check for report=true in URL — open the form and strip the param immediately
  // so that (a) the param doesn't linger after close and (b) closing the form
  // needs no URL manipulation at all (pure state update, no extra Router render).
  useEffect(() => {
    if (searchParams.get('report') === 'true' && isAuthReady) {
      if (!user) {
        openAuthPanel('signin');
      } else {
        setIsFormOpen(true);
        setConfirmedPinLocation(null);
        setSelectedLocation(CALGARY_CENTER);
        setSearchParams(prev => {
          const next = new URLSearchParams(prev);
          next.delete('report');
          return next;
        }, { replace: true });
      }
    }
  }, [searchParams, isAuthReady, user, openAuthPanel, setSearchParams]);

  // `?settings=alerts` — the deep link the instant-alert email points at so a
  // reader can turn alerts off or retune them. Opens account settings (or the
  // sign-in panel first) and strips the param.
  useEffect(() => {
    if (searchParams.get('settings') !== 'alerts' || !isAuthReady) return;
    if (!user) {
      openAuthPanel('signin');
    } else {
      // The summary view (not the address-edit form) is where the alert
      // controls live, so openAuthPanel's default is exactly right here.
      openAuthPanel('settings');
      setSearchParams(prev => {
        const next = new URLSearchParams(prev);
        next.delete('settings');
        return next;
      }, { replace: true });
    }
  }, [searchParams, isAuthReady, user, openAuthPanel, setSearchParams]);


  // Upper bound on the skeleton only. The incidents listener clears isLoading
  // as soon as the first snapshot lands, so a fast connection never waits the
  // full 1.5s — this is just the fallback for when Firestore is slow or the
  // build has no Firebase config at all.
  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 1500);
    return () => clearTimeout(timer);
  }, []);

  // Lock the document against browser-level scroll and pull-to-refresh while on the map page.
  // The map root div already has overflow-hidden, but without this the browser can still
  // trigger pull-to-refresh or show the URL bar on vertical swipes over the Leaflet canvas.
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prev = {
      htmlOverflow: html.style.overflow,
      bodyOverflow: body.style.overflow,
      htmlOverscroll: html.style.overscrollBehavior,
      bodyOverscroll: body.style.overscrollBehavior,
    };
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    html.style.overscrollBehavior = 'none';
    body.style.overscrollBehavior = 'none';
    return () => {
      html.style.overflow = prev.htmlOverflow;
      body.style.overflow = prev.bodyOverflow;
      html.style.overscrollBehavior = prev.htmlOverscroll;
      body.style.overscrollBehavior = prev.bodyOverscroll;
    };
  }, []);

  useEffect(() => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
        },
        (error) => {
          console.error('Error getting location:', error);
          setLocationError(true);
        }
      );
    }
  }, []);

  // Real-time incidents listener
  useEffect(() => {
    if (!isAuthReady) return;

    // Local screenshot harness only. `import.meta.env.DEV` is false in every
    // production build, so this branch is removed there and the live map can
    // never show anything but Firestore reports.
    if (import.meta.env.DEV) {
      const fixture = (window as { __CW_MAP_FIXTURE__?: Incident[] }).__CW_MAP_FIXTURE__;
      if (Array.isArray(fixture)) {
        setFirebaseIncidents(fixture);
        setHasMoreIncidents(false);
        setIsLoading(false);
        return;
      }
    }

    if (!db) {
      // Firebase not configured — start with an empty map.
      setFirebaseIncidents([]);
      setHasMoreIncidents(false);
      lastVisibleIncidentDoc.current = null;
      setIsLoading(false);
      return;
    }

    // Hidden reports are excluded by the *query*, not by the client. Firestore
    // rules filter queries rather than rows, so this constraint is what makes
    // the matching rule enforceable — without it the listener is rejected
    // outright rather than silently returning less.
    const q = query(
      collection(db, 'incidents'),
      where('visibility', '==', 'public'),
      orderBy('timestamp', 'desc'),
      limit(INCIDENT_PAGE_SIZE),
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const incidentData = snapshot.docs
        .map(doc => {
          const d = doc.data();
          return { id: doc.id, ...d, lat: Number(d.lat), lng: Number(d.lng) } as Incident;
        })
        .filter((incident) => isPubliclyVisible(incident) && isFinite(incident.lat) && isFinite(incident.lng));

      if (hasInitializedIncidents.current) {
        const newIncidents = incidentData.filter((i) => !knownIncidentIds.current.has(i.id));

        if (newIncidents.length > 0) {
          const incoming = newIncidents
            .slice(0, 5)
            .map((item) => ({ id: item.id, title: item.title, timestamp: item.timestamp }));

          setNotifications((prev) => [...incoming, ...prev].slice(0, 20));
          setUnreadNotifications((prev) => prev + newIncidents.length);
        }
      }
      
      lastVisibleIncidentDoc.current = snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1] : null;
      setHasMoreIncidents(snapshot.docs.length === INCIDENT_PAGE_SIZE);

      setFirebaseIncidents((prev) => {
        const merged = new globalThis.Map<string, Incident>();
        incidentData.forEach((incident) => merged.set(incident.id, incident));

        const oldestTimestamp = incidentData.length > 0
          ? Math.min(...incidentData.map(i => i.timestamp))
          : Date.now();

        prev.forEach((incident) => {
          if (!merged.has(incident.id) && incident.timestamp < oldestTimestamp && isPubliclyVisible(incident)) {
            merged.set(incident.id, incident);
          }
        });

        const now = Date.now();
        return [...merged.values()]
          .filter((i) => !i.expires_at || i.expires_at > now)
          .sort((a, b) => b.timestamp - a.timestamp);
      });
      hasInitializedIncidents.current = true;
      knownIncidentIds.current = new Set(incidentData.map((i) => i.id));
      // Data is on screen — drop the skeleton now rather than waiting out the
      // 1.5s fallback timer.
      setIsLoading(false);
    }, (error) => {
      console.error('Failed to subscribe to incidents:', error);
      // Show an empty map rather than stale/fake data on error.
      setFirebaseIncidents([]);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [isAuthReady]);

  const handleLoadMoreIncidents = useCallback(async () => {
    if (!db || isLoadingMoreIncidents || !hasMoreIncidents || !lastVisibleIncidentDoc.current) return;

    setIsLoadingMoreIncidents(true);
    const path = 'incidents';
    try {
      const nextQuery = query(
        collection(db, path),
        where('visibility', '==', 'public'),
        orderBy('timestamp', 'desc'),
        startAfter(lastVisibleIncidentDoc.current),
        limit(INCIDENT_PAGE_SIZE)
      );
      const nextPage = await getDocs(nextQuery);
      const olderIncidents = nextPage.docs
        .map((doc) => {
          const d = doc.data();
          return { id: doc.id, ...d, lat: Number(d.lat), lng: Number(d.lng) } as Incident;
        })
        .filter((incident) => isPubliclyVisible(incident) && isFinite(incident.lat) && isFinite(incident.lng));

      setFirebaseIncidents((prev) => {
        const merged = new globalThis.Map(prev.map((incident) => [incident.id, incident]));
        olderIncidents.forEach((incident) => {
          if (!merged.has(incident.id)) {
            merged.set(incident.id, incident);
          }
        });
        return [...merged.values()].sort((a, b) => b.timestamp - a.timestamp);
      });

      lastVisibleIncidentDoc.current = nextPage.docs.length > 0 ? nextPage.docs[nextPage.docs.length - 1] : lastVisibleIncidentDoc.current;
      setHasMoreIncidents(nextPage.docs.length === INCIDENT_PAGE_SIZE);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, path);
    } finally {
      setIsLoadingMoreIncidents(false);
    }
  }, [hasMoreIncidents, isLoadingMoreIncidents]);

  const handleMarkerClick = useCallback((incident: Incident) => {
    setSelectedArea(null);
    setActiveIncidentId(incident.id);

    // Show popup first — user taps "Details" in the popup to open the full panel.
    window.requestAnimationFrame(() => {
      mapRef.current?.showPopup(incident);
    });

    const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 1024;
    if (isDesktop) {
      mapRef.current?.flyToWithOffset(incident.lat, incident.lng, {
        zoom: 15,
        offsetX: 320,
        offsetY: 0,
      });
    } else {
      mapRef.current?.flyTo(incident.lat, incident.lng, 15);
    }
  }, []);

  // Sidebar / list click: fly + popup + open detail panel immediately.
  const handleSidebarIncidentClick = useCallback((incident: Incident) => {
    handleMarkerClick(incident);
    startTransition(() => setSelectedIncident(incident));
  }, [handleMarkerClick]);

  /**
   * A row tap in the mobile sheet.
   *
   * Routed through handleMarkerClick rather than the sheet reaching into the map
   * itself, so tapping a row and tapping its marker are one code path — which is
   * what makes activeIncidentId correct for both.
   */
  const handleSheetIncidentClick = useCallback((incident: Incident) => {
    handleMarkerClick(incident);
    setSheetState('rail');
  }, [handleMarkerClick]);

  /** Open the report form, optionally pre-pinned to a spot. */
  const openReportForm = useCallback((location: { lat: number; lng: number } | null) => {
    if (location) {
      setSelectedLocation(location);
      setConfirmedPinLocation(location);
      setIsPinMode(false);
    } else {
      setConfirmedPinLocation(null);
      // Start neutral - the reader picks GPS or a pin explicitly in the form.
      setSelectedLocation(CALGARY_CENTER);
    }
    setIsFormOpen(true);
    setSheetState('rail');
  }, []);

  /**
   * Every "report" entry point goes through here: Post, the phone sheet,
   * ?action=report and "Report related". Signed out, it asks them to sign in
   * first and remembers what they were doing (see pendingReport).
   */
  const requestReport = useCallback((location: { lat: number; lng: number } | null = null) => {
    if (!user) {
      setPendingReport({ location });
      openAuthPanel('signin');
      return;
    }
    openReportForm(location);
  }, [user, openAuthPanel, openReportForm]);

  const handleReportFromIncident = useCallback((incident: Incident) => {
    setSelectedIncident(null);
    setSelectedArea(null);
    requestReport({ lat: incident.lat, lng: incident.lng });
  }, [requestReport]);

  /**
   * How long a community report stays on the map.
   *
   * Was 24 hours, which emptied the map faster than neighbours could fill it —
   * a report vanished the day after it was filed, so the map read as quieter
   * than the neighbourhood actually was. Five days lets real reports accumulate
   * into something worth opening.
   *
   * Official records are unaffected: their lifetime comes from `expires_at`,
   * set by the source, so a cleared road closure still disappears on time.
   */
  const MAP_DECAY_MS = 5 * 24 * 60 * 60 * 1000; // 5 days

  // All incidents for the sidebar — community posts show until deleted, official use expires_at
  const incidents = useMemo(() => {
    const now = Date.now();
    // Browser-derived civic records are rebuilt from their upstream APIs on
    // every load, so a moderator's decision about them can only live in the
    // suppression list. Applied here, after the merge, so it covers every
    // source uniformly.
    const combined = applySuppression(
      [...firebaseIncidents, ...officialOpenData, ...edmontonOpenData, ...weatherAlerts, ...powerOutageIncidents, ...airQualityIncidents, ...riverIncidents],
      suppressedIds,
    );
    // Reduce API-sourced traffic by exactly 15% after every source is merged,
    // so City traffic and ingested 511 rows share one selection rule. Community
    // observations are never dropped by this API-density control.
    const apiTraffic = combined.filter((incident) =>
      incident.category === 'traffic' && incident.data_source === 'official'
    );
    const keptTrafficIds = new Set(curateTrafficReports(apiTraffic).map((incident) => incident.id));
    const densityCurated = combined.filter((incident) =>
      incident.category !== 'traffic'
      || incident.data_source !== 'official'
      || keptTrafficIds.has(incident.id)
    );
    const unique = new globalThis.Map(densityCurated.map((i: Incident) => [i.id, i]));
    const filtered = [...unique.values()]
      .filter((i) => {
        if (i.expires_at) return i.expires_at > now;
        return true;
      })
      .sort((a: Incident, b: Incident) => b.timestamp - a.timestamp);

    // Final catch-all proximity dedup for official/weather API incidents.
    // Community reports (no data_source field) always show — never merged.
    const kept: Incident[] = [];
    for (const inc of filtered) {
      if (inc.data_source !== 'official') {
        kept.push(inc);
        continue;
      }
      const isDup = kept.some(
        (k) => k.data_source === 'official' &&
          getDistance(k.lat, k.lng, inc.lat, inc.lng) < 0.03
      );
      if (!isDup) kept.push(inc);
    }
    return kept;
  }, [firebaseIncidents, officialOpenData, edmontonOpenData, weatherAlerts, powerOutageIncidents, airQualityIncidents, riverIncidents, suppressedIds]);

  // ── My Watch ────────────────────────────────────────────────────────────────
  // The reader's persisted "last checked" mark, radius and categories. The
  // signed-in profile is the source of truth and follows them across devices;
  // localStorage is the signed-out fallback. Read once per profile change.
  const watchState = useMemo(() => {
    const local = typeof window !== 'undefined'
      ? readLocalWatch(window.localStorage)
      : { lastSeenAt: null, radiusM: null, categories: [] as IncidentCategory[] };
    return mergeWatchState(
      userProfile
        ? {
            lastSeenAt: userProfile.watchLastSeenAt,
            radiusM: userProfile.watchRadiusM,
            categories: userProfile.watchCategories,
          }
        : null,
      local,
    );
  }, [userProfile]);

  // What changed near the reader since they last looked. Home is GPS when we
  // have it; buildWatchFeed falls back to recency+section ordering without it.
  const watchFeed = useMemo(
    () => buildWatchFeed({
      incidents,
      home: userLocation,
      since: watchState.lastSeenAt,
      prefs: { radiusM: watchState.radiusM, categories: watchState.categories },
      now: Date.now(),
    }),
    [incidents, userLocation, watchState],
  );

  // Seed the notification panel from the since-you-last-checked set on the
  // first load for a returning reader (one with a stored mark). First-time
  // readers keep the original empty-then-live behaviour rather than being
  // buried under every currently-loaded incident.
  const seededWatchRef = useRef(false);
  useEffect(() => {
    if (seededWatchRef.current) return;
    if (!hasInitializedIncidents.current) return;
    if (watchState.lastSeenAt === null) return;
    seededWatchRef.current = true;
    const seed: MapNotification[] = watchFeed.items.slice(0, 20).map((it) => ({
      id: it.incident.id,
      title: it.incident.title,
      timestamp: it.incident.timestamp,
      neighborhood: it.incident.neighborhood,
      kind: 'incident' as const,
    }));
    if (seed.length === 0) return;
    setNotifications((prev) => {
      const seen = new Set(prev.map((p) => p.id));
      return [...seed.filter((s) => !seen.has(s.id)), ...prev].slice(0, 20);
    });
    setUnreadNotifications(seed.length);
  }, [watchFeed, watchState.lastSeenAt]);

  // Advance and persist the "last checked" mark when the reader opens the
  // panel: local always, profile when signed in, plus one funnel event.
  const advanceWatchSeen = useCallback(() => {
    const now = Date.now();
    if (typeof window !== 'undefined') {
      writeLocalWatch(window.localStorage, { ...watchState, lastSeenAt: now });
    }
    if (user && db) {
      void setDoc(doc(db, 'users', user.uid), { watchLastSeenAt: now, profileUpdatedAt: now }, { merge: true })
        .catch(() => { /* profile listener will re-sync */ });
    }
    logProductEvent('watch_opened', { count: watchFeed.items.length });
  }, [watchState, user, watchFeed.items.length]);

  // Advance the mark exactly on the open transition. Kept as an effect rather
  // than folded into toggleNotifications because that callback is defined
  // earlier in the component, before advanceWatchSeen exists.
  const watchPanelWasOpen = useRef(false);
  useEffect(() => {
    if (showNotifications && !watchPanelWasOpen.current) advanceWatchSeen();
    watchPanelWasOpen.current = showNotifications;
  }, [showNotifications, advanceWatchSeen]);

  // report_viewed at a single choke point — a detail panel can be opened from
  // the sidebar, the sheet, a marker, or a deep link, and one effect on the
  // selected incident covers them all without touching each call site.
  const viewedIncidentRef = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedIncident) {
      viewedIncidentRef.current = null;
      return;
    }
    if (selectedIncident.id === viewedIncidentRef.current) return;
    viewedIncidentRef.current = selectedIncident.id;
    logProductEvent('report_viewed', {
      section: isCommunityFacingIncident(selectedIncident) ? 'community' : 'official',
      category: selectedIncident.category,
    });
  }, [selectedIncident]);

  // report_started on the open transition of the report form.
  const reportFormWasOpen = useRef(false);
  useEffect(() => {
    if (isFormOpen && !reportFormWasOpen.current) logProductEvent('report_started');
    reportFormWasOpen.current = isFormOpen;
  }, [isFormOpen]);

  // Official community list + names observed in live data
  const officialCommunities = useCalgaryCommunities(Boolean(user));
  const neighborhoodSuggestions = useMemo(() => {
    const names = new Set<string>(FALLBACK_NEIGHBORHOODS);
    officialCommunities.forEach((name) => names.add(name));
    incidents.forEach((incident) => {
      const name = incident.neighborhood?.trim();
      if (name && !/^Calgary\s+[NSEW]{1,2}$/i.test(name)) names.add(name);
    });
    crimeStats?.forEach((_, key) => {
      if (key && !key.includes(':')) names.add(key.replace(/\b\w/g, c => c.toUpperCase()));
    });
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [incidents, crimeStats, officialCommunities]);

  const addressQuery = stripCityQualifier(profileDraft.address).toLowerCase();
  const neighborhoodQuery = profileDraft.neighborhood.trim().toLowerCase();

  // Real addresses from the city property registry; falls back to accepting
  // the raw typed address (with a street number) if the registry has no hit.
  const liveAddressResults = useAddressSearch(profileDraft.address);
  const addressSuggestions = useMemo(() => {
    if (liveAddressResults.length > 0) return liveAddressResults;
    if (/\d/.test(addressQuery) && addressQuery.length >= 5) {
      return [{ label: withCityQualifier(profileDraft.address), neighborhood: '' }];
    }
    return [];
  }, [liveAddressResults, addressQuery, profileDraft.address]);

  /**
   * Whether the address in the box is already settled.
   *
   * It is settled if we resolved a community for it, or if it is exactly what
   * is already saved on the account. Either way the person has finished
   * choosing, and continuing to offer suggestions for a decision they already
   * made reads as the form not having noticed.
   */
  const addressIsSettled =
    profileDraft.address.trim().length > 0 &&
    (profileDraft.inferredNeighborhood.trim().length > 0 ||
      profileDraft.address.trim() === (userProfile?.address ?? '').trim());

  const filteredNeighborhoodSuggestions = useMemo(() => {
    const query = neighborhoodQuery;
    if (query.length < 2) return [];
    return neighborhoodSuggestions
      .filter((name) => name.toLowerCase().includes(query))
      .sort((a, b) => {
        const aStarts = a.toLowerCase().startsWith(query) ? 0 : 1;
        const bStarts = b.toLowerCase().startsWith(query) ? 0 : 1;
        return aStarts - bStarts || a.localeCompare(b);
      })
      .slice(0, 6);
  }, [neighborhoodQuery, neighborhoodSuggestions]);

  const profileNeedsSetup = Boolean(
    user && userProfile !== null && !userProfile.onboardingCompletedAt && !userProfile.piiConsentAt
  );

  const isDirty =
    profileDraft.address !== (userProfile?.address ?? '') ||
    profileDraft.neighborhood !== (userProfile?.neighborhood ?? '') ||
    profileDraft.weeklyDigestOptIn !== (userProfile?.weeklyDigestOptIn ?? false) ||
    profileDraft.digestCategories.join(',') !== (userProfile?.digestCategories ?? []).join(',');

  const preferredNeighborhood = (userProfile?.neighborhood || '').trim();
  const preferredInferredNeighborhood = (userProfile?.inferredNeighborhood || '').trim();
  const preferredAddress = (userProfile?.address || '').trim();


  const saveProfileSettings = useCallback(async () => {
    if (!user || !db) return;
    const neighborhood = profileDraft.neighborhood.trim().slice(0, 80);
    const address = profileDraft.address.trim().slice(0, 160);
    // inferredNeighborhood is set when user picks from ADDRESS_GUESSES autocomplete.
    // If they typed an address manually (no autocomplete pick), geocode it instead.
    let inferredNeighborhood = profileDraft.inferredNeighborhood.trim().slice(0, 80);
    if ((neighborhood || address) && !profileDraft.piiConsent) {
      setProfileSaveError('Agree to store your area, or leave location blank to continue with all Calgary.');
      return;
    }

    setIsSavingProfile(true);
    setProfileSaveError(null);

    // Geocode the address if we don't already have an inferred neighborhood
    if (address && !inferredNeighborhood) {
      const geocoded = await geocodeToCalgarySuburb(address);
      if (geocoded) inferredNeighborhood = geocoded.slice(0, 80);
    }

    try {
      const optedOutNow = userProfile?.weeklyDigestOptIn === true && !profileDraft.weeklyDigestOptIn;
      await setDoc(doc(db, 'users', user.uid), {
        uid: user.uid,
        displayName: user.displayName || userProfile?.displayName || 'Calgary User',
        email: user.email || userProfile?.email || '',
        photoURL: user.photoURL || userProfile?.photoURL || '',
        ...plansAreaPatch({ neighborhood, address, inferredNeighborhood, consent: profileDraft.piiConsent }, userProfile, Date.now()),
        onboardingCompletedAt: userProfile?.onboardingCompletedAt || Date.now(),
        weeklyDigestOptIn: profileDraft.weeklyDigestOptIn,
        weeklyDigestOptInAt: profileDraft.weeklyDigestOptIn
          ? (userProfile?.weeklyDigestOptInAt || Date.now())
          : null,
        digestCategories: profileDraft.weeklyDigestOptIn ? profileDraft.digestCategories : [],
        digestUnsubscribedAt: optedOutNow
          ? Date.now()
          : profileDraft.weeklyDigestOptIn ? null : (userProfile?.digestUnsubscribedAt ?? null),
        digestUnsubscribeSource: optedOutNow
          ? 'account-settings'
          : profileDraft.weeklyDigestOptIn ? null : (userProfile?.digestUnsubscribeSource ?? null),
        profileUpdatedAt: Date.now(),
      }, { merge: true });
      setIsEditingPreferences(false);
      setAuthPanelOpen(false);
      setAuthPanelMode('signin');
    } catch (error) {
      console.error('Failed to save profile settings:', error);
      setProfileSaveError('Could not save your settings. Please try again.');
    } finally {
      setIsSavingProfile(false);
    }
  }, [profileDraft, user, userProfile]);

  const skipOnboarding = useCallback(async () => {
    if (!user || !db) return;
    setOnboardingDismissedThisSession(true);
    setIsEditingPreferences(false);
    setAuthPanelOpen(false);
    setAuthPanelMode('signin');
    try {
      await setDoc(doc(db, 'users', user.uid), { onboardingCompletedAt: Date.now() }, { merge: true });
    } catch (error) {
      console.error('Failed to skip onboarding:', error);
    }
  }, [user]);

  // Resume a report started while signed out, once they are signed in and
  // past (or have skipped) profile setup.
  useEffect(() => {
    if (!pendingReport || !user) return;
    if (db && userProfile === null) return; // profile still loading
    if (profileNeedsSetup && !onboardingDismissedThisSession) return;
    setAuthPanelOpen(false);
    setAuthPanelMode('signin');
    openReportForm(pendingReport.location);
    setPendingReport(null);
  }, [pendingReport, user, userProfile, profileNeedsSetup, onboardingDismissedThisSession, openReportForm]);

  // If the profile snapshot never arrives (offline, rules error), don't hold
  // the report hostage: open the form after a few seconds anyway.
  useEffect(() => {
    if (!pendingReport || !user || !db || userProfile !== null) return;
    const timer = window.setTimeout(() => {
      setAuthPanelOpen(false);
      setAuthPanelMode('signin');
      openReportForm(pendingReport.location);
      setPendingReport(null);
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [pendingReport, user, userProfile, openReportForm]);

  useEffect(() => {
    const targetId = searchParams.get('i');
    if (!targetId || deepLinkHandledRef.current) return;
    const target = incidents.find((inc) => inc.id === targetId);
    if (target) {
      deepLinkHandledRef.current = true;
      handleMarkerClick(target);
      startTransition(() => setSelectedIncident(target));
      return;
    }

    // Email highlights may deliberately use an older local crime report that
    // is no longer inside the map's newest-60 page. Resolve that exact public
    // document instead of opening a map that appears to have lost its link.
    if (!db || !isAuthReady) return;
    let cancelled = false;
    getDoc(doc(db, 'incidents', targetId)).then((snapshot) => {
      if (cancelled || !snapshot.exists()) return;
      const data = snapshot.data();
      const fetched = {
        id: snapshot.id,
        ...data,
        lat: Number(data.lat),
        lng: Number(data.lng),
      } as Incident;
      if (!isPubliclyVisible(fetched) || !Number.isFinite(fetched.lat) || !Number.isFinite(fetched.lng)) return;
      if (typeof fetched.expires_at === 'number' && fetched.expires_at <= Date.now()) return;
      deepLinkHandledRef.current = true;
      setFirebaseIncidents((previous) => previous.some((item) => item.id === fetched.id)
        ? previous
        : [fetched, ...previous]);
      handleMarkerClick(fetched);
      startTransition(() => setSelectedIncident(fetched));
    }).catch((error) => console.error('Failed to load linked incident:', error));
    return () => { cancelled = true; };
  }, [searchParams, incidents, handleMarkerClick, isAuthReady]);

  useEffect(() => {
    const nextParams = new URLSearchParams(searchParams);
    const currentId = nextParams.get('i');

    if (selectedIncident) {
      if (currentId === selectedIncident.id) return;
      nextParams.set('i', selectedIncident.id);
      setSearchParams(nextParams, { replace: true });
      return;
    }

    if (currentId && deepLinkHandledRef.current) {
      nextParams.delete('i');
      setSearchParams(nextParams, { replace: true });
    }
  }, [selectedIncident, searchParams, setSearchParams]);

  const coordDeepLinkHandledRef = useRef(false);
  useEffect(() => {
    if (coordDeepLinkHandledRef.current) return;
    const latStr = searchParams.get('lat');
    const lngStr = searchParams.get('lng');

    if (latStr && lngStr) {
      const lat = parseFloat(latStr);
      const lng = parseFloat(lngStr);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        coordDeepLinkHandledRef.current = true;
        window.requestAnimationFrame(() => {
          mapRef.current?.flyTo(lat, lng, 15);
        });
      }
      return;
    }

    // /map?area=seton — search links a neighbourhood straight to its patch of
    // the map. `?near=` is the same thing in the words people search with
    // (/map?when=yesterday&near=seton), and takes a slug or a plain name.
    const area = searchParams.get('near') || searchParams.get('area');
    if (area) {
      coordDeepLinkHandledRef.current = true;
      fetchCommunityBoundaries().then((boundaries) => {
        const centre = communityCentre(area, boundaries);
        if (!centre) {
          // Boundaries unavailable or no polygon match: still name the area
          // for the briefing, matching reports by their neighbourhood label.
          const display = area.replace(/[-_]+/g, ' ').trim().replace(/\b\w/g, (c) => c.toUpperCase());
          if (display) {
            setNearArea({ name: display, boundary: null });
            window.setTimeout(() => viewNeighborhoodRef.current?.(display), 400);
          }
          return;
        }
        const slug = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        const boundary = boundaries.find((b) => slug(b.name) === slug(area)) ?? null;
        const display = (boundary?.name ?? area.replace(/-/g, ' ')).replace(/\b\w/g, (c) => c.toUpperCase());
        setNearArea({ name: display, boundary });
        // Open the community the link names, once the map is there to fly.
        window.setTimeout(() => viewNeighborhoodRef.current?.(display), 400);
        // The map may still be mounting on a cold load; give it a moment.
        let tries = 0;
        const go = () => {
          if (mapRef.current) mapRef.current.flyTo(centre[0], centre[1], 14);
          else if (++tries < 20) window.setTimeout(go, 250);
        };
        go();
      });
    }
  }, [searchParams]);

  // ?action=report (linked from neighbourhood stories). Goes through the same
  // sign-in gate as every other report button, and is stripped once handled
  // so closing the form does not reopen it.
  useEffect(() => {
    if (searchParams.get('action') !== 'report' || !isAuthReady) return;
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.delete('action');
      return next;
    }, { replace: true });
    requestReport(null);
  }, [searchParams, isAuthReady, requestReport, setSearchParams]);

  const [isPinMode, setIsPinMode] = useState(false);
  // Coordinates captured the moment "Set Pin Here" fires - stored in MapPage
  // state so there is zero prop-chain timing involved.
  const [confirmedPinLocation, setConfirmedPinLocation] = useState<{ lat: number; lng: number } | null>(null);

  const handleMapClick = useCallback((lat: number, lng: number) => {
    if (isFormOpen && !isPinMode) {
      setSelectedLocation({ lat, lng });
    }
  }, [isFormOpen, isPinMode]);

  const handleRequestMapPin = useCallback(() => {
    setConfirmedPinLocation(null);
    setIsPinMode(true);
    // Don't auto-fly - the user pans from wherever the map currently is.
    // This avoids the crosshair appearing at GPS coordinates when the user
    // hasn't chosen to navigate there.
  }, []);

  const handlePinConfirm = useCallback((lat: number, lng: number) => {
    setConfirmedPinLocation({ lat, lng });
    setIsPinMode(false);
  }, []);

  const handlePinCancel = useCallback(() => {
    // Only clear pin state — the IncidentForm's useEffect calls onClose() which
    // closes the form one render later. This avoids flipping isFormOpen and
    // isPinMode in the same batch, which causes the MobileMapSheet to open while
    // Leaflet is still processing the cancel touch event.
    setIsPinMode(false);
    setConfirmedPinLocation(null);
  }, []);

  const handleFormClose = useCallback(() => {
    setIsPinMode(false);
    setConfirmedPinLocation(null);
    setIsFormOpen(false);
  }, []);

  const handleIncidentSubmit = useCallback((data: IncidentFormData & { lat: number; lng: number; image_url?: string }) => {
    if (!user) {
      openAuthPanel('signin');
      return;
    }
    setIsPinMode(false);
    setConfirmedPinLocation(null);

    const fallbackName = (user.email?.split('@')[0] || 'Calgary User').slice(0, 50);
    const fullName = (user.displayName && user.displayName.trim().length >= 2)
      ? user.displayName.trim()
      : (fallbackName.length >= 2 ? fallbackName : 'Calgary User');
    const firstName = fullName.split(/\s+/)[0]?.slice(0, 50) || 'Calgary User';
    const isAnonymous = Boolean(data.anonymous);

    const path = 'incidents';
    if (!db) {
      console.warn('Cannot post report: Firebase env vars were not set at build time.');
      return;
    }
    startTransition(() => {
      (async () => {
        try {
          const { anonymous, image_url, ...incidentData } = data;
          const safeTitle = incidentData.title.trim().padEnd(5, ' ').slice(0, 100);
          const safeDesc = incidentData.description.trim().padEnd(10, ' ').slice(0, 1000);
          const safeNeighborhood = (incidentData.neighborhood || 'Calgary').trim().padEnd(2, ' ').slice(0, 80);
          const nameToUse = isAnonymous ? 'Anonymous' : firstName;
          const safeName = nameToUse.trim().padEnd(2, ' ').slice(0, 50);

          // The public incident and the private reporter record are written in
          // one batch. A partial write would either publish a report with no
          // way to trace it, or strand reporter identity against an incident
          // that does not exist.
          const incidentRef = doc(collection(db!, path));
          const batch = writeBatch(db!);
          batch.set(incidentRef, {
            title: safeTitle,
            description: safeDesc,
            category: incidentData.category,
            neighborhood: safeNeighborhood,
            lat: incidentData.lat,
            lng: incidentData.lng,
            name: safeName,
            source_name: safeName,
            anonymous: isAnonymous,
            timestamp: Date.now(),
            verified_status: 'unverified',
            report_count: 1,
            authorUid: user.uid,
            visibility: 'public',
            flag_count: 0,
            flagged_by: [],
            ...(image_url ? { image_url } : {}),
          });
          // Reporter email never touches the world-readable incident document.
          if (user.email) {
            batch.set(doc(db!, 'incident_reporters', incidentRef.id), {
              incidentId: incidentRef.id,
              authorUid: user.uid,
              email: user.email,
              createdAt: Date.now(),
            });
          }
          await batch.commit();
          logProductEvent('report_submitted', { category: incidentData.category });
          celebrate('Your report is live. Neighbours can see it now.');
        } catch (error) {
          console.error('[CalgaryWatch] Report submission failed:', error);
          setSubmitError('Your report could not be saved. Please try again.');
          setTimeout(() => setSubmitError(null), 6000);
        }
      })();
    });
  }, [user, openAuthPanel, celebrate]);

  const handleEmergencySubmit = useCallback((data: EmergencySubmitData) => {
    if (!user) { openAuthPanel('signin'); return; }
    const fallbackName = (user.email?.split('@')[0] || 'Calgary User').slice(0, 50);
    const fullName = (user.displayName && user.displayName.trim().length >= 2)
      ? user.displayName.trim()
      : (fallbackName.length >= 2 ? fallbackName : 'Calgary User');
    const firstName = fullName.split(/\s+/)[0]?.slice(0, 50) || 'Calgary User';
    const path = 'incidents';
    setConfirmedEmergencyPinLocation(null);
    if (!db) {
      console.warn('Cannot submit emergency report: Firebase env vars were not set at build time.');
      return;
    }

    startTransition(() => {
      (async () => {
        try {
          // Defensively ensure lengths
          const safeTitle = data.title.trim().padEnd(5, ' ').slice(0, 100);
          const safeDesc = data.description.trim().padEnd(10, ' ').slice(0, 1000);
          const safeNeighborhood = (data.neighborhood || 'Calgary').trim().padEnd(2, ' ').slice(0, 80);
          const safeName = firstName.trim().padEnd(2, ' ').slice(0, 50);

          const incidentRef = doc(collection(db!, path));
          const batch = writeBatch(db!);
          batch.set(incidentRef, {
            title: safeTitle,
            description: safeDesc,
            category: data.category,
            neighborhood: safeNeighborhood,
            lat: data.lat,
            lng: data.lng,
            name: safeName,
            source_name: safeName,
            anonymous: false,
            timestamp: Date.now(),
            verified_status: 'unverified',
            report_count: 1,
            authorUid: user.uid,
            visibility: 'public',
            flag_count: 0,
            flagged_by: [],
            ...(data.image_url ? { image_url: data.image_url } : {}),
          });
          if (user.email) {
            batch.set(doc(db!, 'incident_reporters', incidentRef.id), {
              incidentId: incidentRef.id,
              authorUid: user.uid,
              email: user.email,
              createdAt: Date.now(),
            });
          }
          await batch.commit();
          celebrate('Emergency report posted. If anyone is in danger, call 911.');
        } catch (error) {
          handleFirestoreError(error, OperationType.CREATE, path);
        }
      })();
    });
  }, [user, openAuthPanel, celebrate]);

  const handleEmergencyRequestPin = useCallback(() => {
    setConfirmedEmergencyPinLocation(null);
    setIsEmergencyPinMode(true);
  }, []);

  const handleEmergencyPinConfirm = useCallback((lat: number, lng: number) => {
    setConfirmedEmergencyPinLocation({ lat, lng });
    setIsEmergencyPinMode(false);
  }, []);

  const handleEmergencyPinCancel = useCallback(() => {
    setIsEmergencyPinMode(false);
    setConfirmedEmergencyPinLocation(null);
    setIsEmergencyOpen(false);
  }, []);

  // Map shows all incidents: official API data (traffic, 311) + community posts.
  // Official incidents use expires_at for decay; community posts use 24h rolling decay.
  const mapIncidents = useMemo(() => {
    const now = Date.now();
    const visible = incidents.filter((i) => {
      if (i.data_source === 'official') {
        return !i.expires_at || i.expires_at > now;         // expires_at controls official lifetime
      }
      return now - i.timestamp < MAP_DECAY_MS;              // community reports linger 5 days
    }).filter((i) => inMapTimeWindow(i.timestamp, timeWindow, now)); // same window as the feed
    if (selectedCategory === 'all') return visible;
    return visible.filter(i => i.category === selectedCategory || i.category === 'emergency');
  }, [incidents, selectedCategory, timeWindow, clock]);

  /**
   * The report feed is Calgary-focused. Edmonton Open Data can still render as
   * geographic context on the map, but never enters the desktop sidebar or the
   * mobile sheet where noisy records could outrank local reports.
   */
  const feedIncidents = useMemo(() => {
    const localFeed = incidents.filter((incident) => incident.source_type !== 'edmonton_open_data');
    if (timeWindow === 'all') return localFeed;
    const now = Date.now();
    return localFeed.filter((incident) => inMapTimeWindow(incident.timestamp, timeWindow, now));
  }, [incidents, timeWindow, clock]);

  /** The feed scoped to the community a ?near= link named, for the briefing. */
  const briefingIncidents = useMemo(() => {
    if (!nearArea) return feedIncidents;
    const b = nearArea.boundary;
    if (b) {
      const [minLng, minLat, maxLng, maxLat] = b.bbox;
      return feedIncidents.filter((i) =>
        i.lng >= minLng && i.lng <= maxLng && i.lat >= minLat && i.lat <= maxLat
        && b.polygons.some((poly) => pointInPolygon(i.lng, i.lat, poly)));
    }
    const want = nearArea.name.toLowerCase();
    return feedIncidents.filter((i) => (i.neighborhood || '').toLowerCase() === want);
  }, [feedIncidents, nearArea]);

  /**
   * Newest real report time, for "Latest report 2 min ago". Community and
   * ingested reports plus the City's open data; the weather, air and river
   * readings are stamped at fetch time, so they would always read "just now".
   */
  const newestReportAt = useMemo(() => {
    let newest: number | null = null;
    for (const i of [...firebaseIncidents, ...officialOpenData]) {
      if (!Number.isFinite(i.timestamp) || i.timestamp > clock + 60_000) continue;
      if (newest === null || i.timestamp > newest) newest = i.timestamp;
    }
    return newest;
  }, [firebaseIncidents, officialOpenData, clock]);
  const freshness = freshnessLabel(newestReportAt, clock);

  /**
   * The one number the mobile feed reports.
   *
   * The value this replaces was derived straight from `incidents`, so it
   * ignored the time window — the chrome badge and the sheet's rail could
   * sit on screen together showing different totals for the same feed. This
   * one is derived from `feedIncidents`, the same list that backs the rows
   * both surfaces render, so they can no longer disagree.
   */
  const feedCount = useMemo(
    () => feedIncidents.filter((i) => selectedCategory === 'all' || i.category === selectedCategory).length,
    [feedIncidents, selectedCategory],
  );

  // Incidents sorted by distance from user for the Near Me panel
  const nearMeIncidents = useMemo(() => {
    const loc = userLocation || CALGARY_CENTER;
    return incidents
      .map(i => ({ i, dist: getDistance(loc.lat, loc.lng, i.lat, i.lng) }))
      .filter(x => x.dist <= NEAR_ME_RADIUS_KM)
      .sort((a, b) => {
        if (a.i.category === 'emergency' && b.i.category !== 'emergency') return -1;
        if (b.i.category === 'emergency' && a.i.category !== 'emergency') return 1;
        return a.dist - b.dist;
      })
      .map(x => ({ ...x.i, _dist: x.dist })) as (Incident & { _dist: number })[];
  }, [incidents, userLocation]);

  /** Latest nearby list, for callbacks that fire after a delay. */
  const nearMeIncidentsRef = useRef<(Incident & { _dist: number })[]>([]);
  useEffect(() => { nearMeIncidentsRef.current = nearMeIncidents; }, [nearMeIncidents]);

  const handleViewNeighborhood = useCallback((neighborhood: string) => {
    setSelectedIncident(null);
    const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 1024;
    // Shared by both branches: the desktop layout needs the 360px offsetX to
    // clear the area panel, but mobile still needs the map to move — it was
    // silently skipping the fly entirely, leaving the map static while the
    // area panel opened underneath the sheet.
    const focusIncident = incidents
      .filter((incident) => incident.neighborhood === neighborhood)
      .sort((a, b) => b.timestamp - a.timestamp)[0];

    if (focusIncident) {
      if (isDesktop) {
        mapRef.current?.flyToWithOffset(focusIncident.lat, focusIncident.lng, {
          zoom: 13,
          offsetX: 360,
          offsetY: 0,
        });
      } else {
        mapRef.current?.flyTo(focusIncident.lat, focusIncident.lng, 13);
      }
    }
    // Title-case the name so the panel header looks correct regardless of input case
    const displayName = neighborhood.replace(/\b\w/g, c => c.toUpperCase());
    const base = getAreaIntelligence(displayName, incidents);

    if (crimeStats && crimeStats.size > 0) {
      const rawKey = neighborhood.toLowerCase().trim();
      const allKeys = [...crimeStats.keys()];
      // Fuzzy resolve: exact → whole-word-only substring → word overlap (community name only)
      // Street type words are stripped so "Stoney Trail NW" never matches community "stoney".
      const STOP = new Set([
        'the','and','of','in','at','sw','se','nw','ne','calgary','alberta','ab',
        // street suffixes — present in addresses but NOT in community names
        'trail','drive','avenue','ave','blvd','boulevard','road','rd','street','st',
        'crescent','cres','way','place','pl','court','ct','close','lane','ln',
        'mews','terrace','terr','grove','gate','view','ridge','heights','park',
        'hill','hills','lake','lakes','bay','cove','green','landing','rise','run',
        'bend','point','pointe','village','estate','estates','manor','meadows',
      ]);
      const resolveKey = (q: string): string | undefined => {
        if (crimeStats.has(q)) return q;
        // Namespaced exact match (e.g. "edmonton:downtown" → bare "downtown" matches q)
        for (const k of allKeys) {
          const bare = k.replace(/^\w+:/, '');
          if (bare === q) return k;
        }
        // Strip leading street numbers (e.g. "1234 Banff Trail NW" → "banff trail nw")
        const stripped = q.replace(/^\d+\s+/, '');
        if (crimeStats.has(stripped)) return stripped;
        // Only do substring containment on the cleaned string and only for multi-word keys
        // (prevents single short community names like "stoney" matching long address strings)
        // Strip namespace prefix before substring comparison
        const subFound = allKeys.find(k => {
          const bare = k.replace(/^\w+:/, '');
          if (bare.split(' ').length < 2) return false; // skip single-word keys for substring
          return stripped.includes(bare) || bare.includes(stripped);
        });
        if (subFound) return subFound;
        // Word-overlap: use only meaningful words (after removing numbers + STOP words)
        // Strip namespace prefix before splitting into words
        const qWords = stripped.split(/\s+/).filter(w => w.length > 2 && !STOP.has(w) && !/^\d+$/.test(w));
        if (qWords.length === 0) return undefined;
        let best: string | undefined;
        let bestScore = 0;
        for (const k of allKeys) {
          const bare = k.replace(/^\w+:/, '');
          const kWords = bare.split(/\s+/).filter(w => !STOP.has(w));
          // All community words must appear in the query — prevents partial road-name matches
          const overlap = kWords.filter(kw => qWords.some(w => w === kw || w.startsWith(kw) || kw.startsWith(w))).length;
          const score = overlap / Math.max(kWords.length, 1);
          if (score > bestScore && overlap === kWords.length) { bestScore = score; best = k; }
        }
        return bestScore >= 0.5 ? best : undefined;
      };
      const resolvedKey = resolveKey(rawKey);
      const entry = resolvedKey ? crimeStats.get(resolvedKey) : undefined;
      // Use canonical name from the matched key when fuzzy resolution differs from input.
      // Strip namespace prefix (e.g. "edmonton:downtown" → "Downtown") for display.
      const canonicalName = resolvedKey
        ? resolvedKey.replace(/^\w+:/, '').replace(/\b\w/g, c => c.toUpperCase())
        : displayName;
      // Calgary communities only: Edmonton rows ("edmonton:…") are a different
      // city's data and must not move a Calgary comparison.
      const calgaryEntries = [...crimeStats.entries()].filter(([k]) => !k.includes(':')).map(([, e]) => e);
      const baseline = calgaryEntries.length > 0 ? calgaryEntries : [...crimeStats.values()];

      if (entry) {
        const total = entry.crime + entry.disorder;

        // Computed insights from real data. These figures are 311 service
        // requests (or StatCan rows), not police-reported crime, and the copy
        // says so. No ranks: a "#3 of 200" reads as a league table of
        // neighbourhoods, which is the opposite of the awareness framing.
        const sortedTotals = baseline
          .map(e => e.crime + e.disorder)
          .sort((a, b) => a - b);
        const median = sortedTotals[Math.floor(sortedTotals.length / 2)] ?? 0;
        const isStatcan = entry.dataSource === 'statcan';
        // crime + disorder together is every 311 request counted for the area.
        const what = isStatcan ? 'incidents in Statistics Canada data' : '311 requests';
        const comparison = median > 0 && !resolvedKey?.includes(':')
          ? total > median * 1.2
            ? 'more than most Calgary communities'
            : total < median * 0.8
            ? 'fewer than most Calgary communities'
            : 'about the same as most Calgary communities'
          : '';

        const computedInsights = [
          `${total.toLocaleString('en-CA')} ${what} in ${entry.year}${comparison ? `, ${comparison}` : ''}.`,
          'Counts follow population and foot traffic, so busy areas see more. Reports aren\u2019t a score.',
        ];

        setSelectedArea({
          ...base,
          communityName: canonicalName,
          crimeKey: resolvedKey,
          insights: [...computedInsights, ...base.insights],
        });
      } else {
        setSelectedArea({ ...base, communityName: displayName });
      }
      return;
    }
    setSelectedArea({ ...base, communityName: displayName });
  }, [incidents, mapRef, crimeStats, cityAverages]);

  useEffect(() => { viewNeighborhoodRef.current = handleViewNeighborhood; }, [handleViewNeighborhood]);

  // Placed here rather than beside handleSheetIncidentClick because it closes
  // over handleViewNeighborhood, which is a `const` declared just above —
  // referencing it any earlier in the component body would throw a
  // temporal-dead-zone ReferenceError on every render.
  const handleSheetNeighbourhoodSelect = useCallback((name: string) => {
    handleViewNeighborhood(name);
    setNearArea({ name, boundary: null });
    setSheetState('rail');
  }, [handleViewNeighborhood]);

  useEffect(() => {
    // Require a registered address — neighborhood/inferred alone is not enough
    if (!user || !preferredAddress || profileNeedsSetup) return;
    if (lastNeighborhoodReportUidRef.current === user.uid) return;
    lastNeighborhoodReportUidRef.current = user.uid;

    // Priority: address-autocomplete inferred → user-typed neighborhood → raw address
    // The raw address falls through to the fuzzy key resolver in handleViewNeighborhood
    const neighborhoodLookup = preferredInferredNeighborhood || preferredNeighborhood || preferredAddress;

    const notification: MapNotification = {
      id: `neighborhood-report-${user.uid}-${Date.now()}`,
      title: `Neighbourhood report ready for ${preferredAddress}`,
      timestamp: Date.now(),
      neighborhood: neighborhoodLookup,
      kind: 'neighborhood_report',
      // The card renders the resolved community name, which on its own looks
      // like it came from nowhere. Carrying the saved address through makes the
      // connection to their location settings explicit.
      basis: preferredAddress || preferredNeighborhood || '',
    };
    setNotifications((prev) => [notification, ...prev].slice(0, 20));
    setUnreadNotifications((prev) => prev + 1);
  }, [user, preferredAddress, preferredNeighborhood, preferredInferredNeighborhood, profileNeedsSetup]);

  /**
   * Locate: show them where they are, and stop there.
   *
   * The pin is deliberately never cleared once placed. Losing your own
   * position the moment you close a panel is disorienting on a map whose whole
   * subject is distance from you.
   */
  const handleLocate = useCallback(() => {
    const loc = userLocation || CALGARY_CENTER;
    if (nearMeOpen) { setNearMeOpen(false); return; }
    mapRef.current?.flyTo(loc.lat, loc.lng, userLocation ? 15 : 11);
    if (userLocation) {
      mapRef.current?.showUserLocation(userLocation.lat, userLocation.lng);
      userPinShown.current = true;
    }
    setNearMeIndex(0);
    setNearMeStage('arrived');
    setNearMeScanning(false);
    if (nearMeScanTimer.current) window.clearTimeout(nearMeScanTimer.current);
    setNearMeOpen(true);
  }, [userLocation, nearMeOpen]);

  /** They said yes to the scan: run the radar beat, then reveal. */
  const startNearMeScan = useCallback(() => {
    setNearMeStage('results');
    setNearMeIndex(0);
    setNearMeScanning(true);
    if (nearMeScanTimer.current) window.clearTimeout(nearMeScanTimer.current);
    nearMeScanTimer.current = window.setTimeout(() => {
      setNearMeScanning(false);
      const first = nearMeIncidentsRef.current[0];
      if (first) mapRef.current?.flyTo(first.lat, first.lng, 15);
    }, 450);
  }, []);

  const handleNotificationClick = useCallback((notification: MapNotification) => {
    // The neighbourhood report is this person's own briefing. Sending it to the
    // shared area panel — which anyone can open for any community — threw away
    // everything that made it theirs.
    if (notification.kind === 'neighborhood_report') {
      setShowNotifications(false);
      setBriefingOpen(true);
      return;
    }
    if (notification.neighborhood) {
      handleViewNeighborhood(notification.neighborhood);
      setShowNotifications(false);
      setSheetState('rail');
    }
  }, [handleViewNeighborhood]);

  // The sheet used to collapse itself when pin mode began. Ownership of sheet
  // position now sits here, so the page does it.
  useEffect(() => {
    if (isPinMode || isEmergencyPinMode) setSheetState('rail');
  }, [isPinMode, isEmergencyPinMode]);

  // ── Live area snapshot for the neighbourhood-report notification ──────────
  // Registry-sourced inferredNeighborhood matches 311 comm_name keys, so a
  // direct lookup usually lands. Calgary communities only. The notification
  // shows a plain comparison with the median, never a rank; the briefing still
  // receives rank/count for its own "report volume, not a safety grade" strip.
  const areaTotalsDesc = useMemo(() => {
    if (!crimeStats || crimeStats.size === 0) return [];
    return [...crimeStats.entries()]
      .filter(([k]) => !k.includes(':'))
      .map(([, e]) => e.crime + e.disorder)
      .sort((a, b) => b - a);
  }, [crimeStats]);

  const getAreaStats = useCallback((name?: string) => {
    if (!name || !crimeStats || areaTotalsDesc.length === 0) return null;
    const key = name.toLowerCase().trim();
    if (key.includes(':')) return null;
    const entry = crimeStats.get(key);
    if (!entry) return null;
    const total = entry.crime + entry.disorder;
    const rank = Math.max(1, areaTotalsDesc.findIndex((t) => t <= total) + 1);
    const median = areaTotalsDesc[Math.floor(areaTotalsDesc.length / 2)] ?? 0;
    const comparison: AreaComparison['comparison'] = median > 0
      ? total > median * 1.2 ? 'more' : total < median * 0.8 ? 'fewer' : 'about the same as'
      : null;
    return { entry, total, rank, count: areaTotalsDesc.length, comparison };
  }, [crimeStats, areaTotalsDesc]);

  /**
   * The air reading the briefing quotes.
   *
   * Regional, and deliberately not measured at their address. Smoke arrives as
   * an airmass, so a per-address request would be no more accurate while
   * sending their home coordinates to a third party — which the briefing's own
   * closing note promises does not happen.
   */
  const briefingAir = useMemo<AirZoneReading | null>(
    () => airReadings.find((r) => r.zone === 'Calgary') ?? airReadings[0] ?? null,
    [airReadings],
  );

  /** The community the briefing is written about, from their saved location. */
  const briefingCommunity =
    preferredInferredNeighborhood || preferredNeighborhood || '';


  // Featured card for "your neighbourhood report" — rendered in both lists.
  const renderNotificationRow = useCallback((n: MapNotification) => {
    const stats = n.kind === 'neighborhood_report' ? getAreaStats(n.neighborhood) : null;
    return (
      <NotificationRow
        key={n.id}
        n={n}
        stats={stats ? { total: stats.total, year: stats.entry.year, comparison: stats.comparison } : null}
        onOpen={handleNotificationClick}
        onChangeLocation={() => {
          setShowNotifications(false);
          openAuthPanel('settings');
        }}
      />
    );
  }, [getAreaStats, handleNotificationClick, openAuthPanel]);

  const showProfileStep = Boolean(user);
  const authPanelVisible = authPanelOpen || (profileNeedsSetup && !onboardingDismissedThisSession);
  // A signed-out visitor may open this panel just to learn what an account is
  // for. Keep the exit available before Google auth as well as during profile
  // setup so choosing "Sign in" never becomes a one-way action.
  const canCloseAuthPanel = authPanelOpen || Boolean(user);
  const locationLabel = preferredAddress || preferredNeighborhood || preferredInferredNeighborhood || 'your local report area';

  // ── First-run tour ─────────────────────────────────────────────────────────
  // Auto-starts only for users who just signed up in THIS session (their
  // profile-setup panel was shown here). Returning users are never interrupted
  // — they can replay it from the avatar menu → "App tour".
  const [tourOpen, setTourOpen] = useState(false);
  const [tourTarget, setTourTarget] = useState<string>();
  const tourOpenedCameraRef = useRef(false);
  const wasNewSignupRef = useRef(false);
  useEffect(() => {
    if (profileNeedsSetup) wasNewSignupRef.current = true;
  }, [profileNeedsSetup]);

  useEffect(() => {
    if (!user || !isAuthReady || isLoading || authPanelVisible || isPinMode || isEmergencyPinMode) return;
    if (!wasNewSignupRef.current) return;
    let seen = true;
    try { seen = localStorage.getItem('cw_tour_done_v1') === '1'; } catch { /* private mode */ }
    if (seen) return;
    const id = window.setTimeout(() => setTourOpen(true), 900);
    return () => window.clearTimeout(id);
  }, [user, isAuthReady, isLoading, authPanelVisible, isPinMode, isEmergencyPinMode]);

  const finishTour = useCallback(() => {
    setTourOpen(false);
    setTourTarget(undefined);
    if (tourOpenedCameraRef.current) {
      setViewerCamera(null);
      tourOpenedCameraRef.current = false;
    }
    try { localStorage.setItem('cw_tour_done_v1', '1'); } catch { /* private mode */ }
  }, []);

  const replayTour = useCallback(() => {
    setShowUserMenu(false);
    setShowNotifications(false);
    setViewerCamera(null);
    setTourTarget(undefined);
    setTourOpen(true);
  }, []);

  const handleTourStepChange = useCallback((target?: string) => {
    setTourTarget(target);
    if (target === 'traffic-cameras' || target === 'camera-viewer') setShowCameras(true);
  }, []);

  useEffect(() => {
    if (!tourOpen) return;
    if (tourTarget !== 'camera-viewer') {
      if (tourOpenedCameraRef.current) {
        setViewerCamera(null);
        tourOpenedCameraRef.current = false;
      }
      return;
    }
    if (viewerCamera || trafficCameras.length === 0) return;
    const camera = [...trafficCameras].sort((a, b) =>
      getDistance(CALGARY_CENTER.lat, CALGARY_CENTER.lng, a.lat, a.lng)
      - getDistance(CALGARY_CENTER.lat, CALGARY_CENTER.lng, b.lat, b.lng))[0];
    if (!camera) return;
    tourOpenedCameraRef.current = true;
    setViewerCamera(camera);
    mapRef.current?.flyTo(camera.lat, camera.lng, 16);
  }, [tourOpen, tourTarget, trafficCameras, viewerCamera]);

  // ── One-time weekly-digest prompt ──────────────────────────────────────────
  // Users who haven't turned the digest on get exactly one nudge after sign-in
  // (after onboarding and the tour are out of the way). digestPromptedAt is
  // written the moment it shows, so it can never nag twice — on any device.
  const [digestPromptOpen, setDigestPromptOpen] = useState(false);
  useEffect(() => {
    if (!user || !db || !userProfile || isLoading || authPanelVisible || tourOpen || profileNeedsSetup) return;
    if (userProfile.weeklyDigestOptIn === true) return;
    if (userProfile.digestPromptedAt) return;
    const uid = user.uid;
    const id = window.setTimeout(() => {
      setDigestPromptOpen(true);
      setDoc(doc(db!, 'users', uid), { digestPromptedAt: Date.now() }, { merge: true }).catch(() => {});
    }, 1400);
    return () => window.clearTimeout(id);
  }, [user, userProfile, isLoading, authPanelVisible, tourOpen, profileNeedsSetup]);

  const enableDigest = useCallback(async () => {
    setDigestPromptOpen(false);
    if (!user || !db) return;
    try {
      await setDoc(doc(db, 'users', user.uid), {
        weeklyDigestOptIn: true,
        weeklyDigestOptInAt: Date.now(),
        digestUnsubscribedAt: null,
        digestUnsubscribeSource: null,
        profileUpdatedAt: Date.now(),
      }, { merge: true });
      logProductEvent('digest_enabled');
      celebrate('Weekly digest on — your neighbourhood stats will land by email.');
    } catch { /* profile listener will re-sync */ }
  }, [user, celebrate]);

  /** Close the account panel the way its close button does. */
  const closeAuthPanel = useCallback(() => {
    setOnboardingDismissedThisSession(true);
    setIsEditingPreferences(false);
    setAuthPanelOpen(false);
    setAuthPanelMode('signin');
    setProfileSaveError(null);
    // Walking away from sign-in drops a report they had tried to start.
    if (!user) setPendingReport(null);
  }, [user]);

  /**
   * Escape closes the topmost open panel, one per press. Surfaces that handle
   * Escape themselves (camera viewer, traffic panel, personal briefing, tour)
   * are left to do so, and the report forms are never closed from here so a
   * stray key cannot throw away a half-written report.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (tourOpen || viewerCamera || selectedTrafficSegment || briefingOpen) return;
      if (isFormOpen || isEmergencyOpen || isPinMode || isEmergencyPinMode) return;
      if (digestPromptOpen) { setDigestPromptOpen(false); return; }
      if (authPanelVisible) { if (canCloseAuthPanel) closeAuthPanel(); return; }
      if (showNotifications) { setShowNotifications(false); return; }
      if (showUserMenu) { setShowUserMenu(false); return; }
      if (selectedIncident) { setSelectedIncident(null); return; }
      if (selectedArea) { setSelectedArea(null); return; }
      if (nearMeOpen) { setNearMeOpen(false); setNearMeScanning(false); return; }
      if (sheetState === 'raised') setSheetState('rail');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tourOpen, viewerCamera, selectedTrafficSegment, briefingOpen, isFormOpen, isEmergencyOpen, isPinMode,
    isEmergencyPinMode, digestPromptOpen, authPanelVisible, canCloseAuthPanel, closeAuthPanel, showNotifications,
    showUserMenu, selectedIncident, selectedArea, nearMeOpen, sheetState]);

  // Instant alerts write straight to the profile — small, independent controls
  // that must not wait on the larger report-area form's save cycle.
  const updateAlertPrefs = useCallback(async (patch: Partial<UserProfileSettings>) => {
    if (!user || !db) return;
    try {
      await setDoc(doc(db, 'users', user.uid), { ...patch, profileUpdatedAt: Date.now() }, { merge: true });
    } catch { /* profile listener will re-sync */ }
  }, [user]);

  const [pushBusy, setPushBusy] = useState(false);
  const [pushResult, setPushResult] = useState<PushStatus | null>(null);
  const [pushEnabledHere, setPushEnabledHere] = useState(() => isPushEnabledHere());
  const togglePush = useCallback(async () => {
    if (!user || pushBusy) return;
    setPushBusy(true);
    try {
      // Key off our own local flag, not Notification.permission — the browser
      // never reverts permission to "default" when a token is revoked, so that
      // check would strand the toggle permanently in the "on" state.
      if (isPushEnabledHere()) {
        await disablePush(user.uid);
        setPushResult(null);
      } else {
        setPushResult(await enablePush(user.uid));
      }
    } finally {
      setPushEnabledHere(isPushEnabledHere());
      setPushBusy(false);
    }
  }, [user, pushBusy]);

  // Turning instant alerts off is also a clean opt-out of push on this device —
  // otherwise a live token keeps this browser buzzing for alerts the reader
  // just switched off.
  const toggleAlerts = useCallback(async (turnOn: boolean) => {
    if (!user) return;
    if (turnOn) {
      let tz: string | undefined;
      try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || undefined; } catch { tz = undefined; }
      await updateAlertPrefs({ alertsEnabled: true, ...(tz ? { alertTimezone: tz } : {}) });
    } else {
      await updateAlertPrefs({ alertsEnabled: false });
      await disablePush(user.uid);
      setPushEnabledHere(false);
      setPushResult(null);
    }
  }, [user, updateAlertPrefs]);

  return (
    <div className="map-shell cw-map lv-root relative flex h-dvh w-full overflow-hidden bg-[#FAF8F3] font-sans text-[#151515]">
      <h1 className="sr-only">Calgary crime map with recent reports near you</h1>
      <AnimatePresence>
        {isLoading && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex bg-[#FAF8F3]"
            role="status"
            aria-live="polite"
          >
            <div className="hidden lg:block w-80 h-full border-r-2 border-[#151515]">
              <SidebarSkeleton />
            </div>
            <div className="lv-loading flex-1 h-full relative">
              <div className="absolute inset-0 opacity-60"><MapShimmer /></div>
              <div className="lv-card lv-card-shadow lv-loading-card relative">
                <span className="lv-loading-spin" style={{ borderColor: 'rgba(21,21,21,0.15)', borderTopColor: '#1554D1' }} aria-hidden="true" />
                <span>
                  <span className="lv-h-sm block">Loading the live map</span>
                  <span className="lv-small block mt-0.5">Neighbour reports and City open data</span>
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Auth and profile onboarding */}
      <AnimatePresence>
        {authPanelVisible && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="lv-scrim fixed inset-0 z-[180] flex items-center justify-center p-3 backdrop-blur-sm sm:p-6"
            role="dialog"
            aria-modal="true"
            aria-label={showProfileStep ? 'Calgary Watch profile settings' : 'Sign up or sign in to Calgary Watch'}
          >
            <motion.div
              initial={{ opacity: 0, y: 22, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 22, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 220, damping: 24 }}
              className="lv-modal lv-auth max-h-[calc(100dvh-1.5rem)] max-w-4xl"
            >
              {canCloseAuthPanel && (
                <button
                  type="button"
                  onClick={closeAuthPanel}
                  className="lv-close absolute right-3 top-3 z-10 sm:right-4 sm:top-4"
                  aria-label="Close sign up or sign in panel"
                >
                  <X size={18} />
                </button>
              )}

              <div className="grid lg:grid-cols-[0.82fr_1.18fr]">
                <div className="lv-sky lv-modal-side">
                  <div className="lv-modal-icon">
                    {showProfileStep ? <Home size={22} /> : <GoogleIcon />}
                  </div>
                  <h2>
                    {showProfileStep
                      ? authPanelMode === 'settings' ? 'Account settings' : 'Finish your profile'
                      : 'Sign up or sign in'}
                  </h2>
                  <p>
                    {showProfileStep
                      ? 'Choose your report area and privacy preferences. Your neighbourhood report appears each time you sign in.'
                      : 'Continue with Google to create an account or sign back in. An account lets you post reports, save a home area and get a weekly note about what was reported near you.'}
                  </p>

                  {showProfileStep && (
                    <div className="lv-side-card">
                      <p className="lv-eyebrow">Current report area</p>
                      <strong>{locationLabel}</strong>
                      <span>
                        Weekly digest: {userProfile?.weeklyDigestOptIn === true ? 'on' : 'off'}
                      </span>
                    </div>
                  )}
                </div>

                <div className="p-5 sm:p-6 md:p-8">
                  {!showProfileStep ? (
                    <div className="space-y-5">
                      <div>
                        <p className="lv-eyebrow lv-eyebrow-blue">Your CalgaryWatch account</p>
                        <h3 className="lv-h mt-2">Sign up or sign in <span className="lv-mark">securely</span></h3>
                        <p className="lv-body mt-2">
                          New to CalgaryWatch? Create an account with Google. Already registered? Sign in the same way. This panel will then ask for your privacy consent and, if you like, a neighbourhood or address.
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => void signIn()}
                        className="lv-btn lv-btn-primary lv-btn-block"
                      >
                        <GoogleIcon />
                        Sign up or sign in with Google
                      </button>

                      <p className="lv-small">
                        Calgary Watch uses your account to reduce spam, support report moderation, and connect neighbourhood reports to your saved preferences.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-5">
                      {/* ── Summary view (returning users, not editing) ─────── */}
                      {!profileNeedsSetup && !isEditingPreferences ? (
                        <>
                          {/* Google profile header */}
                          <div className="flex items-center gap-4">
                            {user?.photoURL ? (
                              <img
                                src={user.photoURL}
                                alt={user.displayName || 'Profile'}
                                referrerPolicy="no-referrer"
                                className="h-14 w-14 rounded-[16px] border-2 border-[#151515] object-cover"
                              />
                            ) : (
                              <div className="flex h-14 w-14 items-center justify-center rounded-[16px] border-2 border-[#151515] bg-[#1554D1] text-xl font-black text-[#FFFFFF]">
                                {(user?.displayName || user?.email || 'U').charAt(0).toUpperCase()}
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="truncate text-lg font-black" style={{ color: '#151515' }}>
                                {user?.displayName || 'Calgary User'}
                              </p>
                              <p className="truncate text-xs" style={{ color: '#565A61' }}>
                                {user?.email}
                              </p>
                            </div>
                          </div>

                          {/* Preferences summary — ledger rows */}
                          <div className="lv-row-card" style={{ border: '2px solid #151515' }}>
                            <div className="flex items-center gap-3 p-4" style={{ background: '#FAF8F3' }}>
                              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px]" style={{ background: 'rgba(21,84,209,0.14)' }}>
                                <Home size={15} className="text-[#1554D1]" />
                              </span>
                              <div className="min-w-0">
                                <p className="lv-eyebrow text-[#565A61]">Report area</p>
                                <p className="mt-0.5 text-sm font-bold truncate text-[#151515]">
                                  {preferredAddress || preferredNeighborhood || preferredInferredNeighborhood || 'No location set'}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3 p-4" style={{ borderTop: '1px dashed #E4E1D8' }}>
                              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px]" style={{ background: 'rgba(21,84,209,0.12)' }}>
                                <Bell size={15} className="text-[#1554D1]" />
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="lv-eyebrow text-[#565A61]">Weekly digest</p>
                                <p className="mt-0.5 text-sm font-bold text-[#151515]">
                                  {userProfile?.weeklyDigestOptIn === true ? 'Neighbourhood stats + news, weekly' : 'Off'}
                                </p>
                              </div>
                              <span
                                className="shrink-0 rounded-full font-mono text-[11px] font-bold uppercase tracking-[0.08em] px-2.5 py-1"
                                style={userProfile?.weeklyDigestOptIn === true
                                  ? { background: 'rgba(21,84,209,0.14)', color: '#1554D1' }
                                  : { background: '#FAF8F3', color: '#7A7F87', border: '1px solid #E4E1D8' }}
                              >
                                {userProfile?.weeklyDigestOptIn === true ? 'On' : 'Off'}
                              </span>
                            </div>
                          </div>

                          {/* ── Instant alerts (Phase 3) ─────────────────────
                              Direct-write controls: independent of the report-
                              area form, they take effect the moment they change. */}
                          {(() => {
                            const alertsOn = userProfile?.alertsEnabled === true;
                            const quietOn = typeof userProfile?.alertQuietStartHour === 'number'
                              && typeof userProfile?.alertQuietEndHour === 'number';
                            const alertCats = userProfile?.alertCategories ?? [];
                            const emergencyOn = userProfile?.alertEmergencyAlways !== false;
                            const homeArea = preferredNeighborhood || preferredInferredNeighborhood;
                            const extraZones = userProfile?.alertZones ?? [];
                            const pushOnHere = pushEnabledHere;
                            const pushHint = pushResult === 'denied' ? 'Permission was blocked in your browser.'
                              : pushResult === 'unavailable' ? 'Not available in this preview build.'
                              : pushResult === 'error' ? 'Could not turn on — try again.'
                              : 'Get alerts even when the tab is closed.';
                            return (
                              <div className="lv-row-card" style={{ background: '#FFFFFF', border: '2px solid #151515' }}>
                                <button
                                  type="button"
                                  onClick={() => void toggleAlerts(!alertsOn)}
                                  aria-pressed={alertsOn}
                                  className="flex w-full items-center gap-3 p-4 text-left"
                                >
                                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px]" style={{ background: 'rgba(192,57,43,0.12)' }}>
                                    <Siren size={15} className="text-[#C0392B]" />
                                  </span>
                                  <span className="min-w-0 flex-1">
                                    <span className="block lv-eyebrow text-[#565A61]">Instant alerts</span>
                                    <span className="mt-0.5 block text-sm font-bold text-[#151515]">
                                      {alertsOn ? 'Emergencies + nearby neighbour reports' : 'Off'}
                                    </span>
                                  </span>
                                  <span
                                    className="shrink-0 rounded-full font-mono text-[11px] font-bold uppercase tracking-[0.08em] px-2.5 py-1"
                                    style={alertsOn
                                      ? { background: 'rgba(192,57,43,0.14)', color: '#C0392B' }
                                      : { background: '#FAF8F3', color: '#7A7F87', border: '1px solid #E4E1D8' }}
                                  >
                                    {alertsOn ? 'On' : 'Off'}
                                  </span>
                                </button>

                                {alertsOn && (
                                  <div className="space-y-3 px-4 pb-4" style={{ borderTop: '1px dashed #E4E1D8' }}>
                                    {/* Coverage — an alert only fires inside a watched
                                        area, so say plainly which areas those are. */}
                                    {homeArea ? (
                                      <p className="mt-3 text-[13px]" style={{ color: '#565A61' }}>
                                        Nearby-report alerts cover <strong style={{ color: '#151515' }}>{[homeArea, ...extraZones.map((z) => z.neighborhood)].join(', ')}</strong>.
                                      </p>
                                    ) : (
                                      <p className="mt-3 text-[13px]" style={{ color: '#C0392B' }}>
                                        Set a neighbourhood in <strong>Your report area</strong> above so we know where to alert you. Emergency alerts still reach you meanwhile.
                                      </p>
                                    )}

                                    {/* Additional watched areas (Work, School, family). */}
                                    <div className="space-y-1.5">
                                      <p className="lv-eyebrow" style={{ color: '#565A61' }}>
                                        Other areas to watch
                                      </p>
                                      {extraZones.length > 0 && (
                                        <div className="flex flex-wrap gap-1.5">
                                          {extraZones.map((z) => (
                                            <button
                                              key={z.id}
                                              type="button"
                                              onClick={() => void updateAlertPrefs({ alertZones: extraZones.filter((e) => e.id !== z.id) })}
                                              className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[12px] font-bold"
                                              style={{ background: '#06162F', color: '#FFFFFF', border: '2px solid #151515' }}
                                            >
                                              {z.neighborhood} <X size={11} />
                                            </button>
                                          ))}
                                        </div>
                                      )}
                                      <input
                                        type="text"
                                        placeholder="Add a neighbourhood, then Enter"
                                        className="w-full px-3 py-2 text-[13px]"
                                        style={{ background: '#FFFFFF', border: '2px solid #151515' }}
                                        onKeyDown={(e) => {
                                          if (e.key !== 'Enter') return;
                                          e.preventDefault();
                                          const name = (e.currentTarget.value || '').trim().slice(0, 80);
                                          if (!name) return;
                                          const exists = extraZones.some((z) => z.neighborhood.toLowerCase() === name.toLowerCase())
                                            || name.toLowerCase() === homeArea.toLowerCase();
                                          if (!exists && extraZones.length < 6) {
                                            void updateAlertPrefs({
                                              alertZones: [...extraZones, { id: `z${Date.now().toString(36)}`, label: name, neighborhood: name, radiusM: 0 }],
                                            });
                                          }
                                          e.currentTarget.value = '';
                                        }}
                                      />
                                    </div>

                                    <label className="flex cursor-pointer items-center gap-2.5">
                                      <input
                                        type="checkbox"
                                        checked={emergencyOn}
                                        onChange={(e) => void updateAlertPrefs({ alertEmergencyAlways: e.target.checked })}
                                        className="h-4 w-4 shrink-0"
                                        style={{ accentColor: '#C0392B' }}
                                      />
                                      <span className="text-[13px]" style={{ color: '#565A61' }}>
                                        <strong style={{ color: '#151515' }}>Always alert me to emergencies</strong>, anywhere in the city and at any hour.
                                      </span>
                                    </label>

                                    <label className="flex cursor-pointer items-center gap-2.5">
                                      <input
                                        type="checkbox"
                                        checked={quietOn}
                                        onChange={(e) => void updateAlertPrefs(e.target.checked
                                          ? { alertQuietStartHour: 22, alertQuietEndHour: 7 }
                                          : { alertQuietStartHour: undefined, alertQuietEndHour: undefined })}
                                        className="h-4 w-4 shrink-0"
                                        style={{ accentColor: '#C0392B' }}
                                      />
                                      <span className="text-[13px]" style={{ color: '#565A61' }}>
                                        <strong style={{ color: '#151515' }}>Quiet hours 10 PM–7 AM your time.</strong> {emergencyOn ? 'Emergencies still come through.' : 'Nothing comes through.'}
                                      </span>
                                    </label>

                                    {/* Browser push — only rendered where the browser
                                        supports it and a VAPID key is configured, so it
                                        stays invisible until push is fully set up. */}
                                    {isPushSupported() && isPushConfigured() && (
                                      <div className="flex items-center justify-between gap-3">
                                        <span className="text-[13px]" style={{ color: '#565A61' }}>
                                          <strong style={{ color: '#151515' }}>Browser push on this device.</strong>{' '}
                                          {pushHint}
                                        </span>
                                        <button
                                          type="button"
                                          disabled={pushBusy}
                                          onClick={() => void togglePush()}
                                          className="shrink-0 rounded-full px-3.5 py-2 text-[12.5px] font-bold disabled:opacity-60"
                                          style={pushOnHere
                                            ? { background: 'rgba(21,84,209,0.14)', color: '#1554D1', border: '1.5px solid rgba(21,84,209,0.45)' }
                                            : { background: '#06162F', color: '#FFFFFF', border: '2px solid #151515' }}
                                        >
                                          {pushBusy ? '…' : pushOnHere ? 'Turn off' : 'Enable'}
                                        </button>
                                      </div>
                                    )}
                                    <div className="space-y-1.5">
                                      <p className="lv-eyebrow" style={{ color: '#565A61' }}>
                                        Alert categories <span style={{ color: '#7A7F87' }}>· all if none picked</span>
                                      </p>
                                      <div className="flex flex-wrap gap-1.5">
                                        {DIGEST_CATEGORY_ORDER.map((cat) => {
                                          const on = alertCats.includes(cat);
                                          return (
                                            <button
                                              key={cat}
                                              type="button"
                                              aria-pressed={on}
                                              onClick={() => void updateAlertPrefs({
                                                alertCategories: on ? alertCats.filter((c) => c !== cat) : [...alertCats, cat],
                                              })}
                                              className="rounded-full px-3 py-1.5 text-[12.5px] font-bold"
                                              style={on
                                                ? { background: '#06162F', color: '#FFFFFF', border: '2px solid #151515' }
                                                : { background: '#FFFFFF', color: '#565A61', border: '2px solid #151515' }}
                                            >
                                              {DIGEST_CATEGORY_LABEL[cat]}
                                            </button>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })()}

                          <button
                            type="button"
                            onClick={() => setIsEditingPreferences(true)}
                            className="lv-btn lv-btn-navy lv-btn-block"
                          >
                            Edit preferences
                          </button>
                        </>
                      ) : (
                        /* ── Edit / onboarding form ─────────────────────────── */
                        <>
                          <div>
                            <p className="lv-eyebrow" style={{ color: '#1554D1' }}>
                              {profileNeedsSetup ? 'Set up your report area' : 'Edit preferences'}
                            </p>
                            <h3 className="lv-h mt-2">
                              {addressIsSettled ? 'Your report area' : 'Where should we watch?'}
                            </h3>
                            <p className="mt-2 text-sm leading-relaxed" style={{ color: '#565A61' }}>
                              {addressIsSettled
                                ? 'This is the address your briefing is measured from. Change it any time.'
                                : 'Give an address for a report measured from your door, or just a neighbourhood if you would rather not store one.'}
                            </p>
                          </div>

                          <div className="grid gap-4">
                            {/* ── Address ────────────────────────────────────
                                Three states, because there are three moments:
                                nothing given yet, typing, and settled. The old
                                form only had one, so it kept suggesting
                                alternatives for an address already on file. */}
                            <div className="space-y-2">
                              <span className="flex items-center justify-between gap-3">
                                <span className="lv-eyebrow" style={{ color: '#565A61' }}>
                                  Address or nearby landmark
                                </span>
                                <span
                                  className="rounded-full px-2.5 py-0.5 font-mono text-[11px] font-bold uppercase tracking-[0.08em]"
                                  style={{ background: 'rgba(21,84,209,0.14)', color: '#1554D1' }}
                                >
                                  Recommended
                                </span>
                              </span>

                              {addressIsSettled ? (
                                /* Settled — confirm it and get out of the way. */
                                <div
                                  className="flex items-start gap-3 rounded-[16px] p-3.5"
                                  style={{ background: 'rgba(21,84,209,0.08)', border: '1.5px solid rgba(21,84,209,0.45)' }}
                                >
                                  <span
                                    className="mt-[1px] grid h-6 w-6 shrink-0 place-items-center"
                                    style={{ background: '#1554D1' }}
                                  >
                                    <Check size={13} style={{ color: '#FFFFFF' }} />
                                  </span>
                                  <span className="min-w-0 flex-1">
                                    <span className="block text-sm font-bold leading-snug" style={{ color: '#151515' }}>
                                      {profileDraft.address}
                                    </span>
                                    <span className="mt-0.5 block text-[11.5px] font-medium" style={{ color: '#565A61' }}>
                                      {profileDraft.inferredNeighborhood
                                        ? `Matched to ${profileDraft.inferredNeighborhood} in the city registry`
                                        : 'Saved as your report area'}
                                    </span>
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => setProfileDraft((prev) => ({ ...prev, address: '', inferredNeighborhood: '' }))}
                                    className="shrink-0 px-2 py-1 text-[11.5px] font-bold underline underline-offset-2 transition-opacity hover:opacity-70"
                                    style={{ color: '#151515' }}
                                  >
                                    Change
                                  </button>
                                </div>
                              ) : (
                                <>
                                  <input
                                    value={profileDraft.address}
                                    onChange={(e) => {
                                      const address = e.target.value;
                                      setProfileDraft((prev) => ({ ...prev, address, inferredNeighborhood: '', neighborhood: address.trim() ? '' : prev.neighborhood }));
                                    }}
                                    autoFocus={profileDraft.address.trim().length === 0 && !profileNeedsSetup}
                                    placeholder="Start typing an address, street, or landmark"
                                    className="h-12 w-full px-4 text-sm outline-none transition-colors focus:border-[#151515]"
                                    style={{ background: '#FFFFFF', border: '2px solid #151515', color: '#151515' }}
                                  />
                                  <div className="min-h-6">
                                    {addressQuery.length > 0 && addressQuery.length < 3 && (
                                      <p className="text-[11.5px] font-medium" style={{ color: '#565A61' }}>
                                        Keep typing — matched against the City of Calgary address registry.
                                      </p>
                                    )}
                                    {addressSuggestions.length > 0 && (
                                      <div className="grid gap-2 sm:grid-cols-2">
                                        {addressSuggestions.map((item) => (
                                          <button
                                            key={`${item.label}-${item.neighborhood}`}
                                            type="button"
                                            onClick={() => setProfileDraft((prev) => ({ ...prev, address: item.label, inferredNeighborhood: item.neighborhood, neighborhood: '' }))}
                                            className="rounded-[14px] px-3 py-2 text-left text-xs font-bold transition-colors hover:bg-[#FFF5CC]"
                                            style={{ background: '#FFFFFF', border: '2px solid #151515', color: '#151515' }}
                                          >
                                            <span className="block truncate">{item.label}</span>
                                            {item.neighborhood && (
                                              <span className="mt-0.5 block text-[10px] font-medium" style={{ color: '#565A61' }}>
                                                {item.neighborhood}
                                              </span>
                                            )}
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </>
                              )}
                            </div>

                            <div className="flex items-center gap-3">
                              <div className="h-px flex-1" style={{ background: '#E4E1D8' }} />
                              <span className="lv-eyebrow" style={{ color: '#565A61' }}>or</span>
                              <div className="h-px flex-1" style={{ background: '#E4E1D8' }} />
                            </div>

                            {/* ── Neighbourhood ──────────────────────────────
                                Hidden once an address is settled: the two are
                                mutually exclusive, and showing an empty second
                                option implies the choice is unfinished. */}
                            {!addressIsSettled && (
                              <label className="space-y-2">
                                <span className="lv-eyebrow" style={{ color: '#565A61' }}>
                                  Neighbourhood only
                                </span>
                                <input
                                  value={profileDraft.neighborhood}
                                  onChange={(e) => {
                                    const neighborhood = e.target.value;
                                    setProfileDraft((prev) => ({ ...prev, neighborhood, inferredNeighborhood: '', address: neighborhood.trim() ? '' : prev.address }));
                                  }}
                                  placeholder="Start typing a Calgary neighbourhood"
                                  className="h-12 w-full px-4 text-sm outline-none transition-colors focus:border-[#151515]"
                                  style={{ background: '#FFFFFF', border: '2px solid #151515', color: '#151515' }}
                                />
                                <div className="min-h-6">
                                  {neighborhoodQuery.length > 0 && neighborhoodQuery.length < 2 && (
                                    <p className="text-[11.5px] font-medium" style={{ color: '#565A61' }}>
                                      Type 2+ letters — all {neighborhoodSuggestions.length || 300}+ official communities are searchable.
                                    </p>
                                  )}
                                  {filteredNeighborhoodSuggestions.length > 0 && (
                                    <div className="flex flex-wrap gap-2">
                                      {filteredNeighborhoodSuggestions.map((name) => (
                                        <button
                                          key={name}
                                          type="button"
                                          onClick={() => setProfileDraft((prev) => ({ ...prev, neighborhood: name, inferredNeighborhood: '', address: '' }))}
                                          className="rounded-full px-3 py-2 text-xs font-bold transition-colors hover:bg-[#FFF5CC]"
                                          style={{ background: '#FFFFFF', border: '2px solid #151515', color: '#151515' }}
                                        >
                                          {name}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </label>
                            )}
                            {addressIsSettled && (
                              <p className="text-[11.5px] font-medium" style={{ color: '#565A61' }}>
                                Prefer not to store an address? Choose <strong style={{ color: '#151515' }}>Change</strong> above, then
                                give a neighbourhood name instead.
                              </p>
                            )}
                          </div>

                          {(profileDraft.neighborhood.trim() || profileDraft.address.trim()) ? (
                          <label
                            className="flex cursor-pointer gap-3 rounded-[16px] p-4"
                            style={{ background: '#FAF8F3', border: '2px solid #151515' }}
                          >
                            <input
                              type="checkbox"
                              checked={profileDraft.piiConsent}
                              onChange={(e) => setProfileDraft((prev) => ({ ...prev, piiConsent: e.target.checked }))}
                              className="mt-0.5 h-4 w-4 shrink-0"
                              style={{ accentColor: '#1554D1' }}
                            />
                            <span className="text-[13px] leading-relaxed" style={{ color: '#565A61' }}>
                              <strong style={{ color: '#151515' }}>Store my location preference.</strong> Calgary Watch keeps your
                              profile and report area to run your account, your neighbourhood report and moderation.{' '}
                              <a href="/privacy" className="font-bold underline underline-offset-2" style={{ color: '#151515' }}>
                                What we keep
                              </a>
                            </span>
                          </label>
                          ) : <p className="text-sm">Location is optional. Leave it blank to see all of Calgary.</p>}

                          <label
                            className="flex cursor-pointer gap-3 rounded-[16px] p-4"
                            style={{ background: 'rgba(21,84,209,0.08)', border: '1.5px solid rgba(21,84,209,0.45)' }}
                          >
                            <input
                              type="checkbox"
                              checked={profileDraft.weeklyDigestOptIn}
                              onChange={(e) => setProfileDraft((prev) => ({ ...prev, weeklyDigestOptIn: e.target.checked }))}
                              className="mt-0.5 h-4 w-4 shrink-0"
                              style={{ accentColor: '#1554D1' }}
                            />
                            <span className="text-[13px] leading-relaxed" style={{ color: '#565A61' }}>
                              <strong style={{ color: '#151515' }}>Email me the weekly digest.</strong> Crime stats, notable reports
                              and community updates for your area. Optional, and you can turn it off any time.
                            </span>
                          </label>
                          <a
                            href="/plans#emails"
                            className="block rounded-[16px] px-4 py-3 text-[13px] font-semibold underline underline-offset-2"
                            style={{ color: '#151515', background: '#FFF5CC', border: '2px solid #151515' }}
                          >
                            Also want Thursday weekend picks, your plans and badges? Manage everything in Your CalgaryWatch →
                          </a>

                          {/* Category preference — only meaningful once the digest
                              is on. Empty selection means every category, so the
                              default (nothing ticked) reads as "all". */}
                          {profileDraft.weeklyDigestOptIn && (
                            <div className="space-y-2 px-1">
                              <p className="lv-eyebrow" style={{ color: '#565A61' }}>
                                Digest topics <span style={{ color: '#7A7F87' }}>· all if none picked</span>
                              </p>
                              <div className="flex flex-wrap gap-1.5">
                                {DIGEST_CATEGORY_ORDER.map((cat) => {
                                  const on = profileDraft.digestCategories.includes(cat);
                                  return (
                                    <button
                                      key={cat}
                                      type="button"
                                      aria-pressed={on}
                                      onClick={() => setProfileDraft((prev) => ({
                                        ...prev,
                                        digestCategories: on
                                          ? prev.digestCategories.filter((c) => c !== cat)
                                          : [...prev.digestCategories, cat],
                                      }))}
                                      className="rounded-full px-3 py-1.5 text-[12.5px] font-bold transition-colors"
                                      style={on
                                        ? { background: '#06162F', color: '#FFFFFF', border: '2px solid #151515' }
                                        : { background: '#FFFFFF', color: '#565A61', border: '2px solid #151515' }}
                                    >
                                      {DIGEST_CATEGORY_LABEL[cat]}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {profileSaveError && (
                            <p className="rounded-[14px] px-3 py-2.5 text-[13px] font-bold"
                               style={{ background: 'rgba(192,57,43,0.08)', border: '1.5px solid rgba(192,57,43,0.45)', color: '#96271C' }}>
                              {profileSaveError}
                            </p>
                          )}

                          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                            {profileNeedsSetup && (
                              <button type="button" onClick={skipOnboarding} className="lv-btn lv-btn-ghost">
                                Skip for now
                              </button>
                            )}
                            {!profileNeedsSetup && (
                              <button
                                type="button"
                                onClick={() => {
                                  setIsEditingPreferences(false);
                                  setProfileDraft({
                                    neighborhood: userProfile?.neighborhood || '',
                                    address: userProfile?.address || '',
                                    inferredNeighborhood: userProfile?.inferredNeighborhood || '',
                                    piiConsent: Boolean(userProfile?.piiConsentAt),
                                    weeklyDigestOptIn: userProfile?.weeklyDigestOptIn === true,
                                    digestCategories: userProfile?.digestCategories || [],
                                  });
                                  setProfileSaveError(null);
                                }}
                                className="lv-btn lv-btn-ghost"
                              >
                                Cancel
                              </button>
                            )}
                            {(profileNeedsSetup || isDirty) && (
                              <button
                                type="button"
                                onClick={saveProfileSettings}
                                disabled={isSavingProfile}
                                className="lv-btn lv-btn-primary"
                              >
                                {isSavingProfile ? 'Saving…' : 'Save and continue'}
                              </button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* One-time weekly digest prompt */}
      <AnimatePresence>
        {digestPromptOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="lv-scrim fixed inset-0 z-[190] flex items-end sm:items-center justify-center p-4"
            onClick={() => setDigestPromptOpen(false)}
            role="dialog"
            aria-modal="true"
            aria-label="Weekly digest"
          >
            <motion.div
              initial={{ opacity: 0, y: 26, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 260, damping: 22 }}
              className="lv-modal w-full max-w-sm overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="lv-sky px-6 pt-6 pb-5">
                <p className="lv-eyebrow" style={{ color: '#9fe9f5' }}>Weekly email · free</p>
                <h3 className="mt-2 font-display text-[24px] font-extrabold leading-[1.05] tracking-[-0.03em]" style={{ color: '#fff' }}>
                  <span className="lv-mark">{locationLabel !== 'your local report area' ? locationLabel : 'Your neighbourhood'}</span>, weekly
                </h3>
                <p className="mt-2 text-[13.5px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.84)' }}>
                  One email a week: what neighbours reported near you, City 311 figures
                  for your area, and community news. Opt out any time.
                </p>
              </div>
              <div className="flex items-center gap-3 px-5 py-4">
                <button type="button" onClick={() => setDigestPromptOpen(false)} className="lv-btn lv-btn-ghost flex-1">
                  Not now
                </button>
                <button type="button" onClick={() => void enableDigest()} className="lv-btn lv-btn-primary flex-[1.4]">
                  Email me the digest
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Post-submit celebration toast */}
      <AnimatePresence>
        {celebration && (
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 280, damping: 20 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[210] pointer-events-none w-max max-w-[calc(100vw-2rem)]"
            role="status"
          >
            <div className="lv-toast lv-toast-navy">
              <span className="lv-toast-icon" style={{ background: '#ffdf4f', color: '#151515' }} aria-hidden="true">
                <Check size={18} strokeWidth={3} />
              </span>
              <div>
                <p className="font-display text-[15px] font-extrabold">On the map</p>
                <p className="text-[12.5px] font-medium" style={{ color: '#a9b8d0' }}>{celebration}</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Submit error toast */}
      <AnimatePresence>
        {submitError && (
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] w-max max-w-[calc(100vw-2rem)]"
            role="alert"
          >
            <div className="lv-toast">
              <span className="lv-toast-icon" style={{ background: '#fff5cc' }} aria-hidden="true">
                <ShieldAlert size={16} />
              </span>
              <span>{submitError}</span>
              <button type="button" onClick={() => setSubmitError(null)} aria-label="Dismiss" className="lv-close" style={{ width: 32, height: 32, borderRadius: 10 }}>
                <X size={14} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/*
        Geolocation notice. Sits below the phone chrome and the desktop bar,
        stays on one line, and clears itself: a denied location is a minor
        fallback, not an error the map needs to keep insisting on.
      */}
      <AnimatePresence>
        {locationError && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            role="status"
            className="fixed left-3 top-[calc(var(--cw-chrome-h,10rem)+0.75rem)] z-[200] max-w-[calc(100vw-5.5rem)]
                       lg:left-1/2 lg:top-[5.5rem] lg:-translate-x-1/2 lg:max-w-[calc(100vw-2rem)]"
          >
            <div className="lv-toast whitespace-nowrap" style={{ padding: '8px 8px 8px 14px', borderRadius: 999, boxShadow: '3px 3px 0 #151515' }}>
              <Navigation size={14} className="shrink-0" style={{ color: '#1554D1' }} />
              <span className="truncate">Location off. Showing all of Calgary</span>
              <button type="button" onClick={() => setLocationError(false)} aria-label="Dismiss" className="grid size-7 shrink-0 place-items-center rounded-full hover:bg-[#FFF5CC]">
                <X size={13} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* First-run coach-mark tour */}
      <MapTour open={tourOpen} onFinish={finishTour} onStepChange={handleTourStepChange} />

      {/* Sidebar Feed - Desktop */}
      <div className="relative z-40 hidden h-full shrink-0 flex-col lg:flex" data-tour="feed">
        <Sidebar
          incidents={feedIncidents}
          briefingIncidents={nearArea ? briefingIncidents : undefined}
          areaName={nearArea?.name}
          timeWindow={timeWindow}
          onTimeWindowChange={setTimeWindow}
          onIncidentClick={handleSidebarIncidentClick}
          selectedCategory={selectedCategory}
          onCategoryChange={setSelectedCategory}
          activeIncidentId={activeIncidentId}
          hasMore={hasMoreIncidents}
          isLoadingMore={isLoadingMoreIncidents}
          onLoadMore={handleLoadMoreIncidents}
        />
      </div>


      {/* Main Map Area */}
      <main className="flex-1 relative min-w-0">
        <Map
          ref={mapRef}
          incidents={mapIncidents}
          onMarkerClick={handleMarkerClick}
          onMapClick={handleMapClick}
          onViewNeighborhood={handleViewNeighborhood}
          onViewIncident={setSelectedIncident}
          showLiveReports={showLiveReports}
          showHeatmap={showHeatmap}
          showCrimeLayer={showCrimeLayer}
          trafficCameras={showCameras ? trafficCameras : undefined}
          safetyCameras={showSafetyCameras ? safetyCameras : undefined}
          trafficSegments={showTrafficFlow ? trafficFlow.snapshot?.segments : undefined}
          selectedTrafficSegmentId={selectedTrafficSegment?.id}
          crimeStats={crimeStats}
          isPinMode={isPinMode || isEmergencyPinMode}
          onPinConfirm={isEmergencyPinMode ? handleEmergencyPinConfirm : handlePinConfirm}
          onPinCancel={isEmergencyPinMode ? handleEmergencyPinCancel : handlePinCancel}
          onCameraSelect={setViewerCamera}
          onTrafficSegmentSelect={(segment) => {
            setSelectedTrafficSegment(segment);
            setSelectedIncident(null);
            setSelectedArea(null);
          }}
          isMapInteractive={!isFormOpen || isPinMode || isEmergencyPinMode || isEmergencyOpen}
        />

        {/* Tap-to-close: covers the exposed map only. It starts below the chrome —
            at top-0 it swallowed the chrome's own controls, so tapping Home or a
            time chip collapsed the sheet instead of acting. The sheet itself
            (z-[52]) sits over the rest. */}
        {sheetState === 'raised' && (
          <div
            className="fixed inset-x-0 bottom-0 z-[49] cursor-pointer lg:hidden"
            style={{ top: 'var(--cw-chrome-h, 0px)' }}
            onClick={() => setSheetState('rail')}
            aria-hidden="true"
          />
        )}

        {/* Mobile Bottom Sheet */}
        <MobileMapSheet
          ref={sheetRef}
          incidents={feedIncidents}
          feedCount={feedCount}
          timeWindow={timeWindow}
          onTimeWindowChange={setTimeWindow}
          selectedCategory={selectedCategory}
          onCategoryChange={setSelectedCategory}
          state={sheetState}
          onStateChange={setSheetState}
          userLocation={userLocation}
          hasMore={hasMoreIncidents}
          isLoadingMore={isLoadingMoreIncidents}
          onLoadMore={handleLoadMoreIncidents}
          onIncidentClick={handleSheetIncidentClick}
          onNeighbourhoodSelect={handleSheetNeighbourhoodSelect}
          onReportPress={() => requestReport(null)}
          activeIncidentId={activeIncidentId}
          hidden={isFormOpen || isPinMode || isEmergencyPinMode}
          briefing={
            /* ── NowBriefing slot (feed worker's component) ── */
            <>
              {nearArea && (
                <button
                  type="button"
                  className="lv-chip lv-chip-sm mb-2"
                  style={{ background: '#fff5cc' }}
                  onClick={() => setNearArea(null)}
                  aria-label={`Stop focusing on ${nearArea.name}`}
                >
                  <MapPin size={13} /> Near {nearArea.name} <X size={13} />
                </button>
              )}
              <NowBriefing
              incidents={briefingIncidents}
              window={timeWindow}
              areaName={nearArea?.name}
              selectedCategory={selectedCategory}
              onSelectCategory={(c) => setSelectedCategory(c as IncidentCategory | 'all')}
              />
            </>
          }
        />

        {/* ── Phone chrome: navy live-sky bar. Wordmark + Live, a search entry
            that raises the sheet with the caret in its field, and the time
            chips, which drive the map and the feed together. Measured into
            --cw-chrome-h. ──────────────────────────────────────────────── */}
        <div
          ref={chromeRef}
          className="lv-mtop lv-sky lv-tear lg:hidden"
          data-hidden={isPinMode || isEmergencyPinMode ? 'true' : undefined}
        >
          <div className="lv-mtop-row">
            <DesktopMapBrandMark compact />
            <span className="ml-auto" />
            <LivePill />
          </div>
          {/* No aria-label: the visible text and count are the accessible
              name (WCAG 2.5.3, Label in Name). */}
          <button
            type="button"
            data-tour="m-feed"
            onClick={() => sheetRef.current?.raiseAndFocusSearch()}
            className="lv-search"
          >
            <Search size={18} className="shrink-0" />
            <span className="lv-search-label">
              Search reports or areas
            </span>
            <span className="lv-search-count">
              {feedCount} {feedCount === 1 ? 'report' : 'reports'}
            </span>
          </button>
          <WhenChips value={timeWindow} onChange={setTimeWindow} />
        </div>

        {/* Phone action rail (right edge): locate, alerts, account. z-[51]
            keeps it above the tap-to-close scrim (z-[49]) and below the raised
            sheet (z-[52]). The column itself ignores pointer events so the
            scrim still catches taps on the map around the buttons. */}
        <div className="lv-rail lg:hidden" data-hidden={isPinMode || isEmergencyPinMode ? 'true' : undefined}>
          <button
            type="button"
            onClick={handleLocate}
            data-tour="near-me"
            data-on={nearMeOpen ? 'true' : undefined}
            className="lv-sq"
            aria-label="What's near me"
            aria-pressed={nearMeOpen}
          >
            <Navigation size={20} strokeWidth={2.2} />
          </button>
          <button
            type="button"
            onClick={toggleNotifications}
            data-tour="m-alerts"
            className="lv-sq"
            aria-label={bellLabel(unreadNotifications)}
          >
            <Bell size={20} strokeWidth={2.2} />
            <UnreadBadge count={unreadNotifications} />
          </button>
          <div className="relative">
            {user ? (
              <button type="button" onClick={toggleUserMenu} className="lv-sq" aria-label="Account menu" aria-expanded={showUserMenu}>
                <AvatarFace user={user} />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => openAuthPanel('signin')}
                aria-label="Sign up or sign in"
                title="Sign up or sign in"
                className="lv-sq"
              >
                <LogIn size={19} strokeWidth={2.2} />
              </button>
            )}
            {user && (
              <UserMenu
                open={showUserMenu}
                user={user}
                isAdmin={isAdmin}
                motionFrom="side"
                className="!top-0 !right-[calc(100%+12px)] z-[60]"
                onAdmin={() => { navigate('/admin'); setShowUserMenu(false); }}
                onSettings={() => openAuthPanel('settings')}
                onTour={replayTour}
                onSignOut={() => { logout(); setShowUserMenu(false); }}
              />
            )}
          </div>
        </div>

        {/* Near Me Panel — card above the sheet rail (phone), bottom-left card (desktop) */}
        <AnimatePresence>
          {nearMeOpen && (
            <motion.div
              key="near-me-panel"
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 40 }}
              transition={{ type: 'spring', damping: 26, stiffness: 220 }}
              className={cn(
                'absolute z-40 pointer-events-auto',
                // Clears the sheet's measured rail rather than sitting under it.
                'bottom-[calc(var(--cw-rail-h,66px)+1.5rem)] left-3 right-3',
                'lg:left-6 lg:right-auto lg:bottom-24 lg:w-[24rem]',
              )}
              role="dialog"
              aria-label="Near me"
            >
              <div className="lv-card lv-card-shadow lv-near">
                <div className="lv-near-head">
                  <span className="lv-eyebrow lv-eyebrow-blue flex items-center gap-1.5">
                    <Navigation size={13} />
                    {nearMeStage === 'arrived' ? 'Your location' : `Within ${NEAR_ME_RADIUS_KM} km`}
                  </span>
                  <button
                    type="button"
                    onClick={() => { setNearMeOpen(false); setNearMeScanning(false); }}
                    className="lv-close"
                    style={{ width: 34, height: 34, borderRadius: 10 }}
                    aria-label="Close near me panel"
                  >
                    <X size={15} />
                  </button>
                </div>

                {nearMeStage === 'arrived' ? (
                  /* Arrival: show them where they are and ask before moving
                     the map somewhere else. */
                  <div className="px-4 pb-4">
                    <div className="flex items-start gap-3">
                      <span className="lv-near-dot mt-0.5" aria-hidden="true"><i /></span>
                      <div className="min-w-0 flex-1">
                        <p className="lv-h-sm">
                          {userLocation ? 'This is where you are' : 'Showing central Calgary'}
                        </p>
                        <p className="lv-small mt-1">
                          {userLocation
                            ? 'Your pin stays on the map while you look around.'
                            : 'Turn on location in your browser to centre the map on you.'}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 space-y-2.5">
                      <button type="button" onClick={startNearMeScan} className="lv-btn lv-btn-primary lv-btn-block justify-between" style={{ minHeight: 54, borderRadius: 16 }}>
                        <span className="min-w-0 text-left">
                          <span className="block text-[14.5px] font-extrabold leading-tight">See what is near me</span>
                          <span className="block text-[12px] font-medium opacity-80 mt-0.5">
                            {nearMeIncidents.length > 0
                              ? `${nearMeIncidents.length} report${nearMeIncidents.length === 1 ? '' : 's'} within ${NEAR_ME_RADIUS_KM} km`
                              : `Look ${NEAR_ME_RADIUS_KM} km around this pin`}
                          </span>
                        </span>
                        <ArrowRight size={17} className="shrink-0" />
                      </button>

                      {/* The deeper version of the same question, for people
                          who have given us an address to measure from. */}
                      {user && preferredAddress && (
                        <button
                          type="button"
                          onClick={() => { setNearMeOpen(false); setBriefingOpen(true); }}
                          className="lv-btn lv-btn-ghost lv-btn-block justify-between"
                          style={{ minHeight: 54, borderRadius: 16 }}
                        >
                          <span className="min-w-0 text-left">
                            <span className="block text-[14px] font-extrabold leading-tight">Open my full briefing</span>
                            <span className="block truncate text-[12px] font-medium mt-0.5" style={{ color: '#565a61' }}>
                              Measured from {preferredAddress}
                            </span>
                          </span>
                          <ArrowRight size={17} className="shrink-0" style={{ color: '#1554D1' }} />
                        </button>
                      )}
                    </div>
                  </div>
                ) : nearMeScanning ? (
                  <div className="px-4 pb-6 pt-2 flex flex-col items-center text-center">
                    <span className="lv-loading-spin" style={{ borderColor: 'rgba(21,21,21,0.15)', borderTopColor: '#1554D1' }} aria-hidden="true" />
                    <p className="mt-3 lv-eyebrow lv-eyebrow-blue">Looking within 3 km…</p>
                    <p className="lv-small mt-1">Reports already on the map around your pin</p>
                  </div>
                ) : nearMeIncidents.length === 0 ? (
                  <div className="px-4 pb-5 pt-1">
                    <p className="lv-h-sm">Nothing posted within {NEAR_ME_RADIUS_KM} km</p>
                    <p className="lv-small mt-1.5">
                      No reports on the map around you right now. Quiet maps are normal, and an empty map isn&rsquo;t proof nothing happened.
                    </p>
                  </div>
                ) : (
                  <>
                    <p className="px-4 pb-2.5 lv-h-sm">
                      {nearMeIncidents.length === 1
                        ? '1 report nearby'
                        : `${nearMeIncidents.length} reports nearby`}
                    </p>

                    {(() => {
                      const inc = nearMeIncidents[nearMeIndex];
                      if (!inc) return null;
                      const catInk = categoryColor(inc.category);
                      const age = Date.now() - inc.timestamp;
                      const ageStr = age < 60_000 ? 'Just now'
                        : age < 3_600_000 ? `${Math.round(age / 60_000)} min ago`
                        : age < 86_400_000 ? `${Math.round(age / 3_600_000)} h ago`
                        : `${Math.round(age / 86_400_000)} d ago`;
                      return (
                        <div className="px-4 pb-3">
                          <button
                            type="button"
                            className="lv-near-card"
                            style={{ borderLeft: `8px solid ${catInk}` }}
                            onClick={() => {
                              handleMarkerClick(inc);
                              setNearMeOpen(false);
                            }}
                          >
                            <span className="flex items-center justify-between gap-2">
                              <span className="lv-eyebrow" style={{ color: '#151515' }}>{inc.category}</span>
                              <span className="font-mono text-[11px] text-[#565a61] shrink-0">{ageStr}</span>
                            </span>
                            <span className="mt-1.5 block text-[15px] font-bold leading-snug text-[#151515]">{inc.title}</span>
                            <span className="mt-1 block text-[12.5px] leading-relaxed text-[#565a61] line-clamp-2">{inc.description}</span>
                            <span className="mt-2 block text-[12px] font-semibold text-[#151515]">
                              {inc._dist < 1 ? `${Math.round(inc._dist * 1000)} m` : `${inc._dist.toFixed(1)} km`} away{inc.neighborhood ? ` · ${inc.neighborhood}` : ''}
                            </span>
                          </button>
                        </div>
                      );
                    })()}

                    <div className="flex items-center justify-between gap-2 px-4 pb-4 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          const next = Math.max(0, nearMeIndex - 1);
                          setNearMeIndex(next);
                          const inc = nearMeIncidents[next];
                          if (inc) mapRef.current?.flyTo(inc.lat, inc.lng, 15);
                        }}
                        disabled={nearMeIndex === 0}
                        className="lv-near-nav"
                      >
                        ← Prev
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setNearMeStage('arrived');
                          const loc = userLocation || CALGARY_CENTER;
                          mapRef.current?.flyTo(loc.lat, loc.lng, userLocation ? 15 : 11);
                        }}
                        className="lv-link text-[12px]"
                        style={{ color: '#565a61' }}
                      >
                        {nearMeIndex + 1} of {nearMeIncidents.length} · back to me
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const next = Math.min(nearMeIncidents.length - 1, nearMeIndex + 1);
                          setNearMeIndex(next);
                          const inc = nearMeIncidents[next];
                          if (inc) mapRef.current?.flyTo(inc.lat, inc.lng, 15);
                        }}
                        disabled={nearMeIndex === nearMeIncidents.length - 1}
                        className="lv-near-nav"
                      >
                        Next →
                      </button>
                    </div>
                  </>
                )}

                {/* Weekly digest opt-in — wired to the existing profile setting */}
                {nearMeStage === 'results' && !nearMeScanning && (!user || userProfile?.weeklyDigestOptIn !== true) && (
                  <button
                    type="button"
                    onClick={() => {
                      setNearMeOpen(false);
                      openAuthPanel(user ? 'settings' : 'signin');
                    }}
                    className="lv-digest-row"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-extrabold leading-tight text-[#151515]">
                        Want this weekly, without opening the map?
                      </span>
                      <span className="block text-[12px] text-[#565a61] font-medium mt-0.5">
                        What was reported near you plus community news, by email. Free, opt out any time.
                      </span>
                    </span>
                    <span className="shrink-0 text-[12.5px] font-extrabold text-[#1554d1]">
                      {user ? 'Turn on' : 'Sign up'} →
                    </span>
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* On phones this is a real bottom sheet, not a narrow popover hanging
            from the rail button. It gets its own stacking context so the report
            preview can never fall behind the draggable feed sheet. */}
        <AnimatePresence>
          {showNotifications && (
            <motion.div
              className="fixed inset-0 z-[80] lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
            >
              <button
                type="button"
                aria-label="Close notifications"
                onClick={() => setShowNotifications(false)}
                className="lv-scrim absolute inset-0 h-full w-full"
              />
              <motion.section
                role="dialog"
                aria-modal="true"
                aria-labelledby="mobile-notifications-title"
                className="lv-msheet absolute inset-x-0 bottom-0 flex max-h-[82dvh] flex-col overflow-hidden pb-[env(safe-area-inset-bottom)]"
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              >
                <div className="flex justify-center pt-2.5 pb-1" aria-hidden="true">
                  <span className="h-1.5 w-12 rounded-full bg-[#151515] opacity-25" />
                </div>
                <div className="flex items-center justify-between gap-3 px-4 pb-3 pt-1" style={{ borderBottom: '2px solid #151515' }}>
                  <div className="min-w-0">
                    <h3 id="mobile-notifications-title" className="lv-h">Notifications</h3>
                    <p className="lv-small mt-0.5">
                      {watchFeed.sinceSummary
                        ? `Since you last checked: ${watchFeed.sinceSummary}`
                        : 'Your neighbourhood report and new reports for your saved area'}
                    </p>
                  </div>
                  <button type="button" onClick={() => setShowNotifications(false)} className="lv-close" aria-label="Close notifications">
                    <X size={19} />
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                  {notifications.length === 0 ? <NotificationsEmpty /> : notifications.map((notification) => renderNotificationRow(notification))}
                </div>
              </motion.section>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Desktop command bar: the navy live sky across the map. Wordmark,
            the red Live pulse, how fresh the newest report is, the time
            window (it drives the map markers and the feed), then Home,
            Locate, alerts and account. ──────────────────────────────────── */}
        <div
          className="lv-cmd lv-sky lv-tear hidden lg:flex"
          data-hidden={isPinMode || isEmergencyPinMode ? 'true' : undefined}
        >
          <DesktopMapBrandMark compact />
          <LivePill />
          <div className="lv-cmd-mid">
            <span className="lv-stamp" title="Time of the newest neighbour report or City record on the map">
              <b>{freshness}</b>
            </span>
            {nearArea && (
              <button
                type="button"
                className="lv-chip lv-chip-sm"
                onClick={() => setNearArea(null)}
                aria-label={`Stop focusing on ${nearArea.name}`}
                style={{ background: '#fff5cc' }}
              >
                <MapPin size={13} /> Near {nearArea.name} <X size={13} />
              </button>
            )}
          </div>
          {/* The time window itself sits at the top of the feed sidebar; it
              drives these markers and that list together. */}
          <div className="lv-cmd-actions">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="lv-icon"
              title="Back to calgarywatch.ca"
              aria-label="Back to landing page"
            >
              <Home size={18} />
            </button>
            <button
              type="button"
              data-tour="locate"
              onClick={handleLocate}
              data-on={nearMeOpen ? 'true' : undefined}
              aria-pressed={nearMeOpen}
              className="lv-icon"
              title="Show my location"
              aria-label="Show my location"
            >
              <Navigation size={18} />
            </button>
            <div className="relative">
              <button
                type="button"
                data-tour="alerts"
                onClick={toggleNotifications}
                aria-expanded={showNotifications}
                className="lv-icon"
                data-on={showNotifications ? 'true' : undefined}
                aria-label={bellLabel(unreadNotifications)}
                title="Notifications"
              >
                <Bell size={18} />
                <UnreadBadge count={unreadNotifications} />
              </button>
              <AnimatePresence>
                {showNotifications && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    transition={{ duration: 0.16 }}
                    className="lv-pop w-[22rem]"
                    role="dialog"
                    aria-label="Notifications"
                  >
                    <div className="lv-pop-head lv-sky">
                      <h3>Notifications</h3>
                      <LivePill />
                    </div>
                    {watchFeed.sinceSummary && (
                      <p className="lv-note-since">Since you last checked: {watchFeed.sinceSummary}</p>
                    )}
                    <div className="max-h-[min(70dvh,34rem)] overflow-y-auto overscroll-contain">
                      {notifications.length === 0 ? <NotificationsEmpty /> : notifications.map((notification) => renderNotificationRow(notification))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            {user ? (
              <div className="relative">
                <button
                  type="button"
                  onClick={toggleUserMenu}
                  className="lv-sq"
                  style={{ width: 40, height: 40, borderRadius: 12, boxShadow: '3px 3px 0 #00c2e0' }}
                  aria-label="Account menu"
                  aria-expanded={showUserMenu}
                >
                  <AvatarFace user={user} />
                </button>
                <UserMenu
                  open={showUserMenu}
                  user={user}
                  isAdmin={isAdmin}
                  onAdmin={() => { navigate('/admin'); setShowUserMenu(false); }}
                  onSettings={() => openAuthPanel('settings')}
                  onTour={replayTour}
                  onSignOut={() => { logout(); setShowUserMenu(false); }}
                />
              </div>
            ) : (
              <button type="button" className="lv-signin" onClick={() => openAuthPanel('signin')} aria-label="Sign up or sign in">
                <LogIn size={16} />
                Sign in
              </button>
            )}
          </div>
        </div>

        <CameraViewer
          camera={viewerCamera}
          cameras={trafficCameras}
          onClose={() => setViewerCamera(null)}
          onFocus={(cam) => mapRef.current?.flyTo(cam.lat, cam.lng, 16)}
          guidedPreview={tourOpen && tourTarget === 'camera-viewer'}
        />

        {/* Emergency and report actions. On a phone the column sits above the
            layer bar, which sits above the sheet rail. */}
        <div
          className="lv-actions bottom-[calc(var(--cw-rail-h,66px)+1.375rem+var(--cw-layerbar-h,3.25rem)+0.75rem+env(safe-area-inset-bottom))] lg:bottom-[5.5rem]"
          data-hidden={isPinMode || isEmergencyPinMode ? 'true' : undefined}
        >
          {/* SOS stays visually separate from standard reporting. */}
          <button
            type="button"
            data-tour="sos"
            className="lv-sos"
            aria-label="SOS: report an emergency"
            title="Emergency report"
            onClick={() => {
              // Debounce: prevent rapid clicks
              const now = Date.now();
              if (now - buttonClickDebounceRef.current < 300) return;
              buttonClickDebounceRef.current = now;

              if (!user) { openAuthPanel('signin'); return; }
              setIsEmergencyOpen(true);
            }}
          >
            <Siren size={22} className="shrink-0" />
            <span className="hidden lg:inline">SOS</span>
          </button>

          {/* Primary reporting action is labelled at every viewport size. */}
          <button
            type="button"
            data-tour="report"
            className="lv-post"
            onClick={() => {
              // Debounce: prevent rapid clicks
              const now = Date.now();
              if (now - buttonClickDebounceRef.current < 300) return;
              buttonClickDebounceRef.current = now;
              requestReport(null);
            }}
          >
            <Plus size={21} strokeWidth={2.6} className="shrink-0" />
            <span>Post<span className="hidden lg:inline"> a report</span></span>
          </button>
        </div>

        {/* Layer Toggle */}
        <LayerToggle
          showLiveReports={showLiveReports}
          setShowLiveReports={setShowLiveReports}
          showHeatmap={showHeatmap}
          setShowHeatmap={setShowHeatmap}
          showCameras={showCameras}
          setShowCameras={setShowCameras}
          showSafetyCameras={showSafetyCameras}
          setShowSafetyCameras={setShowSafetyCameras}
          showTrafficFlow={showTrafficFlow}
          setShowTrafficFlow={(show) => {
            setShowTrafficFlow(show);
            if (!show) setSelectedTrafficSegment(null);
          }}
          trafficFlowMode={trafficFlow.snapshot?.mode}
          trafficSegmentCount={trafficFlow.snapshot?.segments.length ?? 0}
          trafficFlowStale={trafficFlow.stale}
          trafficFlowLoading={trafficFlow.loading || (showTrafficFlow && !trafficFlow.snapshot && !trafficFlow.error)}
          trafficFlowError={trafficFlow.error}
          showCrimeLayer={showCrimeLayer}
          setShowCrimeLayer={setShowCrimeLayer}
          crimeStats={crimeStats}
          tourTarget={tourOpen ? tourTarget : undefined}
          isPinMode={isPinMode || isEmergencyPinMode}
        />

        {/* Status bar, desktop only: what the map is showing, and the one
            caution that matters. Phones carry the count in the chrome. */}
        <div className="lv-status">
          <span className="lv-status-pill">
            <span className="lv-status-dot" data-empty={mapIncidents.length === 0 ? 'true' : undefined} aria-hidden="true" />
            <b>{mapIncidents.length}</b> on the map · {windowWord(timeWindow)}
          </span>
          <span className="lv-status-pill lv-status-note">
            <ShieldAlert size={14} aria-hidden="true" />
            Check the source before you act
          </span>
        </div>

        {/* Desktop & Mobile Panels */}
        <IncidentDetailPanel
          incident={selectedIncident}
          onClose={() => setSelectedIncident(null)}
          onViewNeighborhood={handleViewNeighborhood}
          onReportIncident={handleReportFromIncident}
          trafficCameras={trafficCameras}
          onOpenCamera={(camera) => {
            setSelectedIncident(null);
            setViewerCamera(camera);
            mapRef.current?.flyTo(camera.lat, camera.lng, 16);
          }}
        />
        <TrafficFlowPanel
          segment={selectedTrafficSegment}
          cameras={trafficCameras}
          onClose={() => setSelectedTrafficSegment(null)}
          onOpenCamera={(camera) => {
            setViewerCamera(camera);
            mapRef.current?.flyTo(camera.lat, camera.lng, 15);
          }}
        />
        <AreaIntelligencePanel
          data={selectedArea}
          onClose={() => setSelectedArea(null)}
          crimeStats={crimeStats}
          yearlyStats={crimeYearlyStats}
          statcanStats={statcanStats}
          statcanYearlyStats={statcanYearlyStats}
          propertyData={propertyData}
          cityAverages={cityAverages}
          onWatchArea={(name) => {
            // "Watch this area": add it to the reader's alert areas, then show
            // the alert settings so they can see it and switch alerts on.
            if (!user) { openAuthPanel('signin'); return; }
            const zones = userProfile?.alertZones ?? [];
            const home = (preferredNeighborhood || preferredInferredNeighborhood).toLowerCase();
            const exists = zones.some((z) => z.neighborhood.toLowerCase() === name.toLowerCase()) || home === name.toLowerCase();
            if (!exists && zones.length < 6) {
              void updateAlertPrefs({
                alertZones: [...zones, { id: `z${Date.now().toString(36)}`, label: name, neighborhood: name.slice(0, 80), radiusM: 0 }],
              });
            }
            setSelectedArea(null);
            openAuthPanel('settings');
          }}
        />

        {/* Emergency Modal */}
        <EmergencyModal
          isOpen={isEmergencyOpen}
          onClose={() => { setIsEmergencyOpen(false); setConfirmedEmergencyPinLocation(null); setIsEmergencyPinMode(false); }}
          onSubmit={handleEmergencySubmit}
          location={userLocation}
          pinLocation={confirmedEmergencyPinLocation}
          locationAvailable={!!userLocation}
          onRequestMapPin={handleEmergencyRequestPin}
          isPinMode={isEmergencyPinMode}
          userUid={user?.uid}
          userName={
            user
              ? ((user.displayName?.split(/\s+/)[0]) || user.email?.split('@')[0] || 'User')
              : 'User'
          }
        />

        {/* Incident Form Modal */}
        <IncidentForm
          isOpen={isFormOpen}
          onClose={handleFormClose}
          onSubmit={handleIncidentSubmit}
          location={selectedLocation}
          gpsLocation={userLocation}
          pinLocation={confirmedPinLocation}
          locationAvailable={!!userLocation}
          onRequestMapPin={handleRequestMapPin}
          onClearPin={() => setConfirmedPinLocation(null)}
          isPinMode={isPinMode}
          userProfile={user ? {
            displayName: user.displayName || 'Calgary User',
            email: user.email || 'No email',
            photoURL: user.photoURL || ''
          } : null}
          userUid={user?.uid ?? ''}
        />

        {/* The signed-in resident's own briefing, opened from their report card. */}
        {user && (
          <PersonalBriefing
            open={briefingOpen}
            onClose={() => setBriefingOpen(false)}
            uid={user.uid}
            displayName={user.displayName || userProfile?.displayName || ''}
            address={preferredAddress}
            communityName={briefingCommunity}
            memberSince={
              user.metadata?.creationTime ? new Date(user.metadata.creationTime).getTime() : undefined
            }
            digestOptIn={Boolean(userProfile?.weeklyDigestOptIn)}
            incidents={incidents}
            // The briefing's community strip is a "report-volume rank" (#N of M).
            // Ranks are off the map now, so the figures are withheld until it
            // shows a plain comparison instead (see getAreaStats().comparison).
            areaStats={null}
            airReading={briefingAir}
            safetyCameras={safetyCameras}
            trafficCameras={trafficCameras}
            onOpenArea={() => {
              if (briefingCommunity) {
                handleViewNeighborhood(briefingCommunity);
                setSheetState('rail');
              }
            }}
            onOpenSettings={() => openAuthPanel('settings')}
            photoURL={user.photoURL ?? undefined}
            onOpenNearby={() => {
              const loc = userLocation || CALGARY_CENTER;
              mapRef.current?.flyTo(loc.lat, loc.lng, userLocation ? 14 : 11);
              if (userLocation) {
                mapRef.current?.showUserLocation(userLocation.lat, userLocation.lng);
                userPinShown.current = true;
              }
              setNearMeOpen(true);
              startNearMeScan();
            }}
            onSelectIncident={(incident) => startTransition(() => setSelectedIncident(incident))}
            onOpenCamera={(camera) => {
              setViewerCamera(camera);
              mapRef.current?.flyTo(camera.lat, camera.lng, 16);
            }}
          />
        )}
      </main>

      {/* Global Background Animation (Subtle) */}
      <div className="fixed inset-0 pointer-events-none -z-10 bg-[radial-gradient(circle_at_50%_50%,rgba(30,58,138,0.1),transparent)]" />
    </div>
  );
}
