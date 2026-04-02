import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import L from 'leaflet';
import 'leaflet.heat';

// Fix for Leaflet plugins in ESM environments
if (typeof window !== 'undefined') {
  (window as any).L = L;
  // Dynamically import leaflet.heat to ensure L is available on window
  import('leaflet.heat');
}

import 'leaflet/dist/leaflet.css';
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
}

export interface MapRef {
  flyTo: (lat: number, lng: number, zoom?: number) => void;
  showPopup: (incident: Incident) => void;
}

const Map = forwardRef<MapRef, MapProps>(({ incidents, onMarkerClick, onMapClick, onViewNeighborhood, onViewIncident, showLiveReports, showHeatmap }, ref) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const markers = useRef<{ [key: string]: L.Marker }>({});
  const heatmapLayer = useRef<any>(null);
  const popup = useRef<L.Popup | null>(null);
  const [isMapLoaded, setIsMapLoaded] = useState(false);

  useImperativeHandle(ref, () => ({
    flyTo: (lat: number, lng: number, zoom = 14) => {
      if (map.current) {
        map.current.flyTo([lat, lng], zoom, {
          duration: 1.5,
          easeLinearity: 0.25
        });
      }
    },
    showPopup: (incident: Incident) => {
      if (!map.current) return;
      
      if (popup.current) {
        popup.current.remove();
      }

      const content = `
        <div class="p-0 min-w-[280px] bg-slate-950 text-white rounded-[2rem] border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden relative group">
          <div class="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r ${
            incident.category === 'crime' ? 'from-red-500 to-red-600' :
            incident.category === 'traffic' ? 'from-orange-500 to-orange-600' :
            incident.category === 'infrastructure' ? 'from-blue-500 to-blue-600' :
            incident.category === 'gas' ? 'from-emerald-500 to-emerald-600' :
            'from-purple-500 to-purple-600'
          }"></div>
          
          <div class="p-5 space-y-4">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <div class="w-2 h-2 rounded-full animate-pulse ${
                  incident.category === 'crime' ? 'bg-red-500' :
                  incident.category === 'traffic' ? 'bg-orange-500' :
                  incident.category === 'infrastructure' ? 'bg-blue-500' :
                  incident.category === 'gas' ? 'bg-emerald-500' :
                  'bg-purple-500'
                }"></div>
                <span class="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">${incident.category}</span>
              </div>
              <span class="text-[9px] font-bold text-slate-500 uppercase tracking-widest bg-white/5 px-2 py-0.5 rounded-full border border-white/5">${incident.neighborhood}</span>
            </div>

            <div class="space-y-1.5">
              <h3 class="text-base font-black leading-tight tracking-tight text-white">${incident.title}</h3>
              <p class="text-xs text-slate-400 leading-relaxed line-clamp-3 font-medium">${incident.description}</p>
            </div>

            <div class="flex items-center gap-3 p-3 bg-white/[0.03] rounded-2xl border border-white/5">
              <div class="w-10 h-10 rounded-xl bg-white/10 shrink-0 overflow-hidden flex items-center justify-center border border-white/10">
                ${incident.source_logo ? `<img src="${incident.source_logo}" class="w-full h-full object-contain p-1" referrerPolicy="no-referrer" />` : `<div class="text-blue-400"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg></div>`}
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-[10px] font-black text-slate-500 uppercase tracking-wider truncate">${incident.source_name || 'Community Source'}</p>
                <p class="text-[11px] text-blue-400 font-bold truncate">${incident.verified_status.replace('_', ' ')}</p>
              </div>
            </div>

            <div class="flex items-center gap-2 pt-1">
              <button class="learn-more-btn flex-1 py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all active:scale-95 shadow-lg shadow-blue-600/20" data-neighborhood="${incident.neighborhood}">
                Area Intelligence
              </button>
              <button class="view-details-btn p-3 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white rounded-xl transition-all border border-white/10" data-id="${incident.id}">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
              </button>
            </div>
          </div>
        </div>
      `;

      popup.current = L.popup({
        closeButton: false,
        className: 'custom-leaflet-popup',
        offset: [0, -10]
      })
      .setLatLng([incident.lat, incident.lng])
      .setContent(content)
      .openOn(map.current);
    }
  }));

  useEffect(() => {
    if (map.current || !mapContainer.current) return;

    try {
      // Initialize Leaflet map
      map.current = L.map(mapContainer.current, {
        center: [CALGARY_CENTER.lat, CALGARY_CENTER.lng],
        zoom: 11,
        zoomControl: true,
      });

      // Move zoom control to top right
      if (map.current.zoomControl) {
        map.current.zoomControl.setPosition('topright');
      }

      // Add OpenStreetMap tiles
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
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
      mapContainer.current.addEventListener('click', (e) => {
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
          const incident = incidents.find(i => i.id === id);
          if (incident && onViewIncident) {
            onViewIncident(incident);
          }
        }
      });

      setIsMapLoaded(true);
    } catch (err) {
      console.error('Failed to initialize Leaflet:', err);
    }

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []);

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

      // Create custom marker element
      const el = document.createElement('div');
      el.className = 'relative w-10 h-10 flex items-center justify-center group';

      // Pulse ring
      const pulse = document.createElement('div');
      pulse.className = cn(
        'absolute inset-0 rounded-2xl animate-pulse-ring',
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
        'relative w-10 h-10 rounded-2xl border-2 border-white/20 shadow-2xl cursor-pointer transition-all hover:scale-110 flex items-center justify-center z-10',
        incident.category === 'crime' ? 'bg-red-500 shadow-red-500/40' :
        incident.category === 'traffic' ? 'bg-orange-500 shadow-orange-500/40' :
        incident.category === 'infrastructure' ? 'bg-blue-500 shadow-blue-500/40' :
        incident.category === 'gas' ? 'bg-emerald-500 shadow-emerald-500/40' :
        'bg-purple-500 shadow-purple-500/40'
      );

      // Add icon inside marker
      const iconHtml = incident.category === 'crime' ? '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="text-white"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>' :
                      incident.category === 'traffic' ? '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="text-white"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/></svg>' :
                      incident.category === 'infrastructure' ? '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="text-white"><rect x="2" y="6" width="20" height="8" rx="1"/><path d="M17 14v7"/><path d="M7 14v7"/><path d="M17 3v3"/><path d="M7 3v3"/><path d="M10 14 2.3 6.3"/><path d="m14 14 7.7-7.7"/></svg>' :
                      incident.category === 'gas' ? '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="text-white"><line x1="3" y1="22" x2="21" y2="22"/><path d="M4 9h16"/><path d="M14 22V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v18"/><path d="M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 2 2h1"/><path d="M10 22V15"/><path d="M9 22V15"/><path d="M11 22V15"/><path d="M18 5v2"/><path d="M14 7h1"/></svg>' :
                      '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="text-white"><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M16 14v6"/><path d="M8 14v6"/><path d="M12 16v6"/></svg>';
      
      body.innerHTML = iconHtml;
      el.appendChild(body);

      // Create Leaflet divIcon
      const icon = L.divIcon({
        html: el,
        className: '', // Remove default Leaflet icon styling
        iconSize: [40, 40],
        iconAnchor: [20, 20],
      });

      try {
        const marker = L.marker([incident.lat, incident.lng], { icon })
          .addTo(map.current!)
          .bindTooltip(incident.title, {
            direction: 'top',
            offset: [0, -20],
            className: 'custom-map-tooltip'
          })
          .on('click', () => onMarkerClick(incident));

        markers.current[incident.id] = marker;
      } catch (err) {
        console.error('Error adding marker to map:', err);
      }
    });

    // Handle Heatmap
    if (showHeatmap && map.current && isMapLoaded) {
      console.log('Toggling Heatmap ON with', incidents.length, 'incidents');
      if (heatmapLayer.current) {
        map.current.removeLayer(heatmapLayer.current);
      }
      
      const heatPoints = incidents.map(i => [i.lat, i.lng, 0.5] as [number, number, number]);
      
      // Ensure L.heatLayer is available (it's a plugin)
      if (typeof (L as any).heatLayer === 'function') {
        heatmapLayer.current = (L as any).heatLayer(heatPoints, {
          radius: 35,
          blur: 20,
          maxZoom: 17,
          gradient: { 0.4: 'blue', 0.6: 'lime', 1: 'red' }
        }).addTo(map.current);
      } else {
        console.warn('Leaflet.heat plugin not loaded correctly. L.heatLayer is undefined.');
      }
    } else if (!showHeatmap && heatmapLayer.current && map.current) {
      console.log('Toggling Heatmap OFF');
      map.current.removeLayer(heatmapLayer.current);
      heatmapLayer.current = null;
    }
  }, [incidents, showLiveReports, showHeatmap, onMarkerClick, isMapLoaded]);

  return (
    <div className="relative w-full h-full min-h-[400px] overflow-hidden bg-slate-900 flex items-center justify-center">
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

      <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-slate-950/20 to-transparent z-10" />
    </div>
  );
});

export default Map;
