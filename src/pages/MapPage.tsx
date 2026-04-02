import { useState, useEffect, useCallback, useRef, startTransition } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import Map, { MapRef } from '@/src/components/Map';
import Sidebar from '@/src/components/Sidebar';
import IncidentForm, { IncidentFormData } from '@/src/components/IncidentForm';
import EmergencyModal from '@/src/components/EmergencyModal';
import AreaIntelligencePanel from '@/src/components/AreaIntelligencePanel';
import IncidentDetailPanel from '@/src/components/IncidentDetailPanel';
import LayerToggle from '@/src/components/LayerToggle';
import MobileBottomSheet from '@/src/components/MobileBottomSheet';
import { Button } from '@/src/components/ui/Button';
import { Incident, IncidentCategory, AreaIntelligence } from '@/src/types';
import { MOCK_INCIDENTS, getAreaIntelligence } from '@/src/services/mockData';
import { Plus, Navigation, ShieldAlert, LogOut, Database, Bell, Sun, Moon, Search, Filter, X, LogIn, Home, LayoutDashboard, Siren } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { CALGARY_CENTER } from '@/src/constants';
import { useAuth } from '@/src/components/FirebaseProvider';
import { db, handleFirestoreError, OperationType } from '@/src/firebase';
import { collection, onSnapshot, query, addDoc, orderBy, limit, getDocs, startAfter, QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';
import { cn } from '@/src/lib/utils';
import { SidebarSkeleton, MapShimmer } from '@/src/components/SkeletonLoader';

export default function MapPage() {
  const INCIDENT_PAGE_SIZE = 60;
  const { user, signIn, logout, isAuthReady, isAdmin } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const mapRef = useRef<MapRef>(null);
  
  const [incidents, setIncidents] = useState<Incident[]>(MOCK_INCIDENTS);
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
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof window === 'undefined') return 'dark';
    return localStorage.getItem('cw-theme') === 'light' ? 'light' : 'dark';
  });
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [notifications, setNotifications] = useState<{ id: string; title: string; timestamp: number }[]>([]);
  const [unreadNotifications, setUnreadNotifications] = useState<number>(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const [locationError, setLocationError] = useState(false);
  const [isEmergencyOpen, setIsEmergencyOpen] = useState(false);
  const [isLoadingMoreIncidents, setIsLoadingMoreIncidents] = useState(false);
  const [hasMoreIncidents, setHasMoreIncidents] = useState(false);
  const hasInitializedIncidents = useRef(false);
  const knownIncidentIds = useRef<Set<string>>(new Set());
  const lastVisibleIncidentDoc = useRef<QueryDocumentSnapshot<DocumentData> | null>(null);
  const buttonClickDebounceRef = useRef(0); // Prevent rapid button clicks

  // Check for report=true in URL
  useEffect(() => {
    if (searchParams.get('report') === 'true' && isAuthReady) {
      if (!user) {
        signIn();
      } else {
        setIsFormOpen(true);
        setSelectedLocation(userLocation || CALGARY_CENTER);
      }
    }
  }, [searchParams, isAuthReady, user, userLocation, signIn]);

  useEffect(() => {
    if (theme === 'light') {
      document.documentElement.classList.add('light');
    } else {
      document.documentElement.classList.remove('light');
    }
    localStorage.setItem('cw-theme', theme);
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

      setIncidents((prev) => {
        const merged = new globalThis.Map<string, Incident>();
        incidentData.forEach((incident) => merged.set(incident.id, incident));
        prev.forEach((incident) => {
          if (!merged.has(incident.id)) {
            merged.set(incident.id, incident);
          }
        });
        MOCK_INCIDENTS.forEach((mock) => {
          if (![...merged.values()].find((real) => real.title === mock.title)) {
            merged.set(mock.id, mock);
          }
        });
        return [...merged.values()].sort((a, b) => b.timestamp - a.timestamp);
      });
      hasInitializedIncidents.current = true;
      knownIncidentIds.current = new Set(incidentData.map((i) => i.id));
    }, (error) => {
      // Keep the map usable even if Firestore permissions are not deployed yet.
      console.error('Failed to subscribe to incidents:', error);
      setIncidents(MOCK_INCIDENTS);
    });

    return () => unsubscribe();
  }, [isAuthReady]);

  const handleLoadMoreIncidents = useCallback(async () => {
    if (isLoadingMoreIncidents || !hasMoreIncidents || !lastVisibleIncidentDoc.current) return;

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

      setIncidents((prev) => {
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

    // Show popup immediately — no waiting for pan animation.
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

  const handleMapClick = useCallback((lat: number, lng: number) => {
    if (isFormOpen) {
      setSelectedLocation({ lat, lng });
    }
  }, [isFormOpen]);

  const handleIncidentSubmit = useCallback((data: IncidentFormData & { lat: number; lng: number }) => {
    if (!user) {
      signIn();
      return;
    }

    const fallbackName = (user.email?.split('@')[0] || 'Calgary User').slice(0, 50);
    const fullName = (user.displayName && user.displayName.trim().length >= 2)
      ? user.displayName.trim()
      : (fallbackName.length >= 2 ? fallbackName : 'Calgary User');
    const firstName = fullName.split(/\s+/)[0]?.slice(0, 50) || 'Calgary User';
    const isAnonymous = Boolean(data.anonymous);

    const path = 'incidents';
    // Fire-and-forget: Don't await the Firestore write, let it happen in background
    startTransition(() => {
      (async () => {
        try {
          const { anonymous, ...incidentData } = data;
          await addDoc(collection(db, path), {
            ...incidentData,
            email: isAnonymous ? 'anonymous@calgarywatch.app' : (user.email || 'unknown@example.com'),
            name: isAnonymous ? 'Anonymous' : firstName,
            source_name: isAnonymous ? 'Anonymous' : firstName,
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

  const handleEmergencySubmit = useCallback((data: { category: string; title: string; description: string }) => {
    if (!user) { signIn(); return; }
    const fallbackName = (user.email?.split('@')[0] || 'Calgary User').slice(0, 50);
    const fullName = (user.displayName && user.displayName.trim().length >= 2)
      ? user.displayName.trim()
      : (fallbackName.length >= 2 ? fallbackName : 'Calgary User');
    const firstName = fullName.split(/\s+/)[0]?.slice(0, 50) || 'Calgary User';
    const loc = userLocation || CALGARY_CENTER;
    const path = 'incidents';
    
    // Fire-and-forget: Don't await the Firestore write, let it happen in background
    startTransition(() => {
      (async () => {
        try {
          await addDoc(collection(db, path), {
            title: data.title,
            description: data.description,
            category: data.category,
            neighborhood: 'Calgary',
            lat: loc.lat,
            lng: loc.lng,
            email: user.email || 'unknown@example.com',
            name: firstName,
            source_name: firstName,
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
  }, [user, signIn, userLocation]);

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
    <div className="flex h-screen w-full bg-slate-950 light:bg-slate-100 overflow-hidden font-sans relative">
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
            className="fixed top-4 left-1/2 -translate-x-1/2 z-[200] flex items-center gap-3 px-4 py-2.5 bg-amber-900/90 border border-amber-500/40 rounded-2xl shadow-xl backdrop-blur-xl text-amber-200 text-xs font-bold"
          >
            <Navigation size={14} className="shrink-0" />
            Location access denied — showing Calgary center instead.
            <button onClick={() => setLocationError(false)} className="ml-1 text-amber-400 hover:text-white transition-colors">
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sidebar Feed - Desktop */}
      <div className="hidden lg:block">
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
          incidents={incidents}
          onMarkerClick={handleMarkerClick}
          onMapClick={handleMapClick}
          onViewNeighborhood={handleViewNeighborhood}
          onViewIncident={setSelectedIncident}
          showLiveReports={showLiveReports}
          showHeatmap={showHeatmap}
          theme={theme}
        />

        {/* Top Header */}
        <div className="absolute top-4 md:top-6 left-4 md:left-6 right-4 md:right-6 flex items-center justify-between pointer-events-none z-30">
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
              className="lg:hidden rounded-full w-10 h-10 md:w-12 md:h-12 bg-slate-950/80 light:bg-white/95 backdrop-blur-xl border border-white/10 light:border-slate-300 hover:border-blue-500/50 light:hover:border-slate-900/40 transition-all shadow-2xl"
              onClick={() => setIsSidebarOpen(true)}
            >
              <Database size={18} className="text-blue-400" />
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

        {/* FABs: Emergency SOS + Report Incident */}
        <div className="absolute bottom-28 md:bottom-32 right-4 md:right-8 z-30 flex flex-col items-end gap-3">
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
                setSelectedLocation(userLocation || CALGARY_CENTER);
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

        {/* Bottom Status & Disclaimer Bar */}
        <div className="absolute bottom-10 md:bottom-12 left-4 md:left-6 right-4 md:right-8 flex items-center justify-between pointer-events-none z-20">
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
          onClose={() => setIsEmergencyOpen(false)}
          onSubmit={handleEmergencySubmit}
          location={userLocation}
          userName={
            user
              ? ((user.displayName?.split(/\s+/)[0]) || user.email?.split('@')[0] || 'User')
              : 'User'
          }
        />

        {/* Incident Form Modal */}
        <IncidentForm
          isOpen={isFormOpen}
          onClose={() => setIsFormOpen(false)}
          onSubmit={handleIncidentSubmit}
          location={selectedLocation}
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
