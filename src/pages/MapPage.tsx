import { useState, useEffect, useCallback, useRef, useMemo, startTransition } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import Map, { MapRef } from '@/src/components/Map';
import Sidebar from '@/src/components/Sidebar';
import IncidentForm, { IncidentFormData } from '@/src/components/IncidentForm';
import EmergencyModal, { EmergencySubmitData } from '@/src/components/EmergencyModal';
import AreaIntelligencePanel from '@/src/components/AreaIntelligencePanel';
import IncidentDetailPanel from '@/src/components/IncidentDetailPanel';
import LayerToggle from '@/src/components/LayerToggle';
import MobileMapSheet, { type MapSheetRef, RAISED_FRACTION } from '@/src/components/MobileMapSheet';
import type { SheetState } from '@/src/hooks/useSheetDrag';
import MapTour from '@/src/components/MapTour';
import { Button } from '@/src/components/ui/Button';
import { Incident, IncidentCategory, AreaIntelligence, isPubliclyVisible } from '@/src/types';
import { getAreaIntelligence } from '@/src/services/mockData';
import { Plus, Navigation, ShieldAlert, LogOut, Database, Bell, Search, X, LogIn, Home, LayoutDashboard, Siren, Settings, HelpCircle, MapPin, Check, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { CALGARY_CENTER } from '@/src/constants';
import { useAuth } from '@/src/components/FirebaseProvider';
import { db, handleFirestoreError, OperationType } from '@/src/firebase';
import { collection, onSnapshot, query, where, orderBy, limit, getDocs, startAfter, QueryDocumentSnapshot, DocumentData, doc, setDoc, writeBatch } from 'firebase/firestore';
import { cn } from '@/src/lib/utils';
import { SidebarSkeleton, MapShimmer } from '@/src/components/SkeletonLoader';
import { useCrimeStats, computeCityAverages } from '@/src/hooks/useCrimeStats';
import { useAlbertaMunicipalityCrimeStats } from '@/src/hooks/useAlbertaMunicipalityCrimeStats';
import { usePropertyAssessments } from '@/src/hooks/usePropertyAssessments';
import { useEdmontonOpenData } from '@/src/hooks/useEdmontonOpenData';
import { usePowerOutages } from '@/src/hooks/usePowerOutages';
import { useTrafficCameras, type TrafficCamera } from '@/src/hooks/useTrafficCameras';
import CameraViewer from '@/src/components/CameraViewer';
import { useSafetyCameras } from '@/src/hooks/useSafetyCameras';
import { stripCityQualifier, withCityQualifier, buildAddressQuery, rankAddressMatches, rankFullTextMatches } from '@/src/lib/address';
import { categoryColor } from '@/src/lib/tokens';
import PersonalBriefing from '@/src/components/PersonalBriefing';
import { fetchCommunityBoundaries, findCommunityAt, normalizeCalgaryAddress } from '@/src/lib/communityLookup';
import { applySuppression, useSuppressedIds } from '@/src/lib/suppression';
import { getDistance } from '@/src/lib/geo';

function getCalgaryQuadrant(lat: number, lng: number) {
  const northSouth = lat >= CALGARY_CENTER.lat ? 'N' : 'S';
  const eastWest = lng >= CALGARY_CENTER.lng ? 'E' : 'W';
  return `${northSouth}${eastWest}`;
}

type MapNotification = {
  id: string;
  title: string;
  timestamp: number;
  neighborhood?: string;
  kind?: 'incident' | 'neighborhood_report';
  /**
   * For neighbourhood reports: the saved profile setting this area was derived
   * from. Shown to the user so it is obvious the report follows their location
   * settings rather than their current GPS position.
   */
  basis?: string;
};

type UserProfileSettings = {
  uid?: string;
  displayName?: string;
  email?: string;
  photoURL?: string;
  role?: string;
  neighborhood?: string;
  inferredNeighborhood?: string;
  address?: string;
  locationPreferenceType?: 'address' | 'neighborhood';
  piiConsentAt?: number;
  weeklyDigestOptIn?: boolean;
  weeklyDigestOptInAt?: number;
  weeklyDigestTopics?: string[];
  profileUpdatedAt?: number;
  onboardingCompletedAt?: number;
  /** Set the first (and only) time the weekly-digest prompt is shown */
  digestPromptedAt?: number;
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
      const trafficIncidents: Incident[] = [];
      const three11Incidents: Incident[] = [];
      const infrastructureIncidents: Incident[] = [];

      // ── Traffic — isolated so a failure never blocks 311 ──────────────────
      try {
        const trafficRes = await fetch(
          'https://data.calgary.ca/resource/35ra-9556.json?$limit=60&$order=start_dt%20DESC'
        );
        if (!trafficRes.ok) throw new Error(`Traffic API ${trafficRes.status}`);
        const trafficData: any[] = await trafficRes.json();

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

          const ts = new Date(item.start_dt || new Date()).getTime();
          trafficIncidents.push({
            id: `yyc-traffic-${item.id || `${String(item.incident_info || 'unk').replace(/[^a-zA-Z0-9]/g, '').slice(0, 32)}-${lat.toFixed(3)}-${lng.toFixed(3)}`}`,
            title: tTitle, description: tDesc, category: 'traffic' as IncidentCategory,
            neighborhood: quadrant, lat, lng, timestamp: ts,
            email: 'opendata@calgary.ca', name: 'City of Calgary Traffic',
            anonymous: false, verified_status: 'community_confirmed' as const, report_count: 1,
            data_source: 'official' as const, source_name: 'City of Calgary Open Data',
            source_url: 'https://data.calgary.ca/dataset/Traffic-Incidents/35ra-9556',
            expires_at: ts + 8 * 60 * 60 * 1000,
          });
        }
      } catch (err) {
        console.warn('[CalgaryWatch] Traffic API failed:', err);
      }

      // ── Calgary 311 — isolated so a failure never blocks traffic ──────────
      try {
        // Socrata API — simplified query without date filtering (less likely to fail)
        // Note: data.calgary.ca may have rate limits or field structure issues
        const three11Url =
          'https://data.calgary.ca/resource/iahh-g8bj.json' +
          '?$limit=50' +
          '&$where=' + encodeURIComponent("status_description='Open'") +
          '&$order=' + encodeURIComponent('requested_date DESC');

        const three11Res = await fetch(three11Url);
        if (!three11Res.ok) throw new Error(`311 API ${three11Res.status}`);
        const three11Data: any[] = await three11Res.json();

        const boring = ['tree', 'shrub', 'waste', 'recycling', 'grass', 'weeds', 'license', 'tax', 'inquiry', 'cart', 'backlane', 'contact us', 'feedback', 'missed collection', 'water main', 'watermain', 'water break'];

        for (const item of three11Data) {
          const lat = parseFloat(item.latitude);
          const lng = parseFloat(item.longitude);
          if (!isFinite(lat) || !isFinite(lng)) continue;

          const sName = (item.service_name || '').toLowerCase();
          if (boring.some(b => sName.includes(b))) continue;

          let category: IncidentCategory = 'infrastructure';
          if (sName.includes('road') || sName.includes('traffic') || sName.includes('pothole') || sName.includes('pavement') || sName.includes('sidewalk') || sName.includes('signal')) category = 'traffic';
          if (sName.includes('snow') || sName.includes('ice') || sName.includes('drain') || sName.includes('spill') || sName.includes('water') || sName.includes('flood')) category = 'weather';
          if (sName.includes('bylaw') || sName.includes('disturbance') || sName.includes('noise') || sName.includes('graffiti')) category = 'crime';
          if (sName.includes('hazard') || sName.includes('emergency') || sName.includes('danger') || sName.includes('fire')) category = 'emergency';

          if (category === 'traffic') continue;

          const timestamp = new Date(item.requested_date || new Date()).getTime();
          let cleanTitle = item.service_name || 'City Service Issue';
          if (cleanTitle.startsWith('Bylaw - ')) cleanTitle = cleanTitle.replace('Bylaw - ', '');
          if (cleanTitle.includes('Disturbance and Behavioural Concerns')) cleanTitle = 'Public Disturbance';

          const area = item.comm_name ? `in ${item.comm_name}` : 'in Calgary';
          let cleanDesc: string;
          if (sName.includes('graffiti')) {
            cleanDesc = `Graffiti reported on public property ${area}. City crews scheduled for removal.`;
          } else if (sName.includes('pothole') || sName.includes('road surface') || sName.includes('pavement')) {
            cleanDesc = `Road surface damage ${area}. Repair crews have been dispatched.`;
          } else if (sName.includes('spill') || sName.includes('hazmat') || sName.includes('contamination')) {
            cleanDesc = `Hazardous spill or contamination reported ${area}. Environmental response team notified.`;
          } else if (sName.includes('noise') || sName.includes('disturbance') || sName.includes('nuisance')) {
            cleanDesc = `Noise or public disturbance complaint filed ${area}. Bylaw officers have been dispatched.`;
          } else if (sName.includes('bylaw') && sName.includes('animal')) {
            cleanDesc = `Animal control complaint ${area}. Officers en route.`;
          } else if (sName.includes('bylaw')) {
            cleanDesc = `Bylaw violation reported ${area}. Officers assigned to investigate.`;
          } else if (sName.includes('street light') || sName.includes('light out') || sName.includes('signal')) {
            cleanDesc = `Street light or signal outage ${area}. Electrical crew scheduled for repair.`;
          } else if (sName.includes('water main') || sName.includes('water break') || sName.includes('watermain')) {
            cleanDesc = `Water main issue reported ${area}. Utilities crew dispatched — local service may be affected.`;
          } else if (sName.includes('sewer') || sName.includes('drain') || sName.includes('flood')) {
            cleanDesc = `Drainage or sewer problem ${area}. City utilities team has been notified.`;
          } else if (sName.includes('fire') || sName.includes('danger') || sName.includes('emergency')) {
            cleanDesc = `Emergency hazard reported ${area}. Response crews have been alerted.`;
          } else if (sName.includes('bridge') || sName.includes('overpass') || sName.includes('infrastructure')) {
            cleanDesc = `Infrastructure concern flagged ${area}. Engineering crew assigned to inspect.`;
          } else if (sName.includes('sidewalk') || sName.includes('curb') || sName.includes('pedestrian')) {
            cleanDesc = `Sidewalk or pedestrian path damage ${area}. Maintenance crew scheduled.`;
          } else {
            const responsible = item.agency_responsible?.replace('CS - ', '') || 'City Crews';
            cleanDesc = `${cleanTitle} reported ${area}. ${responsible} assigned to respond.`;
          }

          three11Incidents.push({
            id: `yyc-311-${item.service_request_id}`,
            title: cleanTitle, description: cleanDesc, category,
            neighborhood: item.comm_name || 'Calgary', lat, lng, timestamp,
            email: 'opendata@calgary.ca', name: 'Calgary 311 Sync',
            anonymous: false, verified_status: 'community_confirmed' as const, report_count: 1,
            data_source: 'official' as const, source_name: 'Calgary 311',
            source_url: 'https://data.calgary.ca/dataset/311-Service-Requests/iahh-g8bj',
            expires_at: timestamp + 24 * 60 * 60 * 1000,
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
  const [briefingOpen, setBriefingOpen] = useState(false);
  const [showCrimeLayer, setShowCrimeLayer] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [nearMeOpen, setNearMeOpen] = useState(false);
  /** The camera pin a reader tapped, or null when the viewer is closed. */
  const [viewerCamera, setViewerCamera] = useState<TrafficCamera | null>(null);
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
    showCameras || Boolean(selectedIncident) || Boolean(viewerCamera),
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
  const [profileDraft, setProfileDraft] = useState({ neighborhood: '', address: '', inferredNeighborhood: '', piiConsent: false, weeklyDigestOptIn: false });
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
   * Defaults to 'all' so the feed starts exactly as it did before.
   */
  const [timeWindow, setTimeWindow] = useState<'24h' | '7d' | 'all'>('all');

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
      setProfileDraft({ neighborhood: '', address: '', inferredNeighborhood: '', piiConsent: false, weeklyDigestOptIn: false });
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

  const handleReportFromIncident = useCallback((incident: Incident) => {
    setSelectedIncident(null);
    setSelectedArea(null);
    setSelectedLocation({ lat: incident.lat, lng: incident.lng });
    setConfirmedPinLocation({ lat: incident.lat, lng: incident.lng });
    setIsPinMode(false);
    setIsFormOpen(true);
    setSheetState('rail');
  }, []);

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
      [...firebaseIncidents, ...officialOpenData, ...edmontonOpenData, ...weatherAlerts, ...powerOutageIncidents],
      suppressedIds,
    );
    const unique = new globalThis.Map(combined.map((i: Incident) => [i.id, i]));
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
  }, [firebaseIncidents, officialOpenData, edmontonOpenData, weatherAlerts, powerOutageIncidents, suppressedIds]);

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
    profileDraft.weeklyDigestOptIn !== (userProfile?.weeklyDigestOptIn ?? false);

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
    if (!profileDraft.piiConsent || (!neighborhood && !address)) {
      setProfileSaveError('Please agree to the privacy obligations and add a neighbourhood or address.');
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
      await setDoc(doc(db, 'users', user.uid), {
        uid: user.uid,
        displayName: user.displayName || userProfile?.displayName || 'Calgary User',
        email: user.email || userProfile?.email || '',
        photoURL: user.photoURL || userProfile?.photoURL || '',
        neighborhood,
        address,
        inferredNeighborhood,
        locationPreferenceType: address ? 'address' : 'neighborhood',
        piiConsentAt: userProfile?.piiConsentAt || Date.now(),
        onboardingCompletedAt: userProfile?.onboardingCompletedAt || Date.now(),
        weeklyDigestOptIn: profileDraft.weeklyDigestOptIn,
        weeklyDigestOptInAt: profileDraft.weeklyDigestOptIn
          ? (userProfile?.weeklyDigestOptInAt || Date.now())
          : null,
        weeklyDigestTopics: profileDraft.weeklyDigestOptIn
          ? ['weekly_crime_stats', 'neighbourhood_incidents', 'market_events', 'community_updates']
          : [],
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

  useEffect(() => {
    const targetId = searchParams.get('i');
    if (!targetId || deepLinkHandledRef.current || incidents.length === 0) return;
    const target = incidents.find((inc) => inc.id === targetId);
    if (target) {
      deepLinkHandledRef.current = true;
      handleMarkerClick(target);
      startTransition(() => setSelectedIncident(target));
    }
  }, [searchParams, incidents, handleMarkerClick]);

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
          celebrate('Signal live — neighbours nearby can see it now.');
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
          celebrate('Emergency signal live — nearby watchers alerted.');
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
    });
    if (selectedCategory === 'all') return visible;
    return visible.filter(i => i.category === selectedCategory || i.category === 'emergency');
  }, [incidents, selectedCategory]);

  /** The feed's view of the world: category-independent, narrowed by time only. */
  const feedIncidents = useMemo(() => {
    if (timeWindow === 'all') return incidents;
    const cutoff = Date.now() - (timeWindow === '24h' ? 24 : 24 * 7) * 60 * 60 * 1000;
    return incidents.filter((i) => i.timestamp >= cutoff);
  }, [incidents, timeWindow]);

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
    const base = getAreaIntelligence(displayName);

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
      const totals = [...crimeStats.values()].map(e => e.crime + e.disorder);
      const cityAvg = totals.reduce((a, b) => a + b, 0) / totals.length;
      const cityMax = Math.max(...totals);

      if (entry) {
        const total = entry.crime + entry.disorder;
        const score = Math.max(10, Math.round(100 - (total / Math.max(cityMax, 1)) * 75));
        const delta = total - cityAvg;
        const trend: 'improving' | 'stable' | 'declining' =
          delta < -cityAvg * 0.2 ? 'improving' : delta > cityAvg * 0.2 ? 'declining' : 'stable';

        // Computed insights from real data
        const sortedTotals = [...crimeStats.entries()]
          .map(([, e]) => e.crime + e.disorder)
          .sort((a, b) => b - a);
        const rawIdx = sortedTotals.findIndex(v => v <= total);
        const rank = rawIdx === -1 ? sortedTotals.length : rawIdx + 1;
        const totalCommunities = crimeStats.size;

        const propPct = entry.violent + entry.property > 0
          ? Math.round((entry.property / (entry.violent + entry.property)) * 100)
          : 0;
        const cityPropPct = cityAverages.avgProperty + cityAverages.avgViolent > 0
          ? Math.round((cityAverages.avgProperty / (cityAverages.avgProperty + cityAverages.avgViolent)) * 100)
          : 0;
        const propVsCityText = propPct > cityPropPct
          ? `above the city average of ${cityPropPct}%`
          : propPct < cityPropPct
          ? `below the city average of ${cityPropPct}%`
          : `equal to the city average of ${cityPropPct}%`;

        const computedInsights = [
          `This community ranks #${rank} of ${totalCommunities} Calgary neighbourhoods by total incident volume`,
          `Property crime accounts for ${propPct}% of all criminal offences — ${propVsCityText}`,
        ];

        setSelectedArea({
          ...base,
          communityName: canonicalName,
          crimeKey: resolvedKey,
          safetyScore: score,
          trend,
          insights: [...computedInsights, ...base.insights],
        });
      } else {
        setSelectedArea({ ...base, communityName: displayName, safetyScore: 50, trend: 'stable' });
      }
      return;
    }
    setSelectedArea({ ...base, communityName: displayName });
  }, [incidents, mapRef, crimeStats, cityAverages]);

  // Placed here rather than beside handleSheetIncidentClick because it closes
  // over handleViewNeighborhood, which is a `const` declared just above —
  // referencing it any earlier in the component body would throw a
  // temporal-dead-zone ReferenceError on every render.
  const handleSheetNeighbourhoodSelect = useCallback((name: string) => {
    handleViewNeighborhood(name);
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
    }, 1600);
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
  // Registry-sourced inferredNeighborhood now matches 311 comm_name keys, so
  // a direct lookup usually lands; ranks come from the same distribution the
  // choropleth uses.
  const areaTotalsDesc = useMemo(() => {
    if (!crimeStats || crimeStats.size === 0) return [];
    return [...crimeStats.entries()]
      .filter(([k]) => !k.includes(':'))
      .map(([, e]) => e.crime + e.disorder)
      .sort((a, b) => b - a);
  }, [crimeStats]);

  const getAreaStats = useCallback((name?: string) => {
    if (!name || !crimeStats || areaTotalsDesc.length === 0) return null;
    const entry = crimeStats.get(name.toLowerCase().trim());
    if (!entry) return null;
    const total = entry.crime + entry.disorder;
    const rank = Math.max(1, areaTotalsDesc.findIndex((t) => t <= total) + 1);
    const pct = rank / areaTotalsDesc.length;
    const band =
      pct <= 0.1 ? { label: 'Hot', color: '#C0392B' } :
      pct <= 0.25 ? { label: 'High', color: '#EA580C' } :
      pct <= 0.5 ? { label: 'Elevated', color: '#B8860B' } :
      { label: 'Calm', color: '#2E8B7A' };
    return { entry, total, rank, count: areaTotalsDesc.length, band };
  }, [crimeStats, areaTotalsDesc]);

  /** The community the briefing is written about, from their saved location. */
  const briefingCommunity =
    preferredInferredNeighborhood || preferredNeighborhood || '';

  /** Their community's figures, shaped for the briefing. */
  const briefingAreaStats = useMemo(() => {
    const stats = getAreaStats(briefingCommunity);
    if (!stats) return null;
    return {
      crime: stats.entry.crime,
      disorder: stats.entry.disorder,
      year: stats.entry.year,
      rank: stats.rank,
      count: stats.count,
    };
  }, [getAreaStats, briefingCommunity]);

  // Featured card for "your neighbourhood report" — rendered in both dropdowns
  const renderNotificationRow = useCallback((n: MapNotification, compact: boolean) => {
    const stats = n.kind === 'neighborhood_report' ? getAreaStats(n.neighborhood) : null;
    if (n.kind === 'neighborhood_report') {
      const areaName = (n.neighborhood ?? 'Your area').replace(/\b\w/g, (c) => c.toUpperCase());
      return (
        <div key={n.id} className="p-2">
          <div
            className="relative overflow-hidden"
            style={{ background: 'linear-gradient(135deg, #1C2B3A 0%, #24466B 80%)', border: '1.5px solid rgba(46,139,122,0.55)' }}
          >
          <button
            type="button"
            onClick={() => handleNotificationClick(n)}
            className="block w-full text-left transition-transform active:scale-[0.99] p-3.5"
          >
            <span className="absolute -right-3 -top-3 h-16 w-16 rounded-full opacity-20" style={{ background: 'radial-gradient(circle, #2E8B7A, transparent 70%)' }} aria-hidden="true" />
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.24em]" style={{ color: '#7FB5A6' }}>
              Your briefing is ready
            </p>
            <p className={cn('font-black mt-1 truncate', compact ? 'text-[13px]' : 'text-[14.5px]')} style={{ color: '#FFFDF8' }}>
              {areaName}
            </p>
            {/* Without this the card shows only the resolved community name and
                the user has no idea where it came from. */}
            {n.basis && (
              <p className="mt-1 flex items-start gap-1.5 text-[10px] font-medium leading-snug" style={{ color: '#9AA6B2' }}>
                <MapPin size={10} className="mt-[1px] shrink-0" aria-hidden="true" />
                <span className="min-w-0">
                  From your saved location · <span className="font-bold" style={{ color: '#C9D8E4' }}>{n.basis}</span>
                </span>
              </p>
            )}
            {stats ? (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="flex items-center gap-1.5 px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.1em]" style={{ background: `${stats.band.color}2e`, color: '#FFFDF8' }}>
                  <span className="h-1.5 w-1.5" style={{ background: stats.band.color }} />
                  {stats.band.label}
                </span>
                <span className="px-2 py-1 font-mono text-[10px] font-bold tabular-nums" style={{ background: 'rgba(255,253,248,0.12)', color: '#C9D8E4' }}>
                  #{stats.rank} of {stats.count}
                </span>
                <span className="px-2 py-1 font-mono text-[10px] font-bold tabular-nums" style={{ background: 'rgba(255,253,248,0.12)', color: '#C9D8E4' }}>
                  {stats.entry.crime} concerns · {stats.entry.year}
                </span>
              </div>
            ) : (
              <p className="mt-1.5 text-[10px] font-medium" style={{ color: '#9AA6B2' }}>
                Reports near your door, cameras, and what your community reads
              </p>
            )}
            <p className="mt-2 font-mono text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: '#7FB5A6' }}>
              Open your briefing →
            </p>
          </button>
          {/* Sibling of the main button, not nested inside it — nesting
              interactive elements breaks keyboard and screen-reader behaviour. */}
          <div className="px-3.5 pb-3">
            <button
              type="button"
              onClick={() => {
                setShowNotifications(false);
                openAuthPanel('settings');
              }}
              className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] underline underline-offset-2 transition-opacity hover:opacity-75 focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{ color: '#7FB5A6' }}
            >
              Change location settings
            </button>
          </div>
          </div>
        </div>
      );
    }
    return (
      <button
        key={n.id}
        type="button"
        onClick={() => handleNotificationClick(n)}
        className="flex w-full items-start gap-2.5 px-3.5 py-3 text-left transition-colors hover:bg-black/[0.03]"
        style={{ borderBottom: '1px solid #E7E0D2' }}
      >
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" style={{ background: 'rgba(74,144,217,0.12)' }}>
          <Bell size={12} className="text-[#4A90D9]" />
        </span>
        <span className="min-w-0">
          <span className={cn('block font-bold text-[#1C2B3A] line-clamp-2 leading-snug', compact ? 'text-[11.5px]' : 'text-[12px]')}>{n.title}</span>
          <span className="block font-mono text-[10px] text-[#5A6B7D] mt-0.5">
            {new Date(n.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </span>
      </button>
    );
  }, [getAreaStats, handleNotificationClick]);

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
    try { localStorage.setItem('cw_tour_done_v1', '1'); } catch { /* private mode */ }
  }, []);

  const replayTour = useCallback(() => {
    setShowUserMenu(false);
    setShowNotifications(false);
    setTourOpen(true);
  }, []);

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
        weeklyDigestTopics: ['weekly_crime_stats', 'neighbourhood_incidents', 'market_events', 'community_updates'],
        profileUpdatedAt: Date.now(),
      }, { merge: true });
      celebrate('Weekly digest on — your neighbourhood stats will land by email.');
    } catch { /* profile listener will re-sync */ }
  }, [user, celebrate]);

  return (
    <div className="map-shell relative flex h-dvh w-full overflow-hidden bg-[#E8F3FC] font-sans text-[#0B1F33]">
      <AnimatePresence>
        {isLoading && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex bg-[#F7F3EA]"
          >
            <div className="hidden lg:block w-80 h-full border-r border-white/5">
              <SidebarSkeleton />
            </div>
            <div className="flex-1 h-full relative">
              <MapShimmer />
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
            className="fixed inset-0 z-[180] flex items-center justify-center bg-[rgba(6,22,47,0.72)] p-3 backdrop-blur-xl sm:p-6"
            role="dialog"
            aria-modal="true"
            aria-label={showProfileStep ? 'Calgary Watch profile settings' : 'Sign up or sign in to Calgary Watch'}
          >
            <motion.div
              initial={{ opacity: 0, y: 22, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 22, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 220, damping: 24 }}
              className="relative max-h-[calc(100dvh-1.5rem)] w-full max-w-4xl overflow-y-auto shadow-[0_32px_80px_-32px_rgba(11,31,51,0.6)]"
              style={{ background: '#FFFDF8', border: '1.5px solid #F2EFE8' }}
            >
              {canCloseAuthPanel && (
                <button
                  type="button"
                  onClick={() => {
                    setOnboardingDismissedThisSession(true);
                    setIsEditingPreferences(false);
                    setAuthPanelOpen(false);
                    setAuthPanelMode('signin');
                    setProfileSaveError(null);
                  }}
                  className="absolute right-3 top-3 z-10 flex h-11 w-11 items-center justify-center border-[1.5px] border-[#0B1F33] bg-[#FFFDF8] text-[#0B1F33] transition-colors hover:bg-[#E8F3FC] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4A90D9] focus-visible:ring-offset-2 sm:right-4 sm:top-4"
                  aria-label="Close sign up or sign in panel"
                >
                  <X size={16} />
                </button>
              )}

              <div className="grid lg:grid-cols-[0.82fr_1.18fr]">
                <div className="bg-[#06162F] p-6 text-[#D5DFEB] md:p-8">
                  <div className="flex h-12 w-12 items-center justify-center bg-[#F2EFE8]">
                    {showProfileStep ? <Home size={22} className="text-[#0B1F33]" /> : <GoogleIcon />}
                  </div>
                  <h2 className="mt-6 font-display text-2xl font-black tracking-[-0.02em] text-[#F2EFE8]">
                    {showProfileStep
                      ? authPanelMode === 'settings' ? 'Account settings' : 'Finish your profile'
                      : 'Sign up or sign in'}
                  </h2>
                  <p className="mt-3 text-sm leading-relaxed text-[#D5DFEB]">
                    {showProfileStep
                      ? 'Choose your report area and privacy preferences. Your neighbourhood report appears each time you sign in.'
                      : 'Continue with Google to create an account or sign back in. Your account lets you post reports, save preferences, and receive neighbourhood-specific safety updates.'}
                  </p>

                  {showProfileStep && (
                    <div className="mt-6 border-[1.5px] border-[rgba(242,239,232,0.26)] bg-[rgba(242,239,232,0.08)] p-4">
                      <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#AFC5DF]">Current report area</p>
                      <p className="mt-1 text-lg font-black text-[#F2EFE8]">{locationLabel}</p>
                      <p className="mt-2 text-xs leading-relaxed text-[#AFC5DF]">
                        Weekly digest: {userProfile?.weeklyDigestOptIn === true ? 'enabled' : 'off'}
                      </p>
                    </div>
                  )}
                </div>

                <div className="p-5 sm:p-6 md:p-8">
                  {!showProfileStep ? (
                    <div className="space-y-5">
                      <div>
                        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-[#1F5C93]">Continue with Google</p>
                        <h3 className="mt-2 font-display text-2xl font-black tracking-[-0.02em] text-[#0B1F33]">Sign up or sign in securely</h3>
                        <p className="mt-2 text-sm leading-relaxed text-[#5A6B7D]">
                          New to Calgary Watch? Google will create your account. Already registered? Google will sign you in. This panel will then ask for your privacy consent and neighbourhood or address.
                        </p>
                      </div>

                      <Button
                        onClick={signIn}
                        className="h-12 w-full rounded-none bg-[#06162F] text-[#F2EFE8] hover:bg-[#1C2B3A]"
                      >
                        <GoogleIcon />
                        Sign up or sign in with Google
                      </Button>

                      <p className="text-[11px] leading-relaxed text-[#5A6B7D]">
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
                                className="h-14 w-14 border-[1.5px] border-[#C9D8E4] object-cover"
                              />
                            ) : (
                              <div className="flex h-14 w-14 items-center justify-center bg-[#2F6FB0] text-xl font-black text-[#FFFDF8]">
                                {(user?.displayName || user?.email || 'U').charAt(0).toUpperCase()}
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="truncate text-lg font-black" style={{ color: '#1C2B3A' }}>
                                {user?.displayName || 'Calgary User'}
                              </p>
                              <p className="truncate text-xs" style={{ color: '#5A6B7D' }}>
                                {user?.email}
                              </p>
                            </div>
                          </div>

                          {/* Preferences summary — ledger rows */}
                          <div className="overflow-hidden" style={{ border: '1.5px solid #C9D8E4' }}>
                            <div className="flex items-center gap-3 p-4" style={{ background: '#F7F3EA' }}>
                              <span className="flex h-9 w-9 shrink-0 items-center justify-center" style={{ background: 'rgba(46,139,122,0.14)' }}>
                                <Home size={15} className="text-[#2E8B7A]" />
                              </span>
                              <div className="min-w-0">
                                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[#5A6B7D]">Report area</p>
                                <p className="mt-0.5 text-sm font-bold truncate text-[#1C2B3A]">
                                  {preferredAddress || preferredNeighborhood || preferredInferredNeighborhood || 'No location set'}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3 p-4" style={{ borderTop: '1px dashed #E7E0D2' }}>
                              <span className="flex h-9 w-9 shrink-0 items-center justify-center" style={{ background: 'rgba(74,144,217,0.12)' }}>
                                <Bell size={15} className="text-[#2F6FB0]" />
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[#5A6B7D]">Weekly digest</p>
                                <p className="mt-0.5 text-sm font-bold text-[#1C2B3A]">
                                  {userProfile?.weeklyDigestOptIn === true ? 'Neighbourhood stats + news, weekly' : 'Off'}
                                </p>
                              </div>
                              <span
                                className="shrink-0 font-mono text-[10px] font-bold uppercase tracking-[0.14em] px-2 py-1"
                                style={userProfile?.weeklyDigestOptIn === true
                                  ? { background: 'rgba(46,139,122,0.14)', color: '#2E8B7A' }
                                  : { background: '#F7F3EA', color: '#9AA6B2', border: '1px solid #E7E0D2' }}
                              >
                                {userProfile?.weeklyDigestOptIn === true ? 'On' : 'Off'}
                              </span>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => setIsEditingPreferences(true)}
                            className="w-full h-12 font-mono text-[11px] font-bold uppercase tracking-[0.18em] transition-transform active:scale-[0.98]"
                            style={{ background: '#06162F', color: '#F2EFE8' }}
                          >
                            Edit preferences
                          </button>
                        </>
                      ) : (
                        /* ── Edit / onboarding form ─────────────────────────── */
                        <>
                          <div>
                            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: '#2E8B7A' }}>
                              {profileNeedsSetup ? 'Set up your report area' : 'Edit preferences'}
                            </p>
                            <h3 className="mt-2 font-display text-2xl font-black tracking-[-0.02em] text-[#0B1F33]">
                              {addressIsSettled ? 'Your report area' : 'Where should we watch?'}
                            </h3>
                            <p className="mt-2 text-sm leading-relaxed" style={{ color: '#5A6B7D' }}>
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
                                <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: '#5A6B7D' }}>
                                  Address or nearby landmark
                                </span>
                                <span
                                  className="px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.14em]"
                                  style={{ background: 'rgba(46,139,122,0.14)', color: '#2E8B7A' }}
                                >
                                  Recommended
                                </span>
                              </span>

                              {addressIsSettled ? (
                                /* Settled — confirm it and get out of the way. */
                                <div
                                  className="flex items-start gap-3 p-3.5"
                                  style={{ background: 'rgba(46,139,122,0.08)', border: '1.5px solid rgba(46,139,122,0.45)' }}
                                >
                                  <span
                                    className="mt-[1px] grid h-6 w-6 shrink-0 place-items-center"
                                    style={{ background: '#2E8B7A' }}
                                  >
                                    <Check size={13} style={{ color: '#FFFDF8' }} />
                                  </span>
                                  <span className="min-w-0 flex-1">
                                    <span className="block text-sm font-bold leading-snug" style={{ color: '#1C2B3A' }}>
                                      {profileDraft.address}
                                    </span>
                                    <span className="mt-0.5 block text-[11.5px] font-medium" style={{ color: '#5A6B7D' }}>
                                      {profileDraft.inferredNeighborhood
                                        ? `Matched to ${profileDraft.inferredNeighborhood} in the city registry`
                                        : 'Saved as your report area'}
                                    </span>
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => setProfileDraft((prev) => ({ ...prev, address: '', inferredNeighborhood: '' }))}
                                    className="shrink-0 px-2 py-1 text-[11.5px] font-bold underline underline-offset-2 transition-opacity hover:opacity-70"
                                    style={{ color: '#1C2B3A' }}
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
                                    className="h-12 w-full px-4 text-sm outline-none transition-colors focus:border-[#4A90D9]"
                                    style={{ background: '#FFFDF8', border: '1.5px solid #C9D8E4', color: '#1C2B3A' }}
                                  />
                                  <div className="min-h-6">
                                    {addressQuery.length > 0 && addressQuery.length < 3 && (
                                      <p className="text-[11.5px] font-medium" style={{ color: '#5A6B7D' }}>
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
                                            className="px-3 py-2 text-left text-xs font-bold transition-colors hover:bg-[#E8F3FC]"
                                            style={{ background: '#FFFDF8', border: '1.5px solid #C9D8E4', color: '#1C2B3A' }}
                                          >
                                            <span className="block truncate">{item.label}</span>
                                            {item.neighborhood && (
                                              <span className="mt-0.5 block text-[10px] font-medium" style={{ color: '#5A6B7D' }}>
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
                              <div className="h-px flex-1" style={{ background: '#E7E0D2' }} />
                              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: '#5A6B7D' }}>or</span>
                              <div className="h-px flex-1" style={{ background: '#E7E0D2' }} />
                            </div>

                            {/* ── Neighbourhood ──────────────────────────────
                                Hidden once an address is settled: the two are
                                mutually exclusive, and showing an empty second
                                option implies the choice is unfinished. */}
                            {!addressIsSettled && (
                              <label className="space-y-2">
                                <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: '#5A6B7D' }}>
                                  Neighbourhood only
                                </span>
                                <input
                                  value={profileDraft.neighborhood}
                                  onChange={(e) => {
                                    const neighborhood = e.target.value;
                                    setProfileDraft((prev) => ({ ...prev, neighborhood, inferredNeighborhood: '', address: neighborhood.trim() ? '' : prev.address }));
                                  }}
                                  placeholder="Start typing a Calgary neighbourhood"
                                  className="h-12 w-full px-4 text-sm outline-none transition-colors focus:border-[#4A90D9]"
                                  style={{ background: '#FFFDF8', border: '1.5px solid #C9D8E4', color: '#1C2B3A' }}
                                />
                                <div className="min-h-6">
                                  {neighborhoodQuery.length > 0 && neighborhoodQuery.length < 2 && (
                                    <p className="text-[11.5px] font-medium" style={{ color: '#5A6B7D' }}>
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
                                          className="px-3 py-2 text-xs font-bold transition-colors hover:bg-[#E8F3FC]"
                                          style={{ background: '#FFFDF8', border: '1.5px solid #C9D8E4', color: '#1C2B3A' }}
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
                              <p className="text-[11.5px] font-medium" style={{ color: '#5A6B7D' }}>
                                Prefer not to store an address? Choose <strong style={{ color: '#1C2B3A' }}>Change</strong> above, then
                                give a neighbourhood name instead.
                              </p>
                            )}
                          </div>

                          <label
                            className="flex cursor-pointer gap-3 p-4"
                            style={{ background: '#F7F3EA', border: '1.5px solid #C9D8E4' }}
                          >
                            <input
                              type="checkbox"
                              checked={profileDraft.piiConsent}
                              onChange={(e) => setProfileDraft((prev) => ({ ...prev, piiConsent: e.target.checked }))}
                              className="mt-0.5 h-4 w-4 shrink-0"
                              style={{ accentColor: '#2E8B7A' }}
                            />
                            <span className="text-[13px] leading-relaxed" style={{ color: '#5A6B7D' }}>
                              <strong style={{ color: '#1C2B3A' }}>Store my location preference.</strong> Calgary Watch keeps your
                              profile and report area to run your account, your neighbourhood report and moderation.{' '}
                              <a href="/privacy" className="font-bold underline underline-offset-2" style={{ color: '#1C2B3A' }}>
                                What we keep
                              </a>
                            </span>
                          </label>

                          <label
                            className="flex cursor-pointer gap-3 p-4"
                            style={{ background: 'rgba(46,139,122,0.08)', border: '1.5px solid rgba(46,139,122,0.45)' }}
                          >
                            <input
                              type="checkbox"
                              checked={profileDraft.weeklyDigestOptIn}
                              onChange={(e) => setProfileDraft((prev) => ({ ...prev, weeklyDigestOptIn: e.target.checked }))}
                              className="mt-0.5 h-4 w-4 shrink-0"
                              style={{ accentColor: '#2E8B7A' }}
                            />
                            <span className="text-[13px] leading-relaxed" style={{ color: '#5A6B7D' }}>
                              <strong style={{ color: '#1C2B3A' }}>Email me the weekly digest.</strong> Crime stats, notable reports
                              and community updates for your area. Optional, and you can turn it off any time.
                            </span>
                          </label>

                          {profileSaveError && (
                            <p className="px-3 py-2.5 text-[13px] font-bold"
                               style={{ background: 'rgba(192,57,43,0.08)', border: '1.5px solid rgba(192,57,43,0.45)', color: '#96271C' }}>
                              {profileSaveError}
                            </p>
                          )}

                          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                            {profileNeedsSetup && (
                              <Button
                                variant="secondary"
                                onClick={skipOnboarding}
                                className="rounded-none font-mono text-[11px] font-bold uppercase tracking-[0.16em]"
                                style={{ background: '#FFFDF8', border: '1.5px solid #C9D8E4', color: '#5A6B7D' }}
                              >
                                Skip for now
                              </Button>
                            )}
                            {!profileNeedsSetup && (
                              <Button
                                variant="secondary"
                                onClick={() => {
                                  setIsEditingPreferences(false);
                                  setProfileDraft({
                                    neighborhood: userProfile?.neighborhood || '',
                                    address: userProfile?.address || '',
                                    inferredNeighborhood: userProfile?.inferredNeighborhood || '',
                                    piiConsent: Boolean(userProfile?.piiConsentAt),
                                    weeklyDigestOptIn: userProfile?.weeklyDigestOptIn === true,
                                  });
                                  setProfileSaveError(null);
                                }}
                                className="rounded-none font-mono text-[11px] font-bold uppercase tracking-[0.16em]"
                                style={{ background: '#FFFDF8', border: '1.5px solid #C9D8E4', color: '#1C2B3A' }}
                              >
                                Cancel
                              </Button>
                            )}
                            {(profileNeedsSetup || isDirty) && (
                              <Button
                                onClick={saveProfileSettings}
                                disabled={isSavingProfile}
                                className="rounded-none font-mono text-[11px] font-bold uppercase tracking-[0.16em] transition-opacity hover:opacity-90"
                                style={{ background: '#06162F', color: '#F2EFE8' }}
                              >
                                {isSavingProfile ? 'Saving…' : 'Save and continue'}
                              </Button>
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
            className="fixed inset-0 z-[190] flex items-end sm:items-center justify-center p-4 backdrop-blur-sm"
            style={{ background: 'rgba(20,28,38,0.45)' }}
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
              className="w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl"
              style={{ background: '#FFFDF8', border: '1px solid #E7E0D2' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="relative px-6 pt-6 pb-5" style={{ background: 'linear-gradient(135deg, rgba(46,139,122,0.12), rgba(74,144,217,0.1))' }}>
                <span className="text-2xl" aria-hidden="true">📬</span>
                <h3 className="mt-2 font-display text-xl font-extrabold tracking-[-0.02em] text-[#1C2B3A]">
                  {locationLabel !== 'your local report area' ? `${locationLabel}, weekly` : 'Your neighbourhood, weekly'}
                </h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-[#5A6B7D]">
                  One email a week: real crime and 311 stats for your area, notable
                  reports, and community news. No spam, opt out anytime.
                </p>
              </div>
              <div className="flex items-center gap-2.5 px-5 py-4">
                <button
                  type="button"
                  onClick={() => setDigestPromptOpen(false)}
                  className="flex-1 h-11 rounded-2xl text-[13px] font-bold transition-colors hover:bg-black/5"
                  style={{ color: '#5A6B7D', border: '1px solid #E7E0D2' }}
                >
                  Not now
                </button>
                <button
                  type="button"
                  onClick={() => void enableDigest()}
                  className="flex-[1.4] h-11 rounded-2xl text-[13px] font-black transition-transform active:scale-[0.97]"
                  style={{ background: '#1C2B3A', color: '#FFFDF8' }}
                >
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
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[210] pointer-events-none"
          >
            <div
              className="relative flex items-center gap-3 pl-4 pr-5 py-3.5 rounded-2xl shadow-2xl overflow-visible"
              style={{ background: '#1C2B3A', border: '1px solid rgba(46,139,122,0.5)' }}
            >
              {/* confetti burst */}
              {['#4A90D9', '#2E8B7A', '#C77F18', '#C0392B', '#6A63A8', '#2E8B7A', '#C77F18', '#4A90D9', '#C0392B', '#4A90D9'].map((c, i) => (
                <motion.span
                  key={i}
                  className="absolute left-1/2 top-1/2 h-1.5 w-1.5 rounded-full"
                  style={{ background: c }}
                  initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                  animate={{
                    x: Math.cos((i / 10) * Math.PI * 2) * (52 + (i % 3) * 22),
                    y: Math.sin((i / 10) * Math.PI * 2) * (36 + (i % 3) * 16),
                    opacity: 0,
                    scale: 0.4,
                  }}
                  transition={{ duration: 1, delay: 0.1, ease: 'easeOut' }}
                  aria-hidden="true"
                />
              ))}
              <motion.span
                initial={{ scale: 0, rotate: -30 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 400, damping: 14, delay: 0.05 }}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base"
                style={{ background: 'rgba(46,139,122,0.25)' }}
                aria-hidden="true"
              >
                🎉
              </motion.span>
              <div>
                <p className="text-[13px] font-black" style={{ color: '#FFFDF8' }}>On the map!</p>
                <p className="text-[11px] font-medium" style={{ color: '#9AA6B2' }}>{celebration}</p>
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
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] flex items-center gap-3 px-4 py-3 bg-[#06162F] border-[1.5px] border-[#C0392B] shadow-[0_10px_28px_rgba(11,31,51,0.28)] backdrop-blur-xl text-[#F2EFE8] text-xs font-bold"
          >
            <ShieldAlert size={14} className="shrink-0 text-[#E8B871]" />
            {submitError}
            <button onClick={() => setSubmitError(null)} className="ml-1 text-[#AFC5DF] hover:text-[#F2EFE8] transition-colors">
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/*
        Geolocation notice.

        This used to sit centred at the very top, where on a phone it wrapped to
        four lines and covered the search field, the home button and the whole
        category chip row — the primary controls — until it was dismissed by
        hand. It now sits below the mobile filter bar and the desktop header,
        stays on one line, and clears itself, because a
        denied location is a minor fallback rather than an error the map needs
        to keep insisting on.
      */}
      <AnimatePresence>
        {locationError && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            role="status"
            className="fixed left-3 top-[calc(6.5rem+env(safe-area-inset-top))] z-[200] max-w-[calc(100vw-5rem)]
                       lg:left-1/2 lg:top-24 lg:-translate-x-1/2 lg:max-w-[calc(100vw-2rem)]
                       flex items-center gap-2 px-3 py-2 shadow-[0_4px_8px_rgba(11,31,51,0.24)] backdrop-blur-xl
                       bg-[#06162F] border-[1.5px] border-[#E8B871] text-[#F2EFE8] text-[12px] font-semibold whitespace-nowrap"
          >
            <Navigation size={13} className="shrink-0 text-[#E8B871]" />
            <span className="truncate">Location off. Showing all of Calgary</span>
            <button
              onClick={() => setLocationError(false)}
              aria-label="Dismiss"
              className="shrink-0 -mr-1 p-1 text-[#AFC5DF] hover:text-[#F2EFE8] transition-colors"
            >
              <X size={13} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* First-run coach-mark tour */}
      <MapTour open={tourOpen} onFinish={finishTour} />

      {/* Sidebar Feed - Desktop */}
      <div className="relative z-40 hidden h-full shrink-0 flex-col lg:flex" data-tour="feed">
        <Sidebar
          incidents={feedIncidents}
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
          crimeStats={crimeStats}
          isPinMode={isPinMode || isEmergencyPinMode}
          onPinConfirm={isEmergencyPinMode ? handleEmergencyPinConfirm : handlePinConfirm}
          onPinCancel={isEmergencyPinMode ? handleEmergencyPinCancel : handlePinCancel}
          onCameraSelect={setViewerCamera}
          isMapInteractive={!isFormOpen || isPinMode || isEmergencyPinMode || isEmergencyOpen}
        />

        {/* Tap-to-close: covers the exposed map only. It starts below the chrome —
            at top-0 it swallowed the chrome's own controls, so tapping Home or a
            category chip collapsed the sheet instead of acting. */}
        {sheetState === 'raised' && (
          <div
            className="fixed inset-x-0 z-[49] cursor-pointer lg:hidden"
            style={{ top: 'var(--cw-chrome-h, 0px)', bottom: `${RAISED_FRACTION * 100}vh` }}
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
          onReportPress={() => {
            setSheetState('rail');
            setIsFormOpen(true);
          }}
          activeIncidentId={activeIncidentId}
          hidden={isFormOpen || isPinMode || isEmergencyPinMode}
        />

        {/* Mobile map chrome (Citizen-inspired glass bar + hero stats) - lg+ uses desktop header only */}
        <div
          ref={chromeRef}
          className={cn(
            'absolute inset-x-0 top-0 z-[51] px-3 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] text-[#0B1F33] transition-all duration-200 pointer-events-none lg:hidden',
            (isPinMode || isEmergencyPinMode) && 'opacity-0 invisible -translate-y-4'
          )}
        >
          <div className="flex items-center gap-2 pointer-events-auto">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="flex size-11 shrink-0 items-center justify-center border-[1.5px] border-[#0B1F33] bg-[rgba(255,253,248,0.96)] text-[#40566B] shadow-[0_4px_8px_rgba(11,31,51,0.14)] backdrop-blur-lg transition-colors hover:bg-[#E8F3FC] active:scale-[0.98]"
              aria-label="Back to home"
            >
              <Home size={18} />
            </button>
            {/* No aria-label: it previously overrode the visible headline,
                sub-label and count badge with static text that omitted the
                count entirely (WCAG 2.5.3, Label in Name). Letting the
                button's own content compute the accessible name means the
                live count a reader can see is exactly what a voice-control
                user can speak. */}
            <button
              type="button"
              data-tour="m-feed"
              onClick={() => sheetRef.current?.raiseAndFocusSearch()}
              className="flex h-11 min-w-0 flex-1 items-center gap-3 border-[1.5px] border-[#0B1F33] bg-[rgba(255,253,248,0.96)] px-3 text-left shadow-[0_4px_8px_rgba(11,31,51,0.14)] backdrop-blur-lg transition-transform active:scale-[0.99]"
            >
              <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
                <span className={cn('relative inline-flex h-2 w-2', feedCount > 0 ? 'bg-[#2E8B7A]' : 'bg-[#5A6B7D]')} />
              </span>
              <div className="min-w-0 flex-1 leading-none">
                <p className="truncate font-display text-[13px] font-black tracking-[-0.02em] text-[#0B1F33]">
                  {selectedCategory === 'all' ? 'All live reports' : `${selectedCategory.charAt(0).toUpperCase()}${selectedCategory.slice(1)} reports`}
                </p>
                <p className="mt-1 truncate font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#40566B]">
                  {feedCount === 0 ? 'Be first to report' : 'Tap to search the feed'}
                </p>
              </div>
              {/* Colours are inline because the app's `light:` theme layer was
                  overriding bg-slate-900 to a cream tone while the label stayed
                  white, leaving the live count invisible on mobile. */}
              <span
                className="shrink-0 px-2 py-1 text-[11px] font-black tabular-nums"
                style={{ background: '#06162F', color: '#F2EFE8' }}
              >
                {feedCount}
              </span>
              <Search size={15} className="shrink-0 text-[#40566B]" />
            </button>
          </div>
        </div>

        {/* Mobile vertical action buttons (right edge). z-[51], matching the
            chrome bar, keeps these above the tap-to-close scrim (z-[49]) and
            below the raised sheet (z-[52] in MobileMapSheet.tsx — the sheet
            must win where it overlaps this column, so its own masthead and
            search row stay tappable instead of a button poking through) —
            the container stays pointer-events-none between the buttons, so
            the scrim still catches taps on the exposed map around them. */}
        <div
          className={cn(
            'absolute right-3 top-28 z-[51] flex flex-col gap-2 pointer-events-none text-[#0B1F33] transition-all duration-200 lg:hidden',
            (isPinMode || isEmergencyPinMode) && 'opacity-0 invisible translate-x-4'
          )}
        >
          <button
            type="button"
            onClick={handleLocate}
            data-tour="near-me"
            className={cn(
              'pointer-events-auto flex size-11 items-center justify-center border-[1.5px] shadow-[0_4px_8px_rgba(11,31,51,0.14)] backdrop-blur-lg transition-colors active:scale-[0.98]',
              nearMeOpen
                ? 'border-[#06162F] bg-[#06162F] text-[#F2EFE8]'
                : 'border-[#0B1F33] bg-[rgba(255,253,248,0.96)] text-[#2F6FB0]'
            )}
            aria-label="What's near me"
          >
            <Navigation size={18} />
          </button>
          <div className="relative pointer-events-auto">
            <button
              type="button"
              onClick={toggleNotifications}
              data-tour="m-alerts"
              className="relative flex size-11 items-center justify-center border-[1.5px] border-[#0B1F33] bg-[rgba(255,253,248,0.96)] text-[#40566B] shadow-[0_4px_8px_rgba(11,31,51,0.14)] backdrop-blur-lg transition-colors hover:bg-[#E8F3FC] active:scale-[0.98]"
              aria-label="Notifications"
            >
              <Bell size={18} className={cn(unreadNotifications > 0 && 'text-[#2F6FB0]')} />
              {unreadNotifications > 0 && (
                <span className="absolute top-1 right-1 flex h-4 min-w-[14px] items-center justify-center border-2 border-[#FFFDF8] bg-[#C0392B] px-0.5 text-[10px] font-black text-[#FFFDF8]">
                  {unreadNotifications > 9 ? '9+' : unreadNotifications}
                </span>
              )}
            </button>
            <AnimatePresence>
              {showNotifications && (
                <motion.div
                  initial={{ opacity: 0, x: 8, scale: 0.96 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: 8, scale: 0.96 }}
              // z-[60] matches the account menu hanging off the same column.
              // At z-50 this dropdown fell below the sheet (z-[52]) and had its
              // lower half clipped whenever the feed was raised, while its
              // sibling — anchored to the same buttons, opened the same way —
              // rendered fine. Two dropdowns from one column behaved differently.
              className="absolute right-full mr-3 top-0 w-[min(18.5rem,calc(100vw-5rem))] overflow-hidden z-[60] shadow-[0_10px_28px_rgba(11,31,51,0.20)]"
              style={{ background: '#FFFDF8', border: '1.5px solid #0B1F33' }}
                >
                  <div className="flex items-center justify-between bg-[#06162F] px-3.5 py-2.5">
                    <h3 className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-[#AFC5DF]">Alerts</h3>
                    <span className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#7FDCC6]">
                      <span className="h-1.5 w-1.5 animate-pulse bg-[#7FDCC6]" />
                      Live
                    </span>
                  </div>
                  <div className="max-h-56 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="px-4 py-6 text-center">
                        <span className="mx-auto flex h-10 w-10 items-center justify-center" style={{ background: '#E8F3FC' }}>
                          <Bell size={15} className="text-[#5A6B7D]" />
                        </span>
                        <p className="mt-2 text-[11.5px] font-bold text-[#1C2B3A]">All caught up</p>
                        <p className="text-[10px] text-[#5A6B7D] mt-0.5">New reports will land here as they happen.</p>
                      </div>
                    ) : (
                      notifications.map((n) => renderNotificationRow(n, true))
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <div className="relative pointer-events-auto">
            {user ? (
              <button
                type="button"
                onClick={toggleUserMenu}
                className="flex size-11 items-center justify-center overflow-hidden border-[1.5px] border-[#0B1F33] bg-[rgba(255,253,248,0.96)] shadow-[0_4px_8px_rgba(11,31,51,0.14)] backdrop-blur-lg"
                aria-label="Account menu"
              >
                {user.photoURL ? (
                  <img src={user.photoURL} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" crossOrigin="anonymous" />
                ) : (
                  <span className="text-xs font-black text-[#1C2B3A]">{(user.displayName?.[0] ?? user.email?.[0] ?? 'U').toUpperCase()}</span>
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => openAuthPanel('signin')}
                aria-label="Sign up or sign in"
                title="Sign up or sign in"
                className="flex size-11 items-center justify-center gap-2 border-[1.5px] border-[#0B1F33] bg-[rgba(255,253,248,0.96)] font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#0B1F33] shadow-[0_4px_8px_rgba(11,31,51,0.14)] backdrop-blur-lg active:scale-[0.98] md:w-auto md:px-3.5"
              >
                <LogIn size={16} />
                <span className="hidden md:inline">Sign up / sign in</span>
              </button>
            )}
            <AnimatePresence>
              {showUserMenu && user && (
                <motion.div
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 8 }}
                  className="absolute right-full mr-3 top-0 w-52 border-[1.5px] border-[#0B1F33] bg-[#FFFDF8] backdrop-blur-xl shadow-[0_10px_28px_rgba(11,31,51,0.20)] z-[60] pointer-events-auto"
                >
                  <div className="border-b-[1.5px] border-[#C9D8E4] bg-[#F7F3EA] p-3">
                    <p className="text-xs font-bold truncate" style={{ color: '#1C2B3A' }}>{user.displayName}</p>
                    <p className="text-[10px] truncate" style={{ color: '#5A6B7D' }}>{user.email}</p>
                  </div>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => { navigate('/admin'); setShowUserMenu(false); }}
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-bold text-[#2F6FB0] hover:bg-[#E8F3FC] text-left"
                    >
                      <LayoutDashboard size={14} />
                      Admin
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => openAuthPanel('settings')}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-bold text-[#1C2B3A] hover:bg-[#E8F3FC] text-left"
                  >
                    <Settings size={14} />
                    Settings
                  </button>
                  <button
                    type="button"
                    onClick={replayTour}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-bold text-[#1C2B3A] hover:bg-[#E8F3FC] text-left"
                  >
                    <HelpCircle size={14} />
                    App tour
                  </button>
                  <button
                    type="button"
                    onClick={() => { logout(); setShowUserMenu(false); }}
                    className="w-full flex items-center gap-2 border-t-[1.5px] border-[#C9D8E4] px-3 py-2.5 text-xs font-bold text-[#1C2B3A] hover:bg-[#E8F3FC] text-left"
                  >
                    <LogOut size={14} />
                    Sign out
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Near Me Panel — bottom sheet (mobile), centered card (desktop) */}
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
                // Clears the sheet's rail rather than sitting under it. This
                // panel used to be pinned 24px off the bottom, which put its
                // action buttons behind the rail on every phone — it is opened
                // by the locate button, so the one control that summons it was
                // also the one thing guaranteed to be covered. The fallback
                // matches the rail's typical measured height, so it is right
                // even in the frame before the sheet has measured itself.
                'bottom-[calc(var(--cw-rail-h,66px)+1.5rem)] left-3 right-3',
                'lg:left-6 lg:right-auto lg:bottom-24 lg:w-[24rem]',
              )}
            >
              <div className="bg-[rgba(255,253,248,0.97)] backdrop-blur-md shadow-2xl overflow-hidden" style={{ border: '1.5px solid #0B1F33' }}>
                {/* Header */}
                <div className="flex items-center justify-between px-4 pt-4 pb-2">
                  <div className="flex items-center gap-2">
                    <Navigation size={14} className="text-blue-600" />
                    <span className="text-xs font-black uppercase tracking-widest text-blue-700">
                      {nearMeStage === 'arrived' ? 'Your location' : 'Near You'}
                    </span>
                    {nearMeStage === 'results' && (
                      <span className="text-[10px] text-[#5A6B7D] font-semibold">within {NEAR_ME_RADIUS_KM} km</span>
                    )}
                  </div>
                  <button
                    onClick={() => { setNearMeOpen(false); setNearMeScanning(false); }}
                    className="w-7 h-7 flex items-center justify-center bg-[#E8F3FC] hover:bg-[#C9D8E4] text-[#5A6B7D] transition-colors"
                    aria-label="Close near me panel"
                  >
                    <X size={13} />
                  </button>
                </div>

                {nearMeStage === 'arrived' ? (
                  /* ── Arrival ──────────────────────────────────────────────
                      Show them where they are and ask before moving the map
                      somewhere else. The old flow flew straight to the nearest
                      incident, which took the map off the thing they had just
                      asked to see. */
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                    className="px-4 pb-4 pt-1"
                  >
                    <div className="flex items-start gap-3">
                      <span className="relative mt-0.5 grid h-9 w-9 shrink-0 place-items-center" aria-hidden="true">
                        <motion.span
                          className="absolute inset-0 rounded-full"
                          style={{ background: 'rgba(74,144,217,0.22)' }}
                          animate={{ scale: [1, 1.9], opacity: [0.7, 0] }}
                          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }}
                        />
                        <span className="relative h-3 w-3 rounded-full border-2 border-white shadow" style={{ background: '#4A90D9' }} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[15px] font-black leading-tight" style={{ color: '#1C2B3A' }}>
                          {userLocation ? 'This is where you are' : 'Showing central Calgary'}
                        </p>
                        <p className="mt-1 text-[12px] font-medium leading-snug" style={{ color: '#5A6B7D' }}>
                          {userLocation
                            ? 'Your pin stays on the map while you look around.'
                            : 'Turn on location in your browser to centre the map on you.'}
                        </p>
                      </div>
                    </div>

                    <div className="mt-3.5 space-y-2">
                      <button
                        type="button"
                        onClick={startNearMeScan}
                        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-transform active:scale-[0.99]"
                        style={{ background: '#1C2B3A', color: '#FFFDF8' }}
                      >
                        <span className="min-w-0">
                          <span className="block text-[13.5px] font-black leading-tight">See what is near me</span>
                          <span className="block text-[11px] font-medium opacity-75">
                            {nearMeIncidents.length > 0
                              ? `${nearMeIncidents.length} report${nearMeIncidents.length === 1 ? '' : 's'} within ${NEAR_ME_RADIUS_KM} km`
                              : `Scan ${NEAR_ME_RADIUS_KM} km around this pin`}
                          </span>
                        </span>
                        <ArrowRight size={16} className="shrink-0" />
                      </button>

                      {/* The deeper version of the same question, for people
                          who have given us an address to measure from. */}
                      {user && preferredAddress && (
                        <button
                          type="button"
                          onClick={() => { setNearMeOpen(false); setBriefingOpen(true); }}
                          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors"
                          style={{ background: 'rgba(46,139,122,0.09)', border: '1px solid rgba(46,139,122,0.3)' }}
                        >
                          <span className="min-w-0">
                            <span className="block text-[13.5px] font-black leading-tight" style={{ color: '#1C2B3A' }}>
                              Open my full briefing
                            </span>
                            <span className="block text-[11px] font-medium" style={{ color: '#5A6B7D' }}>
                              Measured from {preferredAddress}
                            </span>
                          </span>
                          <ArrowRight size={16} className="shrink-0" style={{ color: '#2E8B7A' }} />
                        </button>
                      )}
                    </div>
                  </motion.div>
                ) : nearMeScanning ? (
                  /* ── Radar scan — anticipation beat before the reveal ── */
                  <div className="px-4 pb-6 pt-1 flex flex-col items-center">
                    <div className="relative h-24 w-24" aria-hidden="true">
                      {[0, 0.45, 0.9].map((d) => (
                        <motion.span
                          key={d}
                          className="absolute inset-0 rounded-full border-2"
                          style={{ borderColor: '#2E8B7A' }}
                          initial={{ scale: 0.25, opacity: 0.8 }}
                          animate={{ scale: 1.15, opacity: 0 }}
                          transition={{ duration: 1.3, delay: d, repeat: Infinity, ease: 'easeOut' }}
                        />
                      ))}
                      <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-3.5 w-3.5 rounded-full bg-[#4A90D9] border-2 border-[#fff] shadow-[0_0_12px_2px_rgba(74,144,217,0.6)]" />
                    </div>
                    <p className="mt-2 font-mono text-[10px] font-bold uppercase tracking-[0.28em] text-[#2E8B7A]">
                      Scanning your 3 km…
                    </p>
                    <p className="mt-1 text-[10.5px] text-[#5A6B7D] font-medium">
                      Checking community + city + weather feeds
                    </p>
                  </div>
                ) : nearMeIncidents.length === 0 ? (
                  /* ── All clear — celebrate it ── */
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ type: 'spring', stiffness: 260, damping: 18 }}
                    className="relative px-4 pb-5 pt-2 text-center overflow-hidden"
                  >
                    {/* confetti burst */}
                    {['#4A90D9', '#2E8B7A', '#C77F18', '#C0392B', '#6A63A8', '#2E8B7A', '#C77F18', '#4A90D9', '#C0392B', '#4A90D9'].map((c, i) => (
                      <motion.span
                        key={i}
                        className="absolute left-1/2 top-8 h-1.5 w-1.5 rounded-full"
                        style={{ background: c }}
                        initial={{ x: 0, y: 0, opacity: 1 }}
                        animate={{
                          x: Math.cos((i / 8) * Math.PI * 2) * (44 + (i % 3) * 16),
                          y: Math.sin((i / 8) * Math.PI * 2) * (30 + (i % 3) * 12),
                          opacity: 0,
                        }}
                        transition={{ duration: 1, delay: 0.15, ease: 'easeOut' }}
                        aria-hidden="true"
                      />
                    ))}
                    <p className="text-2xl" aria-hidden="true">✨</p>
                    <p className="mt-1 text-base font-black text-stone-900">All clear around you</p>
                    <p className="text-[11px] text-[#5A6B7D] mt-1 font-medium">
                      Zero open reports within {NEAR_ME_RADIUS_KM} km. That's the whole point of watching.
                    </p>
                  </motion.div>
                ) : (
                  <>
                    {/* Reveal headline — the payoff after the scan */}
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ type: 'spring', stiffness: 260, damping: 20 }}
                      className="px-4 pb-2 flex items-center gap-2"
                    >
                      <span className="text-lg" aria-hidden="true">
                        {nearMeIncidents.length <= 3 ? '👀' : '📡'}
                      </span>
                      <p className="text-[13.5px] font-black text-stone-900">
                        {nearMeIncidents.length === 1
                          ? '1 thing to know nearby'
                          : `${nearMeIncidents.length} things to know nearby`}
                      </p>
                    </motion.div>

                    {/* Incident card */}
                    {(() => {
                      const inc = nearMeIncidents[nearMeIndex];
                      if (!inc) return null;
                      // Straight from CATEGORY: the old map used remapped
                      // Tailwind names, and painted emergency red onto traffic
                      // and infrastructure cards that are not emergencies.
                      const catInk = categoryColor(inc.category);
                      const age = Date.now() - inc.timestamp;
                      const ageStr = age < 60_000 ? 'Just now'
                        : age < 3_600_000 ? `${Math.round(age / 60_000)}m ago`
                        : age < 86_400_000 ? `${Math.round(age / 3_600_000)}h ago`
                        : `${Math.round(age / 86_400_000)}d ago`;

                      return (
                        <div className="px-4 pb-3">
                          <div
                            className="p-3.5 cursor-pointer"
                            style={{ background: `${catInk}14`, border: `1.5px solid ${catInk}59` }}
                            onClick={() => {
                              handleMarkerClick(inc);
                              setNearMeOpen(false);
                            }}
                          >
                            <div className="flex items-start justify-between gap-2 mb-1.5">
                              <span className="text-[10px] font-black uppercase tracking-widest opacity-80">{inc.category}</span>
                              <span className="text-[10px] text-[#5A6B7D] font-semibold shrink-0">{ageStr}</span>
                            </div>
                            <p className="text-sm font-black text-[#1C2B3A] leading-snug mb-1">{inc.title}</p>
                            <p className="text-[11px] text-[#5A6B7D] line-clamp-2 leading-relaxed">{inc.description}</p>
                            <div className="flex items-center gap-1 mt-2">
                              <span className="text-[10px] text-[#5A6B7D]">{inc._dist < 1 ? `${Math.round(inc._dist * 1000)}m` : `${inc._dist.toFixed(1)} km`} away · {inc.neighborhood}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Arrow navigation + counter */}
                    <div className="flex items-center justify-between px-4 pb-4 pt-1">
                      <button
                        onClick={() => {
                          const next = Math.max(0, nearMeIndex - 1);
                          setNearMeIndex(next);
                          const inc = nearMeIncidents[next];
                          if (inc) mapRef.current?.flyTo(inc.lat, inc.lng, 15);
                        }}
                        disabled={nearMeIndex === 0}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed text-[#1C2B3A] text-xs font-bold transition-colors"
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
                        className="text-[11px] font-semibold underline underline-offset-2 text-[#5A6B7D] transition-opacity hover:opacity-70"
                      >
                        {nearMeIndex + 1} of {nearMeIncidents.length} · back to me
                      </button>
                      <button
                        onClick={() => {
                          const next = Math.min(nearMeIncidents.length - 1, nearMeIndex + 1);
                          setNearMeIndex(next);
                          const inc = nearMeIncidents[next];
                          if (inc) mapRef.current?.flyTo(inc.lat, inc.lng, 15);
                        }}
                        disabled={nearMeIndex === nearMeIncidents.length - 1}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed text-[#1C2B3A] text-xs font-bold transition-colors"
                      >
                        Next →
                      </button>
                    </div>
                  </>
                )}

                {/* Weekly digest opt-in — wired to the existing profile setting */}
                {nearMeStage === 'results' && !nearMeScanning && (!user || userProfile?.weeklyDigestOptIn !== true) && (
                  <motion.button
                    type="button"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.35, duration: 0.4 }}
                    onClick={() => {
                      setNearMeOpen(false);
                      openAuthPanel(user ? 'settings' : 'signin');
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[rgba(46,139,122,0.14)]"
                    style={{ background: 'rgba(46,139,122,0.09)', borderTop: '1px dashed #E7E0D2' }}
                  >
                    <span className="text-base shrink-0" aria-hidden="true">📬</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12px] font-black text-stone-900 leading-tight">
                        Want this weekly, without opening the app?
                      </span>
                      <span className="block text-[10.5px] text-[#5A6B7D] font-medium mt-0.5">
                        Real stats for your neighbourhood + community news, by email. Free, opt out anytime.
                      </span>
                    </span>
                    <span className="shrink-0 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[#2E8B7A]">
                      {user ? 'Turn on' : 'Sign up'} →
                    </span>
                  </motion.button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Desktop map command bar */}
        <div className="pointer-events-none absolute left-5 right-5 top-5 z-30 hidden items-center justify-between lg:flex">
          <div className="pointer-events-auto flex h-13 items-center gap-1 border-[1.5px] border-[#0B1F33] bg-[rgba(255,253,248,0.96)] py-1 pl-2 pr-1.5 shadow-[0_4px_8px_rgba(11,31,51,0.14)] backdrop-blur-lg">
            <div className="flex items-center gap-2.5 border-r-[1.5px] border-[#C9D8E4] pr-3">
              <span className="flex size-8 items-center justify-center rounded-lg bg-[#E8F3FC]">
                <img src="/images/brand/calgary-watch-plane-mark.webp" alt="" width={19} height={19} className="size-[19px] object-contain" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
              </span>
              <span className="relative flex h-2 w-2" aria-hidden="true">
                <span className={cn('relative inline-flex h-2 w-2', mapIncidents.length > 0 ? 'bg-[#2E8B7A]' : 'bg-[#5A6B7D]')} />
              </span>
              <div className="leading-none">
                <h1 className="font-display text-[13px] font-black tracking-[-0.02em] text-[#0B1F33]">
                  {selectedCategory === 'all' ? 'All live reports' : `${selectedCategory.charAt(0).toUpperCase()}${selectedCategory.slice(1)} reports`}
                </h1>
                <p className="mt-1 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#5A6B7D]">
                  {mapIncidents.length} visible / Calgary Watch
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => navigate('/')}
              className="flex size-9 items-center justify-center text-[#40566B] transition-colors hover:bg-[#E8F3FC] hover:text-[#2F6FB0] active:scale-[0.98]"
              title="Back to landing page"
              aria-label="Back to landing page"
            >
              <Home size={16} />
            </button>
            <button
              type="button"
              data-tour="locate"
              onClick={handleLocate}
              className={cn(
                'flex size-9 items-center justify-center transition-colors active:scale-[0.98]',
                nearMeOpen
                  ? 'bg-[#06162F] text-[#F2EFE8]'
                  : 'text-[#40566B] hover:bg-[#E8F3FC] hover:text-[#2F6FB0]',
              )}
              title="Show my location"
              aria-label="Show my location"
            >
              <Navigation size={16} />
            </button>
          </div>

          <div className="flex items-center gap-2 md:gap-3 pointer-events-auto">
            <div className="relative">
              <Button
                variant="secondary"
                size="icon"
                data-tour="alerts"
                className="size-12 rounded-none border-[1.5px] border-[#0B1F33] bg-[rgba(255,253,248,0.96)] text-[#40566B] shadow-[0_4px_8px_rgba(11,31,51,0.14)] backdrop-blur-lg transition-colors hover:bg-[#E8F3FC]"
                onClick={toggleNotifications}
              >
                <Bell size={19} className={cn(unreadNotifications > 0 ? 'text-[#2F6FB0]' : 'text-[#40566B]')} />
                {unreadNotifications > 0 && (
                  <span className="absolute top-1.5 right-1.5 flex h-4 w-4 items-center justify-center border-2 border-[#FFFDF8] bg-[#C0392B] text-[10px] font-black text-[#FFFDF8]">
                    {unreadNotifications}
                  </span>
                )}
              </Button>
              
              <AnimatePresence>
                {showNotifications && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute right-0 mt-2 w-80 overflow-hidden z-50 shadow-[0_10px_28px_rgba(11,31,51,0.20)]"
                    style={{ background: '#FFFDF8', border: '1.5px solid #0B1F33' }}
                  >
                    <div className="flex items-center justify-between bg-[#06162F] px-4 py-2.5">
                      <h3 className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-[#AFC5DF]">Alerts</h3>
                      <span className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#7FDCC6]">
                        <span className="h-1.5 w-1.5 animate-pulse bg-[#7FDCC6]" />
                        Live
                      </span>
                    </div>
                    <div className="max-h-64 overflow-y-auto">
                      {notifications.length === 0 ? (
                        <div className="px-4 py-7 text-center">
                          <span className="mx-auto flex h-10 w-10 items-center justify-center" style={{ background: '#E8F3FC' }}>
                            <Bell size={15} className="text-[#5A6B7D]" />
                          </span>
                          <p className="mt-2 text-[12px] font-bold text-[#1C2B3A]">All caught up</p>
                          <p className="text-[10.5px] text-[#5A6B7D] mt-0.5">New reports in your area will land here.</p>
                        </div>
                      ) : (
                        notifications.map((notification) => renderNotificationRow(notification, false))
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {user ? (
              <div className="relative">
                <button 
                  onClick={toggleUserMenu}
                  className="flex size-12 items-center justify-center overflow-hidden border-[1.5px] border-[#0B1F33] bg-[rgba(255,253,248,0.96)] p-1 shadow-[0_4px_8px_rgba(11,31,51,0.14)] backdrop-blur-lg transition-colors hover:bg-[#E8F3FC]"
                >
                  {user.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt=""
                      className="w-8 h-8 md:w-10 md:h-10 border border-[#C9D8E4]"
                      referrerPolicy="no-referrer"
                      crossOrigin="anonymous"
                    />
                  ) : (
                    <div className="w-8 h-8 md:w-10 md:h-10 border border-[#0B1F33] bg-[#2F6FB0] flex items-center justify-center text-[#FFFDF8] text-xs font-black">
                      {(user.displayName?.[0] ?? user.email?.[0] ?? 'U').toUpperCase()}
                    </div>
                  )}
                </button>
                
                <AnimatePresence>
                  {showUserMenu && (
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      className="absolute right-0 mt-2 w-52 overflow-hidden border-[1.5px] border-[#0B1F33] bg-[#FFFDF8] shadow-[0_10px_28px_rgba(11,31,51,0.20)]"
                    >
                      <div className="border-b-[1.5px] border-[#C9D8E4] bg-[#F7F3EA] p-4">
                        <p className="text-xs font-bold truncate" style={{ color: '#1C2B3A' }}>{user.displayName}</p>
                        <p className="text-[10px] text-[#5A6B7D] truncate mt-0.5">{user.email}</p>
                      </div>
                      {isAdmin && (
                        <button
                          onClick={() => {
                            navigate('/admin');
                            setShowUserMenu(false);
                          }}
                          className="w-full flex items-center gap-2 px-4 py-3 text-xs font-bold text-[#2F6FB0] hover:bg-[#E8F3FC] transition-colors text-left"
                        >
                          <LayoutDashboard size={14} />
                          Admin Portal
                        </button>
                      )}
                      <button
                        onClick={() => openAuthPanel('settings')}
                        className="w-full flex items-center gap-2 px-4 py-3 text-xs font-bold text-[#1C2B3A] hover:bg-[#E8F3FC] transition-colors text-left"
                      >
                        <Settings size={14} />
                        Settings
                      </button>
                      <button
                        onClick={replayTour}
                        className="w-full flex items-center gap-2 px-4 py-3 text-xs font-bold text-[#1C2B3A] hover:bg-[#E8F3FC] transition-colors text-left"
                      >
                        <HelpCircle size={14} />
                        App tour
                      </button>
                      <button 
                        onClick={() => {
                          logout();
                          setShowUserMenu(false);
                        }}
                        className="w-full flex items-center gap-2 border-t-[1.5px] border-[#C9D8E4] px-4 py-3 text-xs font-bold text-[#1C2B3A] hover:bg-[#E8F3FC] transition-colors text-left"
                      >
                        <LogOut size={14} />
                        Sign Out
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <Button
                variant="secondary"
                className="flex h-12 items-center gap-2 rounded-none border-[1.5px] border-[#0B1F33] bg-[rgba(255,253,248,0.96)] px-4 text-[#0B1F33] shadow-[0_4px_8px_rgba(11,31,51,0.14)] backdrop-blur-lg transition-colors hover:bg-[#E8F3FC]"
                onClick={() => openAuthPanel('signin')}
                aria-label="Sign up or sign in"
              >
                <LogIn size={18} className="text-[#2F6FB0]" />
                {/* The button turns white in light mode, so the label has to
                    turn dark with it. Without this it inherits white and the
                    primary sign-in call to action is invisible. */}
                <span className="text-sm font-bold text-[#0B1F33]">Sign up / sign in</span>
              </Button>
            )}
          </div>
        </div>

        <CameraViewer
          camera={viewerCamera}
          cameras={trafficCameras}
          onClose={() => setViewerCamera(null)}
          onFocus={(cam) => mapRef.current?.flyTo(cam.lat, cam.lng, 16)}
        />

        {/* Emergency and report actions */}
        <div className={cn(
          // On a phone the layer bar sits 88–140px off the bottom, centred and
          // up to 20rem wide, which put it straight through the SOS/Report
          // column at 7rem. Lifting the column clear of it keeps both usable
          // one-handed instead of stacking two tap targets on top of each other.
          'absolute right-3 z-30 flex flex-col items-end gap-2.5 bottom-[calc(var(--cw-rail-h,66px)+1.375rem+var(--cw-layerbar-h,3.25rem)+0.75rem+env(safe-area-inset-bottom))] transition-all duration-200 md:right-5 lg:right-6 lg:bottom-24',
          (isPinMode || isEmergencyPinMode) && "opacity-0 invisible translate-x-4 pointer-events-none"
        )}>
          {/* SOS remains visually separate from standard reporting. */}
          <Button
            variant="primary"
            data-tour="sos"
            className="group relative flex size-12 items-center justify-center gap-2 rounded-none border-[1.5px] border-[#8E241A] bg-[#C0392B] text-[#FFFDF8] shadow-[0_4px_8px_rgba(11,31,51,0.20)] transition-[background-color,transform] hover:bg-[#A91F1F] active:scale-[0.97] md:size-14 lg:h-12 lg:w-auto lg:px-4"
            onClick={() => {
              // Debounce: prevent rapid clicks
              const now = Date.now();
              if (now - buttonClickDebounceRef.current < 300) return;
              buttonClickDebounceRef.current = now;

              if (!user) { openAuthPanel('signin'); return; }
              setIsEmergencyOpen(true);
            }}
          >
            <Siren size={22} className="relative z-10 shrink-0" />
            <span className="hidden lg:inline font-mono text-[13px] font-bold uppercase tracking-[0.18em] text-[#fff]">SOS</span>
            <div className="absolute right-full mr-4 px-3 py-1.5 bg-[#8E241A] text-[#FFFDF8] font-mono text-[10px] font-bold uppercase tracking-[0.14em] opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none border-[1.5px] border-[#8E241A] shadow-[0_4px_8px_rgba(11,31,51,0.20)] hidden md:block lg:hidden">
              Emergency Report
            </div>
          </Button>

          {/* Primary reporting action is labelled at every viewport size. */}
          <Button
            variant="primary"
            data-tour="report"
            /* Button's `primary` variant sets --tw-shadow-color (blue-500/20), which
               would tint this offset away to nothing. Pin the colour on the element. */
            style={{ ['--tw-shadow-color' as string]: '#4A90D9' } as React.CSSProperties}
            className="group flex h-12 w-auto items-center justify-center gap-2 rounded-none bg-[#0B1F33] px-4 text-[#FFFDF8] shadow-[4px_4px_0_#4A90D9] transition-[background-color,transform,box-shadow] hover:bg-[#1C2B3A] active:translate-x-1 active:translate-y-1 active:shadow-none md:h-14 md:px-5 lg:h-13 lg:px-5"
            onClick={() => {
              // Debounce: prevent rapid clicks
              const now = Date.now();
              if (now - buttonClickDebounceRef.current < 300) return;
              buttonClickDebounceRef.current = now;

              if (!user) {
                openAuthPanel('signin');
              } else {
                setIsFormOpen(true);
                setConfirmedPinLocation(null);
                // Start neutral - user picks GPS or pin explicitly in the form.
                // Don't pre-fill with their home GPS coords.
                setSelectedLocation(CALGARY_CENTER);
              }
            }}
          >
            <Plus size={21} className="shrink-0 text-[#FFFDF8]" />
            <span className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-[#F2EFE8] sm:text-[12px]">Report<span className="hidden lg:inline"> an incident</span></span>
            <div className="absolute right-full mr-4 px-3 py-1.5 bg-[#06162F] text-[#F2EFE8] font-mono text-[10px] font-bold uppercase tracking-[0.14em] opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none border-[1.5px] border-[#06162F] shadow-[0_4px_8px_rgba(11,31,51,0.20)] hidden md:block lg:hidden">
              Report Incident
            </div>
          </Button>
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
          showCrimeLayer={showCrimeLayer}
          setShowCrimeLayer={setShowCrimeLayer}
          crimeStats={crimeStats}
          isPinMode={isPinMode || isEmergencyPinMode}
        />

        {/* Bottom Status & Disclaimer Bar - desktop / tablet only; mobile uses top chrome + layer bar */}
        <div className="pointer-events-none absolute bottom-6 left-6 right-6 z-20 hidden items-center justify-between lg:flex">
          <div className="flex items-center gap-2 border-[1.5px] border-[#0B1F33] bg-[rgba(255,253,248,0.96)] px-3 py-2 shadow-[0_4px_8px_rgba(11,31,51,0.14)] backdrop-blur-lg">
            <div className="relative flex items-center justify-center w-1.5 h-1.5 md:w-2 md:h-2">
              <div className={cn(
                "relative w-1.5 h-1.5 md:w-2 md:h-2",
                mapIncidents.length > 0 ? 'bg-[#2E8B7A]' : 'bg-[#5A6B7D]'
              )} />
            </div>
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#40566B]">
              {mapIncidents.length} Map Markers
            </span>
          </div>

          <div className="flex items-center gap-2 border-[1.5px] border-[#0B1F33] bg-[rgba(255,253,248,0.96)] px-3 py-2 shadow-[0_4px_8px_rgba(11,31,51,0.14)] backdrop-blur-lg">
            <ShieldAlert size={12} className="text-[#8A5710]" />
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#40566B]">
              Verify before action.
            </span>
          </div>
        </div>

        {/* Desktop & Mobile Panels */}
        <IncidentDetailPanel
          incident={selectedIncident}
          onClose={() => setSelectedIncident(null)}
          onViewNeighborhood={handleViewNeighborhood}
          onReportIncident={handleReportFromIncident}
          trafficCameras={trafficCameras}
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
            areaStats={briefingAreaStats}
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
          />
        )}
      </main>

      {/* Global Background Animation (Subtle) */}
      <div className="fixed inset-0 pointer-events-none -z-10 bg-[radial-gradient(circle_at_50%_50%,rgba(30,58,138,0.1),transparent)]" />
    </div>
  );
}
