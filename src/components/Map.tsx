import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';

// Expose Leaflet globally for plugins
if (typeof window !== 'undefined') {
  (window as any).L = L;
}
import { CALGARY_CENTER } from '@/src/constants';
import { Incident } from '@/src/types';
import { cn } from '@/src/lib/utils';

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
  crimeStats?: Map<string, { crime: number; disorder: number; year: number }>;
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

const Map = forwardRef<MapRef, MapProps>(({ incidents, onMarkerClick, onMapClick, onViewNeighborhood, onViewIncident, showLiveReports, showHeatmap, isPinMode = false, onPinConfirm, onPinCancel, showCrimeLayer = false, crimeStats, isMapInteractive = true }, ref) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const markers = useRef<{ [key: string]: L.Marker }>({});
  const clusterGroup = useRef<any>(null);
  const heatmapLayer = useRef<any>(null);
  const baseTileLayer = useRef<L.TileLayer | null>(null);
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

  // Callback refs - keep the single Leaflet click handler up-to-date with latest props
  // without needing to re-register it on every render.
  const isPinModeRef = useRef(isPinMode);
  const onPinConfirmRef = useRef(onPinConfirm);
  const onMapClickRef = useRef(onMapClick);

  // Update refs on every render (no dep array → always current)
  useEffect(() => { isPinModeRef.current = isPinMode; });
  useEffect(() => { onPinConfirmRef.current = onPinConfirm; });
  useEffect(() => { onMapClickRef.current = onMapClick; });

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
      el.innerHTML = `
        <div style="position:relative;width:28px;height:28px;display:flex;align-items:center;justify-content:center;">
          <div style="position:absolute;width:28px;height:28px;border-radius:50%;background:rgba(56,189,248,0.2);animation:location-pulse 2s ease-out infinite;"></div>
          <div style="position:absolute;width:16px;height:16px;border-radius:50%;background:rgba(56,189,248,0.35);"></div>
          <div style="position:relative;width:10px;height:10px;border-radius:50%;background:#38bdf8;border:2px solid white;box-shadow:0 0 8px rgba(56,189,248,0.8);"></div>
        </div>`;
      const style = document.createElement('style');
      style.textContent = '@keyframes location-pulse{0%{transform:scale(1);opacity:0.8}70%{transform:scale(2.2);opacity:0}100%{transform:scale(2.2);opacity:0}}';
      document.head.appendChild(style);
      const icon = L.divIcon({ html: el.innerHTML, className: '', iconSize: [28, 28], iconAnchor: [14, 14] });
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
      const wrapper = document.createElement('div');
      wrapper.className = 'min-w-[264px] bg-slate-950 text-white rounded-[1.4rem] border border-white/10 shadow-[0_14px_34px_rgba(0,0,0,0.42)] overflow-hidden';

      const content = document.createElement('div');
      content.className = 'p-4 space-y-3';

      const topRow = document.createElement('div');
      topRow.className = 'flex items-center justify-between gap-2';
      const categoryPill = document.createElement('span');
      categoryPill.className = 'text-[10px] font-black uppercase tracking-[0.2em] text-slate-300';
      categoryPill.textContent = toLabel(incident.category, 'incident');
      const neighborhood = document.createElement('span');
      neighborhood.className = 'text-[10px] font-bold text-slate-500';
      neighborhood.textContent = toLabel(incident.neighborhood, 'Calgary');
      topRow.append(categoryPill, neighborhood);
      content.appendChild(topRow);

      // Sample reports say so in the popup itself — the marker badge alone is
      // easy to miss once the popup covers it.
      if (incident.data_source === 'demo') {
        const demoRow = document.createElement('div');
        demoRow.style.cssText = 'display:flex;align-items:center;gap:6px;padding:5px 8px;border-radius:8px;background:rgba(245,158,11,0.14);border:1px solid rgba(245,158,11,0.4);';
        const dot = document.createElement('span');
        dot.style.cssText = 'width:5px;height:5px;border-radius:50%;background:#F59E0B;flex:0 0 auto;';
        const label = document.createElement('span');
        label.style.cssText = 'font-size:9.5px;font-weight:800;letter-spacing:0.04em;color:#FCD34D;line-height:1.3;';
        label.textContent = 'Example report — shows how reporting works';
        demoRow.append(dot, label);
        content.appendChild(demoRow);
      }

      const title = document.createElement('h3');
      title.className = 'text-sm font-black tracking-tight leading-tight text-white';
      title.textContent = toLabel(incident.title, 'Untitled report');
      content.appendChild(title);

      const desc = document.createElement('p');
      desc.className = 'text-xs text-slate-400 leading-relaxed line-clamp-2';
      desc.textContent = toLabel(incident.description, '');
      content.appendChild(desc);

      const reporter = getReporterDisplay(incident);
      const reporterText = document.createElement('p');
      reporterText.className = 'text-[11px] text-slate-400';
      reporterText.textContent = `By ${reporter.firstName}`;
      content.appendChild(reporterText);

      const actions = document.createElement('div');
      actions.className = 'flex items-center gap-2 pt-1';
      const viewDetails = document.createElement('button');
      viewDetails.className = 'view-details-btn flex-1 py-2.5 px-3 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all';
      viewDetails.setAttribute('data-id', toLabel(incident.id, ''));
      viewDetails.textContent = 'Details';
      viewDetails.setAttribute('aria-label', 'View details');
      const learnMore = document.createElement('button');
      learnMore.className = 'learn-more-btn py-2.5 px-3 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white rounded-xl transition-all border border-white/10 text-[10px] font-black uppercase tracking-widest';
      learnMore.textContent = 'Area Intel';
      learnMore.setAttribute('data-neighborhood', toLabel(incident.neighborhood, ''));
      actions.append(viewDetails, learnMore);
      content.appendChild(actions);

      wrapper.appendChild(content);

      const openPopup = () => {
        popup.current = L.popup({
          closeButton: false,
          className: 'custom-leaflet-popup',
          offset: [0, -8]
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

    try {
      // Initialize Leaflet map
      map.current = L.map(containerEl, {
        center: [CALGARY_CENTER.lat, CALGARY_CENTER.lng],
        zoom: 11,
        zoomControl: true,
        // @ts-expect-error tap is a valid Leaflet MapOptions at runtime but missing from typedefs
        tap: false,
      });

      // Move zoom control to bottom left
      if (map.current.zoomControl) {
        map.current.zoomControl.setPosition('bottomleft');
      }

      baseTileLayer.current = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20,
      }).addTo(map.current);

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
          if (neighborhood && onViewNeighborhood) {
            onViewNeighborhood(neighborhood);
          }
        } else if (btn.classList.contains('view-details-btn')) {
          const id = btn.getAttribute('data-id');
          const incident = incidentsRef.current.find(i => i.id === id);
          if (incident && onViewIncident) {
            onViewIncident(incident);
          }
        }
      };

      containerEl.addEventListener('click', popupClickHandler);

      setIsMapLoaded(true);
    } catch (err) {
      console.error('Failed to initialize Leaflet:', err);
    }

    return () => {
      if (popupClickHandler) {
        containerEl.removeEventListener('click', popupClickHandler);
      }
      clusterGroup.current?.remove();
      clusterGroup.current = null;
      map.current?.remove();
      map.current = null;
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
        color: '#22d3ee',
        weight: 2,
        opacity: 0.9,
        dashArray: '8 6',
        fill: false,
      });

      const centerMarker = L.circleMarker([CALGARY_CENTER.lat, CALGARY_CENTER.lng], {
        radius: 4,
        color: '#22d3ee',
        fillColor: '#22d3ee',
        fillOpacity: 0.9,
        weight: 1,
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
      iconCreateFunction: (cluster: any) => {
        const count = cluster.getChildCount();
        const children = cluster.getAllChildMarkers();
        const hasEmergency = children.some((m: any) => m.cwCategory === 'emergency');

        const el = document.createElement('div');
        
        if (hasEmergency) {
          // Outer ping ring
          const ring = document.createElement('div');
          ring.style.cssText = [
            'position:absolute', 'inset:-10px',
            'border-radius:22px',
            'background:rgba(239,68,68,0.35)',
            'animation:ping 1.2s cubic-bezier(0,0,0.2,1) infinite',
          ].join(';');

          el.style.cssText = [
            'position:relative',
            'width:56px', 'height:56px',
            'background:rgba(239,68,68,0.97)',
            'border:2.5px solid rgba(254,226,226,0.95)',
            'border-radius:16px',
            'display:flex', 'align-items:center', 'justify-content:center',
            'cursor:pointer',
            'box-shadow:0 4px 10px rgba(127,29,29,0.28)',
          ].join(';');

          // Siren SVG icon — no count, emergency takes full icon space
          const sirenSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          sirenSvg.setAttribute('width', '26'); sirenSvg.setAttribute('height', '26');
          sirenSvg.setAttribute('viewBox', '0 0 24 24');
          sirenSvg.setAttribute('fill', 'none');
          sirenSvg.setAttribute('stroke', 'white');
          sirenSvg.setAttribute('stroke-width', '2.5');
          sirenSvg.setAttribute('stroke-linecap', 'round');
          sirenSvg.setAttribute('stroke-linejoin', 'round');
          // Siren / alarm paths
          [
            'M7 12a5 5 0 0 1 5-5v0a5 5 0 0 1 5 5v6H7v-6Z',
            'M5 20h14',
            'M12 7V3',
            'M5 10 3 9',
            'M19 10l2-1',
          ].forEach(d => {
            const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            p.setAttribute('d', d);
            sirenSvg.appendChild(p);
          });

          el.appendChild(ring);
          el.appendChild(sirenSvg);
          return L.divIcon({ html: el, className: '', iconSize: [56, 56], iconAnchor: [28, 28] });
        } else {
          el.style.cssText = [
            'width:44px', 'height:44px',
            'background:#0B1F33',
            'border:2px solid rgba(255,255,255,0.92)',
            'border-radius:13px',
            'display:flex', 'align-items:center', 'justify-content:center',
            'cursor:pointer',
            'box-shadow:0 4px 10px rgba(11,31,51,0.24)',
          ].join(';');
          const label = document.createElement('span');
          label.style.cssText = 'color:white;font-size:12px;font-weight:900;letter-spacing:-0.01em;';
          label.textContent = `+${count}`;
          el.appendChild(label);
          return L.divIcon({ html: el, className: '', iconSize: [44, 44], iconAnchor: [22, 22] });
        }
      },
      maxClusterRadius: 48,
      zoomToBoundsOnClick: true,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      animate: true,
      disableClusteringAtZoom: 17,
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
    map.current.on('move', update);
    return () => { map.current?.off('move', update); };
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

    // ── Quantile heat ramp ─────────────────────────────────────────────────
    // Thresholds derive from the live distribution (p50/p75/p90), so the map
    // stays meaningful whatever the absolute counts are.
    const totalFor = (name: string): number | null => {
      const entry = crimeStats.get(name);
      return entry ? entry.crime + entry.disorder : null;
    };
    const totals = features
      .map((f: any) => totalFor(f.properties.name))
      .filter((v: number | null): v is number => v !== null && v > 0)
      .sort((a: number, b: number) => a - b);
    const q = (p: number) => totals[Math.min(totals.length - 1, Math.floor(totals.length * p))] ?? 0;
    const p50 = q(0.5), p75 = q(0.75), p90 = q(0.9);

    // Rank lookup for tooltips (1 = most concerns)
    const ranked = [...totals].sort((a, b) => b - a);
    const rankOf = (v: number) => ranked.findIndex((t) => t <= v) + 1;

    const bandFor = (total: number | null): { fill: string; label: string } => {
      if (total === null || total <= 0) return { fill: 'transparent', label: 'No data' };
      if (total >= p90) return { fill: 'rgba(220,38,38,0.52)',  label: 'Hot' };
      if (total >= p75) return { fill: 'rgba(234,88,12,0.42)',  label: 'High' };
      if (total >= p50) return { fill: 'rgba(212,168,67,0.36)', label: 'Elevated' };
      return { fill: 'rgba(46,139,122,0.2)', label: 'Calm' };
    };

    choroplethLayer.current = L.geoJSON(featureCollection as any, {
      style: (feature) => ({
        fillColor: bandFor(totalFor(feature?.properties?.name ?? '')).fill,
        weight: 1,
        opacity: 0.7,
        color: 'rgba(255,255,255,0.55)',
        fillOpacity: 1,
      }),
      onEachFeature: (feature, layer) => {
        const name = feature.properties?.name ?? '';
        const entry = crimeStats.get(name);
        const displayName = name.replace(/\b\w/g, (c: string) => c.toUpperCase());
        if (entry) {
          const total = entry.crime + entry.disorder;
          const band = bandFor(total);
          layer.bindTooltip(
            `<div style="min-width:150px">` +
            `<div style="font-weight:900;font-size:12px;margin-bottom:2px">${displayName}</div>` +
            `<div style="display:flex;align-items:center;gap:5px;margin-bottom:3px">` +
            `<span style="width:8px;height:8px;border-radius:50%;background:${band.fill.replace(/0\.\d+\)/, '1)')};display:inline-block"></span>` +
            `<span style="font-weight:700">${band.label}</span>` +
            `<span style="opacity:0.65">· #${rankOf(total)} of ${totals.length}</span>` +
            `</div>` +
            `<div style="opacity:0.75">${entry.crime} concerns · ${entry.disorder} service calls (${entry.year})</div>` +
            `<div style="margin-top:3px;font-weight:700;color:#2E8B7A">Tap for full area intel →</div>` +
            `</div>`,
            { className: 'custom-map-tooltip', sticky: true }
          );
        }
        // Hover lift — the polygon under the cursor pops forward
        layer.on('mouseover', () => {
          (layer as L.Path).setStyle({ weight: 2.5, color: '#1C2B3A', opacity: 1 });
          (layer as L.Path).bringToFront();
        });
        layer.on('mouseout', () => {
          choroplethLayer.current?.resetStyle(layer as L.Path);
        });
        layer.on('click', () => {
          if (onViewNeighborhood) onViewNeighborhood(name);
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

      const isEmergency = incident.category === 'emergency';

      // Create custom marker element
      const el = document.createElement('div');
      el.className = isEmergency
        ? 'relative w-14 h-14 flex items-center justify-center group'
        : 'relative w-10 h-10 flex items-center justify-center group';

      // Emergency pins retain a restrained attention ring. Standard markers
      // stay still so dense map areas remain readable and calm.
      if (isEmergency) {
        const outerRing = document.createElement('div');
        outerRing.className = 'absolute inset-[-5px] rounded-2xl border-2 border-red-500/45';
        el.appendChild(outerRing);
      }

      const pulse = document.createElement('div');
      pulse.className = cn(
        'absolute inset-0 rounded-xl opacity-20',
        isEmergency ? 'bg-red-600' :
        incident.category === 'crime' ? 'bg-red-500' :
        incident.category === 'traffic' ? 'bg-orange-500' :
        incident.category === 'infrastructure' ? 'bg-blue-500' :
        'bg-purple-500'
      );
      el.appendChild(pulse);

      // Marker body
      const body = document.createElement('div');
      body.className = cn(
        isEmergency
          ? 'relative flex h-14 w-14 cursor-pointer items-center justify-center rounded-2xl border-2 border-white/80 bg-red-600 shadow-[0_4px_10px_rgba(127,29,29,0.28)] transition-transform hover:scale-105 z-10'
          : 'relative flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl border-2 border-white/90 shadow-[0_4px_10px_rgba(11,31,51,0.2)] transition-transform hover:scale-105 z-10',
        !isEmergency && (
          incident.category === 'crime' ? 'bg-[#C0392B]' :
          incident.category === 'traffic' ? 'bg-[#C65514]' :
          incident.category === 'infrastructure' ? 'bg-[#286FAF]' :
          'bg-[#2E8B7A]'
        )
      );

      // Build the SVG icon via DOM (avoids innerHTML XSS surface).
      // All path data is static - no user data is interpolated into SVG markup.
      const iconSize = isEmergency ? 28 : 20;
      const svgNS = 'http://www.w3.org/2000/svg';

      // Map each category to its static SVG path strings.
      const CATEGORY_PATHS: Record<string, string[]> = {
        emergency: [
          'M7 12a5 5 0 0 1 5-5v0a5 5 0 0 1 5 5v6H7v-6Z',
          'M5 20h14',
          'M12 7V3',
          'M5 10 3 9',
          'M19 10l2-1',
        ],
        crime: [], // uses circle + lines - see special handling below
        traffic: [
          'M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2',
          'M9 17h6',
        ],
        infrastructure: [
          'M17 14v7',
          'M7 14v7',
          'M17 3v3',
          'M7 3v3',
          'M10 14 2.3 6.3',
          'm14 14 7.7-7.7',
        ],
        weather: [
          'M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242',
          'M16 14v6',
          'M8 14v6',
          'M12 16v6',
        ],
      };

      const svg = document.createElementNS(svgNS, 'svg');
      svg.setAttribute('xmlns', svgNS);
      svg.setAttribute('width', String(iconSize));
      svg.setAttribute('height', String(iconSize));
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('fill', 'none');
      svg.setAttribute('stroke', 'currentColor');
      svg.setAttribute('stroke-width', '2.5');
      svg.setAttribute('stroke-linecap', 'round');
      svg.setAttribute('stroke-linejoin', 'round');
      svg.style.color = 'white';

      if (incident.category === 'crime') {
        // Circle + info lines - use createElementNS for circle and line
        const circle = document.createElementNS(svgNS, 'circle');
        circle.setAttribute('cx', '12'); circle.setAttribute('cy', '12'); circle.setAttribute('r', '10');
        svg.appendChild(circle);
        const l1 = document.createElementNS(svgNS, 'line');
        l1.setAttribute('x1', '12'); l1.setAttribute('y1', '8'); l1.setAttribute('x2', '12'); l1.setAttribute('y2', '12');
        svg.appendChild(l1);
        const l2 = document.createElementNS(svgNS, 'line');
        l2.setAttribute('x1', '12'); l2.setAttribute('y1', '16'); l2.setAttribute('x2', '12.01'); l2.setAttribute('y2', '16');
        svg.appendChild(l2);
      } else if (incident.category === 'traffic') {
        // Traffic also needs two circles for wheels
        (CATEGORY_PATHS.traffic || []).forEach((d) => {
          const path = document.createElementNS(svgNS, 'path');
          path.setAttribute('d', d);
          svg.appendChild(path);
        });
        const c1 = document.createElementNS(svgNS, 'circle');
        c1.setAttribute('cx', '7'); c1.setAttribute('cy', '17'); c1.setAttribute('r', '2');
        svg.appendChild(c1);
        const c2 = document.createElementNS(svgNS, 'circle');
        c2.setAttribute('cx', '17'); c2.setAttribute('cy', '17'); c2.setAttribute('r', '2');
        svg.appendChild(c2);
      } else if (incident.category === 'infrastructure') {
        // Infrastructure needs a rect
        const rect = document.createElementNS(svgNS, 'rect');
        rect.setAttribute('x', '2'); rect.setAttribute('y', '6');
        rect.setAttribute('width', '20'); rect.setAttribute('height', '8');
        rect.setAttribute('rx', '1');
        svg.appendChild(rect);
        (CATEGORY_PATHS.infrastructure || []).forEach((d) => {
          const path = document.createElementNS(svgNS, 'path');
          path.setAttribute('d', d);
          svg.appendChild(path);
        });
      } else {
        const paths = CATEGORY_PATHS[incident.category] || CATEGORY_PATHS.weather;
        paths.forEach((d) => {
          const path = document.createElementNS(svgNS, 'path');
          path.setAttribute('d', d);
          svg.appendChild(path);
        });
      }

      body.appendChild(svg);

      // Official source badge (small "C" for City) — no user data interpolated
      if ((incident as any).data_source === 'official') {
        const badge = document.createElement('div');
        badge.style.cssText = 'position:absolute;top:-4px;right:-4px;width:14px;height:14px;border-radius:50%;background:#0ea5e9;border:1.5px solid white;display:flex;align-items:center;justify-content:center;font-size:8px;font-weight:900;color:white;line-height:1;z-index:20;';
        badge.textContent = 'C';
        body.appendChild(badge);
      }

      // Sample-report treatment: amber corner badge plus a dashed outline, so a
      // demo pin is distinguishable from a real report at a glance and without
      // relying on colour alone.
      if (incident.data_source === 'demo') {
        body.style.borderStyle = 'dashed';
        body.style.borderColor = 'rgba(245,158,11,0.95)';
        const badge = document.createElement('div');
        badge.style.cssText = 'position:absolute;top:-5px;right:-5px;padding:0 3px;height:13px;border-radius:7px;background:#F59E0B;border:1.5px solid white;display:flex;align-items:center;justify-content:center;font-size:7px;font-weight:900;color:#3B2705;line-height:1;letter-spacing:0.04em;z-index:20;';
        badge.textContent = 'EG';
        badge.title = 'Example report';
        body.appendChild(badge);
      }

      el.appendChild(body);

      // Create Leaflet divIcon
      const markerSize: [number, number] = isEmergency ? [56, 56] : [40, 40];
      const icon = L.divIcon({
        html: el,
        className: '', // Remove default Leaflet icon styling
        iconSize: markerSize,
        iconAnchor: [markerSize[0] / 2, markerSize[1] / 2],
      });

      const lat = Number(incident.lat);
      const lng = Number(incident.lng);
      if (!isFinite(lat) || !isFinite(lng)) {
        console.warn('Skipping marker with invalid coords:', incident.id, incident.lat, incident.lng);
        return;
      }

      try {
        const marker = L.marker([lat, lng], { icon })
          .on('click', () => {
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
            window.requestAnimationFrame(() => onMarkerClick(incident));
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
        const categoryBoost = incident.category === 'crime' ? 0.25 : incident.category === 'traffic' ? 0.15 : 0.05;
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
          gradient: {
            0.25: '#22d3ee',
            0.45: '#3b82f6',
            0.62: '#f59e0b',
            0.78: '#f97316',
            1.0: '#ef4444'
          }
        }).addTo(map.current);
      } else {
        console.warn('Leaflet.heat plugin not loaded correctly. L.heatLayer is undefined.');
      }
    } else if (!showHeatmap && heatmapLayer.current && map.current) {
      map.current.removeLayer(heatmapLayer.current);
      heatmapLayer.current = null;
    }
  }, [incidents, showLiveReports, showHeatmap, onMarkerClick, isMapLoaded, isHeatPluginReady]);

  return (
    <div className="relative w-full h-full min-h-[400px] overflow-hidden flex items-center justify-center bg-slate-100">
      <div ref={mapContainer} className="absolute inset-0 w-full h-full z-0" />
      
      {/* Map Loading State */}
      {!isMapLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/50 backdrop-blur-sm z-10">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
            <p className="text-slate-400 text-sm font-medium">Initializing Map...</p>
          </div>
        </div>
      )}

      {/* Vignette: stronger on small screens so map chrome & cards read like a premium safety app; lg+ unchanged */}
      <div className="absolute inset-0 pointer-events-none z-10 bg-gradient-to-t to-transparent from-white/55 via-white/10 max-lg:from-white/50 max-lg:via-white/5 lg:from-white/40" />

      {/* Community concern legend — visible while the crime layer is on */}
      {showCrimeLayer && isMapLoaded && (
        <div className="absolute z-20 pointer-events-none left-1/2 -translate-x-1/2 bottom-[calc(9.6rem+env(safe-area-inset-bottom))] lg:left-20 lg:translate-x-0 lg:bottom-24">
          <div
            className="rounded-2xl px-3.5 py-2.5 lg:px-4 lg:py-3 shadow-xl backdrop-blur-xl"
            style={{ background: 'rgba(255,253,248,0.94)', border: '1px solid #E7E0D2' }}
          >
            {(!crimeStats || crimeStats.size === 0) ? (
              <div className="flex items-center gap-2.5 py-0.5">
                <span className="h-3.5 w-3.5 rounded-full border-2 border-[#2E8B7A] border-t-transparent animate-spin" aria-hidden="true" />
                <div>
                  <p className="text-[10.5px] font-bold text-slate-800">Building the picture…</p>
                  <p className="font-mono text-[8px] uppercase tracking-[0.16em] text-slate-500">Aggregating 311 across 270+ communities</p>
                </div>
              </div>
            ) : (
              <>
                <p className="font-mono text-[8.5px] font-bold uppercase tracking-[0.2em] text-slate-500 mb-1.5">
                  Community concern index
                </p>
                <div className="flex items-center gap-2.5">
                  {([['#2E8B7A', 'Calm'], ['#D4A843', 'Elevated'], ['#EA580C', 'High'], ['#DC2626', 'Hot']] as const).map(([c, l]) => (
                    <span key={l} className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: c, opacity: 0.85 }} />
                      <span className="text-[9.5px] font-bold text-slate-700">{l}</span>
                    </span>
                  ))}
                </div>
                <p className="hidden lg:block mt-1.5 text-[9px] text-slate-500 font-medium">
                  311 + community reports · tap a community for full intel
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {isOutsideServiceArea && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 pointer-events-none max-lg:top-[calc(10rem+env(safe-area-inset-top))] lg:top-4">
          <div className="px-3 py-2 rounded-xl border border-amber-400/30 bg-slate-950/85 text-amber-300 text-[11px] font-bold tracking-wide shadow-lg">
            Zoom in for Calgary metro coverage
          </div>
        </div>
      )}

      {/* ── Pin-mode crosshair overlay ── */}
      {isPinMode && (
        <>
          {/* Crosshair guide lines */}
          <div className="absolute inset-0 z-20 pointer-events-none select-none">
            <div className="absolute top-1/2 w-full h-px bg-blue-400/25" />
            <div className="absolute left-1/2 h-full w-px bg-blue-400/25" />
          </div>

          {/* Pin - rendered in its own stacking layer so the shadow ellipse
              doesn't clip the crosshair lines above */}
          <div className="absolute inset-0 z-[21] pointer-events-none select-none">
            {/*
              The entire pin graphic is a column of:
                [pulse ring + pin head] → stem → tip dot (= map centre)
              translateY(-100%) lifts it so the tip dot sits exactly at 50%/50%.
            */}
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                // -100% lifts the whole column so its bottom aligns with 50%.
                // +6px compensates for the 6px tip dot: +3px for tip radius, +3px
                // for the visual optical correction (pin head shadow reads heavy).
                transform: 'translateX(-50%) translateY(calc(-100% + 6px))',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
              }}
            >
              {/* Pulse ring - uses Tailwind's animate-ping */}
              <div
                className="animate-ping"
                style={{
                  position: 'absolute',
                  top: 0,
                  width: 44,
                  height: 44,
                  borderRadius: '50%',
                  background: 'rgba(37,99,235,0.30)',
                }}
              />
              {/* Pin head */}
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg,#3b82f6,#1d4ed8)',
                  border: '3px solid white',
                  boxShadow: '0 6px 24px rgba(37,99,235,0.55)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                {/* Inner dot */}
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'white', opacity: 0.9 }} />
              </div>
              {/* Stem */}
              <div style={{ width: 3, height: 18, background: 'linear-gradient(to bottom,#1d4ed8,#1e3a8a)', borderRadius: '0 0 2px 2px', flexShrink: 0 }} />
              {/* Tip dot - this pixel sits at exact map centre */}
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#1d4ed8', flexShrink: 0 }} />
            </div>

            {/* Shadow ellipse under the tip */}
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, 6px)',
                width: 20,
                height: 6,
                borderRadius: '50%',
                background: 'rgba(0,0,0,0.30)',
                filter: 'blur(3px)',
              }}
            />
          </div>

          {/* Instruction banner + live coordinate readout */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 pointer-events-none select-none flex flex-col items-center gap-2 max-lg:top-[calc(5.25rem+env(safe-area-inset-top))] lg:top-4 w-[92vw] max-w-sm">
            <div className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-2xl bg-slate-950/90 border border-blue-500/40 shadow-2xl backdrop-blur-md w-full">
              <svg className="shrink-0" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
              <span className="text-blue-300 text-[10px] sm:text-xs font-bold leading-tight flex-1 text-center truncate">
                Tap map to pin - or pan & press <span className="text-white">Set Pin Here</span>
              </span>
            </div>
            {/* Live coords - updates every frame as user pans */}
            {mapCenter && (
              <div className="px-3 py-1.5 rounded-xl bg-slate-950/80 border border-white/10 backdrop-blur-md">
                <span className="text-[11px] font-mono text-emerald-300">
                  {mapCenter.lat.toFixed(5)},&nbsp;{mapCenter.lng.toFixed(5)}
                </span>
              </div>
            )}
          </div>

          {/* Action buttons - when LayerToggle is hidden (isPinMode), sit above collapsed MobileMapSheet */}
          <div className="absolute left-1/2 -translate-x-1/2 z-30 flex items-center justify-center flex-wrap gap-2 md:gap-3 w-[90vw] max-w-sm max-lg:bottom-[5.5rem] md:max-lg:bottom-28 bottom-36 md:bottom-28">
            <button
              onClick={(e) => { e.stopPropagation(); onPinCancel?.(); }}
              className="px-5 py-3 rounded-2xl bg-slate-900/90 border border-white/15 text-slate-300 text-sm font-bold backdrop-blur-md hover:bg-slate-800 active:scale-95 transition-all shadow-xl whitespace-nowrap shrink-0 flex-1 max-w-[120px]"
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
              className="flex items-center justify-center gap-2 px-6 py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold shadow-xl shadow-blue-500/40 active:scale-95 transition-all whitespace-nowrap shrink-0 flex-[2]"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
              Set Pin Here
            </button>
          </div>
        </>
      )}
    </div>
  );
});

export default Map;
