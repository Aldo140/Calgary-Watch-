import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import L from 'leaflet';
import type { TrafficCamera } from '@/src/hooks/useTrafficCameras';
import type { SafetyCamera } from '@/src/hooks/useSafetyCameras';
import type { TrafficSegmentState } from '@/src/types/trafficFlow';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { MaplibreGL } from '@maplibre/maplibre-gl-leaflet';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

// Expose Leaflet globally for plugins
if (typeof window !== 'undefined') {
  (window as any).L = L;
}
import { CALGARY_CENTER } from '@/src/constants';
import { Incident } from '@/src/types';
import { isCitySignal, isSafety311 } from '@/src/lib/crimeBoard';
import { LIVE, TRAFFIC_FLOW } from '@/src/lib/tokens';
import { createCalgaryWatchPositronStyle, OPENFREEMAP_POSITRON_STYLE_URL } from '@/src/lib/mapBasemap';
import {
  buildClusterElement,
  buildPinElement,
  buildPopupContent,
  community311Step,
  COMMUNITY_311_RAMP,
  COMMUNITY_311_STEPS,
  HEAT_GRADIENT,
} from '@/src/components/map/canvas/markerKit';
import '../styles/map-canvas.css';

interface MapProps {
  incidents: Incident[];
  onMarkerClick: (incident: Incident) => void;
  onMapClick?: (lat: number, lng: number) => void;
  onViewNeighborhood?: (neighborhood: string) => void;
  onViewIncident?: (incident: Incident) => void;
  showLiveReports: boolean;
  showHeatmap: boolean;
  /** When true, renders a fixed crosshair pin at screen center for location picking */
  isPinMode?: boolean;
  onPinConfirm?: (lat: number, lng: number) => void;
  onPinCancel?: () => void;
  showCrimeLayer?: boolean;
  /** City traffic cameras, plotted when the layer is on. */
  trafficCameras?: TrafficCamera[];
  /** Intersection safety cameras — the ones that issue tickets. */
  safetyCameras?: SafetyCamera[];
  /** Privacy-safe aggregate road states, rendered as coloured polylines. */
  trafficSegments?: TrafficSegmentState[];
  selectedTrafficSegmentId?: string | null;
  crimeStats?: Map<string, { crime: number; disorder: number; year: number }>;
  /** A camera pin was tapped — the page opens the large viewer. */
  onCameraSelect?: (camera: TrafficCamera) => void;
  onTrafficSegmentSelect?: (segment: TrafficSegmentState) => void;
  isMapInteractive?: boolean;
}

export interface MapRef {
  flyTo: (lat: number, lng: number, zoom?: number) => void;
  flyToWithOffset: (
    lat: number,
    lng: number,
    options?: { zoom?: number; offsetX?: number; offsetY?: number; onComplete?: () => void }
  ) => void;
  showPopup: (incident: Incident) => void;
  /** Returns the current map center - used by pin-mode to capture coordinates */
  getCenter: () => { lat: number; lng: number } | null;
  /** Show a pulsing blue dot at the user's location */
  showUserLocation: (lat: number, lng: number) => void;
  /** Remove the user location marker */
  clearUserLocation: () => void;
}

const Map = forwardRef<MapRef, MapProps>(({ incidents, onMarkerClick, onMapClick, onViewNeighborhood, onViewIncident, showLiveReports, showHeatmap, isPinMode = false, onPinConfirm, onPinCancel, showCrimeLayer = false, trafficCameras, safetyCameras, trafficSegments, selectedTrafficSegmentId, crimeStats, onCameraSelect, onTrafficSegmentSelect, isMapInteractive = true }, ref) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const markers = useRef<{ [key: string]: L.Marker }>({});
  const clusterGroup = useRef<any>(null);
  const heatmapLayer = useRef<any>(null);
  const cameraLayer = useRef<L.LayerGroup | null>(null);
  const safetyCameraLayer = useRef<L.LayerGroup | null>(null);
  const trafficFlowLayer = useRef<L.LayerGroup | null>(null);
  const baseMapLayer = useRef<L.Layer | null>(null);
  const popup = useRef<L.Popup | null>(null);
  const serviceAreaLayer = useRef<L.LayerGroup | null>(null);
  const serviceAreaBounds = useRef<L.LatLngBounds | null>(null);
  const incidentsRef = useRef<Incident[]>(incidents);
  const choroplethLayer = useRef<L.GeoJSON | null>(null);
  const communityGeoJson = useRef<any>(null);
  const userLocationMarker = useRef<L.Marker | null>(null);
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [isHeatPluginReady, setIsHeatPluginReady] = useState(false);
  const [isOutsideServiceArea, setIsOutsideServiceArea] = useState(false);
  // Live map centre - updated on every move event so the pin overlay shows real coords
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [isSettling, setIsSettling] = useState(false);
  const [camerasHiddenByZoom, setCamerasHiddenByZoom] = useState(false);

  // Callback refs - keep the single Leaflet click handler up-to-date with latest props
  // without needing to re-register it on every render.
  const isPinModeRef = useRef(isPinMode);
  const onPinConfirmRef = useRef(onPinConfirm);
  const onMapClickRef = useRef(onMapClick);
  const onCameraSelectRef = useRef(onCameraSelect);
  const onTrafficSegmentSelectRef = useRef(onTrafficSegmentSelect);
  // Popup buttons, choropleth polygons and pins are wired once in Leaflet, so
  // they read the latest callbacks through refs. The popup's "Area intel"
  // handler used to capture the first render's onViewNeighborhood, which on a
  // first visit had no incidents or 311 stats yet.
  const onViewNeighborhoodRef = useRef(onViewNeighborhood);
  const onViewIncidentRef = useRef(onViewIncident);
  const onMarkerClickRef = useRef(onMarkerClick);

  // Update refs on every render (no dep array → always current)
  useEffect(() => { onViewNeighborhoodRef.current = onViewNeighborhood; });
  useEffect(() => { onViewIncidentRef.current = onViewIncident; });
  useEffect(() => { onMarkerClickRef.current = onMarkerClick; });
  useEffect(() => { isPinModeRef.current = isPinMode; });
  useEffect(() => { onPinConfirmRef.current = onPinConfirm; });
  useEffect(() => { onMapClickRef.current = onMapClick; });
  useEffect(() => { onCameraSelectRef.current = onCameraSelect; });
  useEffect(() => { onTrafficSegmentSelectRef.current = onTrafficSegmentSelect; });

  useEffect(() => {
    incidentsRef.current = incidents;
  }, [incidents]);

  const toLabel = (value: unknown, fallback = '') => {
    if (typeof value !== 'string') return fallback;
    return value;
  };

  const getReporterDisplay = (incident: Incident) => {
    const rawName = incident.name?.trim() || 'Community Member';
    const anonymous = Boolean(incident.anonymous) || rawName.toLowerCase() === 'anonymous' || rawName.toLowerCase().includes('anonymous');
    const firstName = anonymous ? 'Anonymous' : (rawName.split(/\s+/)[0] || 'Community');
    const initial = firstName.charAt(0).toUpperCase() || 'C';
    return { anonymous, firstName, initial };
  };

  useImperativeHandle(ref, () => ({
    flyTo: (lat: number, lng: number, zoom = 14) => {
      if (map.current) {
        map.current.flyTo([lat, lng], zoom, {
          duration: 0.55,
          easeLinearity: 0.5
        });
      }
    },
    flyToWithOffset: (lat: number, lng: number, options) => {
      if (!map.current) return;

      const zoom = options?.zoom ?? map.current.getZoom();
      const offsetX = options?.offsetX ?? 0;
      const offsetY = options?.offsetY ?? 0;
      const targetPoint = map.current.project([lat, lng], zoom);
      const adjustedCenterPoint = targetPoint.add([offsetX, offsetY]);
      const adjustedCenterLatLng = map.current.unproject(adjustedCenterPoint, zoom);

      if (options?.onComplete) {
        map.current.once('moveend', options.onComplete);
      }

      map.current.flyTo(adjustedCenterLatLng, zoom, {
        duration: 0.55,
        easeLinearity: 0.5
      });
    },
    getCenter: () => {
      if (!map.current) return null;
      const c = map.current.getCenter();
      return { lat: c.lat, lng: c.lng };
    },
    showUserLocation: (lat: number, lng: number) => {
      if (!map.current) return;
      if (userLocationMarker.current) {
        userLocationMarker.current.remove();
      }
      const el = document.createElement('div');
      el.className = 'lv-you';
      el.innerHTML = '<span class="lv-you__pulse"></span><span class="lv-you__dot"></span>';
      const icon = L.divIcon({ html: el, className: '', iconSize: [28, 28], iconAnchor: [14, 14] });
      userLocationMarker.current = L.marker([lat, lng], { icon, zIndexOffset: 1000, interactive: false }).addTo(map.current);
    },
    clearUserLocation: () => {
      if (userLocationMarker.current) {
        userLocationMarker.current.remove();
        userLocationMarker.current = null;
      }
    },

    showPopup: (incident: Incident) => {
      if (!map.current) return;
      
      if (popup.current) {
        popup.current.remove();
      }
      // A reporter's photo is the most useful thing in the popup, so it leads.
      // buildPopupContent renders incident.image_url and hides the frame if
      // the image fails to decode rather than leaving a broken placeholder.
      const wrapper = buildPopupContent(incident, { reporterFirstName: getReporterDisplay(incident).firstName });

      const openPopup = () => {
        popup.current = L.popup({
          closeButton: false,
          className: 'custom-leaflet-popup lv-popup-shell',
          maxWidth: 312,
          minWidth: 264,
          offset: [0, -14]
        })
          .setLatLng([incident.lat, incident.lng])
          .setContent(wrapper)
          .openOn(map.current!);
      };

      // Yield one frame before opening to avoid visible hitch right after pan.
      window.requestAnimationFrame(openPopup);
    }
  }));

  // Load leaflet.heat plugin after component mounts
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (typeof (L as any).heatLayer === 'function' || typeof (window as any).L?.heatLayer === 'function') {
      setIsHeatPluginReady(true);
      return;
    }

    let cancelled = false;
    import('leaflet.heat')
      .then(() => {
        if (!cancelled) {
          setIsHeatPluginReady(typeof (L as any).heatLayer === 'function' || typeof (window as any).L?.heatLayer === 'function');
        }
      })
      .catch((error) => {
        console.warn('Leaflet.heat plugin failed to load.', error);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (map.current || !mapContainer.current) return;
    const containerEl = mapContainer.current;
    let popupClickHandler: ((e: Event) => void) | null = null;
    let basemapCancelled = false;
    let basemapTimeout: number | null = null;
    let vectorBaseLayer: InstanceType<typeof MaplibreGL> | null = null;

    try {
      // Initialize Leaflet map
      // A phone at zoom 11 shows only the inner city, so Seton, Tuscany and
      // Saddle Ridge open off-screen and every pin seems to be downtown. Zoom
      // 10 fits the whole city between the phone bar and the sheet; the
      // centre sits a little north because the bar covers more than the sheet.
      const narrow = containerEl.clientWidth < 640;
      map.current = L.map(containerEl, {
        center: [CALGARY_CENTER.lat + (narrow ? 0.035 : 0), CALGARY_CENTER.lng],
        zoom: narrow ? 10 : 11,
        zoomControl: true,
        // @ts-expect-error tap is a valid Leaflet MapOptions at runtime but missing from typedefs
        tap: false,
      });

      // Move zoom control to bottom left
      if (map.current.zoomControl) {
        map.current.zoomControl.setPosition('bottomleft');
      }

      // Start with a dependable raster canvas, then promote the modern vector
      // basemap only after it has loaded. Users never see an empty map when
      // WebGL, the style request, or OpenFreeMap is unavailable.
      const fallbackLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map.current);
      baseMapLayer.current = fallbackLayer;

      const loadModernBasemap = async () => {
        try {
          const response = await fetch(OPENFREEMAP_POSITRON_STYLE_URL);
          if (!response.ok) return;
          const providerStyle = await response.json();
          if (basemapCancelled || !map.current) return;

          // Keep the heavier vector renderer off the initial map-page path.
          // The raster canvas is interactive immediately while this downloads.
          const [{ maplibreGL }, { setWorkerUrl }] = await Promise.all([
            import('@maplibre/maplibre-gl-leaflet'),
            import('maplibre-gl'),
          ]);
          if (basemapCancelled || !map.current) return;
          setWorkerUrl(maplibreWorkerUrl);

          vectorBaseLayer = maplibreGL({
            style: createCalgaryWatchPositronStyle(providerStyle),
            interactive: false,
            attributionControl: {
              customAttribution: 'OpenFreeMap © OpenMapTiles · Data © OpenStreetMap contributors',
            },
          }).addTo(map.current);

          const vectorMap = vectorBaseLayer.getMaplibreMap();
          vectorBaseLayer.getContainer().style.zIndex = '2';
          let resourceFailures = 0;
          let promoted = false;

          const restoreFallback = () => {
            if (basemapCancelled || !map.current || !vectorBaseLayer) return;
            vectorBaseLayer.remove();
            vectorBaseLayer = null;
            if (!map.current.hasLayer(fallbackLayer)) fallbackLayer.addTo(map.current);
            baseMapLayer.current = fallbackLayer;
          };

          vectorMap.on('error', () => {
            resourceFailures += 1;
            if (resourceFailures >= 3) restoreFallback();
          });

          const promoteVectorBasemap = () => {
            if (basemapCancelled || !map.current || !vectorBaseLayer) return;
            promoted = true;
            if (basemapTimeout !== null) window.clearTimeout(basemapTimeout);
            fallbackLayer.remove();
            baseMapLayer.current = vectorBaseLayer;
          };

          // With an in-memory style MapLibre can finish its first load during
          // the Leaflet adapter's addTo() call. Check synchronously, then keep
          // both lifecycle events as guards for slower devices and networks.
          if (vectorMap.loaded()) promoteVectorBasemap();
          else {
            vectorMap.once('load', promoteVectorBasemap);
            vectorMap.once('idle', promoteVectorBasemap);
          }

          basemapTimeout = window.setTimeout(() => {
            if (!promoted) restoreFallback();
          }, 10_000);
        } catch {
          // The raster layer is already visible and intentionally needs no key.
        }
      };

      void loadModernBasemap();

      // Use refs so this single handler always calls the latest callbacks.
      // (Leaflet handlers set up here can't close over changing React props.)
      map.current.on('click', (e: L.LeafletMouseEvent) => {
        if (isPinModeRef.current) {
          // Tap-to-pin: tapping the map in pin mode instantly places the pin
          onPinConfirmRef.current?.(e.latlng.lat, e.latlng.lng);
        } else {
          onMapClickRef.current?.(e.latlng.lat, e.latlng.lng);
        }
      });

      // Handle popup button clicks
      popupClickHandler = (e: Event) => {
        const target = e.target as HTMLElement;
        const btn = target.closest('button');
        if (!btn) return;

        if (btn.classList.contains('learn-more-btn')) {
          const neighborhood = btn.getAttribute('data-neighborhood');
          if (neighborhood) onViewNeighborhoodRef.current?.(neighborhood);
        } else if (btn.classList.contains('view-details-btn')) {
          const id = btn.getAttribute('data-id');
          const incident = incidentsRef.current.find(i => i.id === id);
          if (incident) onViewIncidentRef.current?.(incident);
        }
      };

      containerEl.addEventListener('click', popupClickHandler);

      setIsMapLoaded(true);
    } catch (err) {
      console.error('Failed to initialize Leaflet:', err);
    }

    return () => {
      basemapCancelled = true;
      if (basemapTimeout !== null) window.clearTimeout(basemapTimeout);
      if (popupClickHandler) {
        containerEl.removeEventListener('click', popupClickHandler);
      }
      clusterGroup.current?.remove();
      clusterGroup.current = null;
      map.current?.remove();
      map.current = null;
      baseMapLayer.current = null;
    };
  }, []);

  // Calgary service perimeter + outside-area notice logic.
  useEffect(() => {
    if (!map.current || !isMapLoaded) return;

    const calgaryBounds = L.latLngBounds(
      [49.90, -116.00], // SW — south of Lethbridge/Nanton, west of Canmore
      [53.90, -112.75], // NE — Edmonton region north, Gleichen / Vulcan east
    );
    serviceAreaBounds.current = calgaryBounds;

    if (!serviceAreaLayer.current) {
      const perimeter = L.rectangle(calgaryBounds, {
        color: LIVE.blue,
        weight: 1.5,
        opacity: 0.45,
        dashArray: '6 6',
        fill: false,
      });

      const centerMarker = L.circleMarker([CALGARY_CENTER.lat, CALGARY_CENTER.lng], {
        radius: 4,
        color: '#FFFFFF',
        fillColor: LIVE.navy,
        fillOpacity: 1,
        weight: 2,
      });

      serviceAreaLayer.current = L.layerGroup([perimeter, centerMarker]).addTo(map.current);
    }

    const updateOutsideState = () => {
      if (!map.current || !serviceAreaBounds.current) return;
      const zoom = map.current.getZoom();
      const center = map.current.getCenter();
      const outByZoom = zoom <= 9;
      const outByCenter = !serviceAreaBounds.current.contains(center);
      setIsOutsideServiceArea(outByZoom || outByCenter);
    };

    updateOutsideState();
    map.current.on('moveend zoomend', updateOutsideState);

    return () => {
      map.current?.off('moveend zoomend', updateOutsideState);
    };
  }, [isMapLoaded]);

  // Set up marker cluster group once map is ready.
  // Separated from the init effect so a plugin-load failure never blocks
  // isMapLoaded from being set to true.
  useEffect(() => {
    if (!map.current || !isMapLoaded) return;
    if (clusterGroup.current) return; // already created

    const lAny = L as any;
    if (typeof lAny.markerClusterGroup !== 'function') return;

    clusterGroup.current = lAny.markerClusterGroup({
      // Navy bubble, white count, and a thin ring split by category mix.
      // A cluster that holds an emergency shows it in the ring and says so to
      // screen readers, without turning the whole bubble into an alarm.
      iconCreateFunction: (cluster: any) => {
        const children = cluster.getAllChildMarkers();
        const { el, size } = buildClusterElement(children.map((m: any) => String(m.cwCategory ?? '')));
        return L.divIcon({ html: el, className: 'lv-cluster-icon', iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
      },
      // Tighter on phones, where the whole city is on screen at zoom 10.
      maxClusterRadius: (zoom: number) => (zoom <= 10 ? 34 : 48),
      zoomToBoundsOnClick: true,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      animate: true,
      disableClusteringAtZoom: 17,
    });
    // Leaflet makes divIcon markers focusable but only opens popups on Enter,
    // so a focused cluster zooms in on Enter or Space like a click would.
    clusterGroup.current.on('clusterkeypress', (e: any) => {
      const key = e.originalEvent?.key;
      if (key === 'Enter' || key === ' ') {
        e.originalEvent.preventDefault?.();
        e.layer?.zoomToBounds?.({ padding: [40, 40] });
      }
    });
    clusterGroup.current.addTo(map.current);
  }, [isMapLoaded]);

  // No Leaflet dragging.disable() here — the form modal's fixed inset-0 backdrop
  // already intercepts all touch/pointer events when the form is open, so we never
  // need to tell Leaflet the map is "inactive". Calling disable() removes Leaflet's
  // touch-action:none from the mapPane; subsequent enable() doesn't reliably restore
  // native gesture state, leaving drag broken until a full page reload.

  // Track live map centre while in pin mode
  useEffect(() => {
    if (!map.current || !isMapLoaded) return;
    if (!isPinMode) { setMapCenter(null); return; }

    const update = () => {
      if (!map.current) return;
      const c = map.current.getCenter();
      setMapCenter({ lat: c.lat, lng: c.lng });
    };
    update(); // seed immediately when pin mode activates
    // Settling state drives the reticle: it only pulses while the map is
    // actually moving, so the animation reports something instead of
    // decorating. A still reticle means the coordinate under it is final.
    const start = () => setIsSettling(true);
    const end = () => setIsSettling(false);
    map.current.on('move', update);
    map.current.on('movestart', start);
    map.current.on('moveend', end);
    return () => {
      map.current?.off('move', update);
      map.current?.off('movestart', start);
      map.current?.off('moveend', end);
    };
  }, [isPinMode, isMapLoaded]);

  // Fetch Calgary community boundaries once for choropleth.
  // boundsReady re-fires the choropleth effect when data lands — previously,
  // toggling the layer before this fetch finished rendered nothing forever.
  const [boundsReady, setBoundsReady] = useState(false);
  useEffect(() => {
    if (communityGeoJson.current) return;
    fetch('https://data.calgary.ca/resource/surr-xmvs.json?$limit=500')
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) { communityGeoJson.current = data; setBoundsReady(true); } })
      .catch(err => console.warn('[CalgaryWatch] Community boundaries fetch failed:', err));
  }, []);

  useEffect(() => {
    if (!map.current || !isMapLoaded) return;

    if (choroplethLayer.current) {
      map.current.removeLayer(choroplethLayer.current);
      choroplethLayer.current = null;
    }

    if (!showCrimeLayer || !crimeStats || crimeStats.size === 0 || !communityGeoJson.current) return;

    const geoData = communityGeoJson.current;

    const features = geoData
      .filter((row: any) => row.multipolygon)
      .map((row: any) => ({
        type: 'Feature',
        properties: {
          name: (row.name ?? row.comm_name ?? row.community_name ?? '').toLowerCase(),
        },
        geometry: row.multipolygon,
      }));

    if (!features.length) return;

    const featureCollection = { type: 'FeatureCollection', features };

    // ── Neighbourhood 311 ramp ─────────────────────────────────────────────
    // City 311 service requests per community, not crime. One brand-blue
    // ramp, cut at the quartiles of communities that have data, so it reads
    // as "fewer … more than most communities" with no rank and no heat.
    const totalFor = (name: string): number | null => {
      const entry = crimeStats.get(name);
      return entry ? entry.crime + entry.disorder : null;
    };
    const totals = features
      .map((f: any) => totalFor(f.properties.name))
      .filter((v: number | null): v is number => v !== null && v > 0)
      .sort((a: number, b: number) => a - b);
    const q = (p: number) => totals[Math.min(totals.length - 1, Math.floor(totals.length * p))] ?? 0;
    const cuts = { p50: q(0.5), p75: q(0.75), p90: q(0.9) };
    const stepFor = (name: string) => community311Step(totalFor(name), cuts);

    choroplethLayer.current = L.geoJSON(featureCollection as any, {
      style: (feature) => {
        const step = stepFor(feature?.properties?.name ?? '');
        return {
          fillColor: step === null ? 'transparent' : COMMUNITY_311_RAMP[step],
          fillOpacity: step === null ? 0 : 0.38 + step * 0.06,
          weight: 1,
          opacity: 0.7,
          color: 'rgba(255,255,255,0.75)',
        };
      },
      onEachFeature: (feature, layer) => {
        const name = feature.properties?.name ?? '';
        const entry = crimeStats.get(name);
        const displayName = name.replace(/\b\w/g, (c: string) => c.toUpperCase());
        const step = stepFor(name);
        if (entry && step !== null) {
          const tip = document.createElement('div');
          tip.className = 'lv-tip';
          const eyebrow = document.createElement('p');
          eyebrow.className = 'lv-tip__eyebrow';
          eyebrow.textContent = `City 311 requests · ${entry.year}`;
          const title = document.createElement('p');
          title.className = 'lv-tip__title';
          title.textContent = displayName;
          const band = document.createElement('p');
          band.className = 'lv-tip__band';
          const swatch = document.createElement('span');
          swatch.className = 'lv-tip__swatch';
          swatch.style.background = COMMUNITY_311_RAMP[step];
          const bandText = document.createElement('span');
          bandText.textContent = COMMUNITY_311_STEPS[step];
          band.append(swatch, bandText);
          const counts = document.createElement('p');
          counts.className = 'lv-tip__counts';
          counts.textContent = `${entry.crime.toLocaleString()} safety and property requests · ${entry.disorder.toLocaleString()} other requests`;
          const cta = document.createElement('p');
          cta.className = 'lv-tip__cta';
          cta.textContent = 'Tap for the area overview';
          tip.append(eyebrow, title, band, counts, cta);
          layer.bindTooltip(tip, { className: 'custom-map-tooltip lv-tip-shell', sticky: true });
        }
        // Hover lift: the polygon under the cursor gets an ink outline.
        layer.on('mouseover', () => {
          (layer as L.Path).setStyle({ weight: 2.5, color: LIVE.ink, opacity: 1 });
          (layer as L.Path).bringToFront();
        });
        layer.on('mouseout', () => {
          choroplethLayer.current?.resetStyle(layer as L.Path);
        });
        layer.on('click', () => {
          onViewNeighborhoodRef.current?.(name);
        });
      },
    }).addTo(map.current);

    choroplethLayer.current.bringToBack();
  }, [showCrimeLayer, crimeStats, isMapLoaded, boundsReady]);

  // Update markers
  useEffect(() => {
    if (!map.current || !isMapLoaded) return;

    // Remove old markers
    Object.keys(markers.current).forEach((id) => {
      if (!incidents.find((i) => i.id === id) || !showLiveReports) {
        if (clusterGroup.current) {
          clusterGroup.current.removeLayer(markers.current[id]);
        } else {
          markers.current[id].remove();
        }
        delete markers.current[id];
      }
    });

    // Add new markers when the live reports layer is active.
    if (showLiveReports) incidents.forEach((incident) => {
      if (markers.current[incident.id]) return;

      // One palette (tokens CATEGORY), one shape per category, an ink
      // outline with a white halo, and provenance as a second channel. See
      // map/canvas/markerKit.ts. Only emergencies pulse red; fresh reports
      // get one quiet cyan ring.
      const { el, size } = buildPinElement(incident);
      const icon = L.divIcon({
        html: el,
        className: 'lv-pin-icon',
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      });

      const lat = Number(incident.lat);
      const lng = Number(incident.lng);
      if (!isFinite(lat) || !isFinite(lng)) {
        console.warn('Skipping marker with invalid coords:', incident.id, incident.lat, incident.lng);
        return;
      }

      try {
        const activate = () => {
          // Sonar burst at the tapped pin — the map "answers" the touch
          if (map.current) {
            const rippleEl = document.createElement('div');
            rippleEl.className = 'cw-tap-ripple';
            const ripple = L.marker([lat, lng], {
              icon: L.divIcon({ html: rippleEl, className: '', iconSize: [12, 12], iconAnchor: [6, 6] }),
              interactive: false,
              zIndexOffset: 2000,
            }).addTo(map.current);
            window.setTimeout(() => { map.current?.removeLayer(ripple); }, 950);
          }
          window.requestAnimationFrame(() => onMarkerClickRef.current(incident));
        };
        // Divicon pins are focusable (Leaflet sets tabindex and role=button);
        // Enter or Space opens the report like a tap does.
        // Crime and safety pins draw above City signals where they overlap.
        const marker = L.marker([lat, lng], { icon, keyboard: true, riseOnHover: true, zIndexOffset: isCitySignal(incident) ? 0 : isSafety311(incident) ? 200 : 400 })
          .on('click', activate)
          .on('keypress', (e: any) => {
            const key = e.originalEvent?.key;
            if (key === 'Enter' || key === ' ') {
              e.originalEvent.preventDefault?.();
              activate();
            }
          });

        (marker as any).cwCategory = incident.category;

        if (clusterGroup.current) {
          clusterGroup.current.addLayer(marker);
        } else {
          marker.addTo(map.current!);
        }

        markers.current[incident.id] = marker;
      } catch (err) {
        console.error('Error adding marker to map:', err);
      }
    });

    // Handle Heatmap
    if (showHeatmap && map.current && isMapLoaded) {
      if (heatmapLayer.current) {
        map.current.removeLayer(heatmapLayer.current);
      }
      
      const now = Date.now();
      const heatPoints = incidents.flatMap((incident) => {
        const lat = Number(incident.lat);
        const lng = Number(incident.lng);
        if (!isFinite(lat) || !isFinite(lng)) return [];
        const recencyBoost = Math.max(0.15, 1 - (now - incident.timestamp) / (1000 * 60 * 60 * 24));
        const reportBoost = Math.min(1, Math.max(0.2, incident.report_count / 10));
        // A flat category weight (emergencies slightly up): the heatmap shows
        // where reports gather, not a judgement that one kind is scarier.
        const categoryBoost = incident.category === 'emergency' ? 0.15 : 0.08;
        const intensity = Math.min(1, 0.35 + recencyBoost * 0.35 + reportBoost * 0.25 + categoryBoost);
        return [[lat, lng, intensity] as [number, number, number]];
      });
      
      // Ensure L.heatLayer is available (it's a plugin)
      const heatLayerFactory = (L as any).heatLayer || (window as any).L?.heatLayer;
      if (typeof heatLayerFactory === 'function') {
        heatmapLayer.current = heatLayerFactory(heatPoints, {
          radius: 48,
          blur: 28,
          maxZoom: 17,
          minOpacity: 0.5,
          max: 0.9,
          gradient: HEAT_GRADIENT,
        }).addTo(map.current);
      } else {
        console.warn('Leaflet.heat plugin not loaded correctly. L.heatLayer is undefined.');
      }
    } else if (!showHeatmap && heatmapLayer.current && map.current) {
      map.current.removeLayer(heatmapLayer.current);
      heatmapLayer.current = null;
    }
  }, [incidents, showLiveReports, showHeatmap, onMarkerClick, isMapLoaded, isHeatPluginReady]);

  /**
   * Aggregate traffic-flow layer. Solid lines are current/estimated readings;
   * dashed blue lines are the explicitly non-live annual-demand fallback.
   */
  useEffect(() => {
    if (!map.current || !isMapLoaded) return;
    if (trafficFlowLayer.current) {
      map.current.removeLayer(trafficFlowLayer.current);
      trafficFlowLayer.current = null;
    }
    if (!trafficSegments || trafficSegments.length === 0) return;

    let flowPane = map.current.getPane('trafficFlowPane');
    if (!flowPane) {
      flowPane = map.current.createPane('trafficFlowPane');
      // Above polygon overlays such as community statistics, below markers.
      flowPane.style.zIndex = '430';
    }

    const lines = trafficSegments.map((segment) => {
      const baseline = segment.mode === 'baseline';
      const visual = baseline ? TRAFFIC_FLOW.baseline[segment.demand] : TRAFFIC_FLOW.observed[segment.condition];
      const selected = segment.id === selectedTrafficSegmentId;
      const line = L.polyline(segment.geometry, {
        pane: 'trafficFlowPane',
        color: visual.color,
        weight: selected ? 10 : baseline ? 5 : 7,
        opacity: selected ? 1 : baseline ? 0.72 : 0.84,
        dashArray: visual.dashArray,
        lineCap: 'round',
        lineJoin: 'round',
        bubblingMouseEvents: false,
      });
      line.on('click', () => onTrafficSegmentSelectRef.current?.(segment));
      const tooltip = document.createElement('span');
      tooltip.textContent = baseline
        ? `${segment.name} · ${segment.demand.replace('_', ' ')} typical demand`
        : `${segment.name} · ${segment.condition} traffic`;
      line.bindTooltip(tooltip, { sticky: true, direction: 'top', opacity: 0.96 });
      return line;
    });

    const group = L.layerGroup(lines).addTo(map.current);
    trafficFlowLayer.current = group;

    return () => {
      if (map.current && trafficFlowLayer.current) {
        map.current.removeLayer(trafficFlowLayer.current);
        trafficFlowLayer.current = null;
      }
    };
  }, [trafficSegments, selectedTrafficSegmentId, isMapLoaded]);

  /**
   * Traffic camera layer.
   *
   * Markers are deliberately quieter than incident pins — a camera is context,
   * not something that happened. The popup loads the city's live JPEG with a
   * cache-busting stamp so reopening it shows the current frame rather than
   * whatever the browser kept.
   */
  useEffect(() => {
    if (!map.current || !isMapLoaded) return;

    if (cameraLayer.current) {
      map.current.removeLayer(cameraLayer.current);
      cameraLayer.current = null;
    }
    if (!trafficCameras || trafficCameras.length === 0) return;

    // 211 cameras at city zoom blanket the map and bury the incidents, which
    // are the reason anyone opened it. They appear once you are zoomed in far
    // enough for a specific intersection to be worth looking at.
    const MIN_ZOOM = 12;

    const icon = L.divIcon({
      className: '',
      iconSize: [26, 26],
      iconAnchor: [13, 13],
      html: `<div class="lv-campin">
               <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="${LIVE.cyan}" stroke-width="2.5"
                    stroke-linecap="round" stroke-linejoin="round">
                 <path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
               </svg>
             </div>`,
    });

    const markers = trafficCameras.map((cam) =>
      // A tap hands the camera up to React rather than opening a Leaflet
      // popup. The popup was a ~250px thumbnail floating over the map with the
      // map still competing to be the subject; the viewer it replaces fills the
      // width and lets the reader walk the neighbouring intersections, which is
      // what checking a route actually involves.
      L.marker([cam.lat, cam.lng], { icon, zIndexOffset: -500 }).on('click', () => {
        onCameraSelectRef.current?.(cam);
      }),
    );

    const group = L.layerGroup(markers);
    cameraLayer.current = group;

    const syncToZoom = () => {
      if (!map.current) return;
      const shouldShow = map.current.getZoom() >= MIN_ZOOM;
      setCamerasHiddenByZoom(!shouldShow);
      const isShown = map.current.hasLayer(group);
      if (shouldShow && !isShown) group.addTo(map.current);
      else if (!shouldShow && isShown) map.current.removeLayer(group);
    };
    syncToZoom();
    map.current.on('zoomend', syncToZoom);

    return () => {
      map.current?.off('zoomend', syncToZoom);
      setCamerasHiddenByZoom(false);
      if (map.current && cameraLayer.current) {
        map.current.removeLayer(cameraLayer.current);
        cameraLayer.current = null;
      }
    };
  }, [trafficCameras, isMapLoaded]);

  /**
   * Intersection safety camera layer.
   *
   * These are enforcement points, not webcams, so they read as a warning
   * rather than as context: amber where the traffic cameras are navy. There
   * are only 57 of them city-wide — a twentieth of the incident volume — so
   * unlike the traffic layer they are not gated behind a zoom threshold.
   * "Where are the safety cameras" is a question people ask about the whole
   * city at once, and hiding the answer until you zoom in would defeat it.
   *
   * The badge carries a chevron rotated to the direction of travel the camera
   * faces, because a camera on the far side of an intersection watching the
   * other way does not apply to you.
   */
  useEffect(() => {
    if (!map.current || !isMapLoaded) return;

    if (safetyCameraLayer.current) {
      map.current.removeLayer(safetyCameraLayer.current);
      safetyCameraLayer.current = null;
    }
    if (!safetyCameras || safetyCameras.length === 0) return;

    const HEADING: Record<string, number> = {
      Northbound: 0, Eastbound: 90, Southbound: 180, Westbound: 270,
    };

    const markers = safetyCameras.map((cam) => {
      const rotation = HEADING[cam.direction] ?? 0;
      const icon = L.divIcon({
        className: '',
        iconSize: [24, 24],
        iconAnchor: [12, 12],
        html: `<div style="position:relative;width:24px;height:24px">
                 <div style="width:24px;height:24px;border-radius:50%;background:#C77F18;border:2px solid #F7F3EA;
                             box-shadow:0 1px 3px rgba(11,31,51,0.28);display:flex;align-items:center;justify-content:center">
                   <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#FFFDF8" stroke-width="2.4"
                        stroke-linecap="round" stroke-linejoin="round">
                     <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/>
                     <circle cx="12" cy="13" r="3"/>
                   </svg>
                 </div>
                 ${cam.direction ? `<div style="position:absolute;inset:0;transform:rotate(${rotation}deg)">
                   <div style="position:absolute;top:-5px;left:50%;margin-left:-4px;width:0;height:0;
                               border-left:4px solid transparent;border-right:4px solid transparent;
                               border-bottom:6px solid #C77F18;filter:drop-shadow(0 -1px 0 #F7F3EA)"></div>
                 </div>` : ''}
               </div>`,
      });

      const community = cam.community
        ? cam.community.replace(/\b\w+/g, (w) => w.charAt(0) + w.slice(1).toLowerCase())
        : '';

      return L.marker([cam.lat, cam.lng], { icon, zIndexOffset: -400 }).bindPopup(
        `<div style="width:224px;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
           <div style="font-family:'IBM Plex Mono',monospace;font-size:10px;font-weight:700;letter-spacing:0.14em;
                       text-transform:uppercase;color:#C77F18">Safety camera</div>
           <div style="font-weight:800;font-size:13px;color:#0B1F33;line-height:1.3;margin-top:3px">${cam.intersection}</div>
           ${cam.direction ? `<div style="font-size:11.5px;color:#52697D;margin-top:2px">Watches ${cam.direction.toLowerCase()} traffic</div>` : ''}
           <div style="margin-top:7px;padding-top:7px;border-top:1px solid #E4E2DC;font-size:11px;color:#52697D;line-height:1.45">
             Tickets both running the red <strong style="color:#0B1F33">and</strong> speeding through the green.
           </div>
           ${community ? `<div style="font-family:'IBM Plex Mono',monospace;font-size:10px;color:#52697D;margin-top:6px">
             ${community}${cam.ward ? ` &middot; Ward ${cam.ward}` : ''}
           </div>` : ''}
         </div>`,
        { maxWidth: 244, className: 'cw-camera-popup' },
      );
    });

    const group = L.layerGroup(markers).addTo(map.current);
    safetyCameraLayer.current = group;

    return () => {
      if (map.current && safetyCameraLayer.current) {
        map.current.removeLayer(safetyCameraLayer.current);
        safetyCameraLayer.current = null;
      }
    };
  }, [safetyCameras, isMapLoaded]);

  return (
    <div className="lv-canvas relative w-full h-full min-h-[400px] overflow-hidden flex items-center justify-center bg-[#F7F4EC]">
      <div ref={mapContainer} className="absolute inset-0 w-full h-full z-0" />

      {/* Map loading state */}
      {!isMapLoaded && (
        <div className="lv-mapload absolute inset-0 z-10 flex items-center justify-center" role="status">
          <div className="flex flex-col items-center gap-3">
            <span className="lv-mapload__spinner" aria-hidden="true" />
            <p className="lv-mapload__text">Loading the map…</p>
          </div>
        </div>
      )}

      {/* A soft paper fade at the bottom so the layer bar and buttons sit on calm ground. */}
      <div className="lv-vignette absolute inset-0 pointer-events-none z-10" aria-hidden="true" />

      {isOutsideServiceArea && (
        /* Tucks under whatever the chrome actually measures. */
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 pointer-events-none max-lg:top-[calc(var(--cw-chrome-h,66px)+0.75rem)] lg:top-[8.5rem]">
          <div className="lv-notice">
            Zoom in for Calgary metro coverage
          </div>
        </div>
      )}

      {/* The camera layer is on but zoomed out past its threshold. Saying so
          beats leaving the user staring at a map that did not change. */}
      {camerasHiddenByZoom && !isPinMode && (
        /* A transient status message: it lives in the empty top band, not
           among the controls stacked above the rail. */
        <div className="absolute left-1/2 -translate-x-1/2 z-[31] pointer-events-none select-none max-lg:top-[calc(var(--cw-chrome-h,66px)+3.5rem)] bottom-24 lg:bottom-24">
          <div className="lv-notice">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={LIVE.blue} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M23 7l-7 5 7 5V7z" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
            </svg>
            <span>Zoom in to see traffic cameras</span>
          </div>
        </div>
      )}

      {/*
        ── Pin placement: a surveyor's sight, not a map blob ──────────────────
        The old overlay was a blue gradient teardrop on slate chrome — none of
        it from the brand palette, and it vanished into marker clusters because
        it was the same weight and hue as the pins around it. Two labels were
        also unreadable: "Set Pin Here" inside the dark banner and the Cancel
        button both rendered dark-on-dark, because the app's `light:` theme
        layer overrides utility colours here. Every colour below is inline for
        that reason.

        The reticle reads as an instrument: a white halo so it survives any
        basemap or cluster behind it, ink rings for precision, and the brand blue
        reserved for the exact point. It centres on the coordinate directly, so
        the fragile stem-and-tip offset that used to align it is gone.
      */}
      {isPinMode && (
        <>
          {/* Graticule. Hairlines with a gap at the centre so they frame the
              reticle rather than run through it. */}
          <div className="absolute inset-0 z-20 pointer-events-none select-none">
            <div className="absolute top-1/2 left-0 right-1/2 h-px" style={{ background: 'rgba(11,31,51,0.18)', marginRight: 46 }} />
            <div className="absolute top-1/2 left-1/2 right-0 h-px" style={{ background: 'rgba(11,31,51,0.18)', marginLeft: 46 }} />
            <div className="absolute left-1/2 top-0 bottom-1/2 w-px" style={{ background: 'rgba(11,31,51,0.18)', marginBottom: 46 }} />
            <div className="absolute left-1/2 top-1/2 bottom-0 w-px" style={{ background: 'rgba(11,31,51,0.18)', marginTop: 46 }} />
          </div>

          {/* Reticle, centred exactly on the map centre. */}
          <div className="absolute inset-0 z-[21] pointer-events-none select-none">
            <div
              className="absolute"
              style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}
            >
              <svg width="92" height="92" viewBox="0 0 92 92" aria-hidden="true">
                {/* White halo keeps the sight legible over dark clusters. */}
                <circle cx="46" cy="46" r="27" fill="none" stroke="#FFFFFF" strokeWidth="6" opacity="0.9" />
                <circle cx="46" cy="46" r="27" fill="none" stroke={LIVE.navy} strokeWidth="1.75" />
                <circle cx="46" cy="46" r="17" fill="none" stroke={LIVE.navy} strokeWidth="1" opacity="0.45" />
                {/* Ticks at the cardinals — the sight's own graticule. */}
                {[[46, 8, 46, 19], [46, 73, 46, 84], [8, 46, 19, 46], [73, 46, 84, 46]].map(([x1, y1, x2, y2], i) => (
                  <g key={i}>
                    <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#FFFFFF" strokeWidth="5" strokeLinecap="round" opacity="0.9" />
                    <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={LIVE.navy} strokeWidth="1.75" strokeLinecap="round" />
                  </g>
                ))}
                {/* The point itself, in brand blue. */}
                <circle cx="46" cy="46" r="6.5" fill="#FFFFFF" />
                <circle cx="46" cy="46" r="4.5" fill={LIVE.blue} />
                {/* Settling ring: present only while the map is in motion. */}
                {isSettling && (
                  <circle cx="46" cy="46" r="27" fill="none" stroke={LIVE.cyan} strokeWidth="2" opacity="0.7">
                    <animate attributeName="r" values="20;34;20" dur="1.1s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.55;0;0.55" dur="1.1s" repeatCount="indefinite" />
                  </circle>
                )}
              </svg>
            </div>
          </div>

          {/* Instruction + live coordinate, on white so the text is readable. */}
          <div className="absolute left-1/2 -translate-x-1/2 z-30 pointer-events-none select-none flex flex-col items-center gap-2 w-[92vw] max-w-xs max-lg:top-[calc(5.25rem+env(safe-area-inset-top))] lg:top-6">
            <div className="lv-notice lv-notice--lg w-full justify-center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={LIVE.blue} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
              </svg>
              <span>Move the map to place your pin</span>
            </div>
            {mapCenter && (
              <div className="lv-coords">
                <span className="tabular-nums">
                  {mapCenter.lat.toFixed(5)}, {mapCenter.lng.toFixed(5)}
                </span>
              </div>
            )}
          </div>

          {/* Actions. Yellow for confirm, white for cancel; colours live in
              map-canvas.css classes so the app's light remap cannot hide them. */}
          <div className="absolute left-1/2 -translate-x-1/2 z-30 flex items-center gap-2.5 w-[90vw] max-w-sm max-lg:bottom-[calc(5.5rem+env(safe-area-inset-bottom))] bottom-32 md:bottom-28">
            <button
              onClick={(e) => { e.stopPropagation(); onPinCancel?.(); }}
              className="lv-pinbtn lv-pinbtn--ghost shrink-0"
            >
              Cancel
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (!map.current) return;
                const c = map.current.getCenter();
                onPinConfirm?.(c.lat, c.lng);
              }}
              className="lv-pinbtn lv-pinbtn--primary flex-1"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={LIVE.ink} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
              </svg>
              Drop pin here
            </button>
          </div>
        </>
      )}
    </div>
  );
});

export default Map;
