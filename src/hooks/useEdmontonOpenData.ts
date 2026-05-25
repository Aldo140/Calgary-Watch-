import { useState, useEffect } from 'react';
import { Incident, IncidentCategory } from '@/src/types';

const BASE = 'https://data.edmonton.ca/resource';

function isoMinus(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString().slice(0, 19);
}

// ── Bylaw classifier ─────────────────────────────────────────────────────────
// complaint_category / type_of_complaint → IncidentCategory
// Returns null to drop the row entirely (e.g. business licensing).
function classifyBylaw(category: string, type: string): IncidentCategory | null {
  const cat = category.toLowerCase();
  const typ = type.toLowerCase();

  if (/business licens/i.test(cat)) return null;           // not safety-relevant

  if (/conduct/i.test(cat)) return 'crime';                // illegal camping, public disorder
  if (/noise/i.test(cat)) return 'crime';
  if (/graffiti/i.test(typ)) return 'crime';
  if (/nuisance property/i.test(typ)) return 'crime';
  if (/smoking|cannabis/i.test(typ)) return 'crime';

  if (/traffic safety/i.test(cat)) return 'traffic';
  if (/abandon vehicle|parking/i.test(typ)) return 'traffic';

  if (/snow|ice/i.test(cat)) return 'weather';

  if (/fire pit|firework|firecracker/i.test(typ)) return 'emergency';

  if (/property|development|maintenance/i.test(cat)) return 'infrastructure';
  if (/waste|dump|litter|obstruction/i.test(typ)) return 'infrastructure';

  return 'infrastructure';
}

function bylawTitle(category: string, type: string): string {
  if (type && type !== 'General' && type.length < 50) return type;
  return category;
}

// ── 311 classifier ───────────────────────────────────────────────────────────
// service_category / service_description → IncidentCategory
// Returns null to drop administrative / informational rows.
const ADMIN_311_RE = /general information|routes.*schedule|monthly payment|tax account|tax notice|fare product|programs.*recr|programs.*environ|facility booking|general inquiry|email follow|lost.*found|permits.*development|inspections.*plumbing|inspections.*electrical|eco station|trip plan|bus inform|membership|smart fare|tax duplicate|tax certificate|tax notice|non city service|duplicate submission|incomplete call|status update|information provided|info provided|general admin|general admission/i;

function classify311(serviceCategory: string, serviceDesc: string): IncidentCategory | null {
  if (ADMIN_311_RE.test(serviceCategory)) return null;
  if (/general info|info provided|information provided|status update|incomplete call|non city service|duplicate/i.test(serviceDesc)) return null;

  if (/parking/i.test(serviceCategory)) return 'traffic';
  if (/snow|ice/i.test(serviceCategory)) return 'weather';
  if (/bylaw complaint|eps non.*emergency/i.test(serviceCategory)) return 'crime';
  if (/pothole|litter|collection.*dispos|drainage|hazard|graffiti|waste/i.test(serviceCategory)) return 'infrastructure';
  if (/pothole|graffiti|waste|hazard|drainage|flood/i.test(serviceDesc)) return 'infrastructure';

  return null;
}

// ── Traffic classifier ───────────────────────────────────────────────────────
// activity_type / description → IncidentCategory
function classifyTraffic(activityType: string, description: string): IncidentCategory {
  if (/traffic incident/i.test(activityType)) return 'traffic';
  if (/special event/i.test(activityType)) return 'traffic';
  if (/utility emergency/i.test(description)) return 'emergency';
  return 'infrastructure'; // road construction, utility work, bridge work, etc.
}

function toTitleCase(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

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
        const url = `${BASE}/ypje-j649.json?$where=date_created>='${isoMinus(48)}'&$limit=300&$order=date_created DESC`;
        const res = await fetch(url);
        if (res.ok) {
          const rows: any[] = await res.json();
          for (const row of rows) {
            const lat = parseFloat(row.latitude ?? '');
            const lng = parseFloat(row.longitude ?? '');
            if (isNaN(lat) || isNaN(lng)) continue;
            const category = classifyBylaw(row.complaint_category ?? '', row.type_of_complaint ?? '');
            if (!category) continue;
            const title = bylawTitle(row.complaint_category ?? 'Bylaw Complaint', row.type_of_complaint ?? '');
            const street = row.full_name_of_street ? ` on ${toTitleCase(row.full_name_of_street)}` : '';
            results.push({
              id: `edm-bylaw-${row.row_id ?? String(Math.random())}`,
              title,
              description: `${title}${street} in ${row.neighbourhood ?? 'Edmonton'}`,
              category,
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
        const url = `${BASE}/q7ua-agfg.json?$where=date_created>='${isoMinus(48)}'&$limit=400&$order=date_created DESC`;
        const res = await fetch(url);
        if (res.ok) {
          const rows: any[] = await res.json();
          for (const row of rows) {
            const lat = parseFloat(row.nbhd_latitude ?? '');
            const lng = parseFloat(row.nbhd_longitude ?? '');
            if (isNaN(lat) || isNaN(lng)) continue;
            const category = classify311(row.service_category ?? '', row.service_description ?? '');
            if (!category) continue;
            const title = row.service_description ?? row.service_category ?? '311 Request';
            results.push({
              id: `edm-311-${row.row_id ?? String(Math.random())}`,
              title,
              description: `${row.service_category ?? '311 request'}: ${title} in ${row.neighbourhood ?? 'Edmonton'}`,
              category,
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
        const url = `${BASE}/k4tx-5k8p.json?$where=status='Active'&$limit=150`;
        const res = await fetch(url);
        if (res.ok) {
          const rows: any[] = await res.json();
          for (const row of rows) {
            const coords: number[] | undefined = row.point?.coordinates;
            if (!coords || coords.length < 2) continue;
            const lng = coords[0];
            const lat = coords[1];
            if (isNaN(lat) || isNaN(lng)) continue;
            const category = classifyTraffic(row.activity_type ?? '', row.description ?? '');
            const rawDesc = row.description ?? row.activity_type ?? 'Disruption';
            const title = toTitleCase(rawDesc);
            const street = row.on_street ? ` on ${toTitleCase(row.on_street)}` : '';
            const impact = row.impact ? `${row.impact}${street}` : street.trim();
            results.push({
              id: `edm-traffic-${row.disruption_id ?? String(Math.random())}`,
              title,
              description: impact || `${title} in Edmonton`,
              category,
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
