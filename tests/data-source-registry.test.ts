import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import {
  DATA_SOURCES,
  DIRECT_DATA_SOURCES,
  SCHEDULED_DATA_SOURCES,
} from '../src/config/dataSources.js';

const ingest = readFileSync('scripts/ingest/index.ts', 'utf8');
const outages = readFileSync('scripts/ingest/power-outages.ts', 'utf8');
const rss = readFileSync('scripts/ingest/sources/rss.ts', 'utf8');
const adminHook = readFileSync('src/hooks/useAdminData.ts', 'utf8');
const adminPage = readFileSync('src/pages/AdminPage.tsx', 'utf8');
const rules = readFileSync('firestore.rules', 'utf8');
const backendWorkflow = readFileSync('.github/workflows/deploy-firebase-backend.yml', 'utf8');
const rulesDeploy = readFileSync('scripts/deploy-firestore-rules.mjs', 'utf8');

describe('operational data-source registry', () => {
  it('has unique stable IDs and complete operator-facing metadata', () => {
    assert.equal(new Set(DATA_SOURCES.map((source) => source.id)).size, DATA_SOURCES.length);
    for (const source of DATA_SOURCES) {
      assert.ok(source.name.length > 3, source.id);
      assert.ok(source.description.length > 20, source.id);
      assert.match(source.homepage, /^https:\/\//, source.id);
      assert.ok(source.cadence.length > 3, source.id);
    }
  });

  it('registers every scheduled incident job plus ENMAX', () => {
    const expected = [
      'calgary_311', 'calgary_police_news', 'environment_canada',
      'alberta_emergency', 'global_news', 'alberta_511', 'enmax_outages',
    ];
    assert.deepEqual(SCHEDULED_DATA_SOURCES.map((source) => source.id), expected);
    for (const id of expected.slice(0, -1)) assert.match(ingest, new RegExp(`id: '${id}'`));
    assert.match(outages, /doc\('enmax_outages'\)/);
  });

  it('gives every direct layer a browser-safe probe', () => {
    assert.ok(DIRECT_DATA_SOURCES.length > 0);
    for (const source of DIRECT_DATA_SOURCES) assert.match(source.checkUrl ?? '', /^https:\/\//);
  });

  it('keeps retired Reddit and CBC adapters out of the live inventory', () => {
    const names = DATA_SOURCES.map((source) => source.name).join(' ');
    assert.doesNotMatch(names, /Reddit|CBC/i);
  });
});

describe('source health contract', () => {
  it('persists actual scheduled results and makes them admin-readable only', () => {
    assert.match(ingest, /collection\('ingestion_health'\)/);
    assert.match(outages, /collection\('ingestion_health'\)/);
    assert.match(rules, /match \/ingestion_health\/\{sourceId\}[\s\S]*?allow read: if isAdmin\(\);[\s\S]*?allow write: if false;/);
  });

  it('deploys Firestore-only changes without the CLI service-usage preflight', () => {
    assert.match(backendWorkflow, /node scripts\/deploy-firestore-rules\.mjs/);
    assert.match(rulesDeploy, /releaseFirestoreRulesetFromSource\(source\)/);
  });

  it('reports a broken news transport as an error instead of a healthy empty feed', () => {
    assert.match(rss, /if \(!res\.ok\)[\s\S]*failures\.push\(message\)/);
    assert.match(rss, /failures\.length === FEEDS\.length[\s\S]*throw new Error/);
  });

  it('derives admin health from the registry and detects stale workflows', () => {
    assert.match(adminHook, /DATA_SOURCES\.map/);
    assert.match(adminHook, /healthClock - checkedAt > staleAfterMs/);
    assert.match(adminHook, /\? 'stale'/);
    assert.match(adminPage, /Incident ingestion/);
    assert.match(adminPage, /Live map layers/);
    assert.match(adminPage, /Setup required/);
  });
});
