import { useState, useEffect } from 'react';
import { Incident, IncidentCategory } from '@/src/types';

const BASE = 'https://data.edmonton.ca/resource';

function isoMinus48h(): string {
  return new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString().slice(0, 19);
}

function isoMinus24h(): string {
  return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 19);
}

const SAFETY_311_KEYWORDS = ['road', 'drainage', 'graffiti', 'waste', 'hazard', 'pothole', 'illegal dump'];

export function useEdmontonOpenData(isAuthReady: boolean): Incident[] {
  const [incidents, setIncidents] = useState<Incident[]>([]);

  useEffect(() => {
    if (!isAuthReady) return;
    let cancelled = false;

    const fetchAll = async () => {
      const now = Date.now();
      const results: Incident[] = [];

      // ── Bylaw Complaints ─────────────────────────────────────────────────
      try {
        const url = `${BASE}/ypje-j649.json?$where=date_created>='${isoMinus48h()}'&$limit=200&$order=date_created DESC`;
        const res = await fetch(url);
        if (res.ok) {
          const rows: any[] = await res.json();
          for (const row of rows) {
            const lat = parseFloat(row.latitude ?? '');
            const lng = parseFloat(row.longitude ?? '');
            if (isNaN(lat) || isNaN(lng)) continue;
            results.push({
              id: `edm-bylaw-${row.row_id ?? String(Math.random())}`,
              title: row.complaint_category ?? 'Bylaw Complaint',
              description: `${row.type_of_complaint ?? row.complaint_category ?? 'Bylaw complaint'} in ${row.neighbourhood ?? 'Edmonton'}`,
              category: 'infrastructure' as IncidentCategory,
              neighborhood: row.neighbourhood ?? 'Edmonton',
              lat,
              lng,
              timestamp: new Date(row.date_created).getTime() || now,
              email: 'opendata@edmonton.ca',
              name: 'City of Edmonton Bylaw',
              anonymous: false,
              verified_status: 'community_confirmed',
              report_count: 1,
              data_source: 'official',
              source_type: 'edmonton_open_data',
              source_name: 'City of Edmonton Open Data',
              source_url: 'https://data.edmonton.ca/',
              expires_at: now + 2 * 60 * 60 * 1000,
            });
          }
        }
      } catch { /* silent — partial failures are fine */ }

      // ── 311 Requests ─────────────────────────────────────────────────────
      try {
        const url = `${BASE}/q7ua-agfg.json?$where=date_created>='${isoMinus24h()}'&$limit=200&$order=date_created DESC`;
        const res = await fetch(url);
        if (res.ok) {
          const rows: any[] = await res.json();
          for (const row of rows) {
            const lat = parseFloat(row.nbhd_latitude ?? '');
            const lng = parseFloat(row.nbhd_longitude ?? '');
            if (isNaN(lat) || isNaN(lng)) continue;
            const cat = (row.service_category ?? '').toLowerCase();
            if (!SAFETY_311_KEYWORDS.some(k => cat.includes(k))) continue;
            results.push({
              id: `edm-311-${row.row_id ?? String(Math.random())}`,
              title: row.service_description ?? row.service_category ?? '311 Request',
              description: `${row.service_description ?? row.service_category ?? '311 request'} in ${row.neighbourhood ?? 'Edmonton'}`,
              category: 'infrastructure' as IncidentCategory,
              neighborhood: row.neighbourhood ?? 'Edmonton',
              lat,
              lng,
              timestamp: new Date(row.date_created).getTime() || now,
              email: 'opendata@edmonton.ca',
              name: 'City of Edmonton 311',
              anonymous: false,
              verified_status: 'community_confirmed',
              report_count: 1,
              data_source: 'official',
              source_type: 'edmonton_open_data',
              source_name: 'City of Edmonton Open Data',
              source_url: 'https://data.edmonton.ca/',
              expires_at: now + 2 * 60 * 60 * 1000,
            });
          }
        }
      } catch { /* silent */ }

      // ── Traffic Disruptions ──────────────────────────────────────────────
      try {
        const url = `${BASE}/k4tx-5k8p.json?$where=status='Active'&$limit=100`;
        const res = await fetch(url);
        if (res.ok) {
          const rows: any[] = await res.json();
          for (const row of rows) {
            // point.coordinates is [lng, lat] GeoJSON order — swap to [lat, lng]
            const coords: number[] | undefined = row.point?.coordinates;
            if (!coords || coords.length < 2) continue;
            const lng = coords[0];
            const lat = coords[1];
            if (isNaN(lat) || isNaN(lng)) continue;
            results.push({
              id: `edm-traffic-${row.disruption_id ?? String(Math.random())}`,
              title: row.activity_type ?? 'Traffic Disruption',
              description: `${row.impact ?? ''} on ${row.on_street ?? 'Edmonton road'}${row.description ? '. ' + row.description : ''}`.trim(),
              category: 'traffic' as IncidentCategory,
              neighborhood: row.traffic_district ?? 'Edmonton',
              lat,
              lng,
              timestamp: new Date(row.date_issued ?? row.start_date).getTime() || now,
              email: 'opendata@edmonton.ca',
              name: 'City of Edmonton Traffic',
              anonymous: false,
              verified_status: 'community_confirmed',
              report_count: 1,
              data_source: 'official',
              source_type: 'edmonton_open_data',
              source_name: 'City of Edmonton Open Data',
              source_url: 'https://data.edmonton.ca/',
              expires_at: now + 2 * 60 * 60 * 1000,
            });
          }
        }
      } catch { /* silent */ }

      if (!cancelled) setIncidents(results);
    };

    fetchAll();
    const interval = setInterval(fetchAll, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isAuthReady]);

  return incidents;
}
