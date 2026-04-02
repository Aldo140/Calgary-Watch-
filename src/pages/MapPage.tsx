import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import Map, { MapRef } from '@/src/components/Map';
import Sidebar from '@/src/components/Sidebar';
import IncidentForm from '@/src/components/IncidentForm';
import AreaIntelligencePanel from '@/src/components/AreaIntelligencePanel';
import IncidentDetailPanel from '@/src/components/IncidentDetailPanel';
import LayerToggle from '@/src/components/LayerToggle';
import MobileBottomSheet from '@/src/components/MobileBottomSheet';
import { Button } from '@/src/components/ui/Button';
import { Incident, IncidentCategory, AreaIntelligence } from '@/src/types';
import { MOCK_INCIDENTS, getAreaIntelligence } from '@/src/services/mockData';
import { Plus, Navigation, ShieldAlert, LogOut, Database, Bell, Sun, Moon, Search, Filter, X, LogIn, Home, LayoutDashboard } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { CALGARY_CENTER } from '@/src/constants';
import { useAuth } from '@/src/components/FirebaseProvider';
import { db, handleFirestoreError, OperationType } from '@/src/firebase';
import { collection, onSnapshot, query, addDoc, orderBy, writeBatch, doc } from 'firebase/firestore';
import { cn } from '@/src/lib/utils';
import { SidebarSkeleton, MapShimmer } from '@/src/components/SkeletonLoader';

export default function MapPage() {
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
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [notifications, setNotifications] = useState<number>(3);
  const [unreadNotifications, setUnreadNotifications] = useState<number>(3);
  const [showNotifications, setShowNotifications] = useState(false);
  const [isAreaIntelligenceOpen, setIsAreaIntelligenceOpen] = useState(false);
  const [selectedNeighborhood, setSelectedNeighborhood] = useState<string | null>(null);

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
        (error) => console.error('Error getting location:', error)
      );
    }
  }, []);

  // Real-time incidents listener
  useEffect(() => {
    if (!isAuthReady) return;

    const q = query(collection(db, 'incidents'), orderBy('timestamp', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const incidentData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Incident[];
      
      const mergedData = [...incidentData];
      MOCK_INCIDENTS.forEach(mock => {
        if (!mergedData.find(real => real.title === mock.title)) {
          mergedData.push(mock);
        }
      });
      
      setIncidents(mergedData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'incidents');
    });

    return () => unsubscribe();
  }, [isAuthReady]);

  const handleMarkerClick = useCallback((incident: Incident) => {
    setSelectedIncident(incident);
    setActiveIncidentId(incident.id);
    mapRef.current?.flyTo(incident.lat, incident.lng, 15);
    mapRef.current?.showPopup(incident);
  }, []);

  const handleMapClick = useCallback((lat: number, lng: number) => {
    if (isFormOpen) {
      setSelectedLocation({ lat, lng });
    }
  }, [isFormOpen]);

  const handleIncidentSubmit = async (data: any) => {
    if (!user) {
      signIn();
      return;
    }

    const path = 'incidents';
    try {
      await addDoc(collection(db, path), {
        ...data,
        timestamp: Date.now(),
        verified_status: 'unverified',
        report_count: 1,
        authorUid: user.uid,
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  };

  const handleViewNeighborhood = (neighborhood: string) => {
    setSelectedArea(getAreaIntelligence(neighborhood));
  };

  return (
    <div className="flex h-screen w-full bg-slate-950 overflow-hidden font-sans relative">
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

      {/* Sidebar Feed - Desktop */}
      <div className="hidden lg:block">
        <Sidebar
          incidents={incidents}
          onIncidentClick={handleMarkerClick}
          selectedCategory={selectedCategory}
          onCategoryChange={setSelectedCategory}
          activeIncidentId={activeIncidentId}
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
          onViewNeighborhood={(neighborhood) => {
            setSelectedNeighborhood(neighborhood);
            setIsAreaIntelligenceOpen(true);
          }}
          onViewIncident={setSelectedIncident}
          showLiveReports={showLiveReports}
          showHeatmap={showHeatmap}
        />

        {/* Top Header */}
        <div className="absolute top-4 md:top-6 left-4 md:left-6 right-4 md:right-6 flex items-center justify-between pointer-events-none z-30">
          <div className="flex items-center gap-2 md:gap-3 pointer-events-auto">
            <Button
              variant="secondary"
              size="icon"
              className="rounded-full w-10 h-10 md:w-12 md:h-12 bg-slate-950/80 backdrop-blur-xl border border-white/10 hover:border-blue-500/50 transition-all shadow-2xl"
              onClick={() => navigate('/')}
              title="Back to Landing Page"
            >
              <Home size={18} className="text-blue-400" />
            </Button>

            <Button
              variant="secondary"
              size="icon"
              className="lg:hidden rounded-full w-10 h-10 md:w-12 md:h-12 bg-slate-950/80 backdrop-blur-xl border border-white/10 hover:border-blue-500/50 transition-all shadow-2xl"
              onClick={() => setIsSidebarOpen(true)}
            >
              <Database size={18} className="text-blue-400" />
            </Button>
            
            <Button
              variant="secondary"
              size="icon"
              className="rounded-full w-10 h-10 md:w-12 md:h-12 bg-slate-950/80 backdrop-blur-xl border border-white/10 hover:border-blue-500/50 transition-all shadow-2xl"
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
              className="rounded-full w-10 h-10 md:w-12 md:h-12 bg-slate-950/80 backdrop-blur-xl border border-white/10 hover:border-blue-500/50 transition-all shadow-2xl dark:bg-slate-950/80 light:bg-white/80 light:text-slate-900 light:border-slate-200"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            >
              {theme === 'dark' ? <Sun size={18} className="text-yellow-400" /> : <Moon size={18} className="text-blue-600" />}
            </Button>

            <div className="relative">
              <Button
                variant="secondary"
                size="icon"
                className="rounded-full w-12 h-12 bg-slate-950/80 backdrop-blur-xl border border-white/10 hover:border-blue-500/50 transition-all shadow-2xl light:bg-white/80 light:text-slate-900 light:border-slate-200"
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
                    className="absolute right-0 mt-2 w-64 bg-slate-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50 light:bg-white light:border-slate-200"
                  >
                    <div className="p-4 border-b border-white/5 light:border-slate-100">
                      <h3 className="text-xs font-bold text-white light:text-slate-900">Notifications</h3>
                    </div>
                    <div className="max-h-64 overflow-y-auto">
                      <div className="p-4 text-[10px] text-slate-500 text-center">
                        No new alerts in your area.
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {user ? (
              <div className="relative">
                <button 
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="flex items-center gap-2 bg-slate-950/80 backdrop-blur-xl border border-white/10 rounded-full p-1 shadow-2xl hover:border-blue-500/50 transition-all"
                >
                  <img src={user.photoURL || ''} alt="" className="w-8 h-8 md:w-10 md:h-10 rounded-full border border-white/20" referrerPolicy="no-referrer" />
                </button>
                
                <AnimatePresence>
                  {showUserMenu && (
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      className="absolute right-0 mt-2 w-48 bg-slate-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
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
                className="rounded-full h-12 px-6 flex items-center gap-2 bg-slate-950/80 backdrop-blur-xl border border-white/10 hover:border-blue-500/50 transition-all shadow-2xl"
                onClick={signIn}
              >
                <LogIn size={18} className="text-blue-400" />
                <span className="text-sm font-bold">Sign In</span>
              </Button>
            )}
          </div>
        </div>

        {/* Report Incident FAB */}
        <div className="absolute bottom-20 md:bottom-24 right-4 md:right-8 z-30">
          <Button
            variant="primary"
            className="rounded-full w-14 h-14 md:w-16 md:h-16 flex items-center justify-center bg-blue-600 hover:bg-blue-700 shadow-2xl shadow-blue-500/40 transition-all active:scale-90 group"
            onClick={() => {
              if (!user) {
                signIn();
              } else {
                setIsFormOpen(true);
                setSelectedLocation(userLocation || CALGARY_CENTER);
              }
            }}
          >
            <Plus size={28} className="transition-transform group-hover:rotate-90" />
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
        <div className="absolute bottom-4 md:bottom-6 left-4 md:left-6 right-4 md:right-8 flex items-center justify-between pointer-events-none z-20">
          <div className="flex items-center gap-2 px-2 md:px-3 py-1 md:py-1.5 bg-slate-950/60 backdrop-blur-xl border border-white/5 rounded-full shadow-lg">
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

          <div className="flex items-center gap-2 px-2 md:px-3 py-1 md:py-1.5 bg-slate-950/60 backdrop-blur-xl border border-white/5 rounded-full shadow-lg">
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

        {/* Incident Form Modal */}
        <IncidentForm
          isOpen={isFormOpen}
          onClose={() => setIsFormOpen(false)}
          onSubmit={handleIncidentSubmit}
          location={selectedLocation}
        />
      </main>

      {/* Global Background Animation (Subtle) */}
      <div className="fixed inset-0 pointer-events-none -z-10 bg-[radial-gradient(circle_at_50%_50%,rgba(30,58,138,0.1),transparent)]" />
    </div>
  );
}
