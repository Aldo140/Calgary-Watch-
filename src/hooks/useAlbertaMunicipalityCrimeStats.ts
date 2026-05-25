import { useState, useEffect } from 'react';
import { unzipSync } from 'fflate';
import { CrimeStatEntry, CrimeYearEntry } from './useCrimeStats';

// Municipalities to extract from the StatsCan bulk CSV.
// These are matched as substrings of the GEO column.
const COVERED = ['Airdrie', 'Cochrane', 'Okotoks', 'Canmore', 'High River', 'Strathmore', 'Chestermere'];

// Module-level cache — fetch once per session (the ZIP is ~5 MB).
let _statsCache: Map<string, CrimeStatEntry> | null = null;
let _yearlyCache: Map<string, CrimeYearEntry[]> | null = null;
let _fetchPromise: Promise<void> | null = null;

function parseCSVLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      cells.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

function classifyViolation(violation: string): 'violent' | 'property' | 'total' | null {
  const v = violation.toLowerCase();
  if (v.includes('total criminal code') || v.includes('total, all')) return 'total';
  if (v.includes('violent')) return 'violent';
  if (v.includes('property')) return 'property';
  return null;
}

async function loadStatsCan(): Promise<void> {
  if (_statsCache) return;

  // Step 1: get the ZIP URL from the WDS API
  const wdsRes = await fetch(
    'https://www150.statcan.gc.ca/t1/wds/rest/getFullTableDownloadCSV/35100183/en'
  );
  if (!wdsRes.ok) throw new Error(`WDS API ${wdsRes.status}`);
  const wdsMeta: { status: string; object: string } = await wdsRes.json();
  if (!wdsMeta.object) throw new Error('WDS: no object URL in response');

  // Step 2: download the ZIP
  const zipRes = await fetch(wdsMeta.object);
  if (!zipRes.ok) throw new Error(`ZIP fetch ${zipRes.status}`);
  const zipBuffer = await zipRes.arrayBuffer();

  // Step 3: decompress
  const files = unzipSync(new Uint8Array(zipBuffer));

  // Step 4: find the data CSV (not the MetaData file)
  const csvFilename = Object.keys(files).find(
    f => f.endsWith('.csv') && !f.includes('MetaData')
  );
  if (!csvFilename) throw new Error('No data CSV found in ZIP');

  const csvText = new TextDecoder('utf-8').decode(files[csvFilename]);
  const lines = csvText.split('\n');
  if (lines.length < 2) throw new Error('CSV appears empty');

  // Step 5: parse header
  const header = parseCSVLine(lines[0]);
  const idx = (name: string) => header.findIndex(h => h.replace(/"/g, '') === name);
  const iGeo        = idx('GEO');
  const iRefDate    = idx('REF_DATE');
  const iViolations = idx('Violations');
  const iStats      = idx('Statistics');
  const iValue      = idx('VALUE');

  if ([iGeo, iRefDate, iViolations, iStats, iValue].some(i => i === -1)) {
    throw new Error('CSV header mismatch — field not found');
  }

  // Step 6: build per-municipality, per-year Maps
  const totalByMunYr    = new Map<string, Map<number, number>>();
  const violentByMunYr  = new Map<string, Map<number, number>>();
  const propertyByMunYr = new Map<string, Map<number, number>>();
  let maxYear = 0;

  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVLine(lines[i]);
    if (row.length < Math.max(iGeo, iRefDate, iViolations, iStats, iValue) + 1) continue;

    const geoRaw   = row[iGeo].replace(/"/g, '');
    const statsRaw = row[iStats].replace(/"/g, '');
    if (statsRaw !== 'Actual incidents') continue;

    const matchedMun = COVERED.find(m => geoRaw.includes(m));
    if (!matchedMun) continue;

    const year  = parseInt(row[iRefDate], 10);
    const value = parseFloat(row[iValue]);
    if (!year || isNaN(value) || value < 0) continue;
    if (year > maxYear) maxYear = year;

    const mun = matchedMun.toLowerCase();
    const kind = classifyViolation(row[iViolations].replace(/"/g, ''));
    if (!kind) continue;

    const addTo = (map: Map<string, Map<number, number>>) => {
      if (!map.has(mun)) map.set(mun, new Map());
      const yrMap = map.get(mun)!;
      yrMap.set(year, (yrMap.get(year) ?? 0) + value);
    };

    if (kind === 'total')    addTo(totalByMunYr);
    if (kind === 'violent')  addTo(violentByMunYr);
    if (kind === 'property') addTo(propertyByMunYr);
  }

  // Step 7: build output Maps
  const stats  = new Map<string, CrimeStatEntry>();
  const yearly = new Map<string, CrimeYearEntry[]>();

  for (const mun of totalByMunYr.keys()) {
    const totalYr    = totalByMunYr.get(mun)!;
    const violentYr  = violentByMunYr.get(mun);
    const propertyYr = propertyByMunYr.get(mun);

    stats.set(mun, {
      crime:      totalYr.get(maxYear) ?? 0,
      violent:    violentYr?.get(maxYear) ?? 0,
      property:   propertyYr?.get(maxYear) ?? 0,
      disorder:   0,
      year:       maxYear,
      dataSource: 'statcan',
    });

    const allYears = new Set(totalYr.keys());
    yearly.set(mun, [...allYears]
      .filter(y => y > 0)
      .sort((a, b) => a - b)
      .slice(-6)
      .map(yr => ({
        year:     yr,
        crime:    totalYr.get(yr) ?? 0,
        violent:  violentYr?.get(yr) ?? 0,
        property: propertyYr?.get(yr) ?? 0,
        disorder: 0,
      })));
  }

  _statsCache  = stats;
  _yearlyCache = yearly;
}

export function useAlbertaMunicipalityCrimeStats(): {
  stats: Map<string, CrimeStatEntry>;
  yearlyStats: Map<string, CrimeYearEntry[]>;
  isLoading: boolean;
} {
  const [stats, setStats]           = useState<Map<string, CrimeStatEntry>>(new Map());
  const [yearlyStats, setYearly]    = useState<Map<string, CrimeYearEntry[]>>(new Map());
  const [isLoading, setIsLoading]   = useState(false);

  useEffect(() => {
    if (_statsCache) {
      setStats(_statsCache);
      setYearly(_yearlyCache!);
      return;
    }

    setIsLoading(true);

    if (!_fetchPromise) {
      _fetchPromise = loadStatsCan().catch(err => {
        console.warn('[CalgaryWatch] StatsCan municipality stats failed:', err);
        _fetchPromise = null;
      });
    }

    _fetchPromise.then(() => {
      if (_statsCache) {
        setStats(_statsCache);
        setYearly(_yearlyCache!);
      }
      setIsLoading(false);
    });
  }, []);

  return { stats, yearlyStats: yearlyStats, isLoading };
}
