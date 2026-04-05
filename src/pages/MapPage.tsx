import { useState, useEffect, useCallback, useRef, useMemo, startTransition } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import Map, { MapRef } from '@/src/components/Map';
import Sidebar from '@/src/components/Sidebar';
import IncidentForm, { IncidentFormData } from '@/src/components/IncidentForm';
import EmergencyModal, { EmergencySubmitData } from '@/src/components/EmergencyModal';
import AreaIntelligencePanel from '@/src/components/AreaIntelligencePanel';
import IncidentDetailPanel from '@/src/components/IncidentDetailPanel';
import LayerToggle from '@/src/components/LayerToggle';
import { Button } from '@/src/components/ui/Button';
import { Incident, IncidentCategory, AreaIntelligence } from '@/src/types';
import { getAreaIntelligence } from '@/src/services/mockData';
import { Plus, Navigation, ShieldAlert, LogOut, Database, Bell, Sun, Moon, Search, Filter, X, LogIn, Home, LayoutDashboard, Siren } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { CALGARY_CENTER } from '@/src/constants';
import { useAuth } from '@/src/components/FirebaseProvider';
import { db, handleFirestoreError, OperationType } from '@/src/firebase';
import { collection, onSnapshot, query, addDoc, orderBy, limit, getDocs, startAfter, QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';
import { cn } from '@/src/lib/utils';
import { SidebarSkeleton, MapShimmer } from '@/src/components/SkeletonLoader';

function getDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; // km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function useOfficialOpenData(isAuthReady: boolean) {
  const [officialIncidents, setOfficialIncidents] = useState<Incident[]>([]);

  useEffect(() => {
    if (!isAuthReady) return;
    const fetchOpenData = async () => {
      try {
        // Fetch Calgary Traffic
        const trafficRes = await fetch('https://data.calgary.ca/resource/35ra-9556.json?$limit=60&$order=start_dt DESC');
        const trafficData = await trafficRes.json();
        const trafficIncidents: Incident[] = trafficData.map((item: any) => {
          const rawInfo = (item.incident_info || '').trim().toLowerCase();
          const rawDesc = (item.description || '').trim().toLowerCase();
          const combined = `${rawInfo} ${rawDesc}`;
          const quadrant = item.quadrant ? `Calgary ${item.quadrant}` : 'Calgary';

          let tTitle: string;
          let tDesc: string;

          if (combined.includes('collision') || combined.includes('accident')) {
            tTitle = 'Vehicle Collision';
            tDesc = `Multi-vehicle collision blocking traffic in ${quadrant}. Expect delays and use alternate routes.`;
          } else if (combined.includes('stalled') || combined.includes('disabled vehicle')) {
            tTitle = 'Stalled Vehicle';
            tDesc = `Stalled vehicle on the roadway in ${quadrant}. Lane restriction in effect.`;
          } else if (combined.includes('signal') || combined.includes('light out')) {
            tTitle = 'Traffic Signal Issue';
            tDesc = `Traffic signal malfunction reported in ${quadrant}. Treat intersection as all-way stop.`;
          } else if (combined.includes('road closure') || combined.includes('closed')) {
            tTitle = 'Road Closure';
            tDesc = `Road closure active in ${quadrant}. Check alternate routes before travelling.`;
          } else if (combined.includes('construction') || combined.includes('paving') || combined.includes('utility')) {
            tTitle = 'Construction Zone';
            tDesc = `Active construction causing lane reductions in ${quadrant}. Reduce speed and allow extra travel time.`;
          } else if (combined.includes('spill') || combined.includes('debris') || combined.includes('hazard')) {
            tTitle = 'Road Hazard';
            tDesc = `Hazardous material or debris on roadway in ${quadrant}. Avoid area if possible.`;
          } else if (combined.includes('flood') || combined.includes('water')) {
            tTitle = 'Flooded Roadway';
            tDesc = `Water on roadway reported in ${quadrant}. Do not drive through flooded sections.`;
          } else {
            tTitle = item.incident_info?.trim() || 'Traffic Disruption';
            tDesc = `Traffic disruption reported in ${quadrant}. Conditions may change — check 511 Alberta for updates.`;
          }

          return {
            id: `yyc-traffic-${item.id || String(item.incident_info || Math.random()).replace(/[^a-zA-Z0-9]/g, '')}`,
            title: tTitle,
            description: tDesc,
          category: 'traffic',
          neighborhood: item.quadrant ? `Calgary ${item.quadrant}` : 'Calgary',
          lat: parseFloat(item.latitude),
          lng: parseFloat(item.longitude),
          timestamp: new Date(item.start_dt || new Date()).getTime(),
          email: 'opendata@calgary.ca',
          name: 'City of Calgary Traffic',
          anonymous: false,
          verified_status: 'community_confirmed',
          report_count: 1,
          data_source: 'official',
          source_name: 'City of Calgary Open Data',
            source_url: 'https://data.calgary.ca/',
            expires_at: new Date(item.start_dt || new Date()).getTime() + (8 * 60 * 60 * 1000), // Decay after 8 hours
          };
        });

        // Fetch Calgary 311 (Recent issues for infrastructure / weather)
        const three11Res = await fetch('https://data.calgary.ca/resource/iahh-g8bj.json?$limit=80&$where=status_description=\'Open\'&$order=requested_date DESC');
        const three11Data = await three11Res.json();
        
        const three11Incidents: Incident[] = three11Data
          .filter((item: any) => {
            if (!item.latitude || !item.longitude) return false;
            const sName = (item.service_name || '').toLowerCase();
            // Filter out mundane bylaw/city tickets. We want incidents that feel like 'live watch' events.
            const boring = ['tree', 'shrub', 'waste', 'recycling', 'snow and ice', 'grass', 'weeds', 'park', 'license', 'material on public', 'tax', 'inquiry'];
            if (boring.some(b => sName.includes(b))) return false;
            return true;
          })
          .map((item: any) => {
            // Map 311 service names to our categories
            const sName = (item.service_name || '').toLowerCase();
            let category: IncidentCategory = 'infrastructure';
            if (sName.includes('snow') || sName.includes('ice') || sName.includes('drain') || sName.includes('spill') || sName.includes('water')) category = 'weather';
            if (sName.includes('bylaw') || sName.includes('disturbance') || sName.includes('noise')) category = 'crime';
            if (sName.includes('hazard') || sName.includes('emergency') || sName.includes('danger')) category = 'emergency';
            
            const timestamp = new Date(item.requested_date || new Date()).getTime();

            // Derive a human-readable title and contextual description from 311 service data
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

            return {
              id: `yyc-311-${item.service_request_id}`,
              title: cleanTitle,
              description: cleanDesc,
              category,
              neighborhood: item.comm_name || 'Calgary',
              lat: parseFloat(item.latitude),
              lng: parseFloat(item.longitude),
              timestamp,
              email: 'opendata@calgary.ca',
              name: 'Calgary 311 Sync',
              anonymous: false,
              verified_status: 'community_confirmed',
              report_count: 1,
              data_source: 'official',
              source_name: 'Calgary 311',
              source_url: 'https://data.calgary.ca/',
              expires_at: timestamp + (24 * 60 * 60 * 1000), // Decay after 24 hours
            };
          });

        setOfficialIncidents([...trafficIncidents, ...three11Incidents]);
      } catch (err) {
        console.error('Failed to fetch official open data:', err);
      }
    };
    fetchOpenData();
    const interval = setInterval(fetchOpenData, 5 * 60 * 1000); // 5 min
    return () => clearInterval(interval);
  }, [isAuthReady]);

  return officialIncidents;
}

export default function MapPage() {
  const INCIDENT_PAGE_SIZE = 60;
  const { user, signIn, logout, isAuthReady, isAdmin } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const mapRef = useRef<MapRef>(null);
  const officialOpenData = useOfficialOpenData(isAuthReady);
  
  const [firebaseIncidents, setFirebaseIncidents] = useState<Incident[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<IncidentCategory | 'all'>('all');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<{ lat: number; lng: number } | null>(null);
  
  const [selectedArea, setSelectedArea] = useState<AreaIntelligence | null>(null);
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [activeIncidentId, setActiveIncidentId] = useState<string | null>(null);
  
  const [showLiveReports, setShowLiveReports] = useState(true);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof window === 'undefined') return 'dark';
    try {
      return localStorage.getItem('cw-theme') === 'light' ? 'light' : 'dark';
    } catch {
      return 'dark';
    }
  });
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [notifications, setNotifications] = useState<{ id: string; title: string; timestamp: number }[]>([]);
  const [unreadNotifications, setUnreadNotifications] = useState<number>(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const [locationError, setLocationError] = useState(false);
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

  // Check for report=true in URL
  useEffect(() => {
    if (searchParams.get('report') === 'true' && isAuthReady) {
      if (!user) {
        signIn();
      } else {
        setIsFormOpen(true);
        setConfirmedPinLocation(null);
        setSelectedLocation(CALGARY_CENTER);
      }
    }
  }, [searchParams, isAuthReady, user, userLocation, signIn]);


  useEffect(() => {
    if (theme === 'light') {
      document.documentElement.classList.add('light');
    } else {
      document.documentElement.classList.remove('light');
    }
    try {
      localStorage.setItem('cw-theme', theme);
    } catch {
      // Safari private mode might throw
    }
  }, [theme]);

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 1500);
    return () => clearTimeout(timer);
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
      return;
    }

    const q = query(collection(db, 'incidents'), orderBy('timestamp', 'desc'), limit(INCIDENT_PAGE_SIZE));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const incidentData = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as Incident))
        .filter((incident) => incident.deleted !== true);

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
          if (!merged.has(incident.id) && incident.timestamp < oldestTimestamp) {
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
    }, (error) => {
      console.error('Failed to subscribe to incidents:', error);
      // Show an empty map rather than stale/fake data on error.
      setFirebaseIncidents([]);
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
        orderBy('timestamp', 'desc'),
        startAfter(lastVisibleIncidentDoc.current),
        limit(INCIDENT_PAGE_SIZE)
      );
      const nextPage = await getDocs(nextQuery);
      const olderIncidents = nextPage.docs
        .map((doc) => ({ id: doc.id, ...doc.data() } as Incident))
        .filter((incident) => incident.deleted !== true);

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

    // Show popup immediately - no waiting for pan animation.
    window.requestAnimationFrame(() => {
      mapRef.current?.showPopup(incident);
    });

    const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 1024;
    if (isDesktop) {
      // Pan in parallel with the popup appearing; use a shorter, snappier duration.
      mapRef.current?.flyToWithOffset(incident.lat, incident.lng, {
        zoom: 15,
        offsetX: 320,
        offsetY: 0,
      });
    } else {
      mapRef.current?.flyTo(incident.lat, incident.lng, 15);
    }

    // Open detail panel immediately via startTransition (non-blocking).
    startTransition(() => {
      setSelectedIncident(incident);
    });
  }, []);

  // Deep-link: /map?i=INCIDENT_ID — auto-open incident detail panel once incidents load
  const incidents = useMemo(() => {
    const combined = [...firebaseIncidents, ...officialOpenData];
    // Deduplicate by id if needed, though they shouldn't conflict
    const unique = new globalThis.Map(combined.map((i: Incident) => [i.id, i]));
    return [...unique.values()].sort((a: Incident, b: Incident) => b.timestamp - a.timestamp);
  }, [firebaseIncidents, officialOpenData]);

  useEffect(() => {
    const targetId = searchParams.get('i');
    if (!targetId || deepLinkHandledRef.current || incidents.length === 0) return;
    const target = incidents.find((inc) => inc.id === targetId);
    if (target) {
      deepLinkHandledRef.current = true;
      handleMarkerClick(target);
    }
  }, [searchParams, incidents, handleMarkerClick]);

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
    setIsPinMode(false);
  }, []);

  const handleFormClose = useCallback(() => {
    setIsPinMode(false);
    setConfirmedPinLocation(null);
    setIsFormOpen(false);
  }, []);

  const handleIncidentSubmit = useCallback((data: IncidentFormData & { lat: number; lng: number }) => {
    if (!user) {
      signIn();
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
    // Fire-and-forget: Don't await the Firestore write, let it happen in background
    startTransition(() => {
      (async () => {
        try {
          const { anonymous, ...incidentData } = data;
          
          // Defensively ensure all strings match exactly Firestore Rules lengths
          const safeTitle = incidentData.title.trim().padEnd(5, ' ').slice(0, 100);
          const safeDesc = incidentData.description.trim().padEnd(10, ' ').slice(0, 1000);
          const safeNeighborhood = (incidentData.neighborhood || 'Calgary').trim().padEnd(2, ' ').slice(0, 80);
          const nameToUse = isAnonymous ? 'Anonymous' : firstName;
          const safeName = nameToUse.trim().padEnd(2, ' ').slice(0, 50);
          
          await addDoc(collection(db!, path), {
            title: safeTitle,
            description: safeDesc,
            category: incidentData.category,
            neighborhood: safeNeighborhood,
            lat: incidentData.lat,
            lng: incidentData.lng,
            email: isAnonymous ? 'anonymous@calgarywatch.app' : (user.email || 'unknown@example.com'),
            name: safeName,
            source_name: safeName,
            anonymous: isAnonymous,
            timestamp: Date.now(),
            verified_status: 'unverified',
            report_count: 1,
            authorUid: user.uid,
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.CREATE, path);
        }
      })();
    });
  }, [user, signIn]);

  const handleEmergencySubmit = useCallback((data: EmergencySubmitData) => {
    if (!user) { signIn(); return; }
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

          await addDoc(collection(db!, path), {
            title: safeTitle,
            description: safeDesc,
            category: data.category,
            neighborhood: safeNeighborhood,
            lat: data.lat,
            lng: data.lng,
            email: user.email || 'unknown@example.com',
            name: safeName,
            source_name: safeName,
            anonymous: false,
            timestamp: Date.now(),
            verified_status: 'unverified',
            report_count: 1,
            authorUid: user.uid,
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.CREATE, path);
        }
      })();
    });
  }, [user, signIn]);

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
  }, []);

  const filteredIncidentsCount = useMemo(
    () =>
      incidents.filter((i) => selectedCategory === 'all' || i.category === selectedCategory).length,
    [incidents, selectedCategory]
  );

  // Incidents shown on the map — filtered by category, but emergencies always visible
  const mapIncidents = useMemo(() => {
    if (selectedCategory === 'all') return incidents;
    return incidents.filter(i => i.category === selectedCategory || i.category === 'emergency');
  }, [incidents, selectedCategory]);

  const handleViewNeighborhood = useCallback((neighborhood: string) => {
    setSelectedIncident(null);
    const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 1024;
    if (isDesktop) {
      const focusIncident = incidents
        .filter((incident) => incident.neighborhood === neighborhood)
        .sort((a, b) => b.timestamp - a.timestamp)[0];

      if (focusIncident) {
        mapRef.current?.flyToWithOffset(focusIncident.lat, focusIncident.lng, {
          zoom: 13,
          offsetX: 360,
          offsetY: 0,
        });
      }
    }
    setSelectedArea(getAreaIntelligence(neighborhood));
  }, [incidents, mapRef]);

  return (
    <div className="flex h-dvh w-full bg-slate-950 light:bg-slate-100 overflow-hidden font-sans relative">
      <AnimatePresence>
        {isLoading && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex bg-slate-950"
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

      {/* Geolocation error banner */}
      <AnimatePresence>
        {locationError && (
          <motion.div
            initial={{ opacity: 0, y: -40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -40 }}
            className="fixed top-4 max-lg:top-[max(0.75rem,env(safe-area-inset-top))] left-1/2 -translate-x-1/2 z-[200] flex items-center gap-3 px-4 py-2.5 bg-amber-900/90 border border-amber-500/40 rounded-2xl shadow-xl backdrop-blur-xl text-amber-200 text-xs font-bold"
          >
            <Navigation size={14} className="shrink-0" />
            Location access denied. Showing Calgary center instead.
            <button onClick={() => setLocationError(false)} className="ml-1 text-amber-400 hover:text-white transition-colors">
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sidebar Feed - Desktop */}
      <div className="hidden lg:flex flex-col h-full shrink-0 z-40 relative shadow-2xl">
        <Sidebar
          incidents={incidents}
          onIncidentClick={handleMarkerClick}
          selectedCategory={selectedCategory}
          onCategoryChange={setSelectedCategory}
          activeIncidentId={activeIncidentId}
          hasMore={hasMoreIncidents}
          isLoadingMore={isLoadingMoreIncidents}
          onLoadMore={handleLoadMoreIncidents}
        />
      </div>

      {/* Mobile Sidebar Drawer */}
      <AnimatePresence>
        {isSidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSidebarOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] lg:hidden"
            />
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 left-0 w-[85%] max-w-sm z-[70] lg:hidden"
            >
              <Sidebar
                incidents={incidents}
                onIncidentClick={(incident) => {
                  handleMarkerClick(incident);
                  setIsSidebarOpen(false);
                }}
                selectedCategory={selectedCategory}
                onCategoryChange={setSelectedCategory}
                activeIncidentId={activeIncidentId}
                hasMore={hasMoreIncidents}
                isLoadingMore={isLoadingMoreIncidents}
                onLoadMore={handleLoadMoreIncidents}
              />
              <button
                onClick={() => setIsSidebarOpen(false)}
                className="absolute top-6 right-[-50px] w-10 h-10 bg-slate-900 border border-white/10 rounded-full flex items-center justify-center text-white shadow-2xl"
              >
                <X size={24} />
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

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
          theme={theme}
          isPinMode={isPinMode || isEmergencyPinMode}
          onPinConfirm={isEmergencyPinMode ? handleEmergencyPinConfirm : handlePinConfirm}
          onPinCancel={isEmergencyPinMode ? handleEmergencyPinCancel : handlePinCancel}
        />

        {/* Mobile map chrome (Citizen-inspired glass bar + hero stats) - lg+ uses desktop header only */}
        <div
          className={cn(
            'absolute z-30 inset-x-0 top-0 pt-[max(0.5rem,env(safe-area-inset-top))] px-3 pb-2 pointer-events-none lg:hidden transition-all duration-300',
            theme === 'light' && 'text-slate-900',
            (isPinMode || isEmergencyPinMode) && 'opacity-0 invisible -translate-y-4'
          )}
        >
          <div className="flex items-center gap-2 pointer-events-auto">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-black/45 light:bg-white/90 backdrop-blur-xl border border-white/12 light:border-slate-200 shadow-lg text-sky-400 light:text-blue-600"
              aria-label="Back to home"
            >
              <Home size={18} />
            </button>
            <button
              type="button"
              onClick={() => setIsSidebarOpen(true)}
              className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl bg-black/45 light:bg-white/90 backdrop-blur-xl border border-white/12 light:border-slate-200 px-3.5 py-2.5 shadow-lg text-left active:scale-[0.99] transition-transform"
            >
              <Search size={16} className="shrink-0 text-sky-400/90 light:text-blue-600" />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-black uppercase tracking-[0.14em] text-sky-300/90 light:text-blue-700 truncate">
                  Calgary Watch
                </p>
                <p className="text-xs font-bold text-white/90 light:text-slate-800 truncate">
                  {selectedCategory === 'all' ? 'All live reports' : `${selectedCategory} reports`}
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-amber-400/20 border border-amber-400/35 px-2 py-0.5 text-[10px] font-black tabular-nums text-amber-200 light:text-amber-800">
                {filteredIncidentsCount}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setShowMobileFilters(!showMobileFilters)}
              className={cn(
                "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl backdrop-blur-xl border shadow-lg transition-colors",
                showMobileFilters 
                  ? "bg-blue-500/20 border-blue-500/40 text-blue-400 light:bg-slate-900 light:text-white"
                  : "bg-black/45 light:bg-white/90 border-white/12 light:border-slate-200 text-slate-200 light:text-slate-700"
              )}
              aria-label="Toggle map filters"
            >
              <Filter size={18} />
            </button>
          </div>
          
          {/* Mobile Category Filters Overflow */}
          <AnimatePresence>
            {showMobileFilters && (
              <motion.div
                initial={{ opacity: 0, height: 0, y: -10 }}
                animate={{ opacity: 1, height: 'auto', y: 0 }}
                exit={{ opacity: 0, height: 0, y: -10 }}
                className="overflow-hidden mt-3 pointer-events-auto"
              >
                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none snap-x padding-right-safe">
                  {['all', 'crime', 'traffic', 'infrastructure', 'weather', 'emergency'].map((cat) => {
                    const isSelected = selectedCategory === cat;
                    return (
                      <button
                        key={cat}
                        onClick={() => setSelectedCategory(cat as any)}
                        className={cn(
                          "shrink-0 snap-start px-4 py-2 rounded-full border text-xs font-bold uppercase tracking-widest transition-colors",
                          isSelected
                            ? "bg-slate-900/90 light:bg-slate-900 text-white border-white/20 light:border-slate-800"
                            : "bg-black/45 light:bg-white/90 text-slate-300 light:text-slate-700 border-white/12 light:border-slate-200 hover:bg-slate-800/80 light:hover:bg-slate-100"
                        )}
                      >
                        {cat}
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <div className="mt-2 flex justify-center pointer-events-none">
            <div className="inline-flex flex-col items-center rounded-2xl border border-white/8 bg-black/25 light:bg-white/50 px-4 py-2 backdrop-blur-md">
              <p className="text-center text-xl font-black tracking-tight text-amber-300 light:text-amber-700 drop-shadow-[0_2px_12px_rgba(0,0,0,0.35)]">
                {filteredIncidentsCount === 0
                  ? 'No reports in view'
                  : `${filteredIncidentsCount} live report${filteredIncidentsCount === 1 ? '' : 's'}`}
              </p>
              <p className="text-center text-[10px] font-semibold uppercase tracking-wider text-slate-300/90 light:text-slate-600 mt-0.5">
                Community-powered · verify before you act
              </p>
            </div>
          </div>
        </div>

        {/* Mobile vertical action buttons (right edge) */}
        <div
          className={cn(
            'absolute right-3 top-28 flex flex-col gap-2.5 z-30 pointer-events-none lg:hidden transition-all duration-300',
            theme === 'light' && 'text-slate-900',
            (isPinMode || isEmergencyPinMode) && 'opacity-0 invisible translate-x-4'
          )}
        >
          <button
            type="button"
            onClick={() => {
              const loc = userLocation || CALGARY_CENTER;
              mapRef.current?.flyTo(loc.lat, loc.lng, 13);
              
              // Find the closest important incident (emergency, crime, fire, etc.) within 5km
              const nearbyImportant = incidents
                .filter(i => i.category !== 'traffic')
                .map(i => ({ i, dist: getDistance(loc.lat, loc.lng, i.lat, i.lng) }))
                .filter(item => item.dist <= 5)
                .sort((a, b) => {
                  // Prioritize emergencies first, then distance
                  if (a.i.category === 'emergency' && b.i.category !== 'emergency') return -1;
                  if (b.i.category === 'emergency' && a.i.category !== 'emergency') return 1;
                  return a.dist - b.dist;
                })[0];

              if (nearbyImportant) {
                // Wait slightly for flyTo to begin
                setTimeout(() => {
                  setSelectedIncident(nearbyImportant.i);
                }, 600);
              }
            }}
            className="flex h-11 w-11 items-center justify-center rounded-2xl bg-black/45 light:bg-white/90 backdrop-blur-xl border border-white/12 light:border-slate-200 text-sky-400 light:text-blue-600 shadow-lg pointer-events-auto"
            aria-label="Recenter on your location"
          >
            <Navigation size={18} />
          </button>
          <button
            type="button"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="flex h-11 w-11 items-center justify-center rounded-2xl bg-black/45 light:bg-white/90 backdrop-blur-xl border border-white/12 light:border-slate-200 text-amber-300 light:text-amber-700 shadow-lg pointer-events-auto"
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <div className="relative pointer-events-auto">
            <button
              type="button"
              onClick={() => {
                setShowNotifications(!showNotifications);
                if (!showNotifications) setUnreadNotifications(0);
              }}
              className="relative flex h-11 w-11 items-center justify-center rounded-2xl bg-black/45 light:bg-white/90 backdrop-blur-xl border border-white/12 light:border-slate-200 text-slate-200 light:text-slate-700 shadow-lg"
              aria-label="Notifications"
            >
              <Bell size={18} className={cn(unreadNotifications > 0 && 'text-sky-400')} />
              {unreadNotifications > 0 && (
                <span className="absolute top-1.5 right-1.5 min-w-[14px] h-4 px-0.5 bg-red-500 text-white text-[9px] font-black rounded-full flex items-center justify-center border border-black/20">
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
                  className="absolute right-full mr-3 top-0 w-[min(18rem,calc(100vw-5rem))] bg-slate-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50 light:bg-white light:border-slate-300"
                >
                  <div className="p-3 border-b border-white/5 light:border-slate-100">
                    <h3 className="text-xs font-bold text-white light:text-slate-900">Notifications</h3>
                  </div>
                  <div className="max-h-52 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="p-3 text-[10px] text-slate-500 text-center">No new alerts.</div>
                    ) : (
                      notifications.map((n) => (
                        <div key={n.id} className="px-3 py-2.5 border-b border-white/5 light:border-slate-100">
                          <p className="text-[11px] font-bold text-white light:text-slate-900 line-clamp-2">{n.title}</p>
                          <p className="text-[9px] text-slate-500 mt-0.5">
                            {new Date(n.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      ))
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
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex h-11 w-11 items-center justify-center rounded-2xl overflow-hidden border border-white/15 light:border-slate-200 bg-black/45 light:bg-white shadow-lg"
                aria-label="Account menu"
              >
                {user.photoURL ? (
                  <img src={user.photoURL} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" crossOrigin="anonymous" />
                ) : (
                  <span className="text-xs font-black text-white light:text-slate-800">{(user.displayName?.[0] ?? user.email?.[0] ?? 'U').toUpperCase()}</span>
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={signIn}
                className="h-11 px-3.5 rounded-2xl bg-sky-600 text-white text-[10px] font-black uppercase tracking-wide shadow-lg border border-sky-400/30"
              >
                Sign in
              </button>
            )}
            <AnimatePresence>
              {showUserMenu && user && (
                <motion.div
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 8 }}
                  className="absolute right-full mr-3 top-0 w-52 rounded-2xl border border-white/10 bg-slate-900/98 backdrop-blur-xl shadow-2xl z-[60] light:bg-white light:border-slate-300 pointer-events-auto"
                >
                  <div className="p-3 border-b border-white/5">
                    <p className="text-xs font-bold text-white truncate light:text-slate-900">{user.displayName}</p>
                    <p className="text-[10px] text-slate-500 truncate">{user.email}</p>
                  </div>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => { navigate('/admin'); setShowUserMenu(false); }}
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-bold text-blue-400 hover:bg-blue-500/10 text-left"
                    >
                      <LayoutDashboard size={14} />
                      Admin
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => { logout(); setShowUserMenu(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-bold text-red-400 hover:bg-red-500/10 text-left rounded-b-2xl"
                  >
                    <LogOut size={14} />
                    Sign out
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Desktop top header - unchanged at lg+ */}
        <div className="absolute top-4 md:top-6 left-4 md:left-6 right-4 md:right-6 items-center justify-between pointer-events-none z-30 hidden lg:flex">
          <div className="flex items-center gap-2 md:gap-3 pointer-events-auto">
            <Button
              variant="secondary"
              size="icon"
              className="rounded-full w-10 h-10 md:w-12 md:h-12 bg-slate-950/80 light:bg-white/95 backdrop-blur-xl border border-white/10 light:border-slate-300 hover:border-blue-500/50 light:hover:border-slate-900/40 transition-all shadow-2xl"
              onClick={() => navigate('/')}
              title="Back to Landing Page"
            >
              <Home size={18} className="text-blue-400" />
            </Button>

            <Button
              variant="secondary"
              size="icon"
              className="rounded-full w-10 h-10 md:w-12 md:h-12 bg-slate-950/80 light:bg-white/95 backdrop-blur-xl border border-white/10 light:border-slate-300 hover:border-blue-500/50 light:hover:border-slate-900/40 transition-all shadow-2xl"
              onClick={() => {
                if (userLocation) {
                  mapRef.current?.flyTo(userLocation.lat, userLocation.lng);
                } else {
                  mapRef.current?.flyTo(CALGARY_CENTER.lat, CALGARY_CENTER.lng, 11);
                }
              }}
            >
              <Navigation size={18} className="text-blue-400" />
            </Button>
          </div>

          <div className="flex items-center gap-2 md:gap-3 pointer-events-auto">
            <Button
              variant="secondary"
              size="icon"
              className="rounded-full w-10 h-10 md:w-12 md:h-12 bg-slate-950/80 backdrop-blur-xl border border-white/10 hover:border-blue-500/50 transition-all shadow-2xl dark:bg-slate-950/80 light:bg-white/95 light:text-slate-900 light:border-slate-300"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            >
              {theme === 'dark' ? <Sun size={18} className="text-yellow-400" /> : <Moon size={18} className="text-blue-600" />}
            </Button>

            <div className="relative">
              <Button
                variant="secondary"
                size="icon"
                className="rounded-full w-12 h-12 bg-slate-950/80 backdrop-blur-xl border border-white/10 hover:border-blue-500/50 transition-all shadow-2xl light:bg-white/95 light:text-slate-900 light:border-slate-300"
                onClick={() => {
                  setShowNotifications(!showNotifications);
                  if (!showNotifications) setUnreadNotifications(0);
                }}
              >
                <Bell size={20} className={cn(unreadNotifications > 0 ? "text-blue-400 animate-bounce" : "text-slate-400")} />
                {unreadNotifications > 0 && (
                  <span className="absolute top-2 right-2 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-slate-950">
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
                    className="absolute right-0 mt-2 w-72 bg-slate-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50 light:bg-white light:border-slate-300"
                  >
                    <div className="p-4 border-b border-white/5 light:border-slate-100">
                      <h3 className="text-xs font-bold text-white light:text-slate-900">Notifications</h3>
                    </div>
                    <div className="max-h-64 overflow-y-auto">
                      {notifications.length === 0 ? (
                        <div className="p-4 text-[10px] text-slate-500 text-center">
                          No new alerts in your area.
                        </div>
                      ) : (
                        notifications.map((notification) => (
                          <div key={notification.id} className="px-4 py-3 border-b border-white/5 light:border-slate-100">
                            <p className="text-[11px] font-bold text-white light:text-slate-900 line-clamp-2">{notification.title}</p>
                            <p className="text-[10px] text-slate-500 mt-1">
                              {new Date(notification.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {user ? (
              <div className="relative">
                <button 
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="flex items-center gap-2 bg-slate-950/80 light:bg-white/95 backdrop-blur-xl border border-white/10 light:border-slate-300 rounded-full p-1 shadow-2xl hover:border-blue-500/50 light:hover:border-slate-900/40 transition-all"
                >
                  {user.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt=""
                      className="w-8 h-8 md:w-10 md:h-10 rounded-full border border-white/20"
                      referrerPolicy="no-referrer"
                      crossOrigin="anonymous"
                    />
                  ) : (
                    <div className="w-8 h-8 md:w-10 md:h-10 rounded-full border border-white/20 bg-blue-600 flex items-center justify-center text-white text-xs font-black">
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
                      className="absolute right-0 mt-2 w-52 bg-slate-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden light:bg-white light:border-slate-300"
                    >
                      <div className="p-4 border-b border-white/5">
                        <p className="text-xs font-bold text-white truncate">{user.displayName}</p>
                        <p className="text-[10px] text-slate-500 truncate mt-0.5">{user.email}</p>
                      </div>
                      {isAdmin && (
                        <button
                          onClick={() => {
                            navigate('/admin');
                            setShowUserMenu(false);
                          }}
                          className="w-full flex items-center gap-2 px-4 py-3 text-xs font-bold text-blue-400 hover:bg-blue-500/10 transition-colors text-left"
                        >
                          <LayoutDashboard size={14} />
                          Admin Portal
                        </button>
                      )}
                      <button 
                        onClick={() => {
                          logout();
                          setShowUserMenu(false);
                        }}
                        className="w-full flex items-center gap-2 px-4 py-3 text-xs font-bold text-red-400 hover:bg-red-500/10 transition-colors text-left"
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
                className="rounded-full h-12 px-6 flex items-center gap-2 bg-slate-950/80 light:bg-white/95 backdrop-blur-xl border border-white/10 light:border-slate-300 hover:border-blue-500/50 light:hover:border-slate-900/40 transition-all shadow-2xl"
                onClick={signIn}
              >
                <LogIn size={18} className="text-blue-400" />
                <span className="text-sm font-bold">Sign In</span>
              </Button>
            )}
          </div>
        </div>

        {/* FABs: Emergency SOS + Report Incident - extra lift on small screens for layer dock */}
        <div className={cn(
          "absolute right-4 md:right-8 z-30 flex flex-col items-end gap-3 max-lg:bottom-[calc(7.25rem+env(safe-area-inset-bottom))] md:max-lg:bottom-[calc(6.75rem+env(safe-area-inset-bottom))] bottom-28 md:bottom-32 transition-all duration-300",
          (isPinMode || isEmergencyPinMode) && "opacity-0 invisible translate-x-4 pointer-events-none"
        )}>
          {/* SOS Emergency Button */}
          <Button
            variant="primary"
            className="rounded-full w-14 h-14 md:w-16 md:h-16 flex items-center justify-center bg-red-600 hover:bg-red-500 shadow-2xl shadow-red-600/50 transition-all active:scale-90 group relative"
            onClick={() => {
              // Debounce: prevent rapid clicks
              const now = Date.now();
              if (now - buttonClickDebounceRef.current < 300) return;
              buttonClickDebounceRef.current = now;
              
              if (!user) { signIn(); return; }
              setIsEmergencyOpen(true);
            }}
          >
            <span className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-30" />
            <Siren size={24} className="relative z-10" />
            <div className="absolute right-full mr-4 px-3 py-1.5 bg-red-950 text-red-200 text-xs font-bold rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none border border-red-500/30 shadow-xl hidden md:block">
              Emergency Report
            </div>
          </Button>

          {/* Regular Report Button */}
          <Button
            variant="primary"
            className="rounded-full w-14 h-14 md:w-16 md:h-16 flex items-center justify-center bg-blue-600 hover:bg-blue-700 light:bg-slate-900 light:hover:bg-slate-800 shadow-2xl shadow-blue-500/40 light:shadow-slate-900/30 transition-all active:scale-90 group"
            onClick={() => {
              // Debounce: prevent rapid clicks
              const now = Date.now();
              if (now - buttonClickDebounceRef.current < 300) return;
              buttonClickDebounceRef.current = now;
              
              if (!user) {
                signIn();
              } else {
                setIsFormOpen(true);
                setConfirmedPinLocation(null);
                // Start neutral - user picks GPS or pin explicitly in the form.
                // Don't pre-fill with their home GPS coords.
                setSelectedLocation(CALGARY_CENTER);
              }
            }}
          >
            <Plus size={28} className="transition-transform group-hover:rotate-90 duration-150" />
            <div className="absolute right-full mr-4 px-3 py-1.5 bg-slate-950 text-white text-xs font-bold rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none border border-white/10 shadow-xl hidden md:block">
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
        />

        {/* Bottom Status & Disclaimer Bar - desktop / tablet only; mobile uses top chrome + layer bar */}
        <div className="absolute bottom-10 md:bottom-12 left-4 md:left-6 right-4 md:right-8 items-center justify-between pointer-events-none z-20 hidden lg:flex">
          <div className="flex items-center gap-2 px-2 md:px-3 py-1 md:py-1.5 bg-slate-950/60 light:bg-white/95 backdrop-blur-xl border border-white/5 light:border-slate-300 rounded-full shadow-lg">
            <div className="relative flex items-center justify-center w-1.5 h-1.5 md:w-2 md:h-2">
              <div className={cn(
                "absolute inset-0 rounded-full animate-ping opacity-75",
                incidents.length > 0 ? "bg-green-500" : "bg-slate-500"
              )} />
              <div className={cn(
                "relative w-1.5 h-1.5 md:w-2 md:h-2 rounded-full",
                incidents.length > 0 ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" : "bg-slate-500"
              )} />
            </div>
            <span className="text-[8px] md:text-[10px] font-bold text-slate-300 uppercase tracking-wider">
              {incidents.length} Live Reports
            </span>
          </div>

          <div className="flex items-center gap-2 px-2 md:px-3 py-1 md:py-1.5 bg-slate-950/60 light:bg-white/95 backdrop-blur-xl border border-white/5 light:border-slate-300 rounded-full shadow-lg">
            <ShieldAlert size={10} className="text-yellow-500" />
            <span className="text-[8px] md:text-[9px] font-medium text-slate-400 uppercase tracking-tight">
              Verify before action.
            </span>
          </div>
        </div>

        {/* Desktop & Mobile Panels */}
        <IncidentDetailPanel
          incident={selectedIncident}
          onClose={() => setSelectedIncident(null)}
          onViewNeighborhood={handleViewNeighborhood}
        />
        <AreaIntelligencePanel
          data={selectedArea}
          onClose={() => setSelectedArea(null)}
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
        />
      </main>

      {/* Global Background Animation (Subtle) */}
      <div className="fixed inset-0 pointer-events-none -z-10 bg-[radial-gradient(circle_at_50%_50%,rgba(30,58,138,0.1),transparent)]" />
    </div>
  );
}
