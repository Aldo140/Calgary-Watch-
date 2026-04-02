import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

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
  theme?: 'dark' | 'light';
}

export interface MapRef {
  flyTo: (lat: number, lng: number, zoom?: number) => void;
  flyToWithOffset: (
    lat: number,
    lng: number,
    options?: { zoom?: number; offsetX?: number; offsetY?: number; onComplete?: () => void }
  ) => void;
  showPopup: (incident: Incident) => void;
}

const Map = forwardRef<MapRef, MapProps>(({ incidents, onMarkerClick, onMapClick, onViewNeighborhood, onViewIncident, showLiveReports, showHeatmap, theme = 'dark' }, ref) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const markers = useRef<{ [key: string]: L.Marker }>({});
  const heatmapLayer = useRef<any>(null);
  const baseTileLayer = useRef<L.TileLayer | null>(null);
  const popup = useRef<L.Popup | null>(null);
  const serviceAreaLayer = useRef<L.LayerGroup | null>(null);
  const serviceAreaBounds = useRef<L.LatLngBounds | null>(null);
  const incidentsRef = useRef<Incident[]>(incidents);
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [isOutsideServiceArea, setIsOutsideServiceArea] = useState(false);

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
      const learnMore = document.createElement('button');
      learnMore.className = 'learn-more-btn flex-1 py-2.5 px-3 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all';
      learnMore.textContent = 'Area Intelligence';
      learnMore.setAttribute('data-neighborhood', toLabel(incident.neighborhood, ''));
      const viewDetails = document.createElement('button');
      viewDetails.className = 'view-details-btn py-2.5 px-3 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white rounded-xl transition-all border border-white/10 text-[10px] font-black uppercase tracking-widest';
      viewDetails.setAttribute('data-id', toLabel(incident.id, ''));
      viewDetails.textContent = 'Details';
      viewDetails.setAttribute('aria-label', 'View details');
      actions.append(learnMore, viewDetails);
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
    if (typeof window !== 'undefined' && !(window as any).L?.heatLayer) {
      Promise.resolve().then(() => {
        import('leaflet.heat').catch(() => {
          console.debug('leaflet.heat plugin loaded');
        });
      });
    }
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
      });

      // Move zoom control to bottom left
      if (map.current.zoomControl) {
        map.current.zoomControl.setPosition('bottomleft');
      }

      // Add default tiles (theme will be applied in a dedicated effect below)
      baseTileLayer.current = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
      }).addTo(map.current);

      map.current.on('click', (e: L.LeafletMouseEvent) => {
        if (onMapClick) {
          onMapClick(e.latlng.lat, e.latlng.lng);
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
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // Calgary service perimeter + outside-area notice logic.
  useEffect(() => {
    if (!map.current || !isMapLoaded) return;

    const calgaryBounds = L.latLngBounds(
      [50.88, -114.35], // SW
      [51.22, -113.85], // NE
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
      perimeter.bindTooltip('Calgary service area', {
        permanent: true,
        direction: 'center',
        className: 'custom-map-tooltip',
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

  // Update base map style when theme changes
  useEffect(() => {
    if (!map.current || !isMapLoaded) return;

    if (baseTileLayer.current) {
      map.current.removeLayer(baseTileLayer.current);
    }

    const tileUrl = theme === 'light'
      ? 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
      : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';

    baseTileLayer.current = L.tileLayer(tileUrl, {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 20
    }).addTo(map.current);

    if (showHeatmap && heatmapLayer.current) {
      heatmapLayer.current.bringToFront();
    }
  }, [theme, isMapLoaded, showHeatmap]);

  // Update markers
  useEffect(() => {
    if (!map.current || !isMapLoaded) return;

    // Remove old markers
    Object.keys(markers.current).forEach((id) => {
      if (!incidents.find((i) => i.id === id) || !showLiveReports) {
        markers.current[id].remove();
        delete markers.current[id];
      }
    });

    if (!showLiveReports) return;

    // Add new markers
    incidents.forEach((incident) => {
      if (markers.current[incident.id]) return;

      const isEmergency = incident.category === 'emergency';

      // Create custom marker element
      const el = document.createElement('div');
      el.className = isEmergency
        ? 'relative w-14 h-14 flex items-center justify-center group'
        : 'relative w-10 h-10 flex items-center justify-center group';

      // Pulse ring — emergency gets an extra outer ring
      if (isEmergency) {
        const outerRing = document.createElement('div');
        outerRing.className = 'absolute inset-[-8px] rounded-2xl bg-red-600 animate-ping opacity-30';
        el.appendChild(outerRing);
      }

      const pulse = document.createElement('div');
      pulse.className = cn(
        'absolute inset-0 rounded-2xl animate-pulse-ring',
        isEmergency ? 'bg-red-600' :
        incident.category === 'crime' ? 'bg-red-500' :
        incident.category === 'traffic' ? 'bg-orange-500' :
        incident.category === 'infrastructure' ? 'bg-blue-500' :
        incident.category === 'gas' ? 'bg-emerald-500' :
        'bg-purple-500'
      );
      el.appendChild(pulse);

      // Marker body
      const body = document.createElement('div');
      body.className = cn(
        isEmergency
          ? 'relative w-14 h-14 rounded-2xl border-2 border-white/40 shadow-2xl cursor-pointer transition-all hover:scale-110 flex items-center justify-center z-10 bg-red-600 shadow-red-600/60'
          : 'relative w-10 h-10 rounded-2xl border-2 border-white/20 shadow-2xl cursor-pointer transition-all hover:scale-110 flex items-center justify-center z-10',
        !isEmergency && (
          incident.category === 'crime' ? 'bg-red-500 shadow-red-500/40' :
          incident.category === 'traffic' ? 'bg-orange-500 shadow-orange-500/40' :
          incident.category === 'infrastructure' ? 'bg-blue-500 shadow-blue-500/40' :
          incident.category === 'gas' ? 'bg-emerald-500 shadow-emerald-500/40' :
          'bg-purple-500 shadow-purple-500/40'
        )
      );

      // Build the SVG icon via DOM (avoids innerHTML XSS surface).
      // All path data is static — no user data is interpolated into SVG markup.
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
        crime: [], // uses circle + lines — see special handling below
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
        gas: [
          'M3 22 L21 22',
          'M4 9h16',
          'M14 22V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v18',
          'M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 2 2h1',
          'M10 22V15',
          'M9 22V15',
          'M11 22V15',
          'M18 5v2',
          'M14 7h1',
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
        // Circle + info lines — use createElementNS for circle and line
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
      el.appendChild(body);

      // Create Leaflet divIcon
      const markerSize: [number, number] = isEmergency ? [56, 56] : [40, 40];
      const icon = L.divIcon({
        html: el,
        className: '', // Remove default Leaflet icon styling
        iconSize: markerSize,
        iconAnchor: [markerSize[0] / 2, markerSize[1] / 2],
      });

      try {
        const marker = L.marker([incident.lat, incident.lng], { icon })
          .addTo(map.current!)
          .bindTooltip(incident.title, {
            direction: 'top',
            offset: [0, -20],
            className: 'custom-map-tooltip'
          })
          .on('click', () => {
            window.requestAnimationFrame(() => onMarkerClick(incident));
          });

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
      const heatPoints = incidents.map((incident) => {
        const recencyBoost = Math.max(0.15, 1 - (now - incident.timestamp) / (1000 * 60 * 60 * 24));
        const reportBoost = Math.min(1, Math.max(0.2, incident.report_count / 10));
        const categoryBoost = incident.category === 'crime' ? 0.25 : incident.category === 'traffic' ? 0.15 : 0.05;
        const intensity = Math.min(1, 0.35 + recencyBoost * 0.35 + reportBoost * 0.25 + categoryBoost);
        return [incident.lat, incident.lng, intensity] as [number, number, number];
      });
      
      // Ensure L.heatLayer is available (it's a plugin)
      if (typeof (L as any).heatLayer === 'function') {
        heatmapLayer.current = (L as any).heatLayer(heatPoints, {
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
  }, [incidents, showLiveReports, showHeatmap, onMarkerClick, isMapLoaded]);

  return (
    <div className={cn(
      "relative w-full h-full min-h-[400px] overflow-hidden flex items-center justify-center",
      theme === 'light' ? 'bg-slate-100' : 'bg-slate-900'
    )}>
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

      <div
        className={cn(
          "absolute inset-0 pointer-events-none z-10",
          theme === 'light'
            ? 'bg-gradient-to-t from-white/40 to-transparent'
            : 'bg-gradient-to-t from-slate-950/20 to-transparent'
        )}
      />

      {isOutsideServiceArea && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
          <div className="px-3 py-2 rounded-xl border border-amber-400/30 bg-slate-950/85 text-amber-300 text-[11px] font-bold tracking-wide shadow-lg">
            Zoom in to Calgary for full service coverage
          </div>
        </div>
      )}
    </div>
  );
});

export default Map;
